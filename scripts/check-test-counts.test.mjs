// Tests for scripts/check-test-counts.mjs, the README test-count drift guard.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// The headers of the scenario files in FILES: five cite four ATLAS techniques
// between them (10 tests); INT-002 and BL-001 cite none (3 tests), and the
// tactic ID BL-001 names is not a technique.
const SOURCES = {
  'src/atomic/process/AT-PROC-001.spawn.test.ts': '// ATLAS: AML.T0050 (Command and Scripting Interpreter)\n',
  'src/atomic/network/AT-NET-001.connect.test.ts': '// ATLAS: AML.T0025 (Exfiltration via Cyber Means)\n',
  'src/integration/INT-001.exfil.test.ts': '// ATLAS: AML.T0086, AML.T0025\n',
  'src/integration/INT-002.abuse.test.ts': '// Detection-capability test.\n',
  'src/baseline/BL-001.profile.test.ts': '// Defensive response test (counters Impact / AML.TA0011).\n',
  'src/e2e/E2E-001.live-filesystem.test.ts': '// ATLAS: AML.T0055 (Unsecured Credentials)\n',
  'src/e2e/E2E-004.interceptor-process.test.ts': '// ATLAS: AML.T0050\n',
};

// The text of a scenario file in SOURCES, by its path from src/ on.
function source(path, sources = SOURCES) {
  if (!(path in sources)) throw new Error(`no source for ${path}`);
  return sources[path];
}

// Write SOURCES under `dir`, where the command reads them beside the README.
function writeSources(dir) {
  for (const [path, text] of Object.entries(SOURCES)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

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
  "13 standardized attack scenarios that evaluate a runtime security tool. 10 of them, in 5 files, map to MITRE ATLAS (4 techniques); the other 3 test the product's defensive response.",
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
  'Of the 13 tests across 7 scenario files, 10 tests in 5 files map to 4 unique techniques. The other 3 tests, in 2 files, are defensive and capability tests.',
  '',
].join('\n');

test('a README whose counts match the suite passes', () => {
  const { drift, compared } = compareCounts(suite(), README, source);
  assert.deepEqual(drift, []);
  assert.equal(compared, 42);
});

test('every key of the shared statement list is a count the guard measures', () => {
  const live = liveCounts(suite(), source);
  for (const { where, keys } of STATEMENTS) {
    for (const key of keys) assert.equal(typeof live[key], 'number', `${where}: ${key}`);
  }
});

test('every count the README states is compared with the suite', () => {
  for (const m of README.matchAll(/\b\d+\b/g)) {
    const line = README.slice(0, m.index).split('\n').length;
    const changed = README.slice(0, m.index) + (Number(m[0]) + 1) + README.slice(m.index + m[0].length);
    const { drift } = compareCounts(suite(), changed, source);
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
  const { drift } = compareCounts(suite(), changed, source);
  assert.deepEqual(drift, [
    'README line 5 (Quick Start comment) states 18 tests in total; the suite has 19',
    'README line 5 (Quick Start comment) states 17 passing tests; the suite has 18',
    'README line 26 (test table, Pinned benchmark harness tests) states 3 tests in src/benchmark/pinned; the suite has 4',
  ]);
});

test('a badge lower than the passing count is drift', () => {
  const { drift } = compareCounts(suite(), README.replace('tests-18%20passing', 'tests-17%20passing'), source);
  assert.deepEqual(drift, ['README line 1 (tests badge) states 17 passing tests; the suite has 18']);
});

test('a new pinned test without a README edit is drift', () => {
  const files = { ...FILES, 'src/benchmark/pinned/pinned.test.ts': 5 };
  const { drift } = compareCounts(suite(files), README, source);
  assert.ok(drift.some(d => /test table, Pinned benchmark harness tests\) states 4 .* has 5$/.test(d)), drift.join('\n'));
  assert.ok(drift.some(d => /Quick Start comment\) states 19 tests in total; the suite has 20$/.test(d)), drift.join('\n'));
});

// suite() with the second E2E-001 case skipped at run time; `meta` is the
// meta vitest writes for that test.
function withRunTimeSkip(meta) {
  const report = suite();
  const file = report.testResults.find(f => f.name.endsWith('/src/e2e/E2E-001.live-filesystem.test.ts'));
  file.assertionResults[1] = { status: 'skipped', title: 'detects a write', fullName: 'E2E-001 detects a write', meta };
  report.numPassedTests -= 1;
  report.numPendingTests += 1;
  return report;
}

