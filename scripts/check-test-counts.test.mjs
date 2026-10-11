// Tests for scripts/check-test-counts.mjs, the README test-count drift guard.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareCounts, liveCounts, readmeStatements } from './check-test-counts.mjs';
import { STATEMENTS, readFailure } from './readme-counts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'check-test-counts.mjs');

// Tests per file; one E2E test is skipped.
const FILES = {
  'src/atomic/process/AT-PROC-001.spawn.test.ts': 3,
  'src/atomic/network/AT-NET-001.connect.test.ts': 2,
  'src/integration/INT-001.exfil.test.ts': 2,
  'src/integration/INT-002.abuse.test.ts': 1,
  'src/baseline/BL-001.profile.test.ts': 2,
  'src/e2e/E2E-001.live-filesystem.test.ts': 2,
  'src/e2e/E2E-004.interceptor-process.test.ts': 1,
  'src/benchmark/scoring.test.ts': 2,
  'src/benchmark/pinned/pinned.test.ts': 4,
};

// A vitest JSON report of FILES, as the reporter writes it with absolute paths.
function suite(files = FILES, skipped = 1) {
  const testResults = Object.entries(files).map(([path, n]) => ({
    name: `/home/user/oasb/${path}`,
    assertionResults: Array.from({ length: n }, (_, i) => ({ status: path.includes('/e2e/') && i < skipped ? 'skipped' : 'passed' })),
  }));
  const total = Object.values(files).reduce((s, n) => s + n, 0);
  return { numTotalTests: total, numPassedTests: total - skipped, numPendingTests: skipped, testResults };
}

// Every statement the guard reads, with the counts FILES gives.
const README = [
  '[![Tests](https://img.shields.io/badge/tests-18%20passing-brightgreen)](#)',
  '',
  '13 standardized attack scenarios that evaluate a runtime security tool.',
  '',
  'npm test                    # Full suite: 19 tests (18 pass, 1 skip)',
  '',
  'Implement the adapter and run the same 13 attack scenarios.',
  '',
  '> **Counts.** `npm test` runs **19 tests** (18 passing, 1 skipped): **13 attack scenarios** plus **2 scoring-engine unit tests** and **4 pinned benchmark harness tests**. "13" is the scenario count; "18 passing" is the full `npm test` total.',
  '',
  'npm run test:atomic         # 5 atomic detection tests',
  'npm run test:integration    # 3 tests across 2 integration scenarios',
  'npm run test:baseline       # 2 false-positive / baseline tests',
  'npm run test:e2e            # 3 E2E tests',
  'opena2a benchmark run       # all 13 scenarios',
  '',
  '| Category | Tests | Source | What It Evaluates |',
  '|---|---|---|---|',
  '| Process detection | 3 | `src/atomic/process` | spawns |',
  '| Network detection | 2 | `src/atomic/network` | connections |',
  '| Multi-step attacks | 3 | `src/integration` | chains |',
  '| Baseline behavior | 2 | `src/baseline` | false positives |',
  '| Real OS detection | 2 | `src/e2e` (live monitors) | live watches |',
  '| Application-level hooks | 1 | `src/e2e` (interceptors) | interception |',
  '| **Attack scenarios** | **13** | atomic + integration + baseline + E2E | |',
  '| Scoring-engine unit tests | 2 | `src/benchmark` | metrics |',
  '| Pinned benchmark harness tests | 4 | `src/benchmark/pinned` | pins |',
  '| **`npm test` total** | **19** | (18 pass, 1 skipped on every platform) | |',
  '',
  'Techniques across 7 scenario files.',
  '',
].join('\n');

test('a README whose counts match the suite passes', () => {
  const { drift, compared } = compareCounts(suite(), README);
  assert.deepEqual(drift, []);
  assert.equal(compared, 33);
});

test('every key of the shared statement list is a count the guard measures', () => {
  const live = liveCounts(suite());
  for (const { where, keys } of STATEMENTS) {
    for (const key of keys) assert.equal(typeof live[key], 'number', `${where}: ${key}`);
  }
});

test('every count the README states is compared with the suite', () => {
  for (const m of README.matchAll(/\b\d+\b/g)) {
    const line = README.slice(0, m.index).split('\n').length;
    const changed = README.slice(0, m.index) + (Number(m[0]) + 1) + README.slice(m.index + m[0].length);
    const { drift } = compareCounts(suite(), changed);
    assert.ok(
      drift.some(d => d.startsWith(`README line ${line} `)),
      `changing ${m[0]} on line ${line} is not reported: ${JSON.stringify(drift)}`,
    );
  }
});

