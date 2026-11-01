/**
 * Reads named top-level columns of a Parquet file, with no dependency beyond
 * Node itself. It reads the subset of the format a release table of one row
 * per sample uses, and refuses everything else by name instead of guessing:
 *
 * - columns: top-level primitive columns, REQUIRED or OPTIONAL (a REPEATED or
 *   nested column is refused when it is asked for, and skipped otherwise);
 * - physical types: BOOLEAN, INT32, INT64, FLOAT, DOUBLE, BYTE_ARRAY;
 * - pages: dictionary pages, data pages v1 and v2;
 * - encodings: PLAIN, PLAIN_DICTIONARY, RLE_DICTIONARY, and RLE for levels
 *   and booleans (a delta or byte-stream-split page is refused by name);
 * - codecs: UNCOMPRESSED, SNAPPY, GZIP, BROTLI, ZSTD.
 *
 * BYTE_ARRAY values are returned as the bytes the file stores, so a caller
 * can hash or write a text value byte for byte, and decode it when it needs
 * a string. INT64 values are returned as bigint.
 */

import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import * as zlib from 'node:zlib';

export class ParquetError extends Error {}

export type ParquetValue = Buffer | number | bigint | boolean | null;

const TYPE_NAMES = ['BOOLEAN', 'INT32', 'INT64', 'INT96', 'FLOAT', 'DOUBLE', 'BYTE_ARRAY', 'FIXED_LEN_BYTE_ARRAY'];
const CODEC_NAMES = ['UNCOMPRESSED', 'SNAPPY', 'GZIP', 'LZO', 'BROTLI', 'LZ4', 'ZSTD', 'LZ4_RAW'];
const ENCODING_NAMES: Record<number, string> = {
  0: 'PLAIN', 2: 'PLAIN_DICTIONARY', 3: 'RLE', 4: 'BIT_PACKED', 5: 'DELTA_BINARY_PACKED',
  6: 'DELTA_LENGTH_BYTE_ARRAY', 7: 'DELTA_BYTE_ARRAY', 8: 'RLE_DICTIONARY', 9: 'BYTE_STREAM_SPLIT',
};
const REQUIRED = 0;
const OPTIONAL = 1;

// ------------------------------------------------------- Thrift compact protocol

/** A decoded Thrift struct: field id to value. */
type TStruct = Map<number, TValue>;
type TValue = boolean | number | bigint | Buffer | TValue[] | TStruct;

class ThriftReader {
  constructor(private readonly buf: Buffer, public pos: number, private readonly end: number) {}

  private byte(): number {
    if (this.pos >= this.end) throw new ParquetError('metadata ends inside a Thrift value');
    return this.buf[this.pos++];
  }

  private varint(): bigint {
    let shift = 0n;
    let out = 0n;
    for (let i = 0; i < 10; i++) {
      const b = this.byte();
      out |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) return out;
      shift += 7n;
    }
    throw new ParquetError('a Thrift varint runs past 10 bytes');
  }

  private zigzag(): bigint {
    const v = this.varint();
    return (v >> 1n) ^ -(v & 1n);
  }

  private int(): number | bigint {
    const v = this.zigzag();
    return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v;
  }

  private value(type: number, depth: number): TValue {
    if (depth > 32) throw new ParquetError('Thrift metadata nests deeper than 32 levels');
    switch (type) {
      case 1: return true;
      case 2: return false;
      case 3: { const b = this.byte(); return b > 127 ? b - 256 : b; }
      case 4: case 5: case 6: return this.int();
      case 7: {
        if (this.pos + 8 > this.end) throw new ParquetError('metadata ends inside a double');
        const d = this.buf.readDoubleLE(this.pos);
        this.pos += 8;
        return d;
      }
      case 8: {
        const n = Number(this.varint());
        if (this.pos + n > this.end) throw new ParquetError('a Thrift binary runs past the metadata');
        const b = this.buf.subarray(this.pos, this.pos + n);
        this.pos += n;
        return b;
      }
      case 9: case 10: {
        const head = this.byte();
        let size = head >> 4;
        if (size === 15) size = Number(this.varint());
        const elem = head & 0x0f;
        const out: TValue[] = [];
        for (let i = 0; i < size; i++) {
          // A bool inside a list is one byte: 1 is true.
          out.push(elem === 1 || elem === 2 ? this.byte() === 1 : this.value(elem, depth + 1));
        }
        return out;
      }
      case 11: {
        const size = Number(this.varint());
        if (size === 0) return [];
        const kv = this.byte();
        const out: TValue[] = [];
        for (let i = 0; i < size; i++) out.push([this.value(kv >> 4, depth + 1), this.value(kv & 0x0f, depth + 1)]);
        return out;
      }
      case 12: return this.struct(depth + 1);
      default: throw new ParquetError(`unknown Thrift compact type ${type}`);
    }
  }

  struct(depth = 0): TStruct {
    const out: TStruct = new Map();
    let last = 0;
    for (;;) {
      const head = this.byte();
      if (head === 0) return out;
      const delta = head >> 4;
      const type = head & 0x0f;
      const id = delta === 0 ? Number(this.zigzag()) : last + delta;
      last = id;
      out.set(id, this.value(type, depth));
    }
  }
}

