// Tests that CHANGELOG.md and docs/testing/release-smoke.md stay wrapped at
// 80 characters.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 80;

// The 2026-08-27 correction under the withdrawn comparative scores was
// recorded as one unwrapped paragraph and is left as recorded. Only that
// line is exempt: it is matched whole, by its SHA-256, so another line that
// starts the same way is measured like any other.
const UNWRAPPED_START = '**Corrected 2026-08-27.** ';
const UNWRAPPED_SHA256 = ['37ab1d8e02d07308dc523f69b36399e39dbc104bd888b4281317223d223f861d'];

const sha256 = (line) => createHash('sha256').update(line).digest('hex');

/** The lines of a changelog that are wider than WIDTH and not exempt. */
function wideLines(text) {
  const wide = [];
  text.split('\n').forEach((raw, i) => {
    // A checkout with CRLF line endings leaves a carriage return at the end
    // of each line. It is part of the line ending, not of the line.
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const width = [...line].length;
    if (width > WIDTH && !UNWRAPPED_SHA256.includes(sha256(line))) {
      wide.push(`line ${i + 1} is ${width} characters wide`);
    }
  });
  return wide;
}

const changelog = readFileSync(join(repo, 'CHANGELOG.md'), 'utf8');

test(`CHANGELOG.md lines are at most ${WIDTH} characters wide`, () => {
  const wide = wideLines(changelog);
  assert.deepEqual(wide, [], `CHANGELOG.md is wrapped at ${WIDTH} characters: ${wide.join('; ')}`);
});

test(`docs/testing/release-smoke.md lines are at most ${WIDTH} characters wide`, () => {
  const guide = readFileSync(join(repo, 'docs', 'testing', 'release-smoke.md'), 'utf8');
  const wide = wideLines(guide);
  assert.deepEqual(wide, [], `docs/testing/release-smoke.md is wrapped at ${WIDTH} characters: ${wide.join('; ')}`);
});

test('a carriage return before the line feed is not counted', () => {
  assert.deepEqual(wideLines(`${'a'.repeat(WIDTH)}\r\n`), []);
  assert.deepEqual(wideLines(`${'a'.repeat(WIDTH)}\r\n${'b'.repeat(WIDTH + 1)}\r\n`), [
    `line 2 is ${WIDTH + 1} characters wide`,
  ]);
});

test('only the one recorded unwrapped line is exempt', () => {
  const recorded = changelog.split(/\r?\n/).filter((line) => line.startsWith(UNWRAPPED_START));
  assert.equal(recorded.length, 1, `CHANGELOG.md has ${recorded.length} lines that start with "${UNWRAPPED_START}"`);
  assert.ok([...recorded[0]].length > WIDTH, 'the recorded line is wrapped now, so it needs no exemption');
  assert.deepEqual(wideLines(recorded[0]), []);
  assert.deepEqual(wideLines(`${recorded[0]}\r\n`), []);

  const sameStart = UNWRAPPED_START + 'x'.repeat(186 - UNWRAPPED_START.length);
  assert.deepEqual(wideLines(sameStart), ['line 1 is 186 characters wide']);
  const edited = `${recorded[0]} More.`;
  assert.deepEqual(wideLines(edited), [`line 1 is ${[...edited].length} characters wide`]);
});