test('a changed pinned row and Quick Start comment are drift', () => {
  const changed = README
    .replace('| Pinned benchmark harness tests | 4 |', '| Pinned benchmark harness tests | 3 |')
    .replace('Full suite: 19 tests (18 pass', 'Full suite: 18 tests (17 pass');
  const { drift } = compareCounts(suite(), changed);
  assert.deepEqual(drift, [
    'README line 5 (Quick Start comment) states 18 tests in total; the suite has 19',
    'README line 5 (Quick Start comment) states 17 passing tests; the suite has 18',
    'README line 27 (test table, Pinned benchmark harness tests) states 3 tests in src/benchmark/pinned; the suite has 4',
  ]);
});

test('a badge lower than the passing count is drift', () => {
  const { drift } = compareCounts(suite(), README.replace('tests-18%20passing', 'tests-17%20passing'));
  assert.deepEqual(drift, ['README line 1 (tests badge) states 17 passing tests; the suite has 18']);
});

test('a new pinned test without a README edit is drift', () => {
  const files = { ...FILES, 'src/benchmark/pinned/pinned.test.ts': 5 };
  const { drift } = compareCounts(suite(files), README);
  assert.ok(drift.some(d => /test table, Pinned benchmark harness tests\) states 4 .* has 5$/.test(d)), drift.join('\n'));
  assert.ok(drift.some(d => /Quick Start comment\) states 19 tests in total; the suite has 20$/.test(d)), drift.join('\n'));
});

test('tests in a directory the table does not name are drift', () => {
  const { drift } = compareCounts(suite({ ...FILES, 'src/harness/adapter.test.ts': 1 }), README);
  assert.ok(drift.includes("the test table's source rows cover 19 of the suite's 20 tests; add a row for the directory they are in"), drift.join('\n'));
});

