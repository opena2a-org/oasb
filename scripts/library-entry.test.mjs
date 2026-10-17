// Tests for the package entry point as a library install sees it.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.
//
// Each test builds src/ with tsc into a temporary directory and requires the
// built index.js from there. No node_modules sits above that directory, so
// arp-guard, an optional dependency installed here for the suite, cannot be
// resolved: the same state as `npm install @opena2a/oasb --omit=optional`.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
// with the given packages written into its node_modules: a string is the
// package's index.js, an object maps each of its file names to its content.
// Each name in `links` is linked from this checkout's node_modules, where
// `npm ci` installed it.
function install(name, packages = {}, links = []) {
  const dir = join(base, name);
  cpSync(join(base, 'build'), dir, { recursive: true });
  mkdirSync(join(dir, 'node_modules'), { recursive: true });
  for (const [pkg, source] of Object.entries(packages)) {
    mkdirSync(join(dir, 'node_modules', pkg), { recursive: true });
    const files = typeof source === 'string' ? { 'index.js': source } : source;
    for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, 'node_modules', pkg, file), content);
  }
  for (const pkg of links) symlinkSync(join(repo, 'node_modules', pkg), join(dir, 'node_modules', pkg), 'dir');
  delete process.env.OASB_ADAPTER;
  return require(join(dir, 'index.js'));
}

// The version of a package `npm ci` installed in this checkout.
const installedVersion = pkg => JSON.parse(readFileSync(join(repo, 'node_modules', pkg, 'package.json'), 'utf8')).version;

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
  // The VERSION export differs from package.json, as in arp-guard 0.3.0.
  const oasb = install('with-arp-guard', {
    'arp-guard': {
      'package.json': '{"name":"arp-guard","version":"9.9.9"}\n',
      'index.js': "module.exports = { VERSION: '1.3.1' };\n",
    },
  });
  const matrix = oasb.getCapabilityMatrix();
  assert.equal(matrix.product, 'arp-guard');
  assert.equal(matrix.version, '9.9.9');
  assert.ok(matrix.capabilities.has('prompt-input-scanning'));
});

test('the capability matrix reports the version of the arp-guard npm ci installed', () => {
  const oasb = install('installed-arp-guard', {}, ['arp-guard']);
  assert.equal(new oasb.ArpWrapper().getCapabilities().version, installedVersion('arp-guard'));
  assert.equal(oasb.getCapabilityMatrix().version, installedVersion('arp-guard'));
});

test('when an exports map hides package.json, the matrix reports the VERSION export and says so', () => {
  const oasb = install('arp-guard-exports', {
    'arp-guard': {
      'package.json': '{"name":"arp-guard","version":"9.9.9","exports":{".":"./index.js"}}\n',
      'index.js': "module.exports = { VERSION: '1.3.1' };\n",
    },
  });
  assert.equal(oasb.getCapabilityMatrix().version, '1.3.1 (VERSION export; package.json not resolvable)');
});

test('the llm-guard and rebuff adapters report the version of the installed package', () => {
  const fake = install('fake-llm-guard-rebuff', {
    'llm-guard': {
      'package.json': '{"name":"llm-guard","version":"9.9.9"}\n',
      'index.js': 'module.exports = { LLMGuard: class {} };\n',
    },
    rebuff: { 'package.json': '{"name":"rebuff","version":"9.9.8"}\n' },
  });
  assert.equal(new fake.LLMGuardWrapper().getCapabilities().version, '9.9.9');
  assert.equal(new fake.RebuffWrapper().getCapabilities().version, '9.9.8');

  const installed = install('installed-llm-guard-rebuff', {}, ['llm-guard', 'rebuff']);
  assert.equal(new installed.LLMGuardWrapper().getCapabilities().version, installedVersion('llm-guard'));
  assert.equal(new installed.RebuffWrapper().getCapabilities().version, installedVersion('rebuff'));
});

test('a module arp-guard itself cannot load is reported as it is', () => {
  const oasb = install('arp-guard-broken', { 'arp-guard': "require('oasb-missing-dependency');\n" });
  assert.throws(() => oasb.getCapabilityMatrix(), err => {
    assert.match(err.message, /^Cannot find module 'oasb-missing-dependency'/);
    return true;
  });
});
