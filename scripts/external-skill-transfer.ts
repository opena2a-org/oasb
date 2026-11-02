/**
 * The transfer corpus of the external skill-scanner benchmark: a release
 * table (Parquet) and its split file, read at a pinned revision and sha256,
 * turned into cells and materialised as a corpus the runner scans. Used by
 * scripts/external-skill-benchmark.ts; it imports nothing from the runner.
 * Every release-specific value (paths, revision, sha256, column names, label
 * values, advisory sources, expected counts) is given at run time.
 *
 * Cell rule. For each identity of the chosen split, against every SKILL.md of
 * a reference corpus:
 * - excluded when its text is byte-identical to a reference SKILL.md (exact),
 *   or when it is benign and its frontmatter name equals a reference SKILL.md
 *   name (name); the frontmatter name is read by NAME_RULE: NAME_PATTERN takes
 *   each name line, and the code trims its value, removes one pair of
 *   matching surrounding quotes and lowercases it;
 * - otherwise advisory when its source is an advisory source;
 * - otherwise a gate identity of its class; a malicious gate identity whose
 *   name equals a reference name is reported as its own row.
 *
 * Materialisation writes one directory per identity, under a neutral id
 * (n- and 16 hex digits of sha256("neutral\n" + id)), holding one SKILL.md
 * written byte for byte from the text column, for both classes alike:
 *   <out>/corpus/<gate|advisory|excluded>/<malware|benign>/<id>/SKILL.md
 * <out>/corpus is a git repository with one commit whose author, committer and
 * dates are fixed, so the same cells give the same commit. The membership
 * manifest (id to neutral id, cell, reason) is written beside it, at
 * <out>/manifest.json, outside the scanned tree.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { devNull } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { type ParquetValue, describeParquet, openParquet, readColumns } from './parquet-columns.js';

export const TRANSFER_SCHEMA = 'oasb-transfer-cells/v1';
export const NAME_PATTERN = /^name:(.*)$/m;
export const NAME_RULE =
  'the first line matching namePattern whose value (its capture), trimmed, stripped of one pair of matching surrounding quotes where it has them, and trimmed again, is not empty and holds no " or \'; that value, lowercased';
const NAME_LINES = new RegExp(NAME_PATTERN.source, 'gm');
export const REFERENCE_FILE = 'SKILL.md';
export const CELLS = ['gate', 'advisory', 'excluded'] as const;
export const MATERIALISED_CLASS_DIRS = { malicious: 'malware', benign: 'benign' } as const;
export const CELL_RULE =
  'excluded when the text is byte-identical to a reference SKILL.md, or when the identity is benign and its frontmatter name equals a reference SKILL.md name (lowercased); otherwise advisory when its source is an advisory source; otherwise a gate identity, and a malicious gate identity that shares a name is reported as its own row';
const FIXED_DATE = '2000-01-01T00:00:00Z';

export type Label = 'malicious' | 'benign';
export type Cell = (typeof CELLS)[number];

export class TransferError extends Error {}

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

export function transferNeutralId(id: string): string {
  return `n-${sha256(`neutral\n${id}`).slice(0, 16)}`;
}

/**
 * The frontmatter name rule (NAME_RULE). NAME_PATTERN takes each name line in
 * turn and nothing more; the white space and the quotes around its value are
 * read here, in code. A line whose value is then empty or holds a quote gives
 * no name, and the next name line is read.
 */
export function frontmatterName(text: string): string | null {
  for (const m of text.matchAll(NAME_LINES)) {
    let value = m[1].trim();
    const quote = value[0];
    if (value.length > 1 && (quote === '"' || quote === "'") && value.endsWith(quote)) value = value.slice(1, -1).trim();
    if (value !== '' && !value.includes('"') && !value.includes("'")) return value.toLowerCase();
  }
  return null;
}

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF rows. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"' && field === '') quoted = true;
    else if (c === ',') endField();
    else if (c === '\n') endRow();
    else if (c === '\r' && text[i + 1] === '\n') {
      endRow();
      i += 1;
    } else field += c;
    i += 1;
  }
  if (quoted) throw new TransferError('the split file ends inside a quoted field');
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

export interface TransferColumns {
  id: string;
  label: string;
  source: string;
  text: string;
  redacted?: string;
  split: string;
}

