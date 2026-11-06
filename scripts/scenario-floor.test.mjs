// Tests that a vitest run of attack scenarios says on stderr how many of its
// scenario tests it evaluated, and exits 2 when it evaluated none: an adapter
// that declares no capabilities gets every scenario skipped, and that run
// measured nothing, so it must not exit 0 as a passing run does. The line and
// the exit come from the globalSetup teardown in scripts/scenario-floor.ts,
// which vitest.config.ts registers.
// Run with: npm run test:scripts (node --test). Each vitest run here is of one
// test file, not of the scenario directories. Kept outside src/ so the vitest
// totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const vitest = join(repo, 'node_modules', 'vitest', 'vitest.mjs');
const vitestInstalled = existsSync(vitest);
const skip = !vitestInstalled && 'vitest is not installed; run npm ci';

// A scenario file (under src/atomic) and a test file that is not one.
const SCENARIO_FILE = 'src/atomic/ai-layer/AT-AI-001.prompt-input-scan.test.ts';
const OTHER_FILE = 'src/benchmark/scoring.test.ts';

// Declares no capabilities, so every scenario suite is skipped.
const NO_CAPABILITY_ADAPTER = join(repo, 'scripts', 'fixtures', 'no-capability-adapter.cjs');

const EVALUATED = /^OASB: (\d+) of (\d+) attack scenarios evaluated$/m;
const UNREADABLE = "OASB: not measured (the run's test results could not be read)";
const notMeasured = (selected) => `OASB: not measured (0 of ${selected} attack scenarios evaluated)`;

/** The lines of `text` that start with "OASB:". */
const oasbLines = (text) => text.split('\n').filter((line) => line.startsWith('OASB:'));

/**
 * Runs vitest with `args`, with OASB_ADAPTER=adapter, or unset when adapter is
 * null, and with the variables of `vars` set over this process's environment.
 */
function runVitest(args, adapter, vars = {}) {
  const env = { ...process.env, ...vars };
  delete env.OASB_ADAPTER;
  if (adapter) env.OASB_ADAPTER = adapter;
  return spawnSync(process.execPath, [vitest, ...args], { cwd: repo, encoding: 'utf8', env });
}

/**
 * Runs vitest on `file` with OASB_ADAPTER=adapter, the reporters `reporters`
 * and a JSON report of the same run written to `<tmp>/report.json`. Returns
 * the spawn result and the parsed report.
 */
