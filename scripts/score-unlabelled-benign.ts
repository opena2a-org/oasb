/**
 * Score a pinned run on the unlabelled benign set (src/benchmark/unlabelled-benign.ts).
 *
 * Reads the run's own corpus-predictions.jsonl and corpus/v2.json, and prints
 * precision, recall, F1, false-positive rate, flag rate and tier for every
 * scanner in the run, over the 270 categorized malicious fixtures and the
 * benign samples no scanner labeled. It scans nothing and writes nothing.
 *
 * Usage:
 *   npx tsx scripts/score-unlabelled-benign.ts [results/<date>-<runid>]
 *
 * The run defaults to the run of record, results/2026-10-10-2a89ce5d.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { scoreUnlabelledBenign, type RecordedPrediction, type UnlabelledBenignScore } from '../src/benchmark/unlabelled-benign.js';
import type { BenchmarkDataset } from '../src/benchmark/types.js';

export const RUN_OF_RECORD = 'results/2026-10-10-2a89ce5d';
export const BASELINE = 'hma-pipeline';

/** Score the run in `runDir` (relative to `repo`) on the unlabelled benign set. */
export function scoreRun(repo: string, runDir = RUN_OF_RECORD): UnlabelledBenignScore[] {
  const dataset: BenchmarkDataset = JSON.parse(readFileSync(join(repo, 'corpus', 'v2.json'), 'utf-8'));
  const predictions: RecordedPrediction[] = readFileSync(join(repo, runDir, 'corpus-predictions.jsonl'), 'utf-8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
  return scoreUnlabelledBenign(dataset.samples, predictions, BASELINE);
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** The printed table, one row per scanner. */
export function formatScores(scores: UnlabelledBenignScore[]): string[] {
  const header = ['Scanner', 'Recall', 'Precision', 'F1', 'FPR', 'Flag rate', 'Tier'];
  const rows = scores.map((s) => [
    s.adapterId,
    `${pct(s.recall)} (${s.detected}/${s.maliciousTotal})`,
    pct(s.precision),
    pct(s.f1),
    `${pct(s.fpr)} (${s.falsePositives}/${s.benignTotal})`,
    pct(s.flagRate),
    s.tier,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join(' | ').trimEnd();
  return [line(header), widths.map((w) => '-'.repeat(w)).join('-|-'), ...rows.map(line)];
}

function main(): void {
  const runDir = process.argv[2] ?? RUN_OF_RECORD;
  const scores = scoreRun(resolve(__dirname, '..'), runDir);
  console.log(`Unlabelled benign set, ${runDir}: ${scores[0]?.maliciousTotal ?? 0} malicious, ${scores[0]?.benignTotal ?? 0} benign no scanner labeled`);
  for (const line of formatScores(scores)) console.log(line);
}

if (require.main === module) main();
