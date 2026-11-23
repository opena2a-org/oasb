// Checks that package-lock.json resolves no tinypool in the range of its two
// critical advisories. vitest@3.2 depends on tinypool@^1.1.1, and every
// tinypool before 2.1.2 is inside GHSA-5gmw-xhrv-c9v3 or GHSA-85c8-ppgw-ccpr,
// the critical advisories npm ci reported for this lockfile. The fix npm audit
// names is vitest@5, a major version, so `overrides` in package.json moves
// tinypool to ^2.1.2, which vitest@3.2 runs on.
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

// The first tinypool outside both critical advisories.
const FIXED = '2.1.2';

test('package.json overrides the tinypool vitest asks for', () => {
  const { overrides } = readJson('package.json');
  assert.ok(overrides?.tinypool, 'package.json has no overrides.tinypool');
  const floor = String(overrides.tinypool).replace(/^[\^~>=\s]+/, '');
  assert.ok(compare(floor, FIXED) >= 0, `overrides.tinypool ${overrides.tinypool} admits a version below ${FIXED}`);
});

test('package-lock.json resolves no tinypool in the range of its critical advisories', () => {
  const lock = readJson('package-lock.json');
  const found = Object.entries(lock.packages)
    .filter(([key]) => key === 'node_modules/tinypool' || key.endsWith('/node_modules/tinypool'))
    .map(([key, entry]) => [key, entry.version]);
  assert.ok(found.length > 0, 'package-lock.json holds no tinypool; update this test');
  const vulnerable = found.filter(([, version]) => compare(version, FIXED) < 0).map(([key, version]) => `${key}@${version}`);
  assert.deepEqual(vulnerable, [], `package-lock.json resolves tinypool below ${FIXED}:\n${vulnerable.join('\n')}`);
});

test('compare orders versions by major, minor and patch', () => {
  assert.equal(compare('2.1.2', '2.1.2'), 0);
  assert.equal(compare('2.2.0', '2.1.2'), 1);
  assert.equal(compare('1.1.1', '2.1.2'), -1);
  assert.equal(compare('2.10.0', '2.9.9'), 1);
});
