// Tests for the oasb command that `npx @opena2a/oasb <ID>` runs (bin/oasb.mjs,
// bin/run-scenario.mjs): one scenario file against the adapter OASB_ADAPTER
// selects, and the file's verdict.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.
//
// The command's runs are made in an install layout: src/ is built with tsc
// into a temporary directory's node_modules/@opena2a/oasb, beside a copy of
// bin/, src/ and package.json, with the packages `npm ci` installed in this
// checkout linked beside it, and the command is run through the
// node_modules/.bin link npm makes for it, from a directory of its own.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIO_DIRS as COUNTED_DIRS } from './readme-counts.mjs';
import { SCENARIO_DIRS, USAGE, VITEST_MISSING, findScenario, scenarioFiles, verdict, verdictLine } from '../bin/run-scenario.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
const installed = (name) => existsSync(join(repo, 'node_modules', name, 'package.json'));
const skip = !(installed('vitest') && installed('arp-guard')) && 'vitest and arp-guard are not installed; run npm ci';

// Declares no capabilities, so every scenario suite is skipped.
const NO_CAPABILITY_ADAPTER = join(repo, 'scripts', 'fixtures', 'no-capability-adapter.cjs');

// Declares prompt input scanning with a scanner that detects nothing, so the
// detection tests of AT-AI-001 fail and its two benign-input tests pass.
const BLIND_ADAPTER = `module.exports = class BlindAdapter {
  getCapabilities() {
    return { product: 'blind-fixture', version: '0.0.1', capabilities: new Set(['prompt-input-scanning']) };
  }
  createPromptScanner() {
    return { start: async () => {}, stop: async () => {}, scanInput: () => ({ detected: false, matches: [] }) };
  }
};
`;

let base;
const layouts = new Map();

before(() => {
  if (skip) return;
  base = mkdtempSync(join(tmpdir(), 'oasb-bin-'));
  const tsc = require.resolve('typescript/bin/tsc', { paths: [repo] });
  const r = spawnSync(
    process.execPath,
    [tsc, '-p', join(repo, 'tsconfig.json'), '--outDir', join(base, 'dist'), '--declaration', 'false'],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0, `tsc failed:\n${r.stdout}${r.stderr}`);
});

after(() => {
  if (base) rmSync(base, { recursive: true, force: true });
});

/**
 * The node_modules/.bin/oasb link of an install layout named `name`, made
 * once: the built package in node_modules/@opena2a/oasb, with each package
 * this checkout installed linked beside it except those in `omit`.
 */
function layout(name, omit = []) {
  if (layouts.has(name)) return layouts.get(name);
  const modules = join(base, name, 'node_modules');
  const oasb = join(modules, '@opena2a', 'oasb');
  mkdirSync(oasb, { recursive: true });
  cpSync(join(base, 'dist'), join(oasb, 'dist'), { recursive: true });
  for (const entry of ['bin', 'src', 'package.json']) cpSync(join(repo, entry), join(oasb, entry), { recursive: true });
  const link = (from, to) => symlinkSync(join(repo, 'node_modules', from), join(modules, to), 'dir');
  for (const entry of readdirSync(join(repo, 'node_modules'))) {
    if (entry.startsWith('.') || omit.includes(entry)) continue;
    if (entry.startsWith('@')) {
      mkdirSync(join(modules, entry), { recursive: true });
      for (const scoped of readdirSync(join(repo, 'node_modules', entry))) link(join(entry, scoped), join(entry, scoped));
    } else {
      link(entry, entry);
    }
  }
  // npm makes the link and marks its target executable when it installs a bin.
  mkdirSync(join(modules, '.bin'));
  chmodSync(join(oasb, 'bin', 'oasb.mjs'), 0o755);
  symlinkSync(join('..', '@opena2a', 'oasb', 'bin', 'oasb.mjs'), join(modules, '.bin', 'oasb'));
  const bin = join(modules, '.bin', 'oasb');
  layouts.set(name, bin);
  return bin;
}

/**
 * Runs the oasb command of the layout `name` with `args` from a new empty
 * directory, with OASB_ADAPTER=adapter (unset when null); `files` are written
 * into that directory first. Returns the result and the names the directory
 * holds after the run.
 */