const num = (s: TStruct, id: number, fallback?: number): number => {
  const v = s.get(id);
  if (v === undefined) {
    if (fallback !== undefined) return fallback;
    throw new ParquetError(`metadata field ${id} is missing`);
  }
  if (typeof v === 'bigint') {
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new ParquetError(`metadata field ${id} is too large`);
    return Number(v);
  }
  if (typeof v !== 'number') throw new ParquetError(`metadata field ${id} is not an integer`);
  return v;
};
const str = (s: TStruct, id: number): string | null => {
  const v = s.get(id);
  return Buffer.isBuffer(v) ? v.toString('utf8') : null;
};
const list = (s: TStruct, id: number): TValue[] => {
  const v = s.get(id);
  return Array.isArray(v) ? v : [];
};
const sub = (s: TStruct, id: number): TStruct | null => {
  const v = s.get(id);
  return v instanceof Map ? v : null;
};

// ------------------------------------------------------------------ the footer

export interface ParquetColumn {
  name: string;
  type: string;
  repetition: 'REQUIRED' | 'OPTIONAL' | 'REPEATED';
  /** False for a column inside a group (a list, map or struct). */
  topLevel: boolean;
}

interface ChunkMeta {
  type: number;
  codec: number;
  encodings: number[];
  numValues: number;
  dataPageOffset: number;
  dictionaryPageOffset: number | null;
  totalCompressedSize: number;
}

export interface ParquetFile {
  rows: number;
  columns: ParquetColumn[];
  createdBy: string | null;
  rowGroups: Array<{ rows: number; chunks: Map<string, ChunkMeta> }>;
  buf: Buffer;
}

/** Parses the footer: the schema, the row groups and where each column chunk is. */
export function openParquet(buf: Buffer): ParquetFile {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'PAR1' || buf.toString('latin1', buf.length - 4) !== 'PAR1') {
    throw new ParquetError('not a Parquet file: no PAR1 magic at both ends');
  }
  const footerLength = buf.readUInt32LE(buf.length - 8);
  const footerStart = buf.length - 8 - footerLength;
  if (footerStart < 4) throw new ParquetError('the footer length runs past the file');
  const meta = new ThriftReader(buf, footerStart, buf.length - 8).struct();
  const schema = list(meta, 2).map(e => e as TStruct);
  if (schema.length === 0) throw new ParquetError('the schema is empty');

  const columns: ParquetColumn[] = [];
  // Walk the schema tree: the root, then each child with its num_children.
  let i = 1;
  const walk = (count: number, topLevel: boolean, prefix: string) => {
    for (let c = 0; c < count; c++) {
      const el = schema[i++];
      if (!el) throw new ParquetError('the schema lists fewer elements than its groups name');
      const name = str(el, 4) ?? '';
      const children = num(el, 5, 0);
      const rep = num(el, 3, REQUIRED);
      const repetition = rep === REQUIRED ? 'REQUIRED' : rep === OPTIONAL ? 'OPTIONAL' : 'REPEATED';
      if (children > 0) walk(children, false, `${prefix}${name}.`);
      else columns.push({ name: `${prefix}${name}`, type: TYPE_NAMES[num(el, 1)] ?? `type ${num(el, 1)}`, repetition, topLevel });
    }
  };
  walk(num(schema[0], 5, schema.length - 1), true, '');

  const rowGroups = list(meta, 4).map(g => {
    const group = g as TStruct;
    const chunks = new Map<string, ChunkMeta>();
    for (const c of list(group, 1)) {
      const cm = sub(c as TStruct, 3);
      if (!cm) throw new ParquetError('a column chunk carries no metadata (an external file path is not read)');
      if (str(c as TStruct, 1) !== null) throw new ParquetError('a column chunk names an external file; only single-file Parquet is read');
      const path = list(cm, 3).map(p => (p as Buffer).toString('utf8')).join('.');
      const dict = cm.get(11);
      chunks.set(path, {
        type: num(cm, 1),
        codec: num(cm, 4),
        encodings: list(cm, 2).map(e => e as number),
        numValues: num(cm, 5),
        dataPageOffset: num(cm, 9),
        dictionaryPageOffset: dict === undefined ? null : num(cm, 11),
        totalCompressedSize: num(cm, 7),
      });
    }
    return { rows: num(group, 3), chunks };
  });
  return { rows: num(meta, 3), columns, createdBy: str(meta, 6), rowGroups, buf };
}