test('a statement the guard cannot find is drift', () => {
  const { drift } = compareCounts(suite(), README.replace('# 2 false-positive / baseline tests', '# baseline tests'));
  assert.equal(drift.length, 1);
  assert.match(drift[0], /^could not find the README's test:baseline comment/);
});

test('the repository README carries every statement and states each count once', () => {
  const readme = readFileSync(join(here, '..', 'README.md'), 'utf8');
  const { statements, rows, missing } = readmeStatements(readme);
  assert.deepEqual(missing, []);
  assert.ok(rows.length >= 10, `${rows.length} table rows`);
  const byKey = new Map();
  for (const s of statements) byKey.set(s.key, [...(byKey.get(s.key) ?? []), s]);
  for (const [key, list] of byKey) {
    assert.equal(new Set(list.map(s => s.stated)).size, 1, `${key}: ${list.map(s => `line ${s.line} says ${s.stated}`).join(', ')}`);
  }
});

test('the command exits 1 on drift and 0 when every count matches', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-test-counts-'));
  try {
    writeFileSync(join(dir, 'results.json'), JSON.stringify(suite()));
    writeFileSync(join(dir, 'README.md'), README);
    writeFileSync(join(dir, 'README-drift.md'), README.replace('**19 tests**', '**20 tests**'));
    const ok = spawnSync(process.execPath, [script, join(dir, 'results.json'), join(dir, 'README.md')], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /33 README counts match the live suite\./);
    const bad = spawnSync(process.execPath, [script, join(dir, 'results.json'), join(dir, 'README-drift.md')], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /^DRIFT: README line 9 \(Counts note\) states 20 tests in total; the suite has 19$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the command prints the usage for --help and names the field a report lacks', () => {
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /^usage: node scripts\/check-test-counts\.mjs <vitest-results\.json> \[path\/to\/README\.md\]$/m);
  const dir = mkdtempSync(join(tmpdir(), 'check-test-counts-'));
  try {
    writeFileSync(join(dir, 'report.json'), JSON.stringify({ numTotalTests: 1 }));
    writeFileSync(join(dir, 'README.md'), README);
    const bad = spawnSync(process.execPath, [script, join(dir, 'report.json'), join(dir, 'README.md')], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /^cannot read the test report .*report\.json: it has no "testResults" list, so it is not a vitest JSON report; /m);
    assert.doesNotMatch(bad.stderr, /Cannot read properties/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Run the command on a report and README written to a temporary directory;
// `args` maps their two paths to the command's arguments.
function runCommand(report, args = (reportPath, readmePath) => [reportPath, readmePath]) {
  const dir = mkdtempSync(join(tmpdir(), 'check-test-counts-'));
  try {
    writeFileSync(join(dir, 'report.json'), JSON.stringify(report));
    writeFileSync(join(dir, 'README.md'), README);
    return spawnSync(process.execPath, [script, ...args(join(dir, 'report.json'), join(dir, 'README.md'))], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('arguments the command does not take print the usage on stderr and exit 1', () => {
  const usage = /^usage: node scripts\/check-test-counts\.mjs <vitest-results\.json> \[path\/to\/README\.md\]$/m;
  for (const [what, args] of [
    ['no arguments', () => []],
    ['a third argument', (report, readme) => [report, readme, readme]],
    ['an unknown flag first', (report, readme) => ['--verbose', report, readme]],
    ['an unknown flag after the paths', (report, readme) => [report, readme, '--ci']],
    ['an unknown flag in place of the README', report => [report, '--ci']],
  ]) {
    const r = runCommand(suite(), args);
    assert.equal(r.status, 1, what);
    assert.match(r.stderr, usage, what);
    assert.equal(r.stdout, '', what);
  }
});

test('a report without one of the suite counts is reported by the field it lacks', () => {
  for (const field of ['numTotalTests', 'numPassedTests', 'numPendingTests']) {
    const report = suite();
    delete report[field];
    const r = runCommand(report);
    assert.equal(r.status, 1, field);
    assert.match(
      r.stderr,
      new RegExp(`^cannot read the test report .*report\\.json: it has no "${field}" count, so it is not a vitest JSON report$`, 'm'),
    );
    assert.doesNotMatch(r.stderr, /DRIFT/, field);
  }
});

test('a testResults entry without a name or assertionResults list is reported by the entry', () => {
  for (const [what, change] of [
    ['no assertionResults', file => ({ name: file.name })],
    ['no name', file => ({ assertionResults: file.assertionResults })],
    ['a null entry', () => null],
  ]) {
    const report = suite();
    report.testResults[2] = change(report.testResults[2]);
    const r = runCommand(report);
    assert.equal(r.status, 1, what);
    assert.match(
      r.stderr,
      /^cannot read the test report .*report\.json: testResults\[2\] has no "name" or no "assertionResults" list; write the report with: /m,
      what,
    );
    assert.doesNotMatch(r.stderr, /Cannot read properties/, what);
  }
});

test('an assertionResults entry that is not a test result with a status is reported by the entry', () => {
  for (const entry of [null, 'passed', {}, { status: 1 }]) {
    const report = suite();
    report.testResults[1].assertionResults[1] = entry;
    const r = runCommand(report);
    assert.equal(r.status, 1, JSON.stringify(entry));
    assert.match(
      r.stderr,
      /^cannot read the test report .*report\.json: testResults\[1\]\.assertionResults\[1\] is not a test result with a string "status"; write the report with: /m,
      JSON.stringify(entry),
    );
  }
});

test('a test result whose status is not a string is reported as one, not as a result without a status', () => {
  for (const entry of [{ status: 1 }, { status: null }, { status: true }, { status: ['passed'] }]) {
    const report = suite();
    report.testResults[0].assertionResults[0] = entry;
    const r = runCommand(report);
    assert.equal(r.status, 1, JSON.stringify(entry));
    assert.match(r.stderr, /testResults\[0\]\.assertionResults\[0\] is not a test result with a string "status"; /, JSON.stringify(entry));
  }
});

test('a README path that does not exist is named, with no stack trace', () => {
  const r = runCommand(suite(), (report, readme) => [report, join(dirname(readme), 'missing.md')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^cannot read the README .*missing\.md: ENOENT: no such file or directory\n$/);
  assert.doesNotMatch(r.stderr, /^\s+at /m);
});

test('a test report path that does not exist is named once, with no stack trace', () => {
  const r = runCommand(suite(), (report, readme) => [join(dirname(report), 'missing.json'), readme]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^cannot read the test report .*missing\.json: ENOENT: no such file or directory\n$/);
  assert.doesNotMatch(r.stderr, /^\s+at /m);
});

test('readFailure drops the path a file-system error repeats and keeps any other message', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-test-counts-'));
  try {
    const missing = join(dir, 'missing.md');
    let err;
    try {
      readFileSync(missing, 'utf8');
    } catch (e) {
      err = e;
    }
    assert.equal(readFailure(err), 'ENOENT: no such file or directory');
    assert.equal(readFailure(Object.assign(new Error('EACCES: denied'), { code: 'EACCES', syscall: 'open', path: missing })), 'EACCES: denied');
    assert.equal(readFailure(new SyntaxError('Unexpected end of JSON input')), 'Unexpected end of JSON input');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