function oasb(args, { adapter = null, name = 'full', omit = [], files = {} } = {}) {
  const bin = layout(name, omit);
  const cwd = mkdtempSync(join(base, 'cwd-'));
  for (const [file, text] of Object.entries(files)) writeFileSync(join(cwd, file), text);
  const env = { ...process.env, NO_COLOR: '1' };
  delete env.OASB_ADAPTER;
  if (adapter !== null) env.OASB_ADAPTER = adapter;
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, env, encoding: 'utf8' });
  return { ...r, left: readdirSync(cwd).filter((f) => !(f in files)) };
}

const lastLine = (text) => text.trimEnd().split('\n').at(-1);
const installedVersion = (name) => JSON.parse(readFileSync(join(repo, 'node_modules', name, 'package.json'), 'utf8')).version;

test('package.json names bin/oasb.mjs as the oasb command, and npm pack ships it with the modules it loads', () => {
  assert.deepEqual(pkg.bin, { oasb: 'bin/oasb.mjs' });
  assert.equal(readFileSync(join(repo, 'bin', 'oasb.mjs'), 'utf8').split('\n')[0], '#!/usr/bin/env node');
  const r = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const files = JSON.parse(r.stdout)[0].files.map((f) => f.path);
  for (const file of ['bin/oasb.mjs', 'bin/run-scenario.mjs', 'bin/checklist.mjs', 'bin/oasb-1-checklist.json']) {
    assert.ok(files.includes(file), `npm pack does not ship ${file}`);
  }
});

test('npx installs what the command loads: vitest, and arp-guard for the default adapter', () => {
  // npx installs a package's dependencies and optional dependencies, not its
  // devDependencies.
  for (const name of ['vitest', 'arp-guard']) {
    assert.ok(name in { ...pkg.dependencies, ...pkg.optionalDependencies }, `${name} is not a dependency or an optional dependency`);
    assert.ok(!(name in (pkg.devDependencies ?? {})), `${name} is also a devDependency`);
  }
});

test('the command reads the scenario directories scripts/readme-counts.mjs lists', () => {
  assert.deepEqual(SCENARIO_DIRS, COUNTED_DIRS);
});

test('each scenario file is found by its whole ID, ignoring case', () => {
  const scenarios = scenarioFiles();
  const ids = scenarios.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, `two scenario files share an ID: ${ids.join(' ')}`);
  for (const { id, file } of scenarios) {
    assert.ok(COUNTED_DIRS.some((dir) => file.startsWith(`${dir}/`)), file);
    assert.ok(file.split('/').at(-1).startsWith(`${id}.`), file);
  }
  const at = findScenario(scenarios, 'AT-AI-001');
  assert.equal(at?.file, 'src/atomic/ai-layer/AT-AI-001.prompt-input-scan.test.ts');
  assert.equal(findScenario(scenarios, 'at-ai-001'), at);
  assert.equal(findScenario(scenarios, 'AT-AI-00'), undefined);
  assert.equal(findScenario(scenarios, 'AT-AI-001.prompt-input-scan'), undefined);
});

// A vitest file task holding tests of the given result states ('skip' for a
// test of a skipped suite), in one suite.
const fileTask = (states, fileState = states.includes('fail') ? 'fail' : 'pass') => ({
  type: 'suite',
  result: { state: fileState },
  tasks: [{ type: 'suite', tasks: states.map((state) => ({ type: 'test', result: state === 'skip' ? undefined : { state } })) }],
});

test('the verdict is PASS when a test passed and nothing failed, FAIL when something failed, NOT MEASURED otherwise', () => {
  const line = (file, errors) => {
    const v = verdict(file, errors);
    return [v.exitCode, verdictLine('AT-X-001', 'product 1.0', v)];
  };
  assert.deepEqual(line(fileTask(['pass', 'pass'])), [0, 'OASB AT-X-001 against product 1.0: PASS (2 of 2 tests passed)']);
  assert.deepEqual(line(fileTask(['pass', 'skip'])), [0, 'OASB AT-X-001 against product 1.0: PASS (1 of 2 tests passed, 1 skipped)']);
  assert.deepEqual(line(fileTask(['pass', 'fail', 'skip'])), [1, 'OASB AT-X-001 against product 1.0: FAIL (1 of 3 tests failed, 1 passed, 1 skipped)']);
  assert.deepEqual(line(fileTask(['fail'])), [1, 'OASB AT-X-001 against product 1.0: FAIL (1 of 1 test failed)']);
  assert.deepEqual(line(fileTask(['skip', 'skip'])), [2, 'OASB AT-X-001 against product 1.0: NOT MEASURED (0 of 2 tests evaluated)']);
  // A file that failed while vitest collected it, an error vitest caught
  // outside a test, and a run that has no result for the file.
  const outside = 'OASB AT-X-001 against product 1.0: FAIL (the run failed outside a test; its error is printed above)';
  assert.deepEqual(line(fileTask([], 'fail')), [1, outside]);
  assert.deepEqual(line(fileTask(['pass']), 1), [1, outside]);
  assert.deepEqual(line(undefined), [1, outside]);
});

