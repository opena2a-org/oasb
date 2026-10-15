// Type-checks src/ with its test files. `npm run build` leaves the test
// files out and vitest does not check types, so without this a type error in
// a scenario test is reported nowhere.
// Run with: npm run test:scripts (node --test), which npm test runs first.
// Kept outside src/ so the vitest totals the README claims stay a count of
// benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc', { paths: [repo] });
const config = join(repo, 'tsconfig.test.json');

function runTsc(...args) {
  return spawnSync(process.execPath, [tsc, '-p', config, ...args], { cwd: repo, encoding: 'utf8' });
}

test('tsconfig.test.json takes in the scenario test files', () => {
  const r = runTsc('--listFilesOnly');
  assert.equal(r.status, 0, `tsc --listFilesOnly failed:\n${r.stdout}${r.stderr}`);
  const tests = r.stdout
    .split('\n')
    .map(f => relative(repo, f.trim()).split(sep).join('/'))
    .filter(f => /^src\/(atomic|integration|e2e)\/.+\.test\.ts$/.test(f));
  assert.ok(
    tests.length > 0,
    'tsconfig.test.json takes in no test file under src/atomic, src/integration or src/e2e',
  );
});

test('npm run typecheck:tests reports no type error', () => {
  const { scripts } = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  assert.equal(scripts['typecheck:tests'], 'tsc -p tsconfig.test.json');
  const r = runTsc();
  assert.equal(r.status, 0, `tsc -p tsconfig.test.json reported errors:\n${r.stdout}${r.stderr}`);
});
