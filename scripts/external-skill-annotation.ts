/**
 * The blind annotation stream of the external skill-scanner benchmark: every
 * benign sample of a corpus and a seeded-uniform draw of malicious decoys,
 * copied under position ids in one seeded random order, for two human
 * annotators and an adjudicator. Used by scripts/external-skill-benchmark.ts;
 * it imports nothing from the runner.
 *
 * Order. The contested samples (both members of each pair) take the first
 * places, then the samples of any flip list given, then every other benign
 * sample and the decoys, mixed. Each group is in a seeded random order.
 *
 * Decoys are drawn from the malicious samples that are neither contested nor
 * on a flip list, so decoy recall measures known-malicious items only.
 *
 * What the export holds: `stream.txt` (the item ids in stream order) and one
 * directory per item, named by its position, holding the sample's files with
 * every `_meta.json` left out. Files are written fresh with mode 0644. It
 * holds no class or original directory name, no scanner field and no corpus
 * label; the key that maps an item to its sample is written outside the
 * export. verifyAnnotationExport() checks an export against its key and the
 * corpus, and the writer runs it before the export is published.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  KEY_SCHEMA,
  META_FILE,
  type AnnotationKey,
  type ClassLabel,
  type ContestedPair,
  type KeyItem,
  contestedMembers,
  sampleFileSet,
} from './external-skill-adjudication.js';

export const STREAM_FILE = 'stream.txt';
export const MIN_ID_WIDTH = 4;
/** Field names of a scanner's report or of a prediction row: none may reach an annotator. */
export const SCANNER_FIELDS = ['checkId', 'excluded', 'failed', 'findings', 'flaggedBy', 'measured', 'passed', 'scannerVersion', 'severity', 'verdict'];
const LABEL_WORDS = ['benign', 'label', 'malicious'];

export class AnnotationError extends Error {}

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

export interface CorpusSample {
  key: string;
  label: ClassLabel;
  name: string;
  dir: string;
}

export interface ExportOptions {
  samples: CorpusSample[];
  classRoot: string;
  classDirs: Record<ClassLabel, string>;
  corpus: { commit: string | null; manifestSha256: string };
  contested: ContestedPair[];
  decoys: number;
  seed: string;
  flipLists: Array<{ path: string; keys: string[] }>;
  exportDir: string;
  keyFile: string;
}

export interface ExportResult {
  items: number;
  roles: Record<KeyItem['role'], number>;
  keySha256: string;
  streamSha256: string;
}

const inside = (child: string, parent: string) => {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

function seededOrder(keys: string[], seed: string, domain: string): string[] {
  return [...keys]
    .map(key => ({ key, rank: sha256(`${seed}\n${domain}\n${key}`) }))
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.key < b.key ? -1 : 1))
    .map(e => e.key);
}

/** Reads a flip list: one sample key (`<class>/<directory>`) per line; blank lines and lines starting with # are skipped. */
export function readFlipList(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#'));
}

/** Copies a sample's files into an item directory, every _meta.json left out; refuses a symlink or special file. */
function copySample(from: string, to: string, at: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) copySample(src, dst, at);
    else if (entry.name === META_FILE) continue;
    else if (entry.isFile()) writeFileSync(dst, readFileSync(src), { mode: 0o644 });
    else throw new AnnotationError(`${at}: holds a symlink or special file (${entry.name}); an export copies plain files only`);
  }
}

