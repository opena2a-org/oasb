// Tests that every scenario test runs against the adapter OASB_ADAPTER selects
// and is N/A when that adapter lacks a capability the suite needs, so a
// product's scorecard holds its own results and not the reference adapter's.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const vitest = join(repo, 'node_modules', 'vitest', 'vitest.mjs');

// The 222 attack scenarios: atomic, integration, baseline and E2E.
const SCENARIO_DIRS = ['src/atomic', 'src/integration', 'src/baseline', 'src/e2e'];

// Declares no capabilities and throws from every other contract method.
const NO_CAPABILITY_ADAPTER = join(repo, 'scripts', 'fixtures', 'no-capability-adapter.cjs');

// What the two prompt-only stubs declare in getCapabilities(), as the README's
// Evaluating Other Products table lists them.
const PROMPT_ONLY = ['prompt-input-scanning', 'pattern-scanning'];

// The title describeWithCapability gives a suite it skips.
const REQUIRES = /\[requires: ([^\]]+)\]$/;

/** The scenario test files under dir, as repo-relative paths. */
function testFiles(dir) {
  return readdirSync(join(repo, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

/** Run the scenario tests with OASB_ADAPTER=adapter and return vitest's JSON report. */
function runScenarios(adapter) {
  const dir = mkdtempSync(join(tmpdir(), 'adapter-gating-'));
  try {
    const out = join(dir, 'report.json');
    const r = spawnSync(process.execPath, [vitest, 'run', '--reporter=json', `--outputFile=${out}`, ...SCENARIO_DIRS], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, OASB_ADAPTER: adapter },
    });
    try {
      return JSON.parse(readFileSync(out, 'utf8'));
    } catch {
      assert.fail(`vitest wrote no report with OASB_ADAPTER=${adapter} (exit ${r.status}):\n${r.stderr.slice(-2000)}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The report's test files as { file, loadError, suite, tests }: the
 * repo-relative path, the error that stopped the file from loading or running
 * (null if none), the title of its top-level suite and its test results.
 */
function files(report) {
  return report.testResults.map((f) => ({
    file: relative(repo, f.name),
    loadError: f.status === 'failed' && f.message ? f.message : null,
    suite: f.assertionResults[0]?.ancestorTitles[0] ?? '',
    tests: f.assertionResults,
  }));
}

const ran = (t) => t.status !== 'skipped' && t.status !== 'pending';

let noCapabilityReport;
function noCapability() {
  noCapabilityReport ??= runScenarios(NO_CAPABILITY_ADAPTER);
  return noCapabilityReport;
}

test('an adapter that declares no capabilities gets N/A on every scenario test', () => {
  const report = noCapability();
  const expected = SCENARIO_DIRS.flatMap(testFiles).sort();
  const got = files(report);
  assert.deepEqual(got.map((f) => f.file).sort(), expected, 'the report does not hold every scenario test file');
  assert.deepEqual(got.filter((f) => f.loadError).map((f) => `${f.file}: ${f.loadError}`), [], 'scenario files failed to load');
  assert.ok(report.numTotalTests > 0, 'the report holds no tests');

  const notGated = got.filter((f) => !REQUIRES.test(f.suite)).map((f) => f.file);
  assert.deepEqual(notGated, [], 'these scenario files do not wrap their suite in describeWithCapability');

  const notSkipped = got.flatMap((f) => f.tests.filter(ran).map((t) => `${f.file} :: ${t.title} (${t.status})`));
  assert.deepEqual(notSkipped, [], 'these scenario tests ran against an adapter that declares no capabilities');
});

for (const stub of ['llm-guard', 'rebuff']) {
  test(`${stub} runs the scenario suites for prompt input and pattern scanning, and no other`, () => {
    // With no capabilities, each suite's title names every capability it needs.
    const needs = new Map(files(noCapability()).map((f) => [f.file, f.suite.match(REQUIRES)?.[1].split(', ')]));
    const wrong = [];
    for (const f of files(runScenarios(stub))) {
      if (!needs.get(f.file)) {
        wrong.push(`${f.file} is not gated by describeWithCapability`);
        continue;
      }
      const expectRun = needs.get(f.file).every((cap) => PROMPT_ONLY.includes(cap));
      const didRun = !REQUIRES.test(f.suite) && f.tests.some(ran);
      const allSkipped = REQUIRES.test(f.suite) && !f.tests.some(ran);
      if (expectRun && !didRun) wrong.push(`${f.file} needs only ${needs.get(f.file).join(', ')} but did not run`);
      if (!expectRun && !allSkipped) wrong.push(`${f.file} needs ${needs.get(f.file).join(', ')} but was not N/A`);
    }
    assert.deepEqual(wrong, []);
  });
}