// ------------------------------------------------------------------- codecs

/** Decodes a raw Snappy block (the format Parquet's SNAPPY codec stores). */
export function snappyDecompress(src: Buffer): Buffer {
  let pos = 0;
  let length = 0;
  for (let shift = 0; ; shift += 7) {
    if (pos >= src.length || shift > 28) throw new ParquetError('snappy: bad length preamble');
    const b = src[pos++];
    length |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
  }
  const out = Buffer.alloc(length);
  let op = 0;
  while (pos < src.length) {
    const tag = src[pos++];
    const kind = tag & 3;
    if (kind === 0) {
      let len = tag >> 2;
      if (len >= 60) {
        const bytes = len - 59;
        len = 0;
        for (let k = 0; k < bytes; k++) len |= src[pos++] << (8 * k);
        len >>>= 0;
      }
      len += 1;
      if (pos + len > src.length || op + len > length) throw new ParquetError('snappy: a literal runs past the block');
      src.copy(out, op, pos, pos + len);
      pos += len;
      op += len;
      continue;
    }
    let len: number;
    let offset: number;
    if (kind === 1) {
      len = ((tag >> 2) & 7) + 4;
      offset = ((tag >> 5) << 8) | src[pos++];
    } else if (kind === 2) {
      len = (tag >> 2) + 1;
      offset = src[pos] | (src[pos + 1] << 8);
      pos += 2;
    } else {
      len = (tag >> 2) + 1;
      offset = (src[pos] | (src[pos + 1] << 8) | (src[pos + 2] << 16) | (src[pos + 3] << 24)) >>> 0;
      pos += 4;
    }
    if (offset === 0 || offset > op || op + len > length) throw new ParquetError('snappy: a copy reaches outside the output');
    for (let k = 0; k < len; k++, op++) out[op] = out[op - offset];
  }
  if (op !== length) throw new ParquetError(`snappy: decoded ${op} bytes, the block states ${length}`);
  return out;
}

/** Decompresses one page body with the column chunk's codec and checks its stated size. */
export function decompressPage(codec: number, data: Buffer, size: number): Buffer {
  let out: Buffer;
  switch (codec) {
    case 0: out = data; break;
    case 1: out = snappyDecompress(data); break;
    case 2: out = data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b ? gunzipSync(data) : inflateSync(data); break;
    case 4: out = brotliDecompressSync(data); break;
    case 6: {
      const zstd = (zlib as unknown as { zstdDecompressSync?: (b: Buffer) => Buffer }).zstdDecompressSync;
      if (!zstd) throw new ParquetError(`the ZSTD codec needs Node 22.15 or later (this is ${process.version})`);
      out = zstd(data);
      break;
    }
    default: throw new ParquetError(`codec ${CODEC_NAMES[codec] ?? codec} is not read`);
  }
  if (out.length !== size) throw new ParquetError(`a page decompressed to ${out.length} bytes, its header states ${size}`);
  return out;
}

// --------------------------------------------------------------- value decoding

class Bytes {
  constructor(readonly buf: Buffer, public pos = 0, readonly end = buf.length) {}
  need(n: number): void {
    if (this.pos + n > this.end) throw new ParquetError('a page ends inside a value');
  }
  u8(): number {
    this.need(1);
    return this.buf[this.pos++];
  }
  uvarint(): bigint {
    let shift = 0n;
    let out = 0n;
    for (let i = 0; i < 10; i++) {
      const b = this.u8();
      out |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) return out;
      shift += 7n;
    }
    throw new ParquetError('a varint runs past 10 bytes');
  }
}