test('an E2E-001 case skipped as inconclusive is counted with the passing tests, not as drift', () => {
  const { drift, live } = compareCounts(withRunTimeSkip({ inconclusive: 'inconclusive: host delivered no file event' }), README, source);
  assert.deepEqual(drift, []);
  assert.deepEqual({ total: live.total, passed: live.passed, skipped: live.skipped }, { total: 19, passed: 18, skipped: 1 });
  assert.deepEqual(live.inconclusive, ['src/e2e/E2E-001.live-filesystem.test.ts > E2E-001 detects a write']);
});

test('a test skipped at run time without the inconclusive marker is drift', () => {
  for (const meta of [{}, undefined, { inconclusive: true }, { inconclusive: null }]) {
    const { drift, live } = compareCounts(withRunTimeSkip(meta), README, source);
    assert.deepEqual(live.inconclusive, [], JSON.stringify(meta));
    assert.ok(drift.includes('README line 1 (tests badge) states 18 passing tests; the suite has 17'), drift.join('\n'));
    assert.ok(drift.includes('README line 5 (Quick Start comment) states 1 skipped tests; the suite has 2'), drift.join('\n'));
  }
});

test('a passing test is not counted as inconclusive, whatever its meta says', () => {
  const report = suite();
  report.testResults[0].assertionResults[0].meta = { inconclusive: 'left over' };
  const { drift, live } = compareCounts(report, README, source);
  assert.deepEqual(drift, []);
  assert.deepEqual(live.inconclusive, []);
});

test('the command lists the tests skipped as inconclusive and exits 0 when the counts match', () => {
  const r = runCommand(withRunTimeSkip({ inconclusive: 'inconclusive: host delivered no file event' }));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^ {3}total=19 passed=18 skipped=1 /m);
  assert.match(r.stdout, /^ {3}1 skipped as inconclusive, counted with the passing tests:\n {5}src\/e2e\/E2E-001\.live-filesystem\.test\.ts > E2E-001 detects a write$/m);
  assert.match(r.stdout, /42 README counts match the live suite\./);
});