/** Parses `id=<col>,label=<col>,source=<col>,text=<col>[,redacted=<col>][,split=<col>]`. */
export function parseColumns(spec: string): TransferColumns {
  const out: Record<string, string> = {};
  for (const part of spec.split(',')) {
    const at = part.indexOf('=');
    if (at <= 0 || at === part.length - 1) throw new TransferError(`column spec ${part}: name=column`);
    const name = part.slice(0, at).trim();
    if (!['id', 'label', 'source', 'text', 'redacted', 'split'].includes(name)) throw new TransferError(`column spec: unknown field ${name}`);
    out[name] = part.slice(at + 1).trim();
  }
  for (const need of ['id', 'label', 'source', 'text']) if (!out[need]) throw new TransferError(`column spec: ${need}= is required`);
  return { id: out.id, label: out.label, source: out.source, text: out.text, redacted: out.redacted, split: out.split ?? 'split' };
}

/** Parses `malicious=<value>,benign=<value>`. */
export function parseLabels(spec: string): Record<Label, string> {
  const out: Record<string, string> = {};
  for (const part of spec.split(',')) {
    const at = part.indexOf('=');
    const name = part.slice(0, at).trim();
    if (at <= 0 || (name !== 'malicious' && name !== 'benign')) throw new TransferError(`label spec ${part}: malicious=<value> or benign=<value>`);
    out[name] = part.slice(at + 1).trim();
  }
  if (out.malicious === undefined || out.benign === undefined || out.malicious === out.benign) {
    throw new TransferError('label spec: malicious=<value>,benign=<value>, two different values');
  }
  return out as Record<Label, string>;
}

// ---------------------------------------------------------------- the counts

export interface CellCount {
  total: number;
  bySource: Record<string, number>;
}

export interface CellCounts {
  identities: number;
  excluded: { total: number; exact: number; name: number };
  gateBenign: CellCount;
  gateMalicious: CellCount & { nameShared: number; nameSharedBySource: Record<string, number> };
  advisory: CellCount;
}

interface ExpectedField {
  total: number;
  parts: [number, number] | null;
  bySource: Record<string, number> | null;
}

export interface ExpectedCells {
  excluded: ExpectedField;
  gateBenign: ExpectedField;
  gateMalicious: ExpectedField;
  advisory: ExpectedField;
}

/**
 * Parses `<excluded>/<gate-benign>/<gate-malicious>/<advisory>`. Each field is
 * a count, or for excluded `<exact>+<name>` and for gate-malicious
 * `<unshared>+<name-shared>`; any field may add `@<source>:<n>,...`.
 */
export function parseExpectedCells(spec: string): ExpectedCells {
  const fields = spec.split('/');
  if (fields.length !== 4) throw new TransferError('--expect-cells takes <excluded>/<gate-benign>/<gate-malicious>/<advisory>');
  const parse = (field: string, parts: boolean): ExpectedField => {
    const m = /^(\d+)(?:\+(\d+))?(?:@(.+))?$/.exec(field.trim());
    if (!m || (m[2] !== undefined && !parts)) throw new TransferError(`--expect-cells field ${field} is not a count${parts ? ' or a+b' : ''}`);
    let bySource: Record<string, number> | null = null;
    if (m[3] !== undefined) {
      bySource = {};
      for (const pair of m[3].split(',')) {
        const s = /^([^:]+):(\d+)$/.exec(pair.trim());
        if (!s) throw new TransferError(`--expect-cells source count ${pair} is not <source>:<n>`);
        bySource[s[1]] = Number(s[2]);
      }
    }
    const a = Number(m[1]);
    if (m[2] === undefined) return { total: a, parts: null, bySource };
    return { total: a + Number(m[2]), parts: [a, Number(m[2])], bySource };
  };
  return { excluded: parse(fields[0], true), gateBenign: parse(fields[1], false), gateMalicious: parse(fields[2], true), advisory: parse(fields[3], false) };
}

/** Each way the recomputed cells differ from the expected ones. */
export function compareCells(counts: CellCounts, expected: ExpectedCells): string[] {
  const out: string[] = [];
  const check = (name: string, total: number, parts: [number, number] | null, bySource: Record<string, number> | null, want: ExpectedField) => {
    if (total !== want.total) out.push(`${name} ${total}, expected ${want.total}`);
    if (want.parts && parts && (parts[0] !== want.parts[0] || parts[1] !== want.parts[1])) out.push(`${name} ${parts[0]} + ${parts[1]}, expected ${want.parts[0]} + ${want.parts[1]}`);
    if (want.bySource && bySource) {
      const sources = [...new Set([...Object.keys(want.bySource), ...Object.keys(bySource)])].sort();
      for (const s of sources) if ((bySource[s] ?? 0) !== (want.bySource[s] ?? 0)) out.push(`${name} ${s} ${bySource[s] ?? 0}, expected ${want.bySource[s] ?? 0}`);
    }
  };
  check('excluded', counts.excluded.total, [counts.excluded.exact, counts.excluded.name], null, expected.excluded);
  if (expected.excluded.bySource) out.push('excluded takes no source counts');
  check('gate-benign', counts.gateBenign.total, null, counts.gateBenign.bySource, expected.gateBenign);
  const gm = counts.gateMalicious;
  check('gate-malicious', gm.total, [gm.total - gm.nameShared, gm.nameShared], gm.bySource, expected.gateMalicious);
  check('advisory', counts.advisory.total, null, counts.advisory.bySource, expected.advisory);
  return out;
}

