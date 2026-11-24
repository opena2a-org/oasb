// Tests for what the unpinned development runner prints
// (scripts/dev-run-summary.mjs, called by scripts/run-benchmark-v2.ts).
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNLABELLED_NOTE, adapterLines, comparisonLines, percent } from './dev-run-summary.mjs';

// A run whose rates over the whole benign class (precision 99.4%, F1 67.6%,
// FPR 0.03%, flag rate 3.6%) differ from its rates on the unlabelled benign
// set (precision 99.3%, F1 67.5%, FPR 0.6%, flag rate 31.1%, tier silver).
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
  precision: 0.994,
  recall: Math.round((truePositives / (truePositives + falseNegatives)) * 1e4) / 1e4,
  f1: 0.676,
  fpr: 0.0003,
  avgScanTimeMs: 2.5,
  unlabelledBenign: {
    benignTotal: 177,
    falsePositives: 1,
    precision: 0.9928,
    f1: 0.6748,
    fpr: 0.0056,
    flagRate: 0.3110,
    tier: 'silver',
  },
  perCategory: {},
  ...extra,
});

const WHOLE_CLASS_VALUES = ['99.4', '67.6', '0.03', '3.6%'];

test('an adapter run prints its recall and its figures on the unlabelled benign set', () => {
  const lines = adapterLines(run('HMA Static', 511, 489));
  assert.deepEqual(lines, [
    'Samples: 14200 (1000 malicious, 13200 benign)',
    'Malicious detected: 511 of 1000 (missed: 489)',
    'Recall: 51.1%',
    'Unlabelled benign set: 177 benign no scanner labeled, 1 flagged',
    'Precision: 99.3%  F1: 67.5%  FPR: 0.6%  Flag rate: 31.1%  Tier: silver',
    UNLABELLED_NOTE,
    'Avg scan time: 2.5ms',
  ]);
});

test('an adapter run prints no precision, F1, FPR or flag rate over the benign samples the scanner labeled', () => {
  const text = adapterLines(run('HMA Static', 511, 489)).join('\n');
  assert.match(UNLABELLED_NOTE, /^Precision, F1, FPR, flag rate and tier read only the benign samples no scanner labeled;/);
  for (const value of WHOLE_CLASS_VALUES) assert.ok(!text.includes(value), `the run prints the whole-class value ${value}`);
  assert.doesNotMatch(text, /\b(?:TN|Flagged):/);
});

test('the comparison summary has recall and the unlabelled-benign columns, highest recall first', () => {
  const tier = (t) => ({ unlabelledBenign: { ...run('x', 1, 1).unlabelledBenign, tier: t } });
  const lines = comparisonLines([
    run('HMA TME only', 120, 880, tier('listed')),
    run('HMA Static', 511, 489),
    run('HMA Pipeline', 1000, 0, tier('gold')),
  ]);
  assert.match(lines[0], /^Scanner +\| Recall \| Detected +\| Precision \| +F1 \| +FPR \| Flag rate \| Tier$/);
  assert.match(lines[1], /^-+$/);
  const rows = lines.slice(2, 5);
  assert.deepEqual(
    rows.map((row) => row.split('|').map((cell) => cell.trim())),
    [
      ['HMA Pipeline', '100.0%', '1000 of 1000', '99.3%', '67.5%', '0.6%', '31.1%', 'gold'],
      ['HMA Static', '51.1%', '511 of 1000', '99.3%', '67.5%', '0.6%', '31.1%', 'silver'],
      ['HMA TME only', '12.0%', '120 of 1000', '99.3%', '67.5%', '0.6%', '31.1%', 'listed'],
    ],
  );
  assert.deepEqual(lines.slice(5), ['', UNLABELLED_NOTE]);
  for (const value of WHOLE_CLASS_VALUES) {
    assert.ok(!lines.slice(0, 5).join('\n').includes(value), `the summary prints the whole-class value ${value}`);
  }
});

test('each column of the comparison summary lines up', () => {
  const lines = comparisonLines([run('A', 1, 999), run('B', 511, 489), run('C', 1000, 0)]).slice(0, 5).filter((l) => !/^-+$/.test(l));
  const bars = lines.map((row) => [...row].flatMap((c, i) => (c === '|' ? [i] : [])).join(','));
  assert.equal(new Set(bars).size, 1, `the | signs differ between rows:\n${lines.join('\n')}`);
  for (const row of lines.slice(1)) assert.match(row, /\d%/, `a space separates the number from its %: ${row}`);
  assert.equal(percent(0.511), ' 51.1%');
  assert.equal(percent(1), '100.0%');
  assert.equal(percent(0.001), '  0.1%');
});