function runWithReport(file, adapter, reporters) {
  const dir = mkdtempSync(join(tmpdir(), 'scenario-floor-'));
  try {
    const out = join(dir, 'report.json');
    const r = runVitest(['run', ...reporters(out), file], adapter);
    assert.ok(existsSync(out), `vitest wrote no JSON report (exit ${r.status}):\n${r.stderr.slice(-2000)}`);
    return { r, report: JSON.parse(readFileSync(out, 'utf8')) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The default reporter, as `npx vitest run` prints, plus a JSON report.
const withDefault = (out) => ['--reporter=default', '--reporter=json', `--outputFile.json=${out}`];
// The JSON reporter alone, the form scripts/adapter-gating.test.mjs and
// npm run report read.
const jsonOnly = (out) => ['--reporter=json', `--outputFile=${out}`];

test('a scenario run under an adapter that declares no capabilities exits 2 and says 0 were evaluated', { skip }, () => {
  const { r, report } = runWithReport(SCENARIO_FILE, NO_CAPABILITY_ADAPTER, withDefault);
  assert.ok(report.numTotalTests > 0, `the report holds no tests for ${SCENARIO_FILE}`);
  assert.equal(report.numPendingTests, report.numTotalTests, 'a scenario test ran under the no-capability adapter');
  assert.deepEqual(oasbLines(r.stderr), [notMeasured(report.numTotalTests)], `stderr:\n${r.stderr.slice(-2000)}`);
  assert.equal(r.status, 2, `stderr:\n${r.stderr.slice(-2000)}`);
});

test('the same run with --reporter=json --outputFile exits 2 and still writes the report', { skip }, () => {
  const { r, report } = runWithReport(SCENARIO_FILE, NO_CAPABILITY_ADAPTER, jsonOnly);
  assert.ok(Array.isArray(report.testResults), 'the report has no "testResults" list');
  assert.deepEqual(oasbLines(r.stderr), [notMeasured(report.numTotalTests)], `stderr:\n${r.stderr.slice(-2000)}`);
  assert.equal(r.status, 2, `stderr:\n${r.stderr.slice(-2000)}`);
});

test('a scenario run under the reference adapter exits 0 and says how many it evaluated', { skip }, () => {
  const { r, report } = runWithReport(SCENARIO_FILE, null, withDefault);
  const lines = oasbLines(r.stderr);
  assert.equal(lines.length, 1, `stderr:\n${r.stderr.slice(-2000)}`);
  const [, evaluated, selected] = lines[0].match(EVALUATED) ?? [];
  assert.ok(evaluated, `"${lines[0]}" is not "OASB: <n> of <m> attack scenarios evaluated"`);
  assert.ok(Number(evaluated) >= 1, lines[0]);
  assert.equal(Number(evaluated), report.numPassedTests + report.numFailedTests, lines[0]);
  assert.equal(Number(selected), report.numTotalTests, lines[0]);
  assert.equal(r.status, 0, `stderr:\n${r.stderr.slice(-2000)}`);
});

test('a run that selects no scenario test prints no OASB line and keeps its exit', { skip }, () => {
  const r = runVitest(['run', OTHER_FILE], null);
  assert.deepEqual(oasbLines(r.stdout + r.stderr), []);
  assert.equal(r.status, 0, `stderr:\n${r.stderr.slice(-2000)}`);
});

test('collecting a scenario file without running it (vitest list) prints no OASB line and exits 0', { skip }, () => {
  const r = runVitest(['list', SCENARIO_FILE], NO_CAPABILITY_ADAPTER);
  assert.deepEqual(oasbLines(r.stdout + r.stderr), []);
  assert.equal(r.status, 0, `stderr:\n${r.stderr.slice(-2000)}`);
});

// E2E-003 runs the network monitor only where `which` finds lsof (macOS) or ss
// (Linux) on PATH; where it does not, the test skips itself as inconclusive,
// and the run has evaluated nothing.
const E2E_003 = 'src/e2e/E2E-003.live-network-detection.test.ts';
const E2E_003_SKIP = /^inconclusive: lsof \(macOS\) or ss \(Linux\) is not on PATH/;

/** The first executable named `name` in a directory of this process's PATH. */
function onPath(name) {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const file = join(dir, name);
    try {
      accessSync(file, constants.X_OK);
      return file;
    } catch {
      // not in this directory
    }
  }
  return undefined;
}

test('E2E-003 under a PATH that holds neither lsof nor ss is skipped as inconclusive, so the run says not measured and exits 2', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'scenario-floor-'));
  try {
    // A PATH of one directory, holding node for vitest's workers and `which`
    // for the test's check of the tool, which then finds neither tool. Without
    // a `which` on this process's PATH, the check fails for want of it, with
    // the same outcome.
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    symlinkSync(process.execPath, join(bin, 'node'));
    const which = onPath('which');
    if (which) symlinkSync(which, join(bin, 'which'));
    const out = join(dir, 'report.json');
    const r = runVitest(['run', ...withDefault(out), E2E_003], null, { PATH: bin });
    assert.ok(existsSync(out), `vitest wrote no JSON report (exit ${r.status}):\n${r.stderr.slice(-2000)}`);
    const tests = JSON.parse(readFileSync(out, 'utf8')).testResults.flatMap((file) => file.assertionResults);
    assert.equal(tests.length, 1, `the report holds ${tests.length} tests for ${E2E_003}, not 1`);
    assert.equal(tests[0].status, 'skipped', `${tests[0].fullName}: ${tests[0].status}`);
    assert.match(String(tests[0].meta?.inconclusive), E2E_003_SKIP, 'the test was not skipped as inconclusive for want of the tool');
    assert.doesNotMatch(r.stdout, /^SKIP:/m, 'the test printed a SKIP line instead of skipping');
    assert.deepEqual(oasbLines(r.stderr), [notMeasured(1)], `stderr:\n${r.stderr.slice(-2000)}`);
    assert.equal(r.status, 2, `stderr:\n${r.stderr.slice(-2000)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The tool E2E-003's network monitor polls, every 1000 ms in that test.
const NETWORK_TOOL = process.platform === 'darwin' ? 'lsof' : 'ss';

/** `text` quoted for a POSIX shell. */
const shQuote = (text) => `'${text.replaceAll("'", `'\\''`)}'`;

test('E2E-003 with an lsof (macOS) or ss (Linux) that answers slower than the monitor polls passes and exits 0, with no unhandled error', { skip }, (t) => {
  const real = process.platform === 'win32' ? undefined : onPath(NETWORK_TOOL);
  if (!real) {
    t.skip(`${NETWORK_TOOL} is not on PATH, so E2E-003 does not run the monitor here`);
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'scenario-floor-'));
  try {
    // A wrapper first on PATH that waits 1.5 s, past the monitor's 1000 ms
    // interval, and then runs the real tool. The poll that reports the
    // test's connection can then end the test before the echo server has
    // read the client's write: afterEach destroys the client, the echo
    // reaches a closed peer, and the server's socket is reset.
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, NETWORK_TOOL), `#!/bin/sh\nsleep 1.5\nexec ${shQuote(real)} "$@"\n`, { mode: 0o755 });
    const out = join(dir, 'report.json');
    const r = runVitest(['run', ...withDefault(out), E2E_003], null, { PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` });
    const output = `${r.stdout}\n${r.stderr}`;
    assert.doesNotMatch(output, /unhandled error/i, `the run caught an unhandled error:\n${output.slice(-3000)}`);
    assert.ok(existsSync(out), `vitest wrote no JSON report (exit ${r.status}):\n${r.stderr.slice(-2000)}`);
    const tests = JSON.parse(readFileSync(out, 'utf8')).testResults.flatMap((file) => file.assertionResults);
    assert.equal(tests.length, 1, `the report holds ${tests.length} tests for ${E2E_003}, not 1`);
    assert.equal(tests[0].status, 'passed', `${tests[0].fullName}: ${tests[0].status}\n${(tests[0].failureMessages ?? []).join('\n')}`);
    assert.deepEqual(oasbLines(r.stderr), ['OASB: 1 of 1 attack scenarios evaluated'], `stderr:\n${r.stderr.slice(-2000)}`);
    assert.equal(r.status, 0, `stderr:\n${r.stderr.slice(-2000)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Calls the teardown of scripts/scenario-floor.ts in a new node process with
 * a project whose state.getFiles is `getFiles` (the source of a function),
 * and returns the spawn result.
 */
function teardownWith(getFiles) {
  const floor = pathToFileURL(join(repo, 'scripts', 'scenario-floor.ts')).href;
  const code = [
    `const mod = await import(${JSON.stringify(floor)});`,
    // tsx loads the module as CommonJS in this package, so its default
    // export can arrive one level down.
    "const setup = typeof mod.default === 'function' ? mod.default : mod.default.default;",
    `const project = { config: { root: ${JSON.stringify(repo)} }, vitest: { state: { getFiles: ${getFiles} } } };`,
    'const teardown = await setup(project);',
    'await teardown();',
  ].join('\n');
  return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: repo, encoding: 'utf8' });
}

for (const [how, getFiles] of [
  ['throws', "() => { throw new Error('the state is gone'); }"],
  ['returns nothing', '() => undefined'],
]) {
  test(`when reading the run's results ${how}, the teardown says so and sets exit 2`, { skip }, () => {
    const r = teardownWith(getFiles);
    assert.deepEqual(oasbLines(r.stderr), [UNREADABLE], `stderr:\n${r.stderr.slice(-2000)}`);
    assert.equal(r.status, 2, `stderr:\n${r.stderr.slice(-2000)}`);
  });
}