test("the tests the harness skips as inconclusive reach the guard through vitest's JSON report", () => {
  const repo = join(here, '..');
  const vitest = join(repo, 'node_modules', 'vitest', 'vitest.mjs');
  const fixture = join(here, 'fixtures', 'inconclusive-skip');
  const dir = mkdtempSync(join(tmpdir(), 'check-test-counts-'));
  try {
    const out = join(dir, 'report.json');
    const r = spawnSync(process.execPath, [vitest, 'run', '--root', fixture, '--reporter=json', `--outputFile=${out}`], {
      cwd: repo,
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr.slice(-2000));
    const report = JSON.parse(readFileSync(out, 'utf8'));
    assert.deepEqual([report.numTotalTests, report.numPassedTests, report.numPendingTests], [5, 1, 4]);
    const live = liveCounts(report, path => assert.fail(`${path} is not a scenario file`));
    assert.deepEqual({ total: live.total, passed: live.passed, skipped: live.skipped }, { total: 5, passed: 3, skipped: 2 });
    assert.deepEqual(live.inconclusive, [
      'src/inconclusive-skip.test.ts > skips in a test is skipped as inconclusive from the test',
      'src/inconclusive-skip.test.ts > skips in beforeEach is skipped as inconclusive before it runs',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tests in a directory the table does not name are drift', () => {
  const { drift } = compareCounts(suite({ ...FILES, 'src/harness/adapter.test.ts': 1 }), README, source);
  assert.ok(drift.includes("the test table's source rows cover 19 of the suite's 20 tests; add a row for the directory they are in"), drift.join('\n'));
});

test('a statement the guard cannot find is drift', () => {
  const { drift } = compareCounts(suite(), README.replace('# 2 false-positive / baseline tests', '# baseline tests'), source);
  assert.equal(drift.length, 1);
  assert.match(drift[0], /^could not find the README's test:baseline comment/);
});

test('the ATLAS counts split the scenario files by whether they cite a technique ID, not a tactic ID', () => {
  const { mappedScenarios, mappedScenarioFiles, unmappedScenarios, unmappedScenarioFiles, techniques } = liveCounts(suite(), source);
  assert.deepEqual(
    { mappedScenarios, mappedScenarioFiles, unmappedScenarios, unmappedScenarioFiles, techniques },
    { mappedScenarios: 10, mappedScenarioFiles: 5, unmappedScenarios: 3, unmappedScenarioFiles: 2, techniques: 4 },
  );
});

test('a README that says every scenario maps to ATLAS is drift while a scenario file cites no technique', () => {
  const changed = README.replace('10 of them, in 5 files,', '13 of them, in 7 files,').replace('the other 3 test', 'the other 0 test');
  const { drift } = compareCounts(suite(), changed, source);
  assert.deepEqual(drift, [
    'README line 3 (introduction) states 13 scenario tests in files that cite a MITRE ATLAS technique; the suite has 10',
    'README line 3 (introduction) states 7 scenario files that cite a MITRE ATLAS technique; the suite has 5',
    'README line 3 (introduction) states 0 scenario tests in files that cite no MITRE ATLAS technique; the suite has 3',
  ]);
});

test('a scenario file that stops citing its technique is drift in every ATLAS count', () => {
  const sources = { ...SOURCES, 'src/e2e/E2E-001.live-filesystem.test.ts': '// Live filesystem watch.\n' };
  const { drift } = compareCounts(suite(), README, path => source(path, sources));
  assert.deepEqual(drift, [
    'README line 3 (introduction) states 10 scenario tests in files that cite a MITRE ATLAS technique; the suite has 8',
    'README line 3 (introduction) states 5 scenario files that cite a MITRE ATLAS technique; the suite has 4',
    'README line 3 (introduction) states 4 MITRE ATLAS techniques cited by the scenario files; the suite has 3',
    'README line 3 (introduction) states 3 scenario tests in files that cite no MITRE ATLAS technique; the suite has 5',
    'README line 29 (MITRE ATLAS Coverage line) states 10 scenario tests in files that cite a MITRE ATLAS technique; the suite has 8',
    'README line 29 (MITRE ATLAS Coverage line) states 5 scenario files that cite a MITRE ATLAS technique; the suite has 4',
    'README line 29 (MITRE ATLAS Coverage line) states 4 MITRE ATLAS techniques cited by the scenario files; the suite has 3',
    'README line 29 (MITRE ATLAS Coverage line) states 3 scenario tests in files that cite no MITRE ATLAS technique; the suite has 5',
    'README line 29 (MITRE ATLAS Coverage line) states 2 scenario files that cite no MITRE ATLAS technique; the suite has 3',
  ]);
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
    writeSources(dir);
    const ok = spawnSync(process.execPath, [script, join(dir, 'results.json'), join(dir, 'README.md')], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /42 README counts match the live suite\./);
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

// Run the command on a report and README written to a temporary directory,
// with SOURCES beside the README unless `sources` is false; `args` maps the
// report and README paths to the command's arguments.
function runCommand(report, args = (reportPath, readmePath) => [reportPath, readmePath], sources = true) {
  const dir = mkdtempSync(join(tmpdir(), 'check-test-counts-'));
  try {
    writeFileSync(join(dir, 'report.json'), JSON.stringify(report));
    writeFileSync(join(dir, 'README.md'), README);
    if (sources) writeSources(dir);
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

test('a scenario file the report names and the README directory lacks is named, not blamed on the report', () => {
  const r = runCommand(suite(), undefined, false);
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    /^cannot read .*src\/atomic\/process\/AT-PROC-001\.spawn\.test\.ts, a scenario file the test report names: ENOENT: no such file or directory\n$/,
  );
  assert.doesNotMatch(r.stderr, /^\s+at /m);
});

test('the release smoke compares the counts of the README in its clone, not of the working tree', () => {
  const lines = readFileSync(join(here, 'release-smoke.sh'), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .map((l) => l.trim());
  const clone = lines.indexOf('cd "$TMP/oasb"');
  const guard = lines.findIndex((l) => /^node scripts\/check-test-counts\.mjs\b/.test(l));
  assert.notEqual(guard, -1, 'scripts/release-smoke.sh does not run scripts/check-test-counts.mjs');
  assert.ok(clone !== -1 && clone < guard, 'the drift guard does not run inside the fresh clone');
  const readme = lines[guard].split(/\s+/).at(-1);
  assert.equal(readme, 'README.md', `the drift guard reads ${readme}; an uncommitted edit to the working tree's README would be what it measures`);
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
