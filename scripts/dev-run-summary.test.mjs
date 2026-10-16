// Tests for what the unpinned development runner prints
// (scripts/dev-run-summary.mjs, called by scripts/run-benchmark-v2.ts).
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WITHDRAWN_NOTE, adapterLines, comparisonLines, percent } from './dev-run-summary.mjs';

// A run with the rates a development run of the static adapter printed before
// they were withdrawn: precision 99.3%, recall 51.1%, F1 67.5%, FPR 0.03%,
// flag rate 3.6%.
const run = (adapterName, truePositives, falseNegatives, extra = {}) => ({
  adapterId: adapterName.toLowerCase().replace(/\W+/g, '-'),
  adapterName,
  adapterVersion: '0.0.0',
  totalSamples: 14200,
  totalMalicious: truePositives + falseNegatives,
  totalBenign: 13200,
  flagged: 515,
  flagRate: 0.036,
  truePositives,
  falsePositives: 4,
  trueNegatives: 13196,
  falseNegatives,
  precision: 0.993,
  recall: Math.round((truePositives / (truePositives + falseNegatives)) * 1e4) / 1e4,
  f1: 0.675,
  fpr: 0.0003,
  avgScanTimeMs: 2.5,
  perCategory: {},
  ...extra,
});

const WITHDRAWN_VALUES = ['99.3', '67.5', '0.03', '3.6'];

test('an adapter run prints its recall and its malicious-class counts', () => {
  const lines = adapterLines(run('HMA Static', 511, 489));
  assert.deepEqual(lines, [
    'Samples: 14200 (1000 malicious, 13200 benign)',
    'Malicious detected: 511 of 1000 (missed: 489)',
    'Recall: 51.1%',
    WITHDRAWN_NOTE,
    'Avg scan time: 2.5ms',
  ]);
});

test('an adapter run names precision, F1, FPR and flag rate as withdrawn and prints none of their values', () => {
  const text = adapterLines(run('HMA Static', 511, 489)).join('\n');
  assert.match(WITHDRAWN_NOTE, /^Withdrawn: precision, F1, FPR and flag rate\./);
  for (const value of WITHDRAWN_VALUES) assert.ok(!text.includes(value), `the run prints the withdrawn value ${value}`);
  assert.doesNotMatch(text, /\b(?:TN|FP|Flagged):/);
});

test('the comparison summary has a recall column, no withdrawn column, and the highest recall first', () => {
  const lines = comparisonLines([run('HMA TME only', 120, 880), run('HMA Static', 511, 489), run('HMA Pipeline', 1000, 0)]);
  assert.equal(lines[0], `${'Scanner'.padEnd(42)} | Recall | Detected`);
  assert.match(lines[1], /^-+$/);
  assert.deepEqual(lines.slice(2, 5), [
    `${'HMA Pipeline'.padEnd(42)} | 100.0% | 1000 of 1000`,
    `${'HMA Static'.padEnd(42)} |  51.1% | 511 of 1000`,
    `${'HMA TME only'.padEnd(42)} |  12.0% | 120 of 1000`,
  ]);
  assert.deepEqual(lines.slice(5), ['', WITHDRAWN_NOTE]);
  for (const value of WITHDRAWN_VALUES) {
    assert.ok(!lines.slice(0, 5).join('\n').includes(value), `the summary prints the withdrawn value ${value}`);
  }
});

test('each % in the comparison summary follows its number and sits in the same column', () => {
  const rows = comparisonLines([run('A', 1, 999), run('B', 511, 489), run('C', 1000, 0)]).slice(2, 5);
  const columns = rows.map((row) => row.indexOf('%'));
  assert.equal(new Set(columns).size, 1, `the % signs are in columns ${columns.join(', ')}:\n${rows.join('\n')}`);
  for (const row of rows) assert.match(row, /\d%/, `a space separates the number from its %: ${row}`);
  assert.equal(percent(0.511), ' 51.1%');
  assert.equal(percent(1), '100.0%');
  assert.equal(percent(0.001), '  0.1%');
});
