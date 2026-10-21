// Checks that package-lock.json resolves none of the vulnerable versions that
// rebuff's own dependency ranges ask for. rebuff@0.1.0 depends on
// langchain@^0.0.159 and openai@^3.2.1, which pull in expr-eval, axios,
// langsmith and uuid at versions npm audit reports. The rebuff adapter loads
// only rebuff's heuristic (src/harness/rebuff-loader.ts), whose imports of
// langchain and openai are types the compiler drops, so `overrides` in
// package.json moves both to versions outside those advisories.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(readFileSync(join(repo, file), 'utf8'));

/** -1, 0 or 1 as version a is lower than, equal to or higher than b; prerelease tags are ignored. */
function compare(a, b) {
  const parts = (v) => v.split('-')[0].split('.').map(Number);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

// The vulnerable range of each package, as npm audit reported it for the
// lockfile before the overrides.
const VULNERABLE = {
  langchain: { range: '<=1.2.27', test: (v) => compare(v, '1.2.27') <= 0 },
  langsmith: { range: '<=0.5.26', test: (v) => compare(v, '0.5.26') <= 0 },
  openai: { range: '2.0.0 - 3.3.0', test: (v) => compare(v, '2.0.0') >= 0 && compare(v, '3.3.0') <= 0 },
  axios: { range: '<=0.32.0', test: (v) => compare(v, '0.32.0') <= 0 },
  uuid: { range: '<11.1.1', test: (v) => compare(v, '11.1.1') < 0 },
  // expr-eval has no fixed version; the lockfile must not hold it at all.
  'expr-eval': { range: '*', test: () => true },
};

/** Every [lockfile path, version] the lockfile holds for package `name`. */
function resolved(lock, name) {
  return Object.entries(lock.packages)
    .filter(([key]) => key === `node_modules/${name}` || key.endsWith(`/node_modules/${name}`))
    .map(([key, entry]) => [key, entry.version]);
}

test('package.json overrides the langchain and openai versions rebuff asks for', () => {
  const { overrides } = readJson('package.json');
  assert.ok(overrides?.rebuff, 'package.json has no overrides.rebuff');
  assert.ok(overrides.rebuff.langchain, 'overrides.rebuff does not set langchain');
  assert.ok(overrides.rebuff.openai, 'overrides.rebuff does not set openai');
});

test('package-lock.json resolves no version in the advisory ranges of rebuff dependencies', () => {
  const lock = readJson('package-lock.json');
  assert.ok(resolved(lock, 'rebuff').length > 0, 'package-lock.json holds no rebuff; update this test');
  const found = [];
  for (const [name, { range, test: vulnerable }] of Object.entries(VULNERABLE)) {
    for (const [key, version] of resolved(lock, name)) {
      if (vulnerable(version)) found.push(`${key}@${version} (vulnerable: ${range})`);
    }
  }
  assert.deepEqual(found, [], `package-lock.json resolves vulnerable versions:\n${found.join('\n')}`);
});

test('compare orders versions by major, minor and patch', () => {
  assert.equal(compare('1.2.27', '1.2.27'), 0);
  assert.equal(compare('1.2.28', '1.2.27'), 1);
  assert.equal(compare('0.0.159', '1.2.27'), -1);
  assert.equal(compare('1.10.0', '1.9.9'), 1);
  assert.equal(compare('2.0.0-dev-1', '2.0.0'), 0);
});
