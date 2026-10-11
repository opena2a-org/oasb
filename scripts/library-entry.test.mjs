// Tests for the package entry point as a library install sees it.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.
//
// Each test builds src/ with tsc into a temporary directory and requires the
// built index.js from there. No node_modules sits above that directory, so
// arp-guard, an optional peer dependency installed here for the suite, cannot
// be resolved: the same state as `npm install @opena2a/oasb` on its own.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let base;

before(() => {
  base = mkdtempSync(join(tmpdir(), 'oasb-entry-'));
  const tsc = require.resolve('typescript/bin/tsc', { paths: [repo] });
  const r = spawnSync(
    process.execPath,
    [tsc, '-p', join(repo, 'tsconfig.json'), '--outDir', join(base, 'build'), '--declaration', 'false'],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0, `tsc failed:\n${r.stdout}${r.stderr}`);
});

after(() => rmSync(base, { recursive: true, force: true }));

// A fresh copy of the build for one test, so module-level caches start empty,
// with the given packages written into its node_modules.
function install(name, packages = {}) {
  const dir = join(base, name);
  cpSync(join(base, 'build'), dir, { recursive: true });
  for (const [pkg, source] of Object.entries(packages)) {
    mkdirSync(join(dir, 'node_modules', pkg), { recursive: true });
    writeFileSync(join(dir, 'node_modules', pkg, 'index.js'), source);
  }
  delete process.env.OASB_ADAPTER;
  return require(join(dir, 'index.js'));
}

test('without arp-guard, the default adapter names the package to install and OASB_ADAPTER', async () => {
  const oasb = install('no-arp-guard');
  const adapter = oasb.createAdapter();
  const missing = err => {
    assert.match(err.message, /needs arp-guard, which is not installed/);
    assert.match(err.message, /npm install arp-guard/);
    assert.match(err.message, /OASB_ADAPTER/);
    return true;
  };
  assert.throws(() => oasb.getCapabilityMatrix(), missing);
  assert.throws(() => adapter.getCapabilities(), missing);
  await assert.rejects(adapter.start(), missing);
});

test('with arp-guard installed, the capability matrix reports its version', () => {
  const oasb = install('with-arp-guard', { 'arp-guard': "module.exports = { VERSION: '9.9.9' };\n" });
  const matrix = oasb.getCapabilityMatrix();
  assert.equal(matrix.product, 'arp-guard');
  assert.equal(matrix.version, '9.9.9');
  assert.ok(matrix.capabilities.has('prompt-input-scanning'));
});

test('a module arp-guard itself cannot load is reported as it is', () => {
  const oasb = install('arp-guard-broken', { 'arp-guard': "require('oasb-missing-dependency');\n" });
  assert.throws(() => oasb.getCapabilityMatrix(), err => {
    assert.match(err.message, /^Cannot find module 'oasb-missing-dependency'/);
    return true;
  });
});
