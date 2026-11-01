/**
 * The adjudicated arm of the external skill-scanner benchmark: which samples
 * leave both classes before a scanner is scored on them, and what label the
 * adjudicated row carries. Used by scripts/external-skill-benchmark.ts; it
 * imports nothing from the runner.
 *
 * Contested samples. A benign sample is contested when every file of some
 * malicious-class sample is present in it at the same relative path with the
 * same sha256 (`_meta.json` left out at any depth). The corpus labels such an
 * artifact both ways, so both members of the pair leave both classes; neither
 * is moved into the other class.
 *
 * Adjudication record. A blind human adjudication is read from two files: the
 * annotation key the export wrote (item id to sample) and the record the
 * annotators and the adjudicator wrote, one JSON object per line:
 *   {"id": "<item id>", "annotatorA": "<class>", "annotatorB": "<class>", "adjudicated": "<class>" | "DROP"}
 * `adjudicated` is needed only where the two annotators disagree. The class
 * `benign` is benign; every other class is non-benign. A sample whose final
 * class is not its corpus label, and a dropped sample, leave the adjudicated
 * arm and are counted per class.
 *
 * Label. The adjudicated row is `interim` until every benign sample of the
 * corpus has a final class. It is `adjudicated` when, in addition, the binary
 * benign/non-benign Cohen's kappa of the two annotators (taken before
 * adjudication) is at least MIN_KAPPA and decoy recall is at least
 * MIN_DECOY_RECALL; below either it is `advisory`.
 */

import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';

export type ClassLabel = 'malicious' | 'benign';
export type AdjudicationLabel = 'interim' | 'adjudicated' | 'advisory';

export const META_FILE = '_meta.json';
export const BENIGN_CLASS = 'benign';
export const DROP = 'DROP';
export const MIN_KAPPA = 0.8;
export const MIN_DECOY_RECALL = 0.9;
export const KEY_SCHEMA = 'oasb-annotation-key/v1';
export const CONTESTED_RULE =
  'a benign sample is contested when every file of some malicious-class sample is present in it at the same relative path with the same sha256 (_meta.json left out at any depth); both members of each pair leave both classes';
export const LABEL_RULE =
  `interim until every benign sample has a final class; then adjudicated when the binary benign/non-benign kappa of the two annotators before adjudication is at least ${MIN_KAPPA} and decoy recall is at least ${MIN_DECOY_RECALL}, otherwise advisory`;

export class AdjudicationError extends Error {}

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

export interface SampleRef {
  key: string;
  label: ClassLabel;
  dir: string;
}

export interface ContestedPair {
  benign: string;
  malicious: string;
}

// ----------------------------------------------------------------- containment

/** Every file under a sample as `<sha256>  <relative path>`, _meta.json left out; a symlink is its target text and is never followed. */
export function sampleFileSet(dir: string): string[] {
  const out: string[] = [];
  const walk = (at: string, rel: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      const relPath = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(path, relPath);
        continue;
      }
      if (entry.name === META_FILE) continue;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) out.push(`${sha256(`symlink:${readlinkSync(path)}`)}  ${relPath}`);
      else if (stat.isFile()) out.push(`${sha256(readFileSync(path))}  ${relPath}`);
      else out.push(`${sha256('special')}  ${relPath}`);
    }
  };
  walk(dir, '');
  return out.sort();
}