/** The RLE / bit-packed hybrid of the format, for levels, dictionary indices and booleans. */
function readHybrid(b: Bytes, bitWidth: number, count: number): number[] {
  const out: number[] = [];
  if (bitWidth === 0) {
    while (out.length < count) out.push(0);
    return out;
  }
  if (bitWidth > 32) throw new ParquetError(`a bit width of ${bitWidth} is not read`);
  const byteWidth = Math.ceil(bitWidth / 8);
  while (out.length < count) {
    if (b.pos >= b.end) throw new ParquetError('RLE data ends before its values');
    const header = Number(b.uvarint());
    if ((header & 1) === 0) {
      const run = header >>> 1;
      b.need(byteWidth);
      let v = 0;
      for (let k = 0; k < byteWidth; k++) v |= b.buf[b.pos + k] << (8 * k);
      b.pos += byteWidth;
      for (let k = 0; k < run && out.length < count; k++) out.push(v >>> 0);
    } else {
      const groups = header >>> 1;
      const bytes = groups * bitWidth;
      b.need(bytes);
      let acc = 0n;
      let accBits = 0;
      let p = b.pos;
      const mask = (1n << BigInt(bitWidth)) - 1n;
      for (let k = 0; k < groups * 8; k++) {
        while (accBits < bitWidth) {
          acc |= BigInt(b.buf[p++]) << BigInt(accBits);
          accBits += 8;
        }
        const v = Number(acc & mask);
        acc >>= BigInt(bitWidth);
        accBits -= bitWidth;
        if (out.length < count) out.push(v);
      }
      b.pos += bytes;
    }
  }
  return out;
}

function readPlain(b: Bytes, type: number, count: number): ParquetValue[] {
  const out: ParquetValue[] = [];
  switch (type) {
    case 0: {
      b.need(Math.ceil(count / 8));
      for (let k = 0; k < count; k++) out.push(((b.buf[b.pos + (k >> 3)] >> (k & 7)) & 1) === 1);
      b.pos += Math.ceil(count / 8);
      return out;
    }
    case 1: b.need(4 * count); for (let k = 0; k < count; k++, b.pos += 4) out.push(b.buf.readInt32LE(b.pos)); return out;
    case 2: b.need(8 * count); for (let k = 0; k < count; k++, b.pos += 8) out.push(b.buf.readBigInt64LE(b.pos)); return out;
    case 4: b.need(4 * count); for (let k = 0; k < count; k++, b.pos += 4) out.push(b.buf.readFloatLE(b.pos)); return out;
    case 5: b.need(8 * count); for (let k = 0; k < count; k++, b.pos += 8) out.push(b.buf.readDoubleLE(b.pos)); return out;
    case 6: {
      for (let k = 0; k < count; k++) {
        b.need(4);
        const n = b.buf.readUInt32LE(b.pos);
        b.pos += 4;
        b.need(n);
        out.push(Buffer.from(b.buf.subarray(b.pos, b.pos + n)));
        b.pos += n;
      }
      return out;
    }
    default: throw new ParquetError(`physical type ${TYPE_NAMES[type] ?? type} is not read`);
  }
}

function readValues(b: Bytes, encoding: number, type: number, count: number, dict: ParquetValue[] | null): ParquetValue[] {
  switch (encoding) {
    case 0: return readPlain(b, type, count);
    case 2: case 8: {
      if (!dict) throw new ParquetError('a dictionary-encoded page comes before any dictionary page');
      const width = b.u8();
      return readHybrid(b, width, count).map(i => {
        if (i >= dict.length) throw new ParquetError('a dictionary index is out of range');
        return dict[i];
      });
    }
    case 3: {
      if (type !== 0) throw new ParquetError('RLE values are read for BOOLEAN only');
      b.need(4);
      b.pos += 4;
      return readHybrid(b, 1, count).map(v => v === 1);
    }
    default: throw new ParquetError(`encoding ${ENCODING_NAMES[encoding] ?? encoding} is not read`);
  }
}

