// Tests for the unlabelled benign set (src/benchmark/unlabelled-benign.ts) and
// its scores on the pinned run of record (scripts/score-unlabelled-benign.ts),
// and that BENCHMARK-RESULTS.md and docs/pinned-benchmark.md give those scores.
// Nothing is scanned: the run's own corpus-predictions.jsonl is read.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(repo, file), 'utf8');
const flat = (file) => read(file).replace(/\n[ \t]*>?[ \t]*/g, ' ').replace(/\s+/g, ' ');

async function load(path, name) {
  const mod = await tsImport(path, import.meta.url);
  // tsx loads the module as CommonJS in this package, so its exports can
  // arrive one level down.
  return mod[name] ? mod : mod.default;
}

let lib;
let cli;
let scores;
const samples = JSON.parse(read('corpus/v2.json')).samples;

before(async () => {
  lib = await load('../src/benchmark/unlabelled-benign.ts', 'unlabelledBenignSet');
  cli = await load('./score-unlabelled-benign.ts', 'scoreRun');
  scores = Object.fromEntries(cli.scoreRun(repo).map((s) => [s.adapterId, s]));
});

test('the unlabelled benign set is the 270 categorized malicious fixtures and the 177 benign samples no scanner labeled', () => {
  const set = lib.unlabelledBenignSet(samples);
  const benign = set.filter((s) => s.label === 'benign');
  assert.equal(set.filter((s) => s.label === 'malicious').length, 270);
  assert.ok(set.every((s) => s.label !== 'edge_case'));
  assert.ok(set.filter((s) => s.label === 'malicious').every((s) => s.category));
  assert.equal(benign.length, 177);
  assert.ok(benign.every((s) => s.metadata?.scanVerdict === undefined), 'a benign sample in the set carries a scanner verdict');
  const sources = {};
  for (const s of benign) sources[s.source] = (sources[s.source] ?? 0) + 1;
  assert.deepEqual(sources, { registry: 107, enterprise: 70 });
  const labelled = samples.filter((s) => s.label === 'benign' && lib.hasScannerVerdict(s));
  assert.equal(labelled.length, 3704);
  assert.ok(labelled.every((s) => !set.includes(s)));
});

test('a benign sample with a scanner verdict is left out and one without it is kept', () => {
  const base = { source: 'registry', version: 't', artifactType: 'skill', content: '' };
  const set = lib.unlabelledBenignSet([
    { ...base, id: 'a', label: 'benign', metadata: { scanVerdict: 'warning' } },
    { ...base, id: 'b', label: 'benign' },
    { ...base, id: 'c', label: 'malicious' },
    { ...base, id: 'd', label: 'malicious', category: 'persistence' },
    { ...base, id: 'e', label: 'edge_case' },
  ]);
  assert.deepEqual(set.map((s) => s.id), ['b', 'd']);
});

test('every scanner in the pinned run of record is scored on the set, from the run\'s own predictions', () => {
  assert.deepEqual(Object.keys(scores).sort(), ['hma-pipeline', 'hma-static-pipeline', 'hma-tme-only']);
  for (const s of Object.values(scores)) {
    assert.equal(s.maliciousTotal, 270);
    assert.equal(s.benignTotal, 177);
  }
});

// The figures BENCHMARK-RESULTS.md and docs/pinned-benchmark.md publish.
const PUBLISHED = {
  'hma-pipeline': { detected: 192, falsePositives: 19, precision: 0.91, recall: 0.7111, f1: 0.7983, fpr: 0.1073, flagRate: 0.472, tier: 'silver', row: 'HMA Full Pipeline' },
  'hma-static-pipeline': { detected: 138, falsePositives: 1, precision: 0.9928, recall: 0.5111, f1: 0.6748, fpr: 0.0056, flagRate: 0.311, tier: 'silver', row: 'HMA Static' },
  'hma-tme-only': { detected: 251, falsePositives: 82, precision: 0.7538, recall: 0.9296, f1: 0.8325, fpr: 0.4633, flagRate: 0.745, tier: 'listed', row: 'NanoMind TME, model only' },
};

for (const [id, want] of Object.entries(PUBLISHED)) {
  test(`${id} scores what the docs publish on the unlabelled benign set`, () => {
    const s = scores[id];
    for (const key of ['detected', 'falsePositives', 'precision', 'recall', 'f1', 'fpr', 'flagRate', 'tier']) {
      assert.equal(s[key], want[key], `${id} ${key}`);
    }
  });
}

const pct = (n) => `${(n * 100).toFixed(1)}%`;

for (const doc of ['BENCHMARK-RESULTS.md', 'docs/pinned-benchmark.md']) {
  test(`${doc} gives each scanner's precision, F1, FPR, flag rate and tier on the unlabelled benign set`, () => {
    const text = read(doc);
    for (const want of Object.values(PUBLISHED)) {
      const row = text.split('\n').find((line) => line.startsWith(`| ${want.row}`) && line.includes(`(${want.falsePositives}/177)`));
      assert.ok(row, `${doc} has no unlabelled-benign row for ${want.row}`);
      const cells = row.split('|').map((c) => c.trim().replace(/\*/g, ''));
      for (const value of [pct(want.precision), pct(want.f1), `${pct(want.fpr)} (${want.falsePositives}/177)`, pct(want.flagRate), want.tier]) {
        assert.ok(cells.includes(value), `${doc}: the ${want.row} row does not give ${value}: ${row}`);
      }
    }
  });

  test(`${doc} no longer withdraws F1, precision, FPR and flag rate`, () => {
    const text = flat(doc);
    assert.doesNotMatch(text, /\|\s*withdrawn\s*\|/);
    assert.doesNotMatch(text, /F1, precision, false-positive rate and flag rate are withdrawn/);
  });
}

test('the tier on the set follows the published thresholds', async () => {
  const scoring = await load('../src/benchmark/scoring.ts', 'determineTier');
  for (const s of Object.values(scores)) {
    const tier = scoring.determineTier({ f1: s.f1, fpr: s.fpr, categoryCoverage: s.categoryCoverage, kappaVsHMA: s.kappaVsBaseline, precision: s.precision, recall: s.recall, categoryMetrics: [] });
    assert.equal(tier, s.tier, s.adapterId);
  }
});