const bySourceText = (b: Record<string, number>) => {
  const keys = Object.keys(b).sort();
  return keys.length === 0 ? '' : ` (${keys.map(k => `${k} ${b[k]}`).join(', ')})`;
};

/** The cells as one line each, in the order the expected counts take them. */
export function formatCells(counts: CellCounts): string {
  const gm = counts.gateMalicious;
  return [
    `identities ${counts.identities}`,
    `excluded ${counts.excluded.exact} + ${counts.excluded.name} (exact text + benign name-shared) = ${counts.excluded.total}`,
    `gate-benign ${counts.gateBenign.total}${bySourceText(counts.gateBenign.bySource)}`,
    `gate-malicious ${gm.total - gm.nameShared} + ${gm.nameShared} (name-shared, own row) = ${gm.total}${bySourceText(gm.bySource)}`,
    `gate-malicious name-shared ${gm.nameShared}${bySourceText(gm.nameSharedBySource)}`,
    `advisory ${counts.advisory.total}${bySourceText(counts.advisory.bySource)}`,
  ].join('\n');
}

// ------------------------------------------------------------- the computation

export interface TransferSpec {
  parquet: string;
  parquetSha256: string;
  revision: string;
  splitFile: string;
  splitSha256?: string;
  splitValue: string;
  columns: TransferColumns;
  labels: Record<Label, string>;
  advisorySources: string[];
  /** The reference corpus: the directory that holds its class directories. */
  referenceRoot: string;
  referenceClassDirs: Record<Label, string>;
  reference: { commit: string | null; dirty: number | null };
}

export interface TransferIdentity {
  id: string;
  nid: string;
  label: Label;
  source: string;
  cell: Cell;
  reason: 'exact' | 'name' | null;
  nameShared: boolean;
  redacted: boolean;
  textSha256: string;
  textBytes: number;
  text: Buffer;
}

export interface TransferCells {
  identities: TransferIdentity[];
  counts: CellCounts;
  release: any;
  reference: any;
}

function walkNamed(dir: string, name: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkNamed(path, name, out);
    else if (entry.isFile() && entry.name === name) out.push(path);
  }
}

const text = (v: ParquetValue): string | null => (v === null ? null : Buffer.isBuffer(v) ? v.toString('utf8') : String(v));