/** Every value of one column chunk, nulls in place. */
function readChunk(file: ParquetFile, chunk: ChunkMeta, optional: boolean, rows: number): ParquetValue[] {
  const { buf } = file;
  const start = chunk.dictionaryPageOffset !== null && chunk.dictionaryPageOffset > 0 && chunk.dictionaryPageOffset < chunk.dataPageOffset
    ? chunk.dictionaryPageOffset
    : chunk.dataPageOffset;
  const end = start + chunk.totalCompressedSize;
  if (start < 4 || end > buf.length - 8) throw new ParquetError('a column chunk runs past the file');
  let pos = start;
  let dict: ParquetValue[] | null = null;
  const out: ParquetValue[] = [];
  while (out.length < chunk.numValues) {
    if (pos >= end) throw new ParquetError(`a column chunk ends after ${out.length} of ${chunk.numValues} values`);
    const reader = new ThriftReader(buf, pos, end);
    const header = reader.struct();
    pos = reader.pos;
    const pageType = num(header, 1);
    const uncompressed = num(header, 2);
    const compressed = num(header, 3);
    if (pos + compressed > end) throw new ParquetError('a page runs past its column chunk');
    const body = buf.subarray(pos, pos + compressed);
    pos += compressed;
    if (pageType === 2) {
      const dh = sub(header, 7);
      if (!dh) throw new ParquetError('a dictionary page has no dictionary header');
      const enc = num(dh, 2, 0);
      if (enc !== 0 && enc !== 2) throw new ParquetError(`a dictionary page in ${ENCODING_NAMES[enc] ?? enc} is not read`);
      dict = readPlain(new Bytes(decompressPage(chunk.codec, body, uncompressed)), chunk.type, num(dh, 1));
      continue;
    }
    if (pageType === 0) {
      const dp = sub(header, 5);
      if (!dp) throw new ParquetError('a data page has no data page header');
      const n = num(dp, 1);
      const b = new Bytes(decompressPage(chunk.codec, body, uncompressed));
      let defs: number[] | null = null;
      if (optional) {
        if (num(dp, 3, 3) !== 3) throw new ParquetError('definition levels are read in RLE only');
        b.need(4);
        const len = b.buf.readUInt32LE(b.pos);
        b.pos += 4;
        const levels = new Bytes(b.buf, b.pos, b.pos + len);
        defs = readHybrid(levels, 1, n);
        b.pos += len;
      }
      const present = defs ? defs.filter(d => d === 1).length : n;
      const values = readValues(b, num(dp, 2), chunk.type, present, dict);
      let v = 0;
      for (let k = 0; k < n; k++) out.push(defs && defs[k] !== 1 ? null : values[v++]);
      continue;
    }
    if (pageType === 3) {
      const dp = sub(header, 8);
      if (!dp) throw new ParquetError('a data page v2 has no header');
      const n = num(dp, 1);
      const nulls = num(dp, 2, 0);
      const defLen = num(dp, 5, 0);
      const repLen = num(dp, 6, 0);
      if (repLen !== 0) throw new ParquetError('a page with repetition levels is not read');
      const compressedValues = dp.get(7) !== false;
      const defs = optional ? readHybrid(new Bytes(body, 0, defLen), 1, n) : null;
      const rest = body.subarray(defLen);
      const valuesBuf = compressedValues ? decompressPage(chunk.codec, rest, uncompressed - defLen) : rest;
      const present = defs ? defs.filter(d => d === 1).length : n - nulls;
      const values = readValues(new Bytes(valuesBuf), num(dp, 4), chunk.type, present, dict);
      let v = 0;
      for (let k = 0; k < n; k++) out.push(defs && defs[k] !== 1 ? null : values[v++]);
      continue;
    }
    // An index page carries no values.
  }
  if (out.length !== rows) throw new ParquetError(`a column chunk holds ${out.length} values for ${rows} rows`);
  return out;
}

/** Reads the named top-level columns of every row group, in row order. */
export function readColumns(file: ParquetFile, names: string[]): Record<string, ParquetValue[]> {
  const out: Record<string, ParquetValue[]> = {};
  for (const name of names) {
    const col = file.columns.find(c => c.name === name);
    if (!col) throw new ParquetError(`no column ${name} (columns: ${file.columns.map(c => c.name).join(', ')})`);
    if (!col.topLevel || col.repetition === 'REPEATED') throw new ParquetError(`column ${name} is nested or repeated; only top-level primitive columns are read`);
    const values: ParquetValue[] = [];
    for (const group of file.rowGroups) {
      const chunk = group.chunks.get(name);
      if (!chunk) throw new ParquetError(`a row group holds no chunk for column ${name}`);
      values.push(...readChunk(file, chunk, col.repetition === 'OPTIONAL', group.rows));
    }
    if (values.length !== file.rows) throw new ParquetError(`column ${name} holds ${values.length} values for ${file.rows} rows`);
    out[name] = values;
  }
  return out;
}

/** The footer facts a record names: rows, columns, codecs and encodings per column. */
export function describeParquet(file: ParquetFile): {
  rows: number;
  rowGroups: number;
  createdBy: string | null;
  columns: ParquetColumn[];
  codecs: string[];
  encodings: Record<string, string[]>;
} {
  const codecs = new Set<string>();
  const encodings: Record<string, Set<string>> = {};
  for (const g of file.rowGroups) {
    for (const [path, c] of g.chunks) {
      codecs.add(CODEC_NAMES[c.codec] ?? String(c.codec));
      for (const e of c.encodings) (encodings[path] ??= new Set()).add(ENCODING_NAMES[e] ?? String(e));
    }
  }
  return {
    rows: file.rows,
    rowGroups: file.rowGroups.length,
    createdBy: file.createdBy,
    columns: file.columns,
    codecs: [...codecs].sort(),
    encodings: Object.fromEntries(Object.entries(encodings).map(([k, v]) => [k, [...v].sort()])),
  };
}