/** Writes the blind annotation stream and its key, and returns what it wrote. */
export function writeAnnotationExport(opts: ExportOptions): ExportResult {
  const exportDir = resolve(opts.exportDir);
  const keyFile = resolve(opts.keyFile);
  const partial = `${exportDir}.incomplete`;
  if (existsSync(exportDir)) throw new AnnotationError(`${exportDir} exists; an export is written once, into a new directory`);
  if (existsSync(partial)) throw new AnnotationError(`${partial} exists; remove it to write the export again`);
  if (existsSync(keyFile)) throw new AnnotationError(`${keyFile} exists; a key is written once`);
  if (inside(keyFile, exportDir)) throw new AnnotationError('the annotation key is written outside the export, not inside it');
  if (inside(exportDir, opts.classRoot) || inside(opts.classRoot, exportDir)) throw new AnnotationError('the export is written outside the corpus');
  if (!Number.isInteger(opts.decoys) || opts.decoys < 0) throw new AnnotationError('the decoy count is a whole number');

  const byKey = new Map(opts.samples.map(s => [s.key, s]));
  const contested = [...contestedMembers(opts.contested)].sort();
  for (const k of contested) if (!byKey.has(k)) throw new AnnotationError(`contested sample ${k} is not in the corpus`);
  const placed = new Set(contested);
  const flips: string[] = [];
  for (const list of opts.flipLists) {
    for (const k of list.keys) {
      if (!byKey.has(k)) throw new AnnotationError(`${list.path}: ${k} is not a sample of the corpus`);
      if (!placed.has(k)) {
        placed.add(k);
        flips.push(k);
      }
    }
  }
  const pool = opts.samples.filter(s => s.label === 'malicious' && !placed.has(s.key)).map(s => s.key);
  if (opts.decoys > pool.length) throw new AnnotationError(`${opts.decoys} decoys asked for, ${pool.length} malicious samples to draw from`);
  const decoys = new Set(seededOrder(pool, opts.seed, 'decoy').slice(0, opts.decoys));
  const rest = opts.samples.filter(s => !placed.has(s.key) && (s.label === 'benign' || decoys.has(s.key))).map(s => s.key);

  const stream = [
    ...seededOrder(contested, opts.seed, 'order').map(k => ({ k, role: 'contested' as const })),
    ...seededOrder(flips, opts.seed, 'order').map(k => ({ k, role: 'flip' as const })),
    ...seededOrder(rest, opts.seed, 'order').map(k => ({ k, role: decoys.has(k) ? ('decoy' as const) : ('benign' as const) })),
  ];
  const width = Math.max(MIN_ID_WIDTH, String(stream.length).length);
  const items: KeyItem[] = stream.map(({ k, role }, i) => ({ id: String(i + 1).padStart(width, '0'), sample: k, label: byKey.get(k)!.label, role }));

  mkdirSync(partial, { recursive: true });
  try {
    for (const item of items) copySample(byKey.get(item.sample)!.dir, join(partial, item.id), `item ${item.id}`);
    const streamText = items.map(i => i.id).join('\n') + '\n';
    writeFileSync(join(partial, STREAM_FILE), streamText, { mode: 0o644 });
    const roles = { contested: 0, flip: 0, benign: 0, decoy: 0 };
    for (const i of items) roles[i.role] += 1;
    const key: AnnotationKey = {
      schema: KEY_SCHEMA,
      createdAt: new Date().toISOString(),
      seed: opts.seed,
      decoys: opts.decoys,
      corpus: { commit: opts.corpus.commit, manifestSha256: opts.corpus.manifestSha256 },
      classDirs: opts.classDirs,
      order: 'contested pairs, then flip lists, then every other benign sample and the decoys; each group ranked by sha256(seed, "order", sample)',
      decoyDraw: 'malicious samples neither contested nor on a flip list, ranked by sha256(seed, "decoy", sample)',
      contestedPairs: opts.contested,
      flipLists: opts.flipLists.map(l => ({ sha256: sha256(readFileSync(l.path)), keys: l.keys.length })),
      roles,
      export: { items: items.length, streamSha256: sha256(streamText), stream: STREAM_FILE },
      items,
    };
    const lookup = new Map(opts.samples.map(s => [s.key, { dir: s.dir, name: s.name }]));
    const problems = verifyAnnotationExport(partial, key, lookup, opts.classDirs);
    if (problems.length > 0) throw new AnnotationError(`the export fails its own check:\n${problems.slice(0, 20).join('\n')}`);
    renameSync(partial, exportDir);
    mkdirSync(dirname(keyFile), { recursive: true });
    const keyText = JSON.stringify(key, null, 2) + '\n';
    writeFileSync(keyFile, keyText, { mode: 0o600 });
    return { items: items.length, roles, keySha256: sha256(keyText), streamSha256: sha256(streamText) };
  } catch (e) {
    rmSync(partial, { recursive: true, force: true });
    throw e;
  }
}

// ----------------------------------------------------------------------- check

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean);
}

/** What a planted name or file reveals, for the problem message. */
function leakKind(name: string, content: string | null, classNames: string[], original: string[]): string | null {
  const base = name.toLowerCase();
  const stem = base.replace(/\.[^.]*$/, '');
  if (base === META_FILE) return 'a _meta.json';
  if ([...classNames, ...original].some(n => n === base || n === stem)) return 'a class or original directory name';
  if (content !== null) {
    if (SCANNER_FIELDS.some(f => new RegExp(`["']?\\b${f}\\b["']?\\s*[:=]`).test(content))) return 'a scanner field';
    const w = new Set(words(content));
    if ([...LABEL_WORDS, ...classNames].some(l => w.has(l))) return 'a corpus label';
  }
  if (LABEL_WORDS.some(l => l === stem)) return 'a corpus label';
  return null;
}

interface Tree {
  /** Relative path of every file (or other non-directory entry) to its absolute path and kind. */
  files: Map<string, { path: string; kind: 'file' | 'other' }>;
  /** Relative path of every directory below the root. */
  dirs: Set<string>;
}

function treeOf(root: string): Tree {
  const tree: Tree = { files: new Map(), dirs: new Set() };
  const walk = (dir: string, rel: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const path = join(dir, entry.name);
      const r = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        tree.dirs.add(r);
        walk(path, r);
      } else {
        tree.files.set(r, { path, kind: entry.isFile() ? 'file' : 'other' });
      }
    }
  };
  walk(root, '');
  return tree;
}

