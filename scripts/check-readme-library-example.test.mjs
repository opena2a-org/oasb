// Tests for scripts/check-readme-library-example.mjs.
// Run with: npm run test:scripts (node --test).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLibraryExample, expectedLastLine } from './check-readme-library-example.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(repo, 'scripts', 'check-readme-library-example.mjs');
const readme = readFileSync(join(repo, 'README.md'), 'utf8');

test('expectedLastLine reads the comment of the last console.log line', () => {
  assert.equal(expectedLastLine('console.log(a);\nconsole.log(b); // 0.5: one of two\n'), '0.5');
  assert.equal(expectedLastLine('console.log(a); // 1\nconsole.log(b);\n'), undefined);
  assert.equal(expectedLastLine('const x = 1;\n'), undefined);
});

test('the README library example type-checks and runs from the packed tarball', () => {
  const r = spawnSync(process.execPath, [script], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.doesNotMatch(r.stdout + r.stderr, /Cannot find module/);
  assert.match(r.stdout, /type-checks and runs from the packed tarball/);
});

test('a call that no longer matches the package fails the type check', () => {
  const drifted = readme.replace(
    "import { createAdapter, getCapabilityMatrix, benchmark } from '@opena2a/oasb';",
    "import { createAdapter, getCapabilityMatrix, benchmark } from '@opena2a/oasb';\nbenchmark.determineTier();",
  );
  assert.notEqual(drifted, readme, 'the README import line the test edits has changed');
  const { ok, report } = checkLibraryExample(repo, { readme: drifted });
  assert.equal(ok, false);
  assert.match(report, /type-checking the README example failed/);
  assert.match(report, /Expected 1 arguments, but got 0/);
});

test('an example whose last line prints other than its comment says fails', () => {
  const drifted = readme.replace('console.log(entry.metrics.recall); // 0.5', 'console.log(entry.metrics.recall); // 0.75');
  assert.notEqual(drifted, readme, 'the README recall line the test edits has changed');
  const { ok, report } = checkLibraryExample(repo, { readme: drifted });
  assert.equal(ok, false);
  assert.match(report, /says it prints 0\.75, but it printed 0\.5/);
});
