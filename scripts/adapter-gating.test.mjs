// Tests that every scenario test runs against the adapter OASB_ADAPTER selects
// and is N/A when that adapter lacks a capability the suite needs, so a
// product's scorecard holds its own results and not the reference adapter's,
// and that the tests that fail under llm-guard and rebuff are the ones
// docs/adapters.md records, each on the assertion its row quotes.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const vitest = join(repo, 'node_modules', 'vitest', 'vitest.mjs');

// The attack scenarios: atomic, integration, baseline and E2E.
const SCENARIO_DIRS = ['src/atomic', 'src/integration', 'src/baseline', 'src/e2e'];

// Declares no capabilities and throws from every other contract method.
const NO_CAPABILITY_ADAPTER = join(repo, 'scripts', 'fixtures', 'no-capability-adapter.cjs');

// What the two prompt-only stubs declare in getCapabilities(), as the
// Capabilities table of docs/adapters.md lists them.
const PROMPT_ONLY = ['prompt-input-scanning', 'pattern-scanning'];

// The title describeWithCapability gives a suite it skips.
const REQUIRES = /\[requires: ([^\]]+)\]$/;

// The section of docs/adapters.md that records the tests failing under the
// two prompt-only stubs.
const STUB_FAILURES_HEADING = '## Tests that fail under llm-guard and rebuff';

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

// One vitest run per stub, shared by the tests that read it.
const stubReports = new Map();
function stubReport(stub) {
  if (!stubReports.has(stub)) stubReports.set(stub, runScenarios(stub));
  return stubReports.get(stub);
}

/**
 * The rows of the table under STUB_FAILURES_HEADING in docs/adapters.md as
 * { file, title, code }: the scenario file whose name starts with the row's
 * suite ID, the test's title and the code its "Failing assertion" cell quotes.
 */
function documentedStubFailures() {
  const lines = readFileSync(join(repo, 'docs', 'adapters.md'), 'utf8').split('\n');
  const start = lines.indexOf(STUB_FAILURES_HEADING);
  assert.notEqual(start, -1, `docs/adapters.md has no "${STUB_FAILURES_HEADING}" heading`);
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  const scenarioFiles = SCENARIO_DIRS.flatMap(testFiles);
  const rows = [];
  for (const line of lines.slice(start + 1, end === -1 ? lines.length : end)) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    // The header row and the delimiter row have no suite ID in the first cell.
    if (cells.length !== 4 || !/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$/.test(cells[0])) continue;
    const file = scenarioFiles.find((f) => basename(f).startsWith(`${cells[0]}.`));
    assert.ok(file, `docs/adapters.md: no scenario file starts with ${cells[0]}: ${line}`);
    const code = cells[2].match(/^`([^`]+)`$/)?.[1];
    assert.ok(code, `docs/adapters.md: the "Failing assertion" cell quotes no code: ${line}`);
    rows.push({ file, title: cells[1], code });
  }
  assert.ok(rows.length > 0, `docs/adapters.md: no test rows under "${STUB_FAILURES_HEADING}"`);
  return rows;
}

/**
 * The expect() statement a failed test stopped at: the lines of the test
 * file from the nearest one at or above the line its failure message points
 * at that holds `expect(`, through that line. null when the message points
 * at no line of the file.
 */
function failedStatement(file, message) {
  const name = basename(file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const at = message.match(new RegExp(`${name}:(\\d+):\\d+`));
  if (!at) return null;
  const lines = readFileSync(join(repo, file), 'utf8').split('\n');
  const last = Number(at[1]) - 1;
  let first = last;
  while (first > 0 && !lines[first].includes('expect(')) first--;
  return lines.slice(first, last + 1).join('\n');
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
    for (const f of files(stubReport(stub))) {
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

  test(`${stub} fails the tests docs/adapters.md records, each on the assertion its row quotes, and no other`, () => {
    const documented = documentedStubFailures();
    const got = files(stubReport(stub));
    assert.deepEqual(got.filter((f) => f.loadError).map((f) => `${f.file}: ${f.loadError}`), [], 'scenario files failed to load');

    const key = (t) => `${t.file} :: ${t.title}`;
    const failed = got.flatMap((f) =>
      f.tests
        .filter((t) => t.status === 'failed')
        .map((t) => ({ file: f.file, title: t.title, message: t.failureMessages.join('\n') })),
    );
    assert.deepEqual(
      failed.map(key).sort(),
      documented.map(key).sort(),
      `the tests that fail with OASB_ADAPTER=${stub} are not the ones docs/adapters.md records`,
    );

    const wrong = [];
    for (const t of failed) {
      const { code } = documented.find((d) => key(d) === key(t));
      const statement = failedStatement(t.file, t.message);
      if (statement === null) wrong.push(`${key(t)}: the failure names no line of its file`);
      else if (!statement.includes(code)) wrong.push(`${key(t)} failed at ${JSON.stringify(statement.trim())}, which does not hold \`${code}\``);
    }
    assert.deepEqual(wrong, []);
  });
}