test('from an empty directory, the command runs AT-AI-001 against arp-guard, prints PASS, exits 0 and writes nothing there', { skip, timeout: 300_000 }, () => {
  const r = oasb(['AT-AI-001']);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^ ✓ src\/atomic\/ai-layer\/AT-AI-001\.prompt-input-scan\.test\.ts > AT-AI-001: Prompt Input Scanning > /m);
  const version = installedVersion('arp-guard').replace(/\./g, '\\.');
  assert.match(lastLine(r.stdout), new RegExp(`^OASB AT-AI-001 against arp-guard ${version}: PASS \\((\\d+) of \\1 tests passed\\)$`));
  assert.deepEqual(r.left, []);
});

test('an adapter that declares none of what the file tests gets NOT MEASURED and exit 2', { skip, timeout: 300_000 }, () => {
  const r = oasb(['AT-AI-001'], { adapter: NO_CAPABILITY_ADAPTER });
  assert.equal(r.status, 2, `${r.stdout}\n${r.stderr}`);
  assert.match(lastLine(r.stdout), /^OASB AT-AI-001 against no-capability-fixture 0\.0\.0: NOT MEASURED \(0 of \d+ tests evaluated\)$/);
});

test('an adapter given by a path relative to the directory it runs in, whose scanner misses, gets FAIL and exit 1', { skip, timeout: 300_000 }, () => {
  const r = oasb(['AT-AI-001'], { adapter: './blind-adapter.cjs', files: { 'blind-adapter.cjs': BLIND_ADAPTER } });
  assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
  assert.match(lastLine(r.stdout), /^OASB AT-AI-001 against blind-fixture 0\.0\.1: FAIL \(\d+ of \d+ tests failed, 2 passed\)$/);
});

test('an ID that names no scenario file, or no ID, exits 1 and says what to give', { skip, timeout: 300_000 }, () => {
  let r = oasb(['AT-AI-999']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^oasb: no scenario file has the ID "AT-AI-999"\. The scenario IDs are:\n {2}AT-AI-001 AT-AI-002 /);
  r = oasb([]);
  assert.equal(r.status, 1);
  assert.equal(r.stderr.split('\n')[0], USAGE);
  r = oasb(['AT-AI-001', 'AT-AI-002']);
  assert.equal(r.status, 1);
  assert.equal(r.stderr.split('\n')[0], USAGE);
});

test('--help lists the scenario IDs and --version prints the package version, each with exit 0', { skip, timeout: 300_000 }, () => {
  let r = oasb(['--help']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.split('\n')[0], USAGE);
  assert.match(r.stdout, /^Scenario IDs:\n {2}AT-AI-001 /m);
  r = oasb(['--version']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${pkg.version}\n`);
});

test('an adapter that cannot be loaded, or a missing vitest, exits 1 with a line that says so', { skip, timeout: 300_000 }, () => {
  let r = oasb(['AT-AI-001'], { adapter: 'nope' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^oasb: OASB_ADAPTER="nope" is not an adapter\. /);
  r = oasb(['AT-AI-001'], { name: 'no-arp-guard', omit: ['arp-guard'] });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^oasb: The default OASB adapter \(OASB_ADAPTER unset or "arp"\) needs arp-guard, which is not installed\. /);
  r = oasb(['AT-AI-001'], { name: 'no-vitest', omit: ['vitest'], adapter: NO_CAPABILITY_ADAPTER });
  assert.equal(r.status, 1);
  assert.equal(r.stderr, `oasb: ${VITEST_MISSING}\n`);
});
