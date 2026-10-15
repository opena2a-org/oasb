// Tests the check rules of .hmaignore, each of which leaves one
// `hackmyagent secure` check out of the scan of one file: each rule names a
// file in the repository and gives its reason, and the tarball digest
// comparison in src/benchmark/pinned/inputs.ts, which NEMO-002 reports as a
// digest check skipped on a falsy value, has its rule and throws PinError on a
// mismatch, the behaviour that rule's reason states.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const INPUTS = 'src/benchmark/pinned/inputs.ts';

/** The `<file>:<CHECK-ID> # <reason>` rules of .hmaignore. */
function checkRules() {
  return readFileSync(join(repo, '.hmaignore'), 'utf8')
    .split(/\r?\n/)
    .map((line) => /^([^#\s][^\s:]*):([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\s*(?:#\s*(.*))?$/.exec(line.trim()))
    .filter(Boolean)
    .map(([, file, check, reason]) => ({ file, check, reason: (reason ?? '').trim() }));
}

test('each check rule in .hmaignore names a file in the repository and gives a reason', () => {
  const rules = checkRules();
  assert.notDeepEqual(rules, [], '.hmaignore has no <file>:<CHECK-ID> rule');
  for (const { file, check, reason } of rules) {
    assert.ok(existsSync(join(repo, file)), `.hmaignore leaves ${check} out of ${file}, which does not exist`);
    assert.notEqual(reason, '', `.hmaignore leaves ${check} out of ${file} with no reason after #`);
  }
});

test(`.hmaignore leaves NEMO-002 out of ${INPUTS}, whose tarball digest comparison throws PinError on a mismatch`, () => {
  assert.ok(
    checkRules().some(({ file, check }) => file === INPUTS && check === 'NEMO-002'),
    `.hmaignore has no ${INPUTS}:NEMO-002 rule, so hackmyagent secure --ci reports the tarball digest comparison as critical and exits 1`,
  );

  // The comparisons NEMO-002 reports: a negated test on a computed digest.
  const lines = readFileSync(join(repo, INPUTS), 'utf8').split(/\r?\n/);
  const negated = /^\s*if \(!/;
  const comparisons = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => negated.test(line) && line.includes('.digest().equals('));
  assert.notDeepEqual(comparisons, [], `${INPUTS} has no tarball digest comparison`);
  for (const { index } of comparisons) {
    assert.equal(
      lines[index + 1]?.trim(),
      'throw new PinError(',
      `${INPUTS}:${index + 1} compares a tarball digest without throwing PinError on the next line; ` +
        'the NEMO-002 rule in .hmaignore no longer holds',
    );
  }
});
