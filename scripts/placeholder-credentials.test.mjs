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
// An OpenAI key starts a word, so a hyphenated word that has "sk" before a
// hyphen (a "risk-" compound, as in the test below) is not one.
const KEY_SHAPES =
  /(?<!\w)sk-[a-zA-Z0-9\-_]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}|ghp_[a-zA-Z0-9]{36}|glpat-[a-zA-Z0-9\-_]{20,}|xox[bpas]-[a-zA-Z0-9\-]{10,}|(?:eyJ[a-zA-Z0-9_-]{20,}\.){2}[a-zA-Z0-9_-]{20,}/g;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

// Each API-key-shaped value in `text` that does not spell FAKE, as
// "<name>:<line>: <first 8 characters>...".
function unmarked(text, name) {
  const found = [];
  text.split('\n').forEach((line, i) => {
    for (const [value] of line.matchAll(KEY_SHAPES)) {
      if (!value.includes('FAKE')) found.push(`${name}:${i + 1}: ${value.slice(0, 8)}...`);
    }
  });
  return found;
}

test('every API-key-shaped value in src/ spells FAKE', () => {
  const found = files(join(repo, 'src')).flatMap((file) => unmarked(readFileSync(file, 'utf8'), relative(repo, file)));
  assert.deepEqual(found, [], 'mark each value with FAKE, or assemble it at run time from parts');
});

test('a hyphenated word with "sk" before a hyphen is not an OpenAI-shaped key', () => {
  // Joined at run time so that no line of this file holds the whole word,
  // which a credential scan of a push refuses as an OpenAI-shaped key.
  const word = ['risk', 'management', 'framework'].join('-');
  assert.deepEqual(unmarked(`// see the ${word} page`, 'x'), []);
  // Joined at run time so that no line of this file holds the whole value.
  const key = ['sk', 'proj', 'not0a0real0key0value'].join('-');
  assert.deepEqual(unmarked(key, 'x'), ['x:1: sk-proj-...']);
  assert.deepEqual(unmarked(`the key is "${key}"`, 'x'), ['x:1: sk-proj-...']);
});