/** Reads the release at its pins and computes the cells. Refuses a release whose files are not the pinned ones. */
export function computeTransferCells(spec: TransferSpec): TransferCells {
  const parquetBytes = readFileSync(spec.parquet);
  const parquetSha = sha256(parquetBytes);
  if (parquetSha !== spec.parquetSha256) throw new TransferError(`${spec.parquet} has sha256 ${parquetSha}, not ${spec.parquetSha256}`);
  const splitBytes = readFileSync(spec.splitFile);
  const splitSha = sha256(splitBytes);
  if (spec.splitSha256 && splitSha !== spec.splitSha256) throw new TransferError(`${spec.splitFile} has sha256 ${splitSha}, not ${spec.splitSha256}`);
  if (spec.reference.dirty) throw new TransferError(`the reference corpus checkout has ${spec.reference.dirty} modified or untracked paths`);

  const file = openParquet(parquetBytes);
  const c = spec.columns;
  const names = [c.id, c.label, c.source, c.text, ...(c.redacted ? [c.redacted] : [])];
  const cols = readColumns(file, names);
  const ids = cols[c.id].map(text);
  const byId = new Map<string, number>();
  ids.forEach((id, i) => {
    if (id === null || id === '') throw new TransferError(`row ${i + 1} of the release has no ${c.id}`);
    if (byId.has(id)) throw new TransferError(`${c.id} ${id} appears twice in the release`);
    byId.set(id, i);
  });

  const rows = parseCsv(splitBytes.toString('utf8'));
  const header = rows[0] ?? [];
  const at = (name: string) => header.indexOf(name);
  if (at(c.id) === -1 || at(c.split) === -1) throw new TransferError(`the split file has no ${c.id} or ${c.split} column (columns: ${header.join(', ')})`);
  const chosen: number[] = [];
  const seenSplit = new Set<string>();
  const splitValues: Record<string, number> = {};
  let crossChecked = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0] === '') continue;
    if (row.length !== header.length) throw new TransferError(`split file row ${r + 1} has ${row.length} fields, the header ${header.length}`);
    const id = row[at(c.id)];
    if (seenSplit.has(id)) throw new TransferError(`split file names ${id} twice`);
    seenSplit.add(id);
    const i = byId.get(id);
    if (i === undefined) throw new TransferError(`split file names ${id}, which the release does not hold`);
    // Where the split file repeats a column of the release, the two agree.
    for (const col of [c.label, c.source]) {
      if (at(col) !== -1) {
        if (row[at(col)] !== text(cols[col][i])) throw new TransferError(`split file row ${r + 1}: ${col} ${row[at(col)]}, the release ${text(cols[col][i])}`);
        crossChecked += 1;
      }
    }
    const value = row[at(c.split)];
    splitValues[value] = (splitValues[value] ?? 0) + 1;
    if (value === spec.splitValue) chosen.push(i);
  }
  if (chosen.length === 0) throw new TransferError(`no identity of the split file has ${c.split} ${spec.splitValue}`);

  // The reference: every SKILL.md under its class directories.
  const refPaths: string[] = [];
  for (const label of ['malicious', 'benign'] as Label[]) walkNamed(join(spec.referenceRoot, spec.referenceClassDirs[label]), REFERENCE_FILE, refPaths);
  const refHashes = new Set<string>();
  const refNames = new Set<string>();
  const refLines: string[] = [];
  for (const p of refPaths) {
    const data = readFileSync(p);
    const h = sha256(data);
    refHashes.add(h);
    refLines.push(`${h}  ${relative(spec.referenceRoot, p).split(sep).join('/')}`);
    const n = frontmatterName(data.toString('utf8'));
    if (n !== null) refNames.add(n);
  }

  const advisory = new Set(spec.advisorySources);
  const identities: TransferIdentity[] = [];
  const nids = new Map<string, string>();
  for (const i of chosen) {
    const id = ids[i]!;
    const raw = cols[c.text][i];
    if (!Buffer.isBuffer(raw)) throw new TransferError(`${id} has no ${c.text}; every identity of the split needs its text`);
    const labelValue = text(cols[c.label][i]);
    const label: Label | null = labelValue === spec.labels.malicious ? 'malicious' : labelValue === spec.labels.benign ? 'benign' : null;
    if (label === null) throw new TransferError(`${id} has ${c.label} ${labelValue}, neither ${spec.labels.malicious} nor ${spec.labels.benign}`);
    const source = text(cols[c.source][i]) ?? '';
    const textSha256 = sha256(raw);
    const name = frontmatterName(raw.toString('utf8'));
    const shared = name !== null && refNames.has(name);
    const exact = refHashes.has(textSha256);
    const reason = exact ? 'exact' : label === 'benign' && shared ? 'name' : null;
    const cell: Cell = reason ? 'excluded' : advisory.has(source) ? 'advisory' : 'gate';
    const nid = transferNeutralId(id);
    if (nids.has(nid)) throw new TransferError(`${id} and ${nids.get(nid)} have the same neutral id`);
    nids.set(nid, id);
    const redactedValue = c.redacted ? cols[c.redacted][i] : null;
    identities.push({
      id, nid, label, source, cell, reason,
      nameShared: cell === 'gate' && label === 'malicious' && shared,
      redacted: redactedValue === true || text(redactedValue) === 'true',
      textSha256, textBytes: raw.length, text: raw,
    });
  }

  const count = (pred: (x: TransferIdentity) => boolean): CellCount => {
    const of = identities.filter(pred);
    const bySource: Record<string, number> = {};
    for (const x of of) bySource[x.source] = (bySource[x.source] ?? 0) + 1;
    return { total: of.length, bySource };
  };
  const shared = count(x => x.nameShared);
  const counts: CellCounts = {
    identities: identities.length,
    excluded: {
      total: identities.filter(x => x.cell === 'excluded').length,
      exact: identities.filter(x => x.reason === 'exact').length,
      name: identities.filter(x => x.reason === 'name').length,
    },
    gateBenign: count(x => x.cell === 'gate' && x.label === 'benign'),
    gateMalicious: { ...count(x => x.cell === 'gate' && x.label === 'malicious'), nameShared: shared.total, nameSharedBySource: shared.bySource },
    advisory: count(x => x.cell === 'advisory'),
  };
  const described = describeParquet(file);
  return {
    identities,
    counts,
    release: {
      revision: spec.revision,
      parquet: { sha256: parquetSha, bytes: parquetBytes.length, rows: described.rows, rowGroups: described.rowGroups, codecs: described.codecs, createdBy: described.createdBy },
      splitFile: { sha256: splitSha, bytes: splitBytes.length, values: splitValues, crossChecked },
      split: spec.splitValue,
      columns: spec.columns,
      labels: spec.labels,
      advisorySources: [...spec.advisorySources].sort(),
    },
    reference: {
      commit: spec.reference.commit,
      dirty: spec.reference.dirty,
      classDirs: spec.referenceClassDirs,
      file: REFERENCE_FILE,
      files: refPaths.length,
      distinctTexts: refHashes.size,
      distinctNames: refNames.size,
      manifestSha256: sha256(refLines.sort().join('\n') + '\n'),
    },
  };
}

