// Tests for the package entry point as a library install sees it.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.
//
// The tests build src/ with tsc into a temporary directory once, and each
// requires the built index.js from a copy of that build. No node_modules
// sits above that directory, so arp-guard, an optional dependency installed
// here for the suite, cannot be resolved: the same state as
// `npm install @opena2a/oasb --omit=optional`. The requireCapability tests
// instead install the build as node_modules/@opena2a/oasb of a project,
// beside vitest linked from this checkout or a stand-in for its suite API,
// and run this checkout's vitest there.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

// A vitest run of a project that installed the build, under an adapter that
// declares prompt-input-scanning only. The project's test file calls
// requireCapability('mcp-scanning') at the top of one describe() callback
// and requireCapability('prompt-input-scanning') at the top of another.
// `nodeOptions` is added to NODE_OPTIONS for the run. Where `suiteSource` is
// given, the project's node_modules/vitest is a package whose `vitest/suite`
// is that CommonJS source, in place of the vitest that runs the file. Returns
// the result of the test file in the run's JSON report and the adapter's path.
function runRequireCapability(name, { nodeOptions, suiteSource } = {}) {
  const dir = join(base, name);
  const pkg = join(dir, 'node_modules', '@opena2a', 'oasb');
  mkdirSync(pkg, { recursive: true });
  cpSync(join(base, 'build'), join(pkg, 'dist'), { recursive: true });
  writeFileSync(join(pkg, 'package.json'), '{"name":"@opena2a/oasb","main":"dist/index.js"}\n');
  if (suiteSource === undefined) {
    symlinkSync(join(repo, 'node_modules', 'vitest'), join(dir, 'node_modules', 'vitest'), 'dir');
  } else {
    mkdirSync(join(dir, 'node_modules', 'vitest'));
    writeFileSync(join(dir, 'node_modules', 'vitest', 'package.json'), '{"name":"vitest","exports":{"./suite":"./suite.cjs"}}\n');
    writeFileSync(join(dir, 'node_modules', 'vitest', 'suite.cjs'), suiteSource);
  }
  const adapter = join(dir, 'adapter.cjs');
  writeFileSync(
    adapter,
    'module.exports = class OneCapabilityAdapter {\n' +
      '  getCapabilities() {\n' +
      "    return { product: 'one-capability-adapter', version: '0.0.0', capabilities: new Set(['prompt-input-scanning']) };\n" +
      '  }\n' +
      '};\n',
  );
  writeFileSync(join(dir, 'vitest.config.mjs'), "export default { test: { include: ['*.test.mjs'], globals: true } };\n");
  writeFileSync(
    join(dir, 'capability.test.mjs'),
    "import { requireCapability } from '@opena2a/oasb';\n" +
      "describe('needs mcp', () => { requireCapability('mcp-scanning'); it('t1', () => {}); });\n" +
      "describe('has prompt', () => { requireCapability('prompt-input-scanning'); it('t2', () => {}); });\n",
  );
  const env = { ...process.env, OASB_ADAPTER: adapter };
  if (nodeOptions) env.NODE_OPTIONS = [env.NODE_OPTIONS, nodeOptions].filter(Boolean).join(' ');
  const out = join(dir, 'report.json');
  const vitest = join(repo, 'node_modules', 'vitest', 'vitest.mjs');
  const r = spawnSync(
    process.execPath,
    [vitest, 'run', '--root', dir, '--config', join(dir, 'vitest.config.mjs'), '--reporter=json', `--outputFile=${out}`],
    { cwd: dir, encoding: 'utf8', env },
  );
  assert.ok(existsSync(out), `vitest wrote no report (exit ${r.status}):\n${r.stderr.slice(-2000)}`);
  return { file: JSON.parse(readFileSync(out, 'utf8')).testResults[0], adapter };
}

test('in a vitest run of a project that installed the package, requireCapability skips the block whose capability the adapter lacks', () => {
  const { file } = runRequireCapability('require-capability');
  assert.deepEqual(
    file.assertionResults.map(t => [t.ancestorTitles[0], t.title, t.status]),
    [
      ['needs mcp [requires: mcp-scanning]', 't1', 'skipped'],
      ['has prompt', 't2', 'passed'],
    ],
    file.message,
  );
});

test('where Node.js cannot require() an ES module, requireCapability says vitest\'s suite API failed, not that there is no describe() block', () => {
  // --no-experimental-require-module turns off require() of an ES module,
  // which Node.js does without a flag from 20.19.0 in 20.x and from
  // 22.12.0, so the run require()s vitest's suite API as one before those
  // versions does.
  const { file, adapter } = runRequireCapability('require-capability-no-require-module', {
    nodeOptions: '--no-experimental-require-module',
  });
  assert.equal(file.status, 'failed');
  assert.deepEqual(file.assertionResults, []);
  for (const part of [
    `requireCapability('mcp-scanning'): the adapter under test, one-capability-adapter (OASB_ADAPTER=${adapter}), lacks mcp-scanning, and `,
    "vitest's suite API, which requireCapability needs to skip a describe() block, failed: require() of ES Module ",
    `Node.js ${process.version} cannot require() an ES module here: run the suite on Node.js 20.19.0 or a later 20.x release, or on 22.12.0 or later, without --no-experimental-require-module, `,
    "or use describeWithCapability('mcp-scanning', name, fn) from src/harness/capabilities to report the suite N/A.",
  ]) {
    assert.ok(file.message.includes(part), `the message does not hold "${part}":\n${file.message}`);
  }
  assert.ok(!file.message.includes('no describe() block'), file.message);
  // package.json allows the Node.js versions the message names, and no other.
  const { engines } = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  assert.equal(engines.node, '^20.19.0 || >=22.12.0');
});

test('where vitest\'s suite API fails another way, requireCapability quotes the first line of its error, not that there is no describe() block', () => {
  // getCurrentSuite() throws the error vitest's throws where it finds no
  // current suite, and a second line.
  const thrown = 'Vitest failed to find the current suite. This is a bug in Vitest. Please, open an issue with reproduction.';
  const { file } = runRequireCapability('require-capability-suite-api-throws', {
    suiteSource: `exports.getCurrentSuite = () => { throw new Error(${JSON.stringify(`${thrown}\nsecond line`)}); };\n`,
  });
  assert.equal(file.status, 'failed');
  assert.deepEqual(file.assertionResults, []);
  const part =
    "lacks mcp-scanning, and vitest's suite API, which requireCapability needs to skip a describe() block, failed: " +
    `${thrown} Instead, use describeWithCapability('mcp-scanning', name, fn) from src/harness/capabilities to report the suite N/A.`;
  assert.ok(file.message.includes(part), `the message does not hold "${part}":\n${file.message}`);
  assert.ok(!file.message.includes('no describe() block'), file.message);
  assert.ok(!file.message.includes('second line'), file.message);
});