/** The contested pairs of a corpus, sorted by benign then malicious sample. */
export function contestedPairs(samples: SampleRef[]): ContestedPair[] {
  const index = new Map<string, Set<string>>();
  for (const s of samples) {
    if (s.label !== 'benign') continue;
    for (const entry of sampleFileSet(s.dir)) {
      let holders = index.get(entry);
      if (!holders) index.set(entry, (holders = new Set()));
      holders.add(s.key);
    }
  }
  const pairs: ContestedPair[] = [];
  for (const s of samples) {
    if (s.label !== 'malicious') continue;
    const files = sampleFileSet(s.dir);
    if (files.length === 0) continue;
    // The benign samples that hold every file of this malicious sample.
    let common: string[] = [...(index.get(files[0]) ?? [])];
    for (const entry of files.slice(1)) {
      if (common.length === 0) break;
      const holders = index.get(entry);
      common = holders ? common.filter(k => holders.has(k)) : [];
    }
    for (const benign of common) pairs.push({ benign, malicious: s.key });
  }
  return pairs.sort((a, b) => (a.benign < b.benign ? -1 : a.benign > b.benign ? 1 : a.malicious < b.malicious ? -1 : 1));
}

export function contestedMembers(pairs: ContestedPair[]): Set<string> {
  return new Set(pairs.flatMap(p => [p.benign, p.malicious]));
}

// ------------------------------------------------------- the adjudication record

export interface KeyItem {
  id: string;
  sample: string;
  label: ClassLabel;
  role: 'contested' | 'flip' | 'benign' | 'decoy';
}

export interface AnnotationKey {
  schema: string;
  corpus: { commit: string | null; manifestSha256: string };
  items: KeyItem[];
  [field: string]: unknown;
}

export type FinalClass = 'benign' | 'non-benign' | 'drop';

export interface Adjudication {
  recordSha256: string;
  keySha256: string;
  items: number;
  /** Final class per sample key. */
  final: Map<string, FinalClass>;
  unresolved: number;
  kappa: number | null;
  kappaItems: number;
  decoys: number;
  decoyRecall: number | null;
  benignSamples: number;
  benignFinal: number;
  benignComplete: boolean;
}

function normalClass(value: unknown, at: string, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new AdjudicationError(`${at}: ${field} is not a string`);
  const v = value.trim();
  if (v === '') return null;
  return v.toUpperCase() === DROP ? DROP : v.toLowerCase();
}

const binary = (cls: string): 'benign' | 'non-benign' => (cls === BENIGN_CLASS ? 'benign' : 'non-benign');

/** Unweighted Cohen's kappa of two binary raters; null when chance agreement is total. */
export function cohenKappa(pairs: Array<[boolean, boolean]>): number | null {
  if (pairs.length === 0) return null;
  const n = pairs.length;
  const agree = pairs.filter(([a, b]) => a === b).length / n;
  const pa = pairs.filter(([a]) => a).length / n;
  const pb = pairs.filter(([, b]) => b).length / n;
  const chance = pa * pb + (1 - pa) * (1 - pb);
  if (chance === 1) return null;
  return (agree - chance) / (1 - chance);
}

export function readAnnotationKey(path: string): { key: AnnotationKey; sha256: string } {
  const text = readFileSync(path);
  let key: AnnotationKey;
  try {
    key = JSON.parse(text.toString('utf8'));
  } catch (e) {
    throw new AdjudicationError(`${path}: not JSON (${(e as Error).message})`);
  }
  if (key.schema !== KEY_SCHEMA || !Array.isArray(key.items)) throw new AdjudicationError(`${path} is not an annotation key (schema ${KEY_SCHEMA})`);
  return { key, sha256: sha256(text) };
}

/**
 * Reads an adjudication record against its annotation key and the corpus the
 * run scans. Refuses a key written for another corpus, an id the key does not
 * hold, and an id given twice.
 */
