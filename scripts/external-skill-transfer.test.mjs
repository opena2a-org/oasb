// Tests for the transfer corpus of the external skill-scanner benchmark
// (scripts/external-skill-transfer.ts and the Parquet reader
// scripts/parquet-columns.ts; the --transfer switch of
// scripts/run-external-skill-benchmark.ts). Run with: npm run test:scripts
// (node --test). Kept outside src/ so the vitest totals the README claims stay
// a count of benchmark tests.
//
// The release table is a synthetic Parquet file this file writes with its own
// minimal writer (dictionary and plain pages, data pages v1 and v2, four
// codecs, nulls, two row groups, a nested column), with a synthetic split file
// and a synthetic reference corpus. No real release or corpus is read.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';
import { tsImport } from 'tsx/esm/api';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(repo, 'scripts', 'run-external-skill-benchmark.ts');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const hasZstd = typeof zlib.zstdCompressSync === 'function';

let pq;
let tr;
let lib;
let root;

// --------------------------------------------------------- a minimal writer

const T = { i32: 5, i64: 6, bin: 8, list: 9, struct: 12 };
function varint(n) {
  let v = BigInt(n);
  const out = [];
  while (v >= 0x80n) {
    out.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  out.push(Number(v));
  return Buffer.from(out);
}
const zigzag = n => {
  const v = BigInt(n);
  return varint(v >= 0n ? v << 1n : (-v << 1n) - 1n);
};
function tvalue(kind, v) {
  if (kind === 'i32' || kind === 'i64') return zigzag(v);
  if (kind === 'bin') {
    const b = Buffer.isBuffer(v) ? v : Buffer.from(v);
    return Buffer.concat([varint(b.length), b]);
  }
  if (kind === 'struct') return tstruct(v);
  const [ek, items] = v;
  const head = items.length < 15 ? Buffer.from([(items.length << 4) | T[ek]]) : Buffer.concat([Buffer.from([0xf0 | T[ek]]), varint(items.length)]);
  return Buffer.concat([head, ...items.map(x => tvalue(ek, x))]);
}
function tstruct(fields) {
  const parts = [];
  let last = 0;
  for (const [id, kind, v] of fields) {
    if (v === undefined) continue;
    const type = kind === 'bool' ? (v ? 1 : 2) : T[kind];
    const delta = id - last;
    parts.push(delta > 0 && delta <= 15 ? Buffer.from([(delta << 4) | type]) : Buffer.concat([Buffer.from([type]), zigzag(id)]));
    last = id;
    if (kind !== 'bool') parts.push(tvalue(kind, v));
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}
function rleRuns(values, width) {
  const bytes = Math.ceil(width / 8);
  const out = [];
  for (let i = 0; i < values.length;) {
    let j = i;
    while (j < values.length && values[j] === values[i]) j++;
    out.push(varint((j - i) << 1));
    const b = Buffer.alloc(bytes);
    for (let k = 0; k < bytes; k++) b[k] = (values[i] >> (8 * k)) & 0xff;
    out.push(b);
    i = j;
  }
  return Buffer.concat(out);
}
function bitPacked(values, width) {
  const groups = Math.ceil(values.length / 8);
  const out = Buffer.alloc(groups * width);
  let bit = 0;
  for (const v of [...values, ...Array(groups * 8 - values.length).fill(0)]) {
    for (let k = 0; k < width; k++, bit++) if ((v >> k) & 1) out[bit >> 3] |= 1 << (bit & 7);
  }
  return Buffer.concat([varint((groups << 1) | 1), out]);
}
const TYPE_ID = { BOOLEAN: 0, INT32: 1, INT64: 2, DOUBLE: 5, BYTE_ARRAY: 6 };
function plain(type, values) {
  if (type === 'BYTE_ARRAY') {
    return Buffer.concat(values.flatMap(v => {
      const b = Buffer.from(v);
      const len = Buffer.alloc(4);
      len.writeUInt32LE(b.length);
      return [len, b];
    }));
  }
  if (type === 'BOOLEAN') {
    const out = Buffer.alloc(Math.ceil(values.length / 8));
    values.forEach((v, i) => { if (v) out[i >> 3] |= 1 << (i & 7); });
    return out;
  }
  const size = type === 'INT32' ? 4 : 8;
  return Buffer.concat(values.map(v => {
    const b = Buffer.alloc(size);
    if (type === 'INT32') b.writeInt32LE(v);
    else if (type === 'INT64') b.writeBigInt64LE(BigInt(v));
    else b.writeDoubleLE(v);
    return b;
  }));
}
function snappyLiteral(data) {
  const parts = [varint(data.length)];
  for (let i = 0; i < data.length; i += 65536) {
    const chunk = data.subarray(i, i + 65536);
    const n = chunk.length - 1;
    parts.push(n < 60 ? Buffer.from([n << 2]) : n < 256 ? Buffer.from([60 << 2, n]) : Buffer.from([61 << 2, n & 0xff, n >> 8]));
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}
const CODECS = {
  UNCOMPRESSED: [0, b => b],
  SNAPPY: [1, snappyLiteral],
  GZIP: [2, b => zlib.gzipSync(b)],
  ZSTD: [6, b => zlib.zstdCompressSync(b)],
  LZ4: [5, b => b],
};

/** One column chunk: an optional top-level column, `pageRows` values per page. */
function chunk(col, values, offset) {
  const [codecId, compress] = CODECS[col.codec];
  const pages = [];
  let dict = null;
  if (col.encoding === 'DICT') {
    dict = [...new Set(values.filter(v => v !== null))];
    const raw = plain(col.type, dict);
    const comp = compress(raw);
    pages.push(Buffer.concat([tstruct([[1, 'i32', 2], [2, 'i32', raw.length], [3, 'i32', comp.length], [7, 'struct', [[1, 'i32', dict.length], [2, 'i32', 0]]]]), comp]));
  }
  const dataPageOffset = offset + pages.reduce((n, p) => n + p.length, 0);
  for (let s = 0; s < values.length; s += col.pageRows) {
    const page = values.slice(s, s + col.pageRows);
    const present = page.filter(v => v !== null);
    const defs = rleRuns(page.map(v => (v === null ? 0 : 1)), 1);
    let body;
    let encoding = 0;
    if (col.encoding === 'DICT') {
      const width = Math.max(1, Math.ceil(Math.log2(Math.max(2, dict.length))));
      body = Buffer.concat([Buffer.from([width]), bitPacked(present.map(v => dict.indexOf(v)), width)]);
      encoding = 8;
    } else if (col.encoding === 'RLE') {
      const len = Buffer.alloc(4);
      const runs = rleRuns(present.map(v => (v ? 1 : 0)), 1);
      len.writeUInt32LE(runs.length);
      body = Buffer.concat([len, runs]);
      encoding = 3;
    } else {
      body = plain(col.type, present);
    }
    if (col.pageVersion === 1) {
      const len = Buffer.alloc(4);
      len.writeUInt32LE(defs.length);
      const raw = Buffer.concat([len, defs, body]);
      const comp = compress(raw);
      pages.push(Buffer.concat([tstruct([[1, 'i32', 0], [2, 'i32', raw.length], [3, 'i32', comp.length], [5, 'struct', [[1, 'i32', page.length], [2, 'i32', encoding], [3, 'i32', 3], [4, 'i32', 3]]]]), comp]));
    } else {
      const comp = compress(body);
      pages.push(Buffer.concat([
        tstruct([[1, 'i32', 3], [2, 'i32', defs.length + body.length], [3, 'i32', defs.length + comp.length],
          [8, 'struct', [[1, 'i32', page.length], [2, 'i32', page.length - present.length], [3, 'i32', page.length], [4, 'i32', encoding], [5, 'i32', defs.length], [6, 'i32', 0], [7, 'bool', true]]]]),
        defs, comp,
      ]));
    }
  }
  const data = Buffer.concat(pages);
  const meta = [
    [1, 'i32', TYPE_ID[col.type]], [2, 'list', ['i32', [encoding(col), 3]]], [3, 'list', ['bin', [col.name]]], [4, 'i32', codecId],
    [5, 'i64', values.length], [6, 'i64', data.length], [7, 'i64', data.length], [9, 'i64', dataPageOffset],
    ...(dict ? [[11, 'i64', offset]] : []),
  ];
  return { data, meta };
}
const encoding = col => (col.encoding === 'DICT' ? 8 : col.encoding === 'RLE' ? 3 : 0);

/** A whole file: the top-level columns, a nested list column `tags` the reader leaves alone, `groups` row groups. */
function writeParquet(columns, rows, groups = 2) {
  const parts = [Buffer.from('PAR1')];
  let offset = 4;
  const rowGroups = [];
  const per = Math.ceil(rows.length / groups);
  for (let g = 0; g < groups; g++) {
    const slice = rows.slice(g * per, (g + 1) * per);
    const chunks = [];
    for (const col of columns) {
      const c = chunk(col, slice.map(r => r[col.name] ?? null), offset);
      parts.push(c.data);
      chunks.push([[2, 'i64', offset], [3, 'struct', c.meta]]);
      offset += c.data.length;
    }
    // The nested column's chunk: every list null (definition level 0), one page.
    const reps = rleRuns(slice.map(() => 0), 1);
    const defs = rleRuns(slice.map(() => 0), 2);
    const l1 = Buffer.alloc(4);
    l1.writeUInt32LE(reps.length);
    const l2 = Buffer.alloc(4);
    l2.writeUInt32LE(defs.length);
    const raw = Buffer.concat([l1, reps, l2, defs]);
    const nested = Buffer.concat([tstruct([[1, 'i32', 0], [2, 'i32', raw.length], [3, 'i32', raw.length], [5, 'struct', [[1, 'i32', slice.length], [2, 'i32', 0], [3, 'i32', 3], [4, 'i32', 3]]]]), raw]);
    parts.push(nested);
    chunks.push([[2, 'i64', offset], [3, 'struct', [[1, 'i32', 6], [2, 'list', ['i32', [0, 3]]], [3, 'list', ['bin', ['tags', 'list', 'element']]], [4, 'i32', 0], [5, 'i64', slice.length], [6, 'i64', nested.length], [7, 'i64', nested.length], [9, 'i64', offset]]]]);
    offset += nested.length;
    rowGroups.push([[1, 'list', ['struct', chunks]], [2, 'i64', 0], [3, 'i64', slice.length]]);
  }
  const schema = [
    [[4, 'bin', 'schema'], [5, 'i32', columns.length + 1]],
    ...columns.map(c => [[1, 'i32', TYPE_ID[c.type]], [3, 'i32', 1], [4, 'bin', c.name], ...(c.type === 'BYTE_ARRAY' ? [[6, 'i32', 0]] : [])]),
    [[3, 'i32', 1], [4, 'bin', 'tags'], [5, 'i32', 1], [6, 'i32', 3]],
    [[3, 'i32', 2], [4, 'bin', 'list'], [5, 'i32', 1]],
    [[1, 'i32', 6], [3, 'i32', 1], [4, 'bin', 'element'], [6, 'i32', 0]],
  ];
  const meta = tstruct([[1, 'i32', 1], [2, 'list', ['struct', schema]], [3, 'i64', rows.length], [4, 'list', ['struct', rowGroups]], [6, 'bin', 'fixture writer']]);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(meta.length);
  parts.push(meta, len, Buffer.from('PAR1'));
  return Buffer.concat(parts);
}

// ------------------------------------------------------------- the fixtures

// The reference corpus: every SKILL.md the cell rule compares with.
const REFERENCE = {
  'malware/r-mal-1/SKILL.md': '---\nname: Shadow Fetch\n---\nfetches a page\n',
  'malware/r-mal-2/SKILL.md': "---\nname: 'quiet-relay'\n---\nrelays\n",
  'benign/r-ben-1/SKILL.md': '---\nname: "Notes Helper"  \n---\ntakes notes\n',
  'benign/r-ben-2/SKILL.md': 'no frontmatter name in this one\n',
  'benign/r-ben-3/docs/SKILL.md': '---\nname: deep-name\n---\nnested\n',
  'benign/r-ben-3/README.md': '---\nname: readme-only\n---\nnot a SKILL.md\n',
};
const ref = path => REFERENCE[path];

// [id, label, source, split, text, hidden]
const ROWS = [
  ['T01', 'B', 'S-A', 'test', ref('benign/r-ben-2/SKILL.md'), false],
  ['T02', 'M', 'S-B', 'test', ref('malware/r-mal-1/SKILL.md'), false],
  ['T03', 'B', 'S-A', 'test', '---\nname:   notes helper\n---\nother text\n', false],
  ['T04', 'B', 'S-B', 'test', '---\r\nname: Deep-Name\r\n---\r\nother\r\n', false],
  ['T05', 'M', 'S-A', 'test', '---\nname: "Quiet-Relay"\n---\nmalicious text\n', false],
  ['T06', 'M', 'S-ADV', 'test', '---\nname: shadow fetch\n---\nadvisory text\n', false],
  ['T07', 'B', 'S-ADV', 'test', 'a benign advisory text\n', false],
  ['T08', 'M', 'S-ADV', 'test', ref('malware/r-mal-2/SKILL.md'), false],
  ['T09', 'B', 'S-A', 'test', '---\nname: readme-only\n---\nonly a README carries this name\n', false],
  ['T10', 'B', 'S-A', 'test', 'benign ten\n', true],
  ['T11', 'B', 'S-B', 'test', 'benign eleven\n', false],
  ['T12', 'B', 'S-B', 'test', 'benign twelve: "quoted", and a comma\n', false],
  ['T13', 'B', 'S-A', 'test', 'benign thirteen\n', false],
  ['T14', 'B', 'S-B', 'test', 'benign fourteen ünïcödé\n', false],
  ['T15', 'M', 'S-A', 'test', 'malicious fifteen\n', false],
  ['T16', 'M', 'S-B', 'test', 'malicious sixteen\n', false],
  ['T17', 'M', 'S-B', 'test', 'malicious seventeen\n', false],
  ['T18', 'M', 'S-A', 'test', 'malicious eighteen\n', false],
  ['T19', 'B', 'S-A', 'train', ref('benign/r-ben-2/SKILL.md'), false],
  ['T20', 'M', 'S-B', 'validation', 'malicious twenty\n', false],
  ['T21', 'B', 'S-B', 'train', null, false],
];
const EXPECT = '3+2/6@S-A:3,S-B:3/4+1@S-A:3,S-B:2/2@S-ADV:2';
const COLUMNS_SPEC = 'id=ident,label=klass,source=origin,text=body,redacted=hidden,split=part';

const TABLE_COLUMNS = [
  { name: 'ident', type: 'BYTE_ARRAY', encoding: 'PLAIN', codec: 'UNCOMPRESSED', pageVersion: 1, pageRows: 4 },
  { name: 'klass', type: 'BYTE_ARRAY', encoding: 'DICT', codec: 'SNAPPY', pageVersion: 2, pageRows: 5 },
  { name: 'origin', type: 'BYTE_ARRAY', encoding: 'DICT', codec: 'GZIP', pageVersion: 1, pageRows: 3 },
  { name: 'body', type: 'BYTE_ARRAY', encoding: 'PLAIN', codec: hasZstd ? 'ZSTD' : 'GZIP', pageVersion: 2, pageRows: 4 },
  { name: 'hidden', type: 'BOOLEAN', encoding: 'PLAIN', codec: 'SNAPPY', pageVersion: 1, pageRows: 6 },
  { name: 'flagRle', type: 'BOOLEAN', encoding: 'RLE', codec: 'UNCOMPRESSED', pageVersion: 2, pageRows: 5 },
  { name: 'size', type: 'INT64', encoding: 'PLAIN', codec: 'GZIP', pageVersion: 2, pageRows: 7 },
  { name: 'rank', type: 'INT32', encoding: 'PLAIN', codec: 'UNCOMPRESSED', pageVersion: 1, pageRows: 9 },
  { name: 'score', type: 'DOUBLE', encoding: 'PLAIN', codec: 'SNAPPY', pageVersion: 1, pageRows: 8 },
];
const tableRows = rows => rows.map(([id, label, source, , text, hidden], i) => ({
  ident: id, klass: label, origin: source, body: text, hidden,
  flagRle: i % 3 === 0 ? null : i % 2 === 0, size: i % 4 === 0 ? null : BigInt(i) * 1000000007n, rank: 10 - i, score: i / 4,
}));

function splitCsv(rows) {
  // CRLF rows, one quoted id, the label and source columns repeated from the table.
  return 'ident,klass,origin,part\r\n' + rows.map(([id, label, source, split]) => `${id === 'T09' ? '"T09"' : id},${label},${source},${split}`).join('\r\n') + '\r\n';
}

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

let parquetPath;
let splitPath;
let referenceRoot;
let parquetSha;

function release(name, rows, columns = TABLE_COLUMNS) {
  const dir = join(root, 'releases', name);
  mkdirSync(dir, { recursive: true });
  const bytes = writeParquet(columns, tableRows(rows));
  writeFileSync(join(dir, 'table.parquet'), bytes);
  writeFileSync(join(dir, 'split.csv'), splitCsv(rows));
  return { parquet: join(dir, 'table.parquet'), split: join(dir, 'split.csv'), sha: sha256(bytes) };
}

before(async () => {
  pq = await tsImport('./parquet-columns.ts', import.meta.url).then(m => (m.openParquet ? m : m.default));
  tr = await tsImport('./external-skill-transfer.ts', import.meta.url).then(m => (m.computeTransferCells ? m : m.default));
  lib = await tsImport('./external-skill-benchmark.ts', import.meta.url).then(m => (m.runBenchmark ? m : m.default));
  root = mkdtempSync(join(tmpdir(), 'oasb-transfer-'));
  const r = release('main', ROWS);
  parquetPath = r.parquet;
  splitPath = r.split;
  parquetSha = r.sha;
  referenceRoot = join(root, 'reference');
  for (const [rel, text] of Object.entries(REFERENCE)) {
    mkdirSync(dirname(join(referenceRoot, rel)), { recursive: true });
    writeFileSync(join(referenceRoot, rel), text);
  }
  git(referenceRoot, 'init', '-q');
  git(referenceRoot, 'add', '.');
  git(referenceRoot, 'commit', '-q', '-m', 'reference');
});

after(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function spec(overrides = {}) {
  return {
    parquet: parquetPath,
    parquetSha256: parquetSha,
    revision: 'fixture-revision',
    splitFile: splitPath,
    splitValue: 'test',
    columns: tr.parseColumns(COLUMNS_SPEC),
    labels: tr.parseLabels('malicious=M,benign=B'),
    advisorySources: ['S-ADV'],
    referenceRoot,
    referenceClassDirs: { malicious: 'malware', benign: 'benign' },
    reference: { commit: null, dirty: 0 },
    ...overrides,
  };
}

// ------------------------------------------------------------------- tests

test('the Parquet reader reads every top-level column across codecs, page versions, dictionary pages, nulls and row groups', () => {
  const file = pq.openParquet(readFileSync(parquetPath));
  const names = TABLE_COLUMNS.map(c => c.name);
  const cols = pq.readColumns(file, names);
  const want = tableRows(ROWS);
  assert.equal(file.rows, ROWS.length);
  assert.equal(file.rowGroups.length, 2);
  for (const name of names) {
    const got = cols[name].map(v => (Buffer.isBuffer(v) ? v.toString('utf8') : v));
    assert.deepEqual(got, want.map(r => r[name]), name);
  }
  // Text is returned as the stored bytes.
  assert.ok(Buffer.isBuffer(cols.body[13]));
  assert.equal(sha256(cols.body[13]), sha256(Buffer.from('benign fourteen ünïcödé\n')));
  const d = pq.describeParquet(file);
  assert.deepEqual(d.codecs, [...new Set([...TABLE_COLUMNS.map(c => c.codec), 'UNCOMPRESSED'])].sort());
  assert.deepEqual(d.encodings.klass, ['RLE', 'RLE_DICTIONARY']);
  // A nested column is listed as nested, never read, and refused when asked for.
  assert.ok(d.columns.some(c => c.name === 'tags.list.element' && !c.topLevel));
  assert.throws(() => pq.readColumns(file, ['tags.list.element']), /nested or repeated/);
  assert.throws(() => pq.readColumns(file, ['no-such-column']), /no column no-such-column/);
});

test('the Parquet reader refuses a file it cannot read, by name', () => {
  assert.throws(() => pq.openParquet(Buffer.from('PAR1 not a parquet file')), /PAR1|footer/);
  assert.throws(() => pq.openParquet(Buffer.from('plain text, no magic at all')), /not a Parquet file/);
  const lz4 = writeParquet([{ name: 'a', type: 'BYTE_ARRAY', encoding: 'PLAIN', codec: 'LZ4', pageVersion: 1, pageRows: 4 }], [{ a: 'x' }, { a: 'y' }], 1);
  assert.throws(() => pq.readColumns(pq.openParquet(lz4), ['a']), /codec LZ4 is not read/);
  const good = readFileSync(parquetPath);
  const truncated = Buffer.concat([good.subarray(0, 40), good.subarray(good.length - 8)]);
  assert.throws(() => pq.readColumns(pq.openParquet(truncated), ['body']));
});

test('the page codecs: snappy copies, and zstd where this Node has it', () => {
  // "abcd" then a 1-byte-offset copy of 8 (offset 4), then a 2-byte-offset overlapping copy of 5 (offset 1).
  const block = Buffer.from([17, 0x0c, 0x61, 0x62, 0x63, 0x64, 0x11, 0x04, (5 - 1) << 2 | 2, 0x01, 0x00]);
  assert.equal(pq.snappyDecompress(block).toString(), 'abcdabcdabcdddddd');
  assert.throws(() => pq.snappyDecompress(Buffer.from([8, 0x0c, 0x61, 0x62, 0x63, 0x64, 0x11, 0x09])), /outside the output/);
  const frame = Buffer.from('28b52ffd20210901007a7374642070616765207061796c6f61643a206e616d653a20666978747572650a', 'hex');
  if (typeof zlib.zstdDecompressSync === 'function') {
    assert.equal(pq.decompressPage(6, frame, 33).toString(), 'zstd page payload: name: fixture\n');
    assert.throws(() => pq.decompressPage(6, frame, 34), /states 34/);
  } else {
    assert.throws(() => pq.decompressPage(6, frame, 33), /needs Node 22\.15 or later/);
  }
});

test('the frontmatter name rule and the split file parser', () => {
  assert.equal(tr.frontmatterName('---\nname: Shadow Fetch\n---\n'), 'shadow fetch');
  assert.equal(tr.frontmatterName("x\nname: 'Quoted Name'  \nname: second\n"), 'quoted name');
  assert.equal(tr.frontmatterName('---\r\nname: Deep-Name\r\n---\r\n'), 'deep-name');
  assert.equal(tr.frontmatterName('  name: indented is not a match\n'), null);
  assert.equal(tr.frontmatterName('no name here\n'), null);
  assert.deepEqual(tr.parseCsv('a,b\r\n"x, y","say ""hi"""\r\nz,\r\n'), [['a', 'b'], ['x, y', 'say "hi"'], ['z', '']]);
  assert.throws(() => tr.parseCsv('a\n"open'), /quoted field/);
});

test('the cells: exact text and benign name-shared are excluded, advisory sources are advisory, malicious name-shared is its own row', () => {
  const cells = tr.computeTransferCells(spec());
  const by = Object.fromEntries(cells.identities.map(x => [x.id, x]));
  assert.equal(cells.identities.length, 18, 'only the test split');
  assert.deepEqual([by.T01.reason, by.T02.reason, by.T08.reason], ['exact', 'exact', 'exact']);
  assert.deepEqual([by.T03.reason, by.T04.reason], ['name', 'name']);
  assert.equal(by.T05.cell, 'gate');
  assert.equal(by.T05.nameShared, true);
  assert.deepEqual([by.T06.cell, by.T07.cell], ['advisory', 'advisory']);
  assert.equal(by.T09.cell, 'gate', 'a name carried only by a README is not a SKILL.md name');
  assert.equal(by.T10.redacted, true);
  assert.equal(by.T10.textSha256, sha256('benign ten\n'));
  assert.match(by.T10.nid, /^n-[0-9a-f]{16}$/);
  assert.deepEqual(cells.counts, {
    identities: 18,
    excluded: { total: 5, exact: 3, name: 2 },
    gateBenign: { total: 6, bySource: { 'S-A': 3, 'S-B': 3 } },
    gateMalicious: { total: 5, bySource: { 'S-A': 3, 'S-B': 2 }, nameShared: 1, nameSharedBySource: { 'S-A': 1 } },
    advisory: { total: 2, bySource: { 'S-ADV': 2 } },
  });
  assert.equal(cells.release.splitFile.crossChecked, 2 * ROWS.length);
  assert.equal(cells.reference.files, 5, 'every SKILL.md, at any depth, and no other file');
  assert.match(tr.formatCells(cells.counts), /^excluded 3 \+ 2 \(exact text \+ benign name-shared\) = 5$/m);
  assert.match(tr.formatCells(cells.counts), /^gate-malicious 4 \+ 1 \(name-shared, own row\) = 5 \(S-A 3, S-B 2\)$/m);
  assert.deepEqual(tr.compareCells(cells.counts, tr.parseExpectedCells(EXPECT)), []);
  assert.deepEqual(tr.compareCells(cells.counts, tr.parseExpectedCells('5/6/5/2')), []);
  const off = tr.compareCells(cells.counts, tr.parseExpectedCells('2+3/7@S-A:4,S-B:3/5+0/2@S-ADV:1,S-X:1'));
  assert.deepEqual(off, [
    'excluded 3 + 2, expected 2 + 3',
    'gate-benign 6, expected 7',
    'gate-benign S-A 3, expected 4',
    'gate-malicious 4 + 1, expected 5 + 0',
    'advisory S-ADV 2, expected 1',
    'advisory S-X 0, expected 1',
  ]);
  assert.throws(() => tr.parseExpectedCells('1/2/3'), /expect-cells/);
  assert.throws(() => tr.parseExpectedCells('1/2+1/3/4'), /not a count/);
});

test('the release pins and its integrity: another sha256, a split row the table contradicts, a test identity with no text, an unknown label', () => {
  assert.throws(() => tr.computeTransferCells(spec({ parquetSha256: '0'.repeat(64) })), /not 0000/);
  assert.throws(() => tr.computeTransferCells(spec({ splitSha256: '0'.repeat(64) })), /not 0000/);
  const contradicted = release('contradicted', ROWS);
  writeFileSync(contradicted.split, readFileSync(contradicted.split, 'utf8').replace('T11,B,S-B', 'T11,M,S-B'));
  assert.throws(() => tr.computeTransferCells(spec({ parquet: contradicted.parquet, parquetSha256: contradicted.sha, splitFile: contradicted.split })), /klass M, the release B/);
  const noText = release('no-text', ROWS.map(r => (r[0] === 'T11' ? [...r.slice(0, 4), null, false] : r)));
  assert.throws(() => tr.computeTransferCells(spec({ parquet: noText.parquet, parquetSha256: noText.sha, splitFile: noText.split })), /T11 has no body/);
  const strange = release('strange-label', ROWS.map(r => (r[0] === 'T12' ? [r[0], 'X', ...r.slice(2)] : r)));
  assert.throws(() => tr.computeTransferCells(spec({ parquet: strange.parquet, parquetSha256: strange.sha, splitFile: strange.split })), /neither M nor B/);
  assert.throws(() => tr.parseColumns('id=a,label=b,source=c'), /text= is required/);
  assert.throws(() => tr.parseLabels('malicious=1,benign=1'), /two different values/);
});

test('materialisation writes one SKILL.md per identity under a neutral id, one commit, and the membership manifest outside the corpus', () => {
  const cells = tr.computeTransferCells(spec());
  const a = tr.materialiseTransfer(cells, join(root, 'materialised-a'));
  const b = tr.materialiseTransfer(cells, join(root, 'materialised-b'));
  assert.equal(a.commit, b.commit, 'the same cells give the same commit');
  assert.match(a.commit, /^[0-9a-f]{40}$/);
  assert.deepEqual(readdirSync(a.out).sort(), ['corpus', 'manifest.json']);
  for (const x of cells.identities) {
    const dir = join(a.corpus, x.cell, x.label === 'malicious' ? 'malware' : 'benign', x.nid);
    assert.deepEqual(readdirSync(dir), ['SKILL.md'], x.id);
    assert.equal(sha256(readFileSync(join(dir, 'SKILL.md'))), x.textSha256, x.id);
  }
  assert.equal(readdirSync(join(a.corpus, 'gate', 'benign')).length, 6);
  assert.equal(readdirSync(join(a.corpus, 'gate', 'malware')).length, 5);
  assert.deepEqual(readdirSync(join(a.corpus, 'advisory', 'benign')).length, 1);
  assert.equal(git(a.corpus, 'status', '--porcelain', '--untracked-files=all'), '');
  const manifest = JSON.parse(readFileSync(join(a.out, 'manifest.json'), 'utf8'));
  assert.equal(manifest.schema, tr.TRANSFER_SCHEMA);
  assert.equal(manifest.corpus.commit, a.commit);
  assert.deepEqual(manifest.redacted, ['T10']);
  assert.equal(manifest.identities.length, 18);
  assert.ok(manifest.identities.every(x => !('text' in x)), 'the manifest names identities and holds no text');
  assert.ok(!readFileSync(join(a.out, 'manifest.json'), 'utf8').includes('benign ten'));
  assert.throws(() => tr.materialiseTransfer(cells, join(root, 'materialised-a')), /exists/);
});

test('the CLI materialises the cells when they equal the expected counts, and writes nothing when they differ', () => {
  const base = ['--import', 'tsx', cli, '--transfer', parquetPath, '--transfer-sha256', parquetSha, '--transfer-revision', 'fixture-revision',
    '--split-file', splitPath, '--transfer-columns', COLUMNS_SPEC, '--transfer-labels', 'malicious=M,benign=B',
    '--advisory-sources', 'S-ADV', '--reference-corpus', referenceRoot];
  const out = join(root, 'cli-cells');
  const ok = spawnSync(process.execPath, [...base, '--expect-cells', EXPECT, '--out', out], { cwd: repo, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /the recomputed cells equal the expected counts/);
  assert.match(ok.stdout, /^materialised: .* at commit [0-9a-f]{40}/m);
  assert.ok(existsSync(join(out, 'corpus', 'gate', 'malware')));
  const wrongOut = join(root, 'cli-cells-wrong');
  const wrong = spawnSync(process.execPath, [...base, '--expect-cells', '3+2/6/5/3', '--out', wrongOut], { cwd: repo, encoding: 'utf8' });
  assert.equal(wrong.status, 1);
  assert.match(wrong.stdout, /differ from the expected counts; nothing was written:\nadvisory 2, expected 3/);
  assert.ok(!existsSync(wrongOut) && !existsSync(`${wrongOut}.incomplete`));
  const unchecked = spawnSync(process.execPath, [...base, '--out', join(root, 'cli-cells-unchecked')], { cwd: repo, encoding: 'utf8' });
  assert.equal(unchecked.status, 2, 'materialising needs the expected counts');
  const printOnly = spawnSync(process.execPath, base, { cwd: repo, encoding: 'utf8' });
  assert.equal(printOnly.status, 0, printOnly.stderr);
  assert.match(printOnly.stdout, /^advisory 2 \(S-ADV 2\)$/m);
});

test('the runner scans a materialised gate cell as a corpus at its commit, and the run passes its own check', async () => {
  const cells = tr.computeTransferCells(spec());
  const m = tr.materialiseTransfer(cells, join(root, 'materialised-run'));
  const install = join(root, 'scanner');
  const pkg = join(install, 'node_modules', 'fixture-scanner');
  mkdirSync(join(pkg, 'dist'), { recursive: true });
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'fixture-scanner', version: '1.0.0' }));
  writeFileSync(join(pkg, 'dist', 'cli.js'), "process.stdout.write(JSON.stringify({ hackmyagentVersion: '1.0.0', measured: true, details: [] }));");
  writeFileSync(join(install, 'package.json'), JSON.stringify({ name: 'fixture-install', private: true }));
  writeFileSync(join(install, 'package-lock.json'), JSON.stringify({ name: 'fixture-install', lockfileVersion: 3, packages: { 'node_modules/fixture-scanner': { version: '1.0.0', integrity: 'sha512-fixture' } } }));
  const adapter = { ...lib.hackmyagent, name: 'fixture-scanner' };
  const out = join(root, 'runs', 'gate');
  const { record } = await lib.runBenchmark({
    corpus: join(m.corpus, 'gate'), adapter, scanner: lib.resolveScanner(adapter, 'fixture-scanner@1.0.0', install),
    instrument: 'check', network: 'on', workers: 4, timeoutMs: 30000, out, corpusCommit: m.commit, log: () => {},
  });
  assert.deepEqual(lib.verifyRun(out), []);
  assert.equal(record.corpus.commit, m.commit);
  assert.deepEqual(record.corpus.samples, { malicious: 5, benign: 6 });
  assert.deepEqual(record.adjudication.contestedPairs, []);
});
