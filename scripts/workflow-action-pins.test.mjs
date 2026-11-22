// Tests that each action .github/workflows/security.yml uses is pinned to a
// full commit SHA, with the release that commit is in a comment after it. A
// tag or a branch such as `@v4` or `@master` can be moved to another commit
// by whoever controls the action's repository; a commit SHA cannot.
// The first test reads each `uses:` line of the workflow. The last test makes
// each change in its list to a copy of the workflow and checks that the first
// test then fails.
// It does not check that a SHA is the commit of the release its comment
// names: that needs the action's repository, and these tests run offline.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflowText = readFileSync(join(repo, '.github', 'workflows', 'security.yml'), 'utf8');

// A `uses:` key, as a step's first key or a later one, and its value.
const USES = /^\s*(?:-\s+)?uses:\s*(.*)$/;
// owner/repo[/path]@<40 hex digits> # v<major>[.<minor>[.<patch>]]
const PINNED = /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40} # v\d+(?:\.\d+){0,2}$/;

/** The workflow's `uses:` values, outside comments, with their line number. */
function usesOf(text) {
  return text.split('\n').flatMap((line, i) => {
    if (line.trim().startsWith('#')) return [];
    const m = USES.exec(line);
    return m ? [{ value: m[1].trim(), line: i + 1 }] : [];
  });
}

function checkPinned(text) {
  const uses = usesOf(text);
  assert.notDeepEqual(uses, [], 'security.yml uses no action');
  const unpinned = uses.filter(({ value }) => !PINNED.test(value)).map(({ value, line }) => `line ${line}: ${value}`);
  assert.deepEqual(unpinned, [], 'each action should be <owner>/<repo>@<commit SHA> # v<version>');
}

test('each action security.yml uses is pinned to a commit SHA with its version in a comment', () => {
  checkPinned(workflowText);
});

const SHA = /@[0-9a-f]{40}( # v[\d.]+)/;

// Each change unpins an action, or drops the version its comment names.
const weakenings = [
  ['an action is used at a major-version tag', (s) => s.replace(SHA, '@v4')],
  ['an action is used at a branch', (s) => s.replace(SHA, '@master')],
  ['an action is used at a tag with the version comment kept', (s) => s.replace(SHA, '@v4$1')],
  ['an action is used at a short SHA', (s) => s.replace(/@([0-9a-f]{7})[0-9a-f]{33}/, '@$1')],
  ['an action is used at no ref', (s) => s.replace(SHA, '')],
  ['an action pinned to a SHA names no version', (s) => s.replace(/(@[0-9a-f]{40}) # v[\d.]+/, '$1')],
  ['an action pinned to a SHA names its version without a comment', (s) => s.replace(/(@[0-9a-f]{40}) # (v[\d.]+)/, '$1 $2')],
];

test('each change that unpins an action fails the first test', () => {
  const missed = [];
  for (const [what, change] of weakenings) {
    const text = change(workflowText);
    assert.notEqual(text, workflowText, `the change "${what}" does not apply`);
    try {
      checkPinned(text);
      missed.push(what);
    } catch (err) {
      if (!(err instanceof assert.AssertionError)) throw err;
    }
  }
  assert.deepEqual(missed, []);
});
