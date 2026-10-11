// Tests that statements in README.md and BENCHMARK-RESULTS.md match the
// corpus and scripts they describe, and that docs/demo.tape states no count.
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

test('docs/demo.tape states no test or scenario count', () => {
  // The tape is recorded once and kept, so a count in it goes stale as tests
  // are added; README.md states the counts, and scripts/check-readme.mjs
  // holds them to the suite.
  const counted = read('docs/demo.tape')
    .split('\n')
    .map((line, i) => `docs/demo.tape:${i + 1}: ${line.trim()}`)
    .filter((line) => /\b\d+\s+(?:\w+\s+)?(?:tests?|scenarios?)\b/i.test(line.replace(/^[^ ]+ /, '')));
  assert.deepEqual(counted, [], 'refer to the counts README.md states instead');
});

test('README.md states the uncategorized malicious count corpus/v2.json holds', () => {
  const n = samples.filter((s) => s.label === 'malicious' && !s.category).length;
  assert.ok(flat('README.md').includes(`also holds ${n} uncategorized malicious samples`), `${n} uncategorized malicious samples is not stated`);
});
