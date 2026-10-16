// Tests that statements in README.md, BENCHMARK-RESULTS.md and
// docs/pinned-benchmark.md match the corpus and scripts they describe, and
// that docs/demo.tape states no count.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(repo, file), 'utf8');
// Prose and blockquotes wrap anywhere; compare on single-spaced text.
const flat = (file) => read(file).replace(/\n[ \t]*>?[ \t]*/g, ' ').replace(/\s+/g, ' ');

const DOCS = ['README.md', 'BENCHMARK-RESULTS.md'];
const samples = JSON.parse(read('corpus/v2.json')).samples;

test('a cited script line holds the code the docs say it hard-codes', () => {
  const cite = /`(scripts\/[\w.-]+):(\d+)` hard-codes `([^`]+)`/g;
  let seen = 0;
  for (const doc of DOCS) {
    for (const [, file, line, code] of flat(doc).matchAll(cite)) {
      seen++;
      const at = read(file).split('\n')[Number(line) - 1] ?? '';
      assert.ok(at.includes(code), `${doc} cites ${file}:${line} for \`${code}\`, but that line is: ${at.trim()}`);
    }
  }
  assert.ok(seen > 0, 'no `file:line` hard-codes `code` citation found; update this test with the wording');
});

test('BENCHMARK-RESULTS.md states the source of each hand-authored benign sample', () => {
  const unscanned = samples.filter((s) => s.label === 'benign' && !s.metadata?.scanVerdict);
  const bySource = new Map();
  for (const s of unscanned) bySource.set(s.source, (bySource.get(s.source) ?? 0) + 1);
  const text = flat('BENCHMARK-RESULTS.md');
  assert.ok(text.includes(`further ${unscanned.length} are hand-authored fixtures`), `the ${unscanned.length} total is not stated`);
  for (const [source, n] of bySource) {
    assert.ok(text.includes(`${n} declare \`source: '${source}'\``), `${n} declare \`source: '${source}'\` is not stated`);
  }
});

// A number of tests or scenarios, with at most one word between them.
const COUNT = /\b\d+\s+(?:\w+\s+)?(?:tests?|scenarios?)\b/i;

test('the count pattern finds a count with or without a word before "tests" or "scenarios"', () => {
  for (const line of ['# 222 attack scenarios', '# 222 tests', 'Type "Run all 223 Scenarios"', '1 benchmark test']) {
    assert.ok(COUNT.test(line), `${line} is not found as a count`);
  }
  for (const line of ['# Step 1: Run the full benchmark (README.md states the test counts)', 'Type "npm test"', 'Sleep 8s']) {
    assert.ok(!COUNT.test(line), `${line} is found as a count`);
  }
});

test('docs/demo.tape states no test or scenario count', () => {
  // The tape is recorded once and kept, so a count in it goes stale as tests
  // are added; docs/test-catalog.md states the counts, and
  // scripts/check-readme.mjs holds them to the suite.
  const counted = read('docs/demo.tape')
    .split('\n')
    .map((line, i) => `docs/demo.tape:${i + 1}: ${line.trim()}`)
    .filter((line) => COUNT.test(line.replace(/^[^ ]+ /, '')));
  assert.deepEqual(counted, [], 'refer to the counts docs/test-catalog.md states instead');
});

test('the README does not say opena2a benchmark and hackmyagent secure -b oasb-1 check the same controls', () => {
  // opena2a benchmark reports check IDs over the level's check-ID set, and
  // hackmyagent secure -b oasb-1 reports control IDs over verified controls,
  // so the two percentages are not the same figure.
  const heading = '## Usage via OpenA2A CLI';
  const text = read('README.md');
  const start = text.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `README.md has no "${heading}" section; update this test with the heading`);
  const end = text.indexOf('\n## ', start + heading.length + 1);
  const section = (end < 0 ? text.slice(start) : text.slice(start, end)).replace(/\s+/g, ' ');
  assert.ok(!/the same controls/i.test(section), `"${heading}" says "the same controls"`);
});

test('docs/pinned-benchmark.md states the uncategorized malicious count corpus/v2.json holds', () => {
  const n = samples.filter((s) => s.label === 'malicious' && !s.category).length;
  assert.ok(flat('docs/pinned-benchmark.md').includes(`also holds ${n} uncategorized malicious samples`), `${n} uncategorized malicious samples is not stated`);
});