// ------------------------------------------------------------- materialisation

function gitIn(dir: string, args: string[]): string {
  const env = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: devNull,
    GIT_AUTHOR_NAME: 'oasb-transfer',
    GIT_AUTHOR_EMAIL: 'transfer@oasb.invalid',
    GIT_AUTHOR_DATE: FIXED_DATE,
    GIT_COMMITTER_NAME: 'oasb-transfer',
    GIT_COMMITTER_EMAIL: 'transfer@oasb.invalid',
    GIT_COMMITTER_DATE: FIXED_DATE,
  };
  const r = spawnSync('git', ['-c', 'core.hooksPath=' + devNull, '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', '-C', dir, ...args], { encoding: 'utf8', env });
  if (r.status !== 0) throw new TransferError(`git ${args[0]} failed: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

export interface MaterialisedTransfer {
  out: string;
  corpus: string;
  commit: string;
  tree: string;
  manifestSha256: string;
}

/** Writes the cells as a corpus under <out>/corpus (one git commit) and the membership manifest at <out>/manifest.json. */
export function materialiseTransfer(cells: TransferCells, outDir: string, extra: Record<string, unknown> = {}): MaterialisedTransfer {
  const out = resolve(outDir);
  const partial = `${out}.incomplete`;
  if (existsSync(out)) throw new TransferError(`${out} exists; the cells are materialised once, into a new directory`);
  if (existsSync(partial)) throw new TransferError(`${partial} exists; remove it to materialise again`);
  const corpus = join(partial, 'corpus');
  try {
    for (const cell of CELLS) for (const cls of Object.values(MATERIALISED_CLASS_DIRS)) mkdirSync(join(corpus, cell, cls), { recursive: true });
    for (const x of cells.identities) {
      const dir = join(corpus, x.cell, MATERIALISED_CLASS_DIRS[x.label], x.nid);
      mkdirSync(dir);
      writeFileSync(join(dir, REFERENCE_FILE), x.text, { mode: 0o644 });
    }
    gitIn(corpus, ['init', '-q']);
    const used = CELLS.filter(cell => cells.identities.some(x => x.cell === cell));
    gitIn(corpus, ['add', '--', ...used]);
    gitIn(corpus, ['commit', '-q', '-m', 'transfer cells']);
    const commit = gitIn(corpus, ['rev-parse', 'HEAD']);
    const tree = gitIn(corpus, ['rev-parse', 'HEAD^{tree}']);
    const manifest = {
      schema: TRANSFER_SCHEMA,
      ...extra,
      rule: CELL_RULE,
      namePattern: NAME_PATTERN.source,
      nameRule: NAME_RULE,
      release: cells.release,
      reference: cells.reference,
      counts: cells.counts,
      corpus: { path: 'corpus', commit, tree, classDirs: MATERIALISED_CLASS_DIRS, cells: [...CELLS], file: REFERENCE_FILE, neutralIds: 'n- and the first 16 hex digits of sha256("neutral\\n" + id)' },
      redacted: cells.identities.filter(x => x.redacted).map(x => x.id),
      identities: cells.identities.map(({ text: _text, ...rest }) => rest),
    };
    const manifestText = JSON.stringify(manifest, null, 2) + '\n';
    writeFileSync(join(partial, 'manifest.json'), manifestText);
    renameSync(partial, out);
    return { out, corpus: join(out, 'corpus'), commit, tree, manifestSha256: sha256(manifestText) };
  } catch (e) {
    rmSync(partial, { recursive: true, force: true });
    throw e;
  }
}
