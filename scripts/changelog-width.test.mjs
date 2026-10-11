// Tests that CHANGELOG.md stays wrapped at 80 characters.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 80;

// The 2026-08-27 correction under the withdrawn comparative scores was
// recorded as one unwrapped paragraph and is left as recorded.
const UNWRAPPED = ['**Corrected 2026-08-27.** '];

test(`CHANGELOG.md lines are at most ${WIDTH} characters wide`, () => {
  const lines = readFileSync(join(repo, 'CHANGELOG.md'), 'utf8').split('\n');
  const wide = [];
  lines.forEach((line, i) => {
    const width = [...line].length;
    if (width > WIDTH && !UNWRAPPED.some((start) => line.startsWith(start))) {
      wide.push(`line ${i + 1} is ${width} characters wide`);
    }
  });
  assert.deepEqual(wide, [], `CHANGELOG.md is wrapped at ${WIDTH} characters: ${wide.join('; ')}`);
});
