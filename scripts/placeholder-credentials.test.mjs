// Tests that the credential-shaped values in src/ are marked as placeholders.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.
//
// A credential scan of a push refuses a line that holds an API-key-shaped
// value with nothing marking it as fake. Each value in the shapes the OL-001
// output-leak pattern matches must spell FAKE, or be assembled at run time
// from parts so that no line holds the whole value.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

// The key shapes of OL-001: OpenAI, AWS access key ID, GitHub, GitLab, Slack, JWT.
const KEY_SHAPES =
  /sk-[a-zA-Z0-9\-_]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}|ghp_[a-zA-Z0-9]{36}|glpat-[a-zA-Z0-9\-_]{20,}|xox[bpas]-[a-zA-Z0-9\-]{10,}|(?:eyJ[a-zA-Z0-9_-]{20,}\.){2}[a-zA-Z0-9_-]{20,}/g;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

test('every API-key-shaped value in src/ spells FAKE', () => {
  const unmarked = [];
  for (const file of files(join(repo, 'src'))) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const [value] of line.matchAll(KEY_SHAPES)) {
          if (!value.includes('FAKE')) unmarked.push(`${relative(repo, file)}:${i + 1}: ${value.slice(0, 8)}...`);
        }
      });
  }
  assert.deepEqual(unmarked, [], 'mark each value with FAKE, or assemble it at run time from parts');
});