export function readAdjudication(
  recordPath: string,
  keyPath: string,
  corpus: { commit: string | null; manifestSha256: string; benignKeys: string[] },
): Adjudication {
  const { key, sha256: keySha256 } = readAnnotationKey(keyPath);
  if (key.corpus?.manifestSha256 !== corpus.manifestSha256 || key.corpus?.commit !== corpus.commit) {
    throw new AdjudicationError(`${keyPath} was written for corpus ${key.corpus?.commit ?? 'unknown'} (manifest ${String(key.corpus?.manifestSha256).slice(0, 16)}), not the corpus this run scans`);
  }
  const items = new Map(key.items.map(item => [item.id, item]));
  if (items.size !== key.items.length) throw new AdjudicationError(`${keyPath} repeats an item id`);
  const raw = readFileSync(recordPath);
  const seen = new Set<string>();
  const final = new Map<string, FinalClass>();
  const kappaPairs: Array<[boolean, boolean]> = [];
  let unresolved = 0;
  raw.toString('utf8').split('\n').forEach((line, i) => {
    if (line.trim() === '') return;
    const at = `${recordPath}:${i + 1}`;
    let rec: any;
    try {
      rec = JSON.parse(line);
    } catch {
      throw new AdjudicationError(`${at}: not a JSON object`);
    }
    if (typeof rec !== 'object' || rec === null || Array.isArray(rec) || typeof rec.id !== 'string') throw new AdjudicationError(`${at}: no string id`);
    const item = items.get(rec.id);
    if (!item) throw new AdjudicationError(`${at}: id ${rec.id} is not an item of the annotation key`);
    if (seen.has(rec.id)) throw new AdjudicationError(`${at}: id ${rec.id} is given twice`);
    seen.add(rec.id);
    const a = normalClass(rec.annotatorA, at, 'annotatorA');
    const b = normalClass(rec.annotatorB, at, 'annotatorB');
    const adjudicated = normalClass(rec.adjudicated, at, 'adjudicated');
    if (a === DROP || b === DROP) throw new AdjudicationError(`${at}: an annotator gives a class; only the adjudicator drops an item`);
    if (a !== null && b !== null) kappaPairs.push([binary(a) === 'benign', binary(b) === 'benign']);
    const decided = adjudicated ?? (a !== null && a === b ? a : null);
    if (decided === null) {
      unresolved += 1;
      return;
    }
    final.set(item.sample, decided === DROP ? 'drop' : binary(decided));
  });
  const decoys = key.items.filter(item => item.role === 'decoy');
  const recalled = decoys.filter(item => final.get(item.sample) === 'non-benign').length;
  const benignFinal = corpus.benignKeys.filter(k => final.has(k)).length;
  return {
    recordSha256: sha256(raw),
    keySha256,
    items: seen.size,
    final,
    unresolved,
    kappa: cohenKappa(kappaPairs),
    kappaItems: kappaPairs.length,
    decoys: decoys.length,
    decoyRecall: decoys.length === 0 ? null : recalled / decoys.length,
    benignSamples: corpus.benignKeys.length,
    benignFinal,
    benignComplete: corpus.benignKeys.length > 0 && benignFinal === corpus.benignKeys.length,
  };
}

/** The label rule of the adjudicated row, from the values the record holds. */
export function labelOf(state: { benignComplete: boolean; kappa: number | null; decoyRecall: number | null } | null): AdjudicationLabel {
  if (!state || !state.benignComplete) return 'interim';
  const agreed = state.kappa !== null && state.kappa >= MIN_KAPPA;
  const recalled = state.decoyRecall !== null && state.decoyRecall >= MIN_DECOY_RECALL;
  return agreed && recalled ? 'adjudicated' : 'advisory';
}

export type ExclusionReason = 'contested' | 'adjudicated-other' | 'dropped';
export const EXCLUSION_REASONS: ExclusionReason[] = ['contested', 'adjudicated-other', 'dropped'];

/** Why a sample leaves the adjudicated arm, or null when it stays; the same for every scanner row. */
export function exclusionOf(sample: string, label: ClassLabel, contested: Set<string>, adjudication: Adjudication | null): ExclusionReason | null {
  if (contested.has(sample)) return 'contested';
  const final = adjudication?.final.get(sample);
  if (final === 'drop') return 'dropped';
  if (final !== undefined && final !== (label === 'benign' ? 'benign' : 'non-benign')) return 'adjudicated-other';
  return null;
}