/** A line's tokens, split where an id or a name cannot continue. */
const tokens = (line: string) => line.toLowerCase().split(/[\s,;:"'{}[\]()=/\\]+/).filter(Boolean);

/**
 * Checks an export against its key and the corpus: stream.txt lists the key's
 * ids in order and nothing else; the top level holds stream.txt and the item
 * directories only; each item holds exactly its sample's files, byte for byte,
 * with no _meta.json; no path component is a class directory name; and an
 * original directory name appears only where the sample itself holds that
 * path. Returns the problems found.
 */
export function verifyAnnotationExport(
  exportDir: string,
  key: AnnotationKey,
  lookup: Map<string, { dir: string; name: string }>,
  classDirs: Record<ClassLabel, string>,
): string[] {
  const problems: string[] = [];
  const classNames = [...new Set([classDirs.malicious, classDirs.benign, 'malicious', 'benign'].map(n => n.toLowerCase()))];
  const ids = key.items.map(i => i.id);
  const idSet = new Set(ids);
  // Every sample directory name of the corpus, drawn into the stream or not.
  const originals = [...new Set([...lookup.values()].map(s => s.name.toLowerCase()))];

  const streamPath = join(exportDir, STREAM_FILE);
  if (!existsSync(streamPath)) problems.push(`${STREAM_FILE} is missing`);
  else {
    const lines = readFileSync(streamPath, 'utf8').split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    const originalSet = new Set(originals);
    lines.forEach((line, i) => {
      if (line === ids[i]) return;
      const kind = leakKind('', line, classNames, originals) ?? (tokens(line).some(t => originalSet.has(t)) ? 'a class or original directory name' : null);
      problems.push(`${STREAM_FILE} line ${i + 1} is not the item id the key places there${kind ? `: it carries ${kind}` : ''}`);
    });
    if (lines.length !== ids.length) problems.push(`${STREAM_FILE} lists ${lines.length} items, the key ${ids.length}`);
  }

  for (const entry of readdirSync(exportDir, { withFileTypes: true })) {
    if (entry.name === STREAM_FILE && entry.isFile()) continue;
    if (entry.isDirectory() && idSet.has(entry.name)) continue;
    const path = join(exportDir, entry.name);
    const content = entry.isFile() ? readFileSync(path, 'utf8') : null;
    const kind = leakKind(entry.name, content, classNames, originals);
    problems.push(`top-level entry ${entry.name} is not an item of the stream${kind ? `: it carries ${kind}` : ''}`);
  }

  for (const item of key.items) {
    const source = lookup.get(item.sample);
    const itemDir = join(exportDir, item.id);
    if (!source) {
      problems.push(`item ${item.id}: its sample is not in the corpus`);
      continue;
    }
    if (!existsSync(itemDir)) {
      problems.push(`item ${item.id} is missing`);
      continue;
    }
    const expected = new Map(sampleFileSet(source.dir).map(line => [line.slice(66), line.slice(0, 64)]));
    const sourceDirs = treeOf(source.dir).dirs;
    const exported = treeOf(itemDir);
    const own = source.name.toLowerCase();
    // A path component that names a class, or that names the sample where the sample itself holds no such path.
    const nameLeak = (rel: string): string | null => {
      const parts = rel.split('/');
      const classPart = parts.find(p => classNames.includes(p.toLowerCase()));
      if (classPart !== undefined) return `a class or original directory name (${classPart})`;
      const ownAt = parts.findIndex(p => p.toLowerCase() === own);
      if (ownAt === -1) return null;
      const prefix = parts.slice(0, ownAt + 1).join('/');
      return sourceDirs.has(prefix) || expected.has(prefix) ? null : 'a class or original directory name';
    };
    for (const rel of exported.dirs) {
      const leak = nameLeak(rel);
      if (leak) problems.push(`item ${item.id}: ${rel}/: it carries ${leak}`);
      else if (!sourceDirs.has(rel)) problems.push(`item ${item.id}: ${rel}/: the sample holds no such directory`);
    }
    for (const [rel, f] of exported.files) {
      const at = `item ${item.id}: ${rel}`;
      const name = rel.slice(rel.lastIndexOf('/') + 1);
      if (name === META_FILE) {
        problems.push(`${at}: it carries a _meta.json`);
        continue;
      }
      const leak = nameLeak(rel);
      if (leak) {
        problems.push(`${at}: it carries ${leak}`);
        continue;
      }
      if (f.kind !== 'file') {
        problems.push(`${at}: is a symlink or special file`);
        continue;
      }
      const want = expected.get(rel);
      const data = readFileSync(f.path);
      if (want === undefined) {
        const kind = leakKind(name, data.toString('utf8'), classNames, originals);
        problems.push(`${at}: the sample holds no such file${kind ? `; it carries ${kind}` : ''}`);
      } else if (sha256(data) !== want) {
        problems.push(`${at}: differs from the sample`);
      }
    }
    for (const rel of expected.keys()) if (!exported.files.has(rel)) problems.push(`item ${item.id}: lacks ${rel}`);
  }
  return problems;
}
