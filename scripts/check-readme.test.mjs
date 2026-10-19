// Tests for scripts/check-readme.mjs link resolution and test counts.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareCounts } from './check-test-counts.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'check-readme.mjs');
const repo = join(dirname(script), '..');
const USAGE = /^usage: node scripts\/check-readme\.mjs \[--tests <report\.json> \| --no-counts\] \[path\/to\/README\.md\]$/m;

const HEAD = '# Title\n\n## Quick Start\n\n```bash\nnpm test\n```\n\n## Guide\n\n';

// Write a README (layout checks pass) plus docs/guide.md and any other pages
// given by their path from the README's directory, give the pages listed in
// `unreadable` mode 000, run the check on it without the test count check.
function check(body, pages = {}, unreadable = []) {
  const dir = mkdtempSync(join(tmpdir(), 'check-readme-'));
  try {
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', 'guide.md'), '# Guide\n\n## Setup steps\n');
    for (const [path, text] of Object.entries(pages)) {
      mkdirSync(join(dir, dirname(path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    for (const path of unreadable) chmodSync(join(dir, path), 0o000);
    writeFileSync(join(dir, 'README.md'), HEAD + body);
    const r = spawnSync(process.execPath, [script, '--no-counts', join(dir, 'README.md')], { encoding: 'utf8' });
    return { status: r.status, stderr: r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A small suite, by file: [passed, failed, skipped]. 15 tests: 10 attack
// scenarios in 8 files, 2 scoring-engine and 3 pinned; 14 pass, 1 skips.
const SUITE = {
  'src/atomic/process/AT-PROC-001.spawn.test.ts': [2, 0, 0],
  'src/atomic/network/AT-NET-001.connect.test.ts': [1, 0, 0],
  'src/integration/INT-001.exfil.test.ts': [2, 0, 0],
  'src/integration/INT-002.mcp.test.ts': [1, 0, 0],
  'src/baseline/BL-001.profile.test.ts': [1, 0, 0],
  'src/e2e/E2E-001.live-filesystem-detection.test.ts': [1, 0, 0],
  'src/e2e/E2E-003.live-network-detection.test.ts': [0, 0, 1],
  'src/e2e/E2E-004.interceptor-process.test.ts': [1, 0, 0],
  'src/benchmark/scoring.test.ts': [2, 0, 0],
  'src/benchmark/pinned/pinned.test.ts': [3, 0, 0],
};

// The headers of the SUITE's scenario files: six cite four ATLAS techniques
// between them (8 tests); INT-002 and BL-001 cite none (2 tests).
const SOURCES = {
  'src/atomic/process/AT-PROC-001.spawn.test.ts': '// ATLAS: AML.T0050 (Command and Scripting Interpreter)\n',
  'src/atomic/network/AT-NET-001.connect.test.ts': '// ATLAS: AML.T0025 (Exfiltration via Cyber Means)\n',
  'src/integration/INT-001.exfil.test.ts': '// ATLAS: AML.T0086 (Exfiltration via AI Agent Tool Invocation)\n',
  'src/integration/INT-002.mcp.test.ts': '// Detection-capability test.\n',
  'src/baseline/BL-001.profile.test.ts': '// Defensive response test (counters Impact / AML.TA0011).\n',
  'src/e2e/E2E-001.live-filesystem-detection.test.ts': '// ATLAS: AML.T0055 (Unsecured Credentials)\n',
  'src/e2e/E2E-003.live-network-detection.test.ts': '// ATLAS: AML.T0025\n',
  'src/e2e/E2E-004.interceptor-process.test.ts': '// ATLAS: AML.T0050\n',
};
const source = (path) => SOURCES[path];

// The count statements of the real README, with the SUITE's numbers.
const COUNTED = [
  '# OASB',
  '',
  '[![CI](https://github.com/opena2a-org/oasb/actions/workflows/ci.yml/badge.svg)](https://example.com/oasb)',
  '',
  "10 standardized attack scenarios that evaluate a security product. 8 of them, in 6 files, map to MITRE ATLAS (4 techniques); the other 2 test the product's defensive response.",
  '',
  '## Quick Start',
  '',
  '```bash',
  'npm test                    # Full suite: 15 tests (14 pass, 1 skip)',
  '```',
  '',
  'Implement the adapter and run the same 10 attack scenarios.',
  '',
  '> **Counts.** `npm test` runs **15 tests** (14 passing, 1 skipped on every platform): **10 attack scenarios** plus **2 scoring-engine unit tests** and **3 pinned benchmark harness tests**. "10" is the scenario count; "14 passing" is the full `npm test` total.',
  '',
  '```bash',
  'npm run test:atomic         # 3 atomic detection tests (no external deps)',
  'npm run test:integration    # 3 tests across 2 integration scenarios',
  'npm run test:baseline       # 1 false-positive / baseline tests',
  'npm run test:e2e            # 3 E2E tests (E2E-003 currently skipped)',
  '```',
  '',
  '## What Gets Tested',
  '',
  '| Category | Tests | Source | What It Evaluates |',
  '|----------|-------|--------|-------------------|',
  '| Process detection | 2 | `src/atomic/process` | Spawns |',
  '| Network detection | 1 | `src/atomic/network` | Connections |',
  '| Multi-step attacks | 3 | `src/integration` | Chains |',
  '| Baseline behavior | 1 | `src/baseline` | False positives |',
  '| Real OS detection | 2 | `src/e2e` (live monitors) | Live monitors |',
  '| Application-level hooks | 1 | `src/e2e` (interceptors) | Interception |',
  '| **Attack scenarios** | **10** | atomic + integration + baseline + E2E | **4 techniques** |',
  '| Scoring-engine unit tests | 2 | `src/benchmark` | Metrics |',
  '| Pinned benchmark harness tests | 3 | `src/benchmark/pinned` | Pin checks |',
  '| **`npm test` total** | **15** | (14 pass, 1 skipped on every platform) | |',
  '',
  '## MITRE ATLAS Coverage',
  '',
  'Of the 10 tests across 8 scenario files, 8 tests in 6 files map to 4 unique techniques. The other 2 tests, in 2 files, are defensive and capability tests.',
  '',
  '## Usage via OpenA2A CLI',
  '',
  '```bash',
  'opena2a benchmark ./my-agent  # the control set, not the scenarios',
  '```',
  '',
].join('\n');

// Numbers in COUNTED that no check compares: the technique count in the
// "Attack scenarios" row and a test ID.
const NOT_COUNTS = /\*\*\d+ techniques\*\*|E2E-\d+/g;

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// A vitest JSON report of `suite`, with paths under `checkout` (this
// repository by default) as vitest writes them.
function report(suite, checkout = repo) {
  const status = (n, s) => Array.from({ length: n }, () => ({ status: s }));
  const tally = (i) => Object.values(suite).reduce((sum, counts) => sum + counts[i], 0);
  return {
    numTotalTests: tally(0) + tally(1) + tally(2),
    numPassedTests: tally(0),
    numFailedTests: tally(1),
    numPendingTests: tally(2),
    testResults: Object.entries(suite).map(([file, [passed, failed, skipped]]) => ({
      name: join(checkout, file),
      assertionResults: [...status(passed, 'passed'), ...status(failed, 'failed'), ...status(skipped, 'skipped')],
    })),
  };
}

// Run the check (`checkScript`, this repository's by default) with --tests on
// `readme` and `testReport`, with `sources` written beside the README, where
// the check reads the scenario files, and the sources listed in `unreadable`
// given mode 000.
function checkCounts(readme, suite = SUITE, testReport = report(suite), sources = SOURCES, checkScript = script, unreadable = []) {
  const dir = mkdtempSync(join(tmpdir(), 'check-readme-counts-'));
  try {
    writeFileSync(join(dir, 'README.md'), readme);
    for (const [path, text] of Object.entries(sources)) {
      mkdirSync(join(dir, dirname(path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    for (const path of unreadable) chmodSync(join(dir, path), 0o000);
    writeFileSync(join(dir, 'report.json'), JSON.stringify(testReport));
    const r = spawnSync(process.execPath, [checkScript, '--tests', join(dir, 'report.json'), join(dir, 'README.md')], {
      encoding: 'utf8',
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('README counts that equal the test report pass', () => {
  const r = checkCounts(COUNTED);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /test counts match the test report: 15 tests, 14 passing, 1 skipped, 10 attack scenarios/);
  assert.deepEqual(compareCounts(report(SUITE), COUNTED, source).drift, []);
});

// report(SUITE) with one of the two INT-001 cases skipped at run time; `meta`
// is the meta vitest writes for that test.
function withRunTimeSkip(meta) {
  const skipped = report(SUITE);
  const file = skipped.testResults.find((f) => f.name.endsWith('INT-001.exfil.test.ts'));
  file.assertionResults[1] = { status: 'skipped', title: 'detects a write', fullName: 'INT-001 detects a write', meta };
  skipped.numPassedTests -= 1;
  skipped.numPendingTests += 1;
  return skipped;
}

test('with --tests a case skipped as inconclusive is counted with the passing tests, as the drift guard counts it', () => {
  const skipped = withRunTimeSkip({ inconclusive: 'inconclusive: host delivered no file event' });
  const r = checkCounts(COUNTED, SUITE, skipped);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /test counts match the test report: 15 tests, 14 passing, 1 skipped, 10 attack scenarios/);
  assert.match(r.stdout, /^ {3}1 skipped as inconclusive, counted with the passing tests\.$/m);
  const guard = compareCounts(skipped, COUNTED, source);
  assert.deepEqual(guard.drift, []);
  assert.deepEqual({ passed: guard.live.passed, skipped: guard.live.skipped }, { passed: 14, skipped: 1 });
});

test('with --tests a case skipped at run time without the inconclusive marker is a skipped test, as the drift guard counts it', () => {
  for (const meta of [{}, undefined, { inconclusive: true }]) {
    const skipped = withRunTimeSkip(meta);
    const r = checkCounts(COUNTED, SUITE, skipped);
    assert.equal(r.status, 1, JSON.stringify(meta));
    assert.match(r.stderr, /^README: line \d+: the Quick Start comment says 14; the test report has 13 passing tests\.$/m);
    assert.doesNotMatch(r.stdout, /skipped as inconclusive/);
    const { drift } = compareCounts(skipped, COUNTED, source);
    assert.ok(drift.some((d) => / \(Quick Start comment\) states 14 passing tests; the suite has 13$/.test(d)), drift.join('\n'));
  }
});

// COUNTED with a run of one scenario file and what it prints: the two tests
// of AT-PROC-001 in the SUITE.
const CAPTURE_COMMAND = 'npx vitest run AT-PROC-001 --reporter=verbose';
const CAPTURE_FILE = 'src/atomic/process/AT-PROC-001.spawn.test.ts';
const CAPTURED = [
  COUNTED,
  '## First run',
  '',
  '```bash',
  `${CAPTURE_COMMAND}   # one scenario file`,
  '```',
  '',
  `What \`${CAPTURE_COMMAND}\` prints, trimmed:`,
  '',
  '```text',
  ` ✓ ${CAPTURE_FILE} > AT-PROC-001: Spawn > detects a spawn 3ms`,
  '...',
  ' Test Files  1 passed (1)',
  '      Tests  2 passed (2)',
  '```',
  '',
].join('\n');

const lineWith = (text, needle) => lineOf(text, text.indexOf(needle));

// report(SUITE) with the names vitest writes for the two AT-PROC-001 tests;
// `statuses` replaces their statuses.
function namedReport(statuses = ['passed', 'passed']) {
  const named = report(SUITE);
  const file = named.testResults.find((f) => f.name.endsWith(CAPTURE_FILE));
  ['detects a spawn', 'detects a shell'].forEach((title, i) => {
    Object.assign(file.assertionResults[i], { ancestorTitles: ['AT-PROC-001: Spawn'], title, status: statuses[i] });
  });
  return named;
}

test('a capture of a vitest run that equals the test report passes', () => {
  const r = checkCounts(CAPTURED, SUITE, namedReport());
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^ {3}README capture of `npx vitest run AT-PROC-001 --reporter=verbose` matches the test report: 2 tests in 1 test file\.$/m);
});

test('a capture whose summary lines differ from the run fails on each count', () => {
  const stale = CAPTURED.replace('Test Files  1 passed (1)', 'Test Files  2 passed (2)').replace('Tests  2 passed (2)', 'Tests  3 passed (3)');
  const r = checkCounts(stale, SUITE, namedReport());
  assert.equal(r.status, 1);
  const files = lineWith(stale, 'Test Files  2');
  const tests = lineWith(stale, 'Tests  3');
  const cmd = '`npx vitest run AT-PROC-001 --reporter=verbose`';
  assert.match(r.stderr, new RegExp(`^README: line ${files}: the capture's "Test Files" line says 2 in all; ${cmd} selects 1 test file of the test report\\.$`, 'm'));
  assert.match(r.stderr, new RegExp(`^README: line ${files}: the capture's "Test Files" line says 2 passed; of the test files ${cmd} selects, the test report has 1 passed\\.$`, 'm'));
  assert.match(r.stderr, new RegExp(`^README: line ${tests}: the capture's "Tests" line says 3 in all; ${cmd} selects 2 tests of the test report\\.$`, 'm'));
  assert.match(r.stderr, new RegExp(`^README: line ${tests}: the capture's "Tests" line says 3 passed; of the tests ${cmd} selects, the test report has 2 passed\\.$`, 'm'));
});

test('a capture that states a skipped count the run does not have, or leaves out one it has, fails', () => {
  const split = CAPTURED.replace('Tests  2 passed (2)', 'Tests  1 passed | 1 skipped (2)');
  const r = checkCounts(split, SUITE, namedReport());
  assert.equal(r.status, 1);
  const at = lineWith(split, 'Tests  1 passed');
  assert.match(r.stderr, new RegExp(`^README: line ${at}: the capture's "Tests" line says 1 passed; .* the test report has 2 passed\\.$`, 'm'));
  assert.match(r.stderr, new RegExp(`^README: line ${at}: the capture's "Tests" line says 1 skipped; .* the test report has 0 skipped\\.$`, 'm'));

  const skipped = checkCounts(CAPTURED, SUITE, namedReport(['passed', 'skipped']));
  assert.equal(skipped.status, 1);
  const tests = lineWith(CAPTURED, 'Tests  2');
  assert.match(skipped.stderr, new RegExp(`^README: line ${tests}: the capture's "Tests" line says 2 passed; .* the test report has 1 passed\\.$`, 'm'));
  assert.match(skipped.stderr, new RegExp(`^README: line ${tests}: the capture's "Tests" line says 0 skipped; .* the test report has 1 skipped\\.$`, 'm'));
});

test('a capture line that shows a test the run does not pass fails', () => {
  const at = lineWith(CAPTURED, ' ✓ ');
  const cases = [
    [
      CAPTURED.replace('detects a spawn 3ms', 'detects a fork 3ms'),
      namedReport(),
      `the capture shows "AT-PROC-001: Spawn > detects a fork" passing in ${CAPTURE_FILE}; the test report has no test of that name there.`,
    ],
    [
      CAPTURED.replace(`${CAPTURE_FILE} > AT-PROC-001: Spawn > detects a spawn`, 'src/atomic/network/AT-NET-001.connect.test.ts > AT-NET-001 > connects'),
      namedReport(),
      'the capture shows a test of src/atomic/network/AT-NET-001.connect.test.ts, which `npx vitest run AT-PROC-001 --reporter=verbose` does not run.',
    ],
    [
      CAPTURED,
      namedReport(['skipped', 'passed']),
      `the capture shows "AT-PROC-001: Spawn > detects a spawn" passing in ${CAPTURE_FILE}; the test report has it skipped.`,
    ],
  ];
  for (const [readme, testReport, message] of cases) {
    const r = checkCounts(readme, SUITE, testReport);
    assert.equal(r.status, 1, message);
    assert.ok(r.stderr.split('\n').includes(`README: line ${at}: ${message}`), r.stderr);
  }
});

test('a capture names a vitest run that a code block above it shows', () => {
  const noIntro = CAPTURED.replace(`What \`${CAPTURE_COMMAND}\` prints, trimmed:`, 'It prints:');
  let r = checkCounts(noIntro, SUITE, namedReport());
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    new RegExp(`^README: line ${lineWith(noIntro, '```text')}: the code block shows what a vitest run prints, but the line above it does not name the command; `, 'm'),
  );

  const notRun = CAPTURED.replace(`${CAPTURE_COMMAND}   # one scenario file`, 'npx vitest run AT-NET-001');
  r = checkCounts(notRun, SUITE, namedReport());
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    new RegExp(`^README: line ${lineWith(notRun, 'What `')}: the capture names \`npx vitest run AT-PROC-001 --reporter=verbose\`, which no code block above it runs\\.$`, 'm'),
  );

  const other = CAPTURED.replace(`What \`${CAPTURE_COMMAND}\``, 'What `npm test`');
  r = checkCounts(other, SUITE, namedReport());
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^README: line \d+: the capture is of `npm test`; the check reads the capture of a `vitest run` or `npx @opena2a\/oasb <ID>` command only\.$/m);

  const none = CAPTURED.replaceAll('AT-PROC-001 --reporter', 'AT-NONE-404 --reporter');
  r = checkCounts(none, SUITE, namedReport());
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    new RegExp(`^README: line ${lineWith(none, '```text')}: \`npx vitest run AT-NONE-404 --reporter=verbose\` selects no test file of the test report, `, 'm'),
  );
});

// CAPTURED with its intro linking the full output of the run, which
// fullSources writes beside the README with the .json that describes it.
const FULL_PATH = 'docs/captures/run.txt';
const META_PATH = 'docs/captures/run.json';
const WITH_FULL = CAPTURED.replace(
  `What \`${CAPTURE_COMMAND}\` prints, trimmed:`,
  `What \`${CAPTURE_COMMAND}\` prints, trimmed ([full output](${FULL_PATH})):`,
);
const FULL_RUN = [
  '',
  '...',
  '',
  ` ✓ ${CAPTURE_FILE} > AT-PROC-001: Spawn > detects a spawn 3ms`,
  ` ✓ ${CAPTURE_FILE} > AT-PROC-001: Spawn > detects a shell 1ms`,
  '',
  ' Test Files  1 passed (1)',
  '      Tests  2 passed (2)',
  '   Duration  1.00s',
  '',
].join('\n');
const META = JSON.stringify({ command: CAPTURE_COMMAND, outputs: { capture: FULL_PATH } });
const fullSources = (output = FULL_RUN, meta = META) => ({ ...SOURCES, [FULL_PATH]: output, ...(meta === null ? {} : { [META_PATH]: meta }) });
const errors = (r) => r.stderr.split('\n');

test('a capture whose full output shows the run passes, and the check names the full output', () => {
  const r = checkCounts(WITH_FULL, SUITE, namedReport(), fullSources());
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^ {3}README capture of `npx vitest run AT-PROC-001 --reporter=verbose` matches the test report: 2 tests in 1 test file\.$/m);
  assert.match(r.stdout, /^ {3}Its full output docs\/captures\/run\.txt shows the 2 tests that passed and holds each line of the capture\.$/m);
});

test('a full output that leaves out a test the run passes, or a summary line, fails', () => {
  const cmd = `\`${CAPTURE_COMMAND}\``;
  const noShell = FULL_RUN.replace(` ✓ ${CAPTURE_FILE} > AT-PROC-001: Spawn > detects a shell 1ms\n`, '');
  let r = checkCounts(WITH_FULL, SUITE, namedReport(), fullSources(noShell));
  assert.equal(r.status, 1);
  assert.ok(
    errors(r).includes(
      `README: ${FULL_PATH}: the full output of ${cmd} does not show "AT-PROC-001: Spawn > detects a shell" in ${CAPTURE_FILE}, which the test report has passed.`,
    ),
    r.stderr,
  );

  const noFiles = FULL_RUN.replace(' Test Files  1 passed (1)\n', '');
  r = checkCounts(WITH_FULL, SUITE, namedReport(), fullSources(noFiles));
  assert.equal(r.status, 1);
  assert.ok(errors(r).includes(`README: ${FULL_PATH}: the full output of ${cmd} has no "Test Files" line.`), r.stderr);
  assert.ok(
    errors(r).includes(
      `README: line ${lineWith(WITH_FULL, ' Test Files')}: the capture shows a line that its full output ${FULL_PATH} does not have: "Test Files  1 passed (1)".`,
    ),
    r.stderr,
  );
});

test('a full output is held to the run as the capture is', () => {
  const fork = FULL_RUN.replace('detects a shell 1ms', 'detects a fork 1ms').replace('Tests  2 passed (2)', 'Tests  3 passed (3)');
  const r = checkCounts(WITH_FULL, SUITE, namedReport(), fullSources(fork));
  assert.equal(r.status, 1);
  const at = (needle) => lineOf(fork, fork.indexOf(needle));
  for (const message of [
    `${FULL_PATH} line ${at('detects a fork')}: the capture shows "AT-PROC-001: Spawn > detects a fork" passing in ${CAPTURE_FILE}; the test report has no test of that name there.`,
    `${FULL_PATH} line ${at('Tests  3')}: the capture's "Tests" line says 3 in all; \`${CAPTURE_COMMAND}\` selects 2 tests of the test report.`,
    `${FULL_PATH} line ${at('Tests  3')}: the capture's "Tests" line says 3 passed; of the tests \`${CAPTURE_COMMAND}\` selects, the test report has 2 passed.`,
    `line ${lineWith(WITH_FULL, '      Tests  2')}: the capture shows a line that its full output ${FULL_PATH} does not have: "Tests  2 passed (2)".`,
  ]) {
    assert.ok(errors(r).includes(`README: ${message}`), `${message}\n${r.stderr}`);
  }
});

test('a capture line that its full output does not have fails; a "..." line is not read', () => {
  const retimed = WITH_FULL.replace('detects a spawn 3ms', 'detects a spawn 9ms');
  const r = checkCounts(retimed, SUITE, namedReport(), fullSources());
  assert.equal(r.status, 1);
  assert.deepEqual(errors(r).filter(Boolean), [
    `README: line ${lineWith(retimed, ' ✓ ')}: the capture shows a line that its full output ${FULL_PATH} does not have: "✓ ${CAPTURE_FILE} > AT-PROC-001: Spawn > detects a spawn 9ms".`,
  ]);
});

test('a full output needs a .json beside it that names its command and its path', () => {
  const intro = lineWith(WITH_FULL, 'What `');
  let r = checkCounts(WITH_FULL, SUITE, namedReport(), fullSources(FULL_RUN, null));
  assert.equal(r.status, 1);
  assert.deepEqual(errors(r).filter(Boolean), [
    `README: line ${intro}: the full output ${FULL_PATH} has no ${META_PATH} beside it to record the command it is of.`,
  ]);

  r = checkCounts(WITH_FULL, SUITE, namedReport(), fullSources(FULL_RUN, JSON.stringify({ command: 'npm test', outputs: { capture: 'run.txt' } })));
  assert.equal(r.status, 1);
  assert.deepEqual(errors(r).filter(Boolean), [
    `README: ${META_PATH}: "command" is "npm test"; the capture it describes is of \`${CAPTURE_COMMAND}\`.`,
    `README: ${META_PATH}: "outputs.capture" is "run.txt"; the full output it describes is ${FULL_PATH}.`,
  ]);

  r = checkCounts(WITH_FULL, SUITE, namedReport(), fullSources(FULL_RUN, 'command: npx vitest run'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^README: docs\/captures\/run\.json: cannot read it as JSON: /m);
});

test('a full output link with a malformed %-escape is named once by the link check, with no stack trace', () => {
  const malformed = WITH_FULL.replace(`([full output](${FULL_PATH}))`, '([full output](docs/captures/100%.txt))');
  const r = checkCounts(malformed, SUITE, namedReport());
  assert.equal(r.status, 1);
  assert.deepEqual(errors(r).filter(Boolean), [
    `README: line ${lineWith(malformed, 'What `')}: link target "docs/captures/100%.txt" has a malformed %-escape; write a literal % as %25.`,
  ]);
});

// CAPTURED and WITH_FULL as the capture of the package's oasb command on
// AT-PROC-001: the same two tests, then the verdict line it prints.
const OASB_COMMAND = 'npx @opena2a/oasb AT-PROC-001';
const OASB_VERDICT = 'OASB AT-PROC-001 against some-product 1.0.0: PASS (2 of 2 tests passed)';
const asOasb = (readme, command = OASB_COMMAND) =>
  readme.replaceAll(CAPTURE_COMMAND, command).replace('      Tests  2 passed (2)\n', `      Tests  2 passed (2)\n${OASB_VERDICT}\n`);
const OASB_CAPTURED = asOasb(CAPTURED);
const OASB_FULL_RUN = `${FULL_RUN}${OASB_VERDICT}\n`;
const OASB_META = JSON.stringify({ command: OASB_COMMAND, outputs: { capture: FULL_PATH } });

test('a capture of npx @opena2a/oasb <ID> is held to the scenario file whose ID is <ID>, ignoring case', () => {
  let r = checkCounts(OASB_CAPTURED, SUITE, namedReport());
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^ {3}README capture of `npx @opena2a\/oasb AT-PROC-001` matches the test report: 2 tests in 1 test file\.$/m);

  r = checkCounts(asOasb(CAPTURED, 'npx @opena2a/oasb at-proc-001'), SUITE, namedReport());
  assert.equal(r.status, 0, r.stderr);

  // vitest's file filter would select AT-PROC-001 by this prefix; the oasb
  // command selects a file by its whole ID.
  const prefix = asOasb(CAPTURED, 'npx @opena2a/oasb AT-PROC-00');
  r = checkCounts(prefix, SUITE, namedReport());
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    new RegExp(`^README: line ${lineWith(prefix, '```text')}: \`npx @opena2a/oasb AT-PROC-00\` selects no test file of the test report, `, 'm'),
  );
});

test('the verdict line of a capture of npx @opena2a/oasb is the one the oasb command prints for the run', () => {
  const at = lineWith(OASB_CAPTURED, 'OASB AT-PROC-001');
  const message = (said, expected) =>
    `README: line ${at}: the capture's verdict line is "${said}"; for the tests \`${OASB_COMMAND}\` selects, the test report gives "${expected}".`;

  const stale = OASB_CAPTURED.replace('PASS (2 of 2 tests passed)', 'PASS (3 of 3 tests passed)');
  let r = checkCounts(stale, SUITE, namedReport());
  assert.equal(r.status, 1);
  assert.deepEqual(errors(r).filter(Boolean), [
    message('OASB AT-PROC-001 against some-product 1.0.0: PASS (3 of 3 tests passed)', OASB_VERDICT),
  ]);

  r = checkCounts(OASB_CAPTURED, SUITE, namedReport(['passed', 'failed']));
  assert.equal(r.status, 1);
  assert.ok(
    errors(r).includes(message(OASB_VERDICT, 'OASB AT-PROC-001 against some-product 1.0.0: FAIL (1 of 2 tests failed, 1 passed)')),
    r.stderr,
  );

  r = checkCounts(OASB_CAPTURED, SUITE, namedReport(['skipped', 'skipped']));
  assert.equal(r.status, 1);
  assert.ok(
    errors(r).includes(message(OASB_VERDICT, 'OASB AT-PROC-001 against some-product 1.0.0: NOT MEASURED (0 of 2 tests evaluated)')),
    r.stderr,
  );

  const otherId = OASB_CAPTURED.replace('OASB AT-PROC-001 against', 'OASB AT-NET-001 against');
  r = checkCounts(otherId, SUITE, namedReport());
  assert.equal(r.status, 1);
  assert.deepEqual(errors(r).filter(Boolean), [
    message('OASB AT-NET-001 against some-product 1.0.0: PASS (2 of 2 tests passed)', OASB_VERDICT),
  ]);
});

test('the full output of npx @opena2a/oasb holds its verdict line', () => {
  const readme = asOasb(WITH_FULL);
  let r = checkCounts(readme, SUITE, namedReport(), fullSources(OASB_FULL_RUN, OASB_META));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^ {3}Its full output docs\/captures\/run\.txt shows the 2 tests that passed and holds each line of the capture\.$/m);

  r = checkCounts(readme, SUITE, namedReport(), fullSources(FULL_RUN, OASB_META));
  assert.equal(r.status, 1);
  assert.ok(
    errors(r).includes(
      `README: ${FULL_PATH}: the full output of \`${OASB_COMMAND}\` has no verdict line ("OASB AT-PROC-001 against <product>: ..."), which the oasb command prints last.`,
    ),
    r.stderr,
  );
  assert.ok(
    errors(r).includes(`README: line ${lineWith(readme, 'OASB AT-PROC-001')}: the capture shows a line that its full output ${FULL_PATH} does not have: "${OASB_VERDICT}".`),
    r.stderr,
  );
});

test('a README that says every scenario maps to ATLAS fails while a scenario file cites no technique', () => {
  const r = checkCounts(COUNTED.replace('8 of them, in 6 files,', '10 of them, in 8 files,').replace('the other 2 test', 'the other 0 test'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^README: line 5: the introduction says 10; the test report has 8 scenario tests in files that cite a MITRE ATLAS technique ID\.$/m);
  assert.match(r.stderr, /^README: line 5: the introduction says 8; the test report has 6 scenario files that cite a MITRE ATLAS technique ID\.$/m);
  assert.match(r.stderr, /^README: line 5: the introduction says 0; the test report has 2 scenario tests in files that cite no MITRE ATLAS technique ID\.$/m);
});

test('a scenario file that stops citing its technique fails every ATLAS count', () => {
  const sources = { ...SOURCES, 'src/integration/INT-001.exfil.test.ts': '// Multi-step exfiltration chain.\n' };
  const r = checkCounts(COUNTED, SUITE, report(SUITE), sources);
  assert.equal(r.status, 1);
  for (const line of [5, 41]) {
    assert.match(r.stderr, new RegExp(`^README: line ${line}: .* says 8; the test report has 6 scenario tests in files that cite a MITRE ATLAS`, 'm'));
    assert.match(r.stderr, new RegExp(`^README: line ${line}: .* says 4; the test report has 3 MITRE ATLAS technique IDs`, 'm'));
  }
});

test('a scenario file the check cannot read is named, and the ATLAS counts are reported unchecked', () => {
  const { 'src/baseline/BL-001.profile.test.ts': _, ...sources } = SOURCES;
  const r = checkCounts(COUNTED, SUITE, report(SUITE), sources);
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    /^README: cannot read .*src\/baseline\/BL-001\.profile\.test\.ts, a scenario file the test report names: ENOENT: no such file or directory; the MITRE ATLAS counts are not checked\.$/m,
  );
  assert.equal(r.stderr.trim().split('\n').length, 1, r.stderr);
});

// COUNTED with `row` in a MITRE ATLAS Coverage table at line 45, and `link`
// appended to the section's first line (41).
function withAtlas(row, link = '') {
  return COUNTED.replace(
    'are defensive and capability tests.',
    `are defensive and capability tests.${link}\n\n| Technique | ID | Tests |\n|-----------|----|-------|\n${row}`,
  );
}

// The SUITE's sources plus docs/atlas.md, whose sixth line is `row`.
const withPage = (row) => ({
  ...SOURCES,
  'docs/atlas.md': `# Mapping\n\n| Test ID | Description |\n|---------|-------------|\n| AT-NET-001 | Outbound |\n${row}\n`,
});

const SKIPPED_E2E_003 =
  'E2E-003 is listed as MITRE ATLAS coverage, but every test in src/e2e/E2E-003.live-network-detection.test.ts is skipped; write it as "E2E-003 (skipped)" or remove it.';

test('a skipped test the MITRE ATLAS Coverage table lists fails until it is marked as skipped', () => {
  for (const tests of ['AT-NET-001, E2E-003', 'AT-NET-001, E2E-001/003']) {
    const r = checkCounts(withAtlas(`| Exfiltration via Cyber Means | AML.T0025 | ${tests} |`));
    assert.equal(r.status, 1, tests);
    assert.equal(r.stderr.trim(), `README: line 45: ${SKIPPED_E2E_003}`);
  }
  const r = checkCounts(withAtlas('| Exfiltration via Cyber Means | AML.T0025 | AT-NET-001, E2E-001, E2E-003 (skipped) |'));
  assert.equal(r.status, 0, r.stderr);
});

test('a skipped test listed in a page the MITRE ATLAS Coverage section links to fails until it is marked as skipped', () => {
  const readme = withAtlas('| Exfiltration via Cyber Means | AML.T0025 | AT-NET-001 |', ' Detail: [mapping](docs/atlas.md).');
  let r = checkCounts(readme, SUITE, report(SUITE), withPage('| E2E-003 | Outbound TCP |'));
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), `README: docs/atlas.md line 6: ${SKIPPED_E2E_003}`);
  r = checkCounts(readme, SUITE, report(SUITE), withPage('| E2E-003 (skipped) | Outbound TCP |'));
  assert.equal(r.status, 0, r.stderr);
});

test('a page linked from outside the MITRE ATLAS Coverage section is not read for skipped tests', () => {
  const readme = COUNTED.replace(
    'run the same 10 attack scenarios.',
    'run the same 10 attack scenarios. See [mapping](docs/atlas.md).',
  );
  const r = checkCounts(readme, SUITE, report(SUITE), withPage('| E2E-003 | Outbound TCP |'));
  assert.equal(r.status, 0, r.stderr);
});

test('a link with a malformed %-escape in the MITRE ATLAS Coverage section is named once, with no stack trace', () => {
  const r = checkCounts(withAtlas('| Exfiltration via Cyber Means | AML.T0025 | AT-NET-001 |', ' Detail: [mapping](100%.md).'));
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), 'README: line 41: link target "100%.md" has a malformed %-escape; write a literal % as %25.');
});

test('a directory whose name ends in .md in the MITRE ATLAS Coverage section is not read as a page', () => {
  const sources = { ...SOURCES, 'atlas.md/README.md': '# Mapping\n' };
  const r = checkCounts(withAtlas('| Exfiltration via Cyber Means | AML.T0025 | AT-NET-001 |', ' Detail: [mapping](atlas.md).'), SUITE, report(SUITE), sources);
  assert.equal(r.status, 0, r.stderr);
});

// "constructor" and "toString" are inherited by every object, so a lookup
// that is not limited to the counts' own keys finds a function for them.
for (const key of ['nosuchkey', 'constructor', 'toString']) {
  test(`a STATEMENTS key that names no count ("${key}") fails with the key instead of a TypeError`, () => {
    // A copy of the check beside a readme-counts.mjs whose STATEMENTS has one
    // more entry, with the oasb command module it imports from ../bin.
    const dir = mkdtempSync(join(tmpdir(), 'check-readme-keys-'));
    try {
      const counts = pathToFileURL(join(repo, 'scripts', 'readme-counts.mjs')).href;
      mkdirSync(join(dir, 'scripts'));
      mkdirSync(join(dir, 'bin'));
      writeFileSync(join(dir, 'scripts', 'check-readme.mjs'), readFileSync(script));
      writeFileSync(join(dir, 'bin', 'run-scenario.mjs'), `export * from '${pathToFileURL(join(repo, 'bin', 'run-scenario.mjs')).href}';\n`);
      writeFileSync(
        join(dir, 'scripts', 'readme-counts.mjs'),
        `import { STATEMENTS as REAL } from '${counts}';\n` +
          `export * from '${counts}';\n` +
          `export const STATEMENTS = [...REAL, { where: 'x', re: /(\\d+) tests/g, keys: ['${key}'] }];\n`,
      );
      const r = checkCounts(COUNTED, SUITE, report(SUITE), SOURCES, join(dir, 'scripts', 'check-readme.mjs'));
      assert.equal(r.status, 1);
      assert.doesNotMatch(r.stderr, /TypeError/);
      assert.match(
        r.stderr,
        new RegExp(
          `^README: STATEMENTS in scripts/readme-counts\\.mjs gives the x the key "${key}", which names no count this check measures \\(total, passed, .*\\)\\.$`,
          'm',
        ),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('every count the README states is compared by this check and by the drift guard', () => {
  const notCounts = [...COUNTED.matchAll(NOT_COUNTS)].map((m) => [m.index, m.index + m[0].length]);
  const counts = [...COUNTED.matchAll(/\b\d+\b/g)].filter(
    (m) => !notCounts.some(([start, end]) => m.index >= start && m.index < end),
  );
  assert.equal(counts.length, 41);
  for (const m of counts) {
    const line = lineOf(COUNTED, m.index);
    const stated = Number(m[0]) + 1;
    const changed = COUNTED.slice(0, m.index) + stated + COUNTED.slice(m.index + m[0].length);
    const why = `changing ${m[0]} to ${stated} on line ${line}`;
    const r = checkCounts(changed);
    assert.equal(r.status, 1, `${why} passes check-readme`);
    assert.match(r.stderr, new RegExp(`^README: line ${line}: .* says ${stated}; `, 'm'), `${why}: ${r.stderr}`);
    const { drift } = compareCounts(report(SUITE), changed, source);
    assert.ok(
      drift.some((d) => d.startsWith(`README line ${line} `)),
      `${why} is not drift for check-test-counts: ${JSON.stringify(drift)}`,
    );
  }
});

test('a report written in another checkout is read by each file\'s path from src/', () => {
  const r = checkCounts(COUNTED, SUITE, report(SUITE, '/elsewhere/oasb-clone'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /test counts match the test report: 15 tests, 14 passing, 1 skipped, 10 attack scenarios/);
});

test('a report without testResults is reported by the field it lacks', () => {
  const r = checkCounts(COUNTED, SUITE, { numTotalTests: 1 });
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    /^README: cannot read the test report .*report\.json: it has no "testResults" list, so it is not a vitest JSON report; write the report with: npx vitest run --reporter=json --outputFile=<report\.json>$/m,
  );
  assert.doesNotMatch(r.stderr, /Cannot read properties/);
});

test('a report entry that is not a file or test result is reported by the entry', () => {
  for (const [testResults, entry] of [
    [[{ name: '/x/src/atomic/a.test.ts' }], 'testResults\\[0\\] has no "name" or no "assertionResults" list'],
    [[{ name: '/x/src/atomic/a.test.ts', assertionResults: [null] }], 'testResults\\[0\\]\\.assertionResults\\[0\\] is not a test result with a string "status"'],
    [[{ name: '/x/src/atomic/a.test.ts', assertionResults: [{ status: 'passed' }, {}] }], 'testResults\\[0\\]\\.assertionResults\\[1\\] is not a test result with a string "status"'],
    [[{ name: '/x/src/atomic/a.test.ts', assertionResults: [{ status: 1 }] }], 'testResults\\[0\\]\\.assertionResults\\[0\\] is not a test result with a string "status"'],
  ]) {
    const r = checkCounts(COUNTED, SUITE, { testResults });
    assert.equal(r.status, 1);
    assert.match(r.stderr, new RegExp(`^README: cannot read the test report .*report\\.json: ${entry}; write the report with: `, 'm'));
    assert.doesNotMatch(r.stderr, /Cannot read properties/);
  }
});

test('a README path that does not exist is named, with no stack trace', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-readme-missing-'));
  try {
    const missing = join(dir, 'missing.md');
    for (const args of [['--no-counts', missing], [missing]]) {
      const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
      assert.equal(r.status, 1, args.join(' '));
      assert.equal(r.stderr, `README: cannot read the README ${missing}: ENOENT: no such file or directory\n`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a test report path that does not exist is named once', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-readme-missing-'));
  try {
    const missing = join(dir, 'missing.json');
    writeFileSync(join(dir, 'README.md'), COUNTED);
    const r = spawnSync(process.execPath, [script, '--tests', missing, join(dir, 'README.md')], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^README: cannot read the test report .*missing\.json: ENOENT: no such file or directory$/m);
    assert.equal(r.stderr.split(missing).length, 2, r.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--help prints the usage on stdout and exits 0', () => {
  for (const flag of ['--help', '-h']) {
    const r = spawnSync(process.execPath, [script, flag], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${flag}: ${r.stderr}`);
    assert.match(r.stdout, USAGE, flag);
    assert.equal(r.stderr, '', flag);
  }
});

test('arguments the check does not take print the usage on stderr and exit 1', () => {
  for (const args of [['--tests'], ['--verbose'], ['a.md', 'b.md'], ['--no-counts', '--tests', 'report.json']]) {
    const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 1, args.join(' '));
    assert.match(r.stderr, USAGE, args.join(' '));
  }
});

// Collecting the suite needs vitest, which the release smoke installs after
// its first step.
const vitestInstalled = existsSync(join(repo, 'node_modules', 'vitest', 'package.json'));

test(
  'without --tests the check collects the suite, matches the repository README and leaves no adapter directory',
  { skip: !vitestInstalled && 'vitest is not installed; run npm ci', timeout: 300_000 },
  () => {
    const tmp = mkdtempSync(join(tmpdir(), 'check-readme-collect-'));
    try {
      const r = spawnSync(process.execPath, [script], {
        encoding: 'utf8',
        env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp },
      });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /README test counts match the collected suite: \d+ tests, \d+ not skipped/);
      assert.match(r.stdout, /^ {3}README capture of `npx @opena2a\/oasb AT-AI-001` matches the collected suite: \d+ tests? in \d+ test files?\.$/m);
      assert.match(r.stdout, /^ {3}Its full output docs\/captures\/quick-start\.txt shows the \d+ tests? not skipped and holds each line of the capture\.$/m);
      assert.deepEqual(
        readdirSync(tmp).filter((name) => /^(arp|llmg|rbuf)-lab-/.test(name)),
        [],
        'collecting the suite left adapter data directories in the temp directory',
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
);

// The adapters src/harness/create-adapter.ts selects by OASB_ADAPTER besides
// the default. The README counts are those of the default adapter, so these
// are collected with `vitest list`, which collects as the check does.
const OTHER_ADAPTERS = ['llm-guard', 'rebuff'];

test(
  'collecting the suite with each other adapter leaves no adapter directory',
  { skip: !vitestInstalled && 'vitest is not installed; run npm ci', timeout: 300_000 },
  () => {
    for (const adapter of OTHER_ADAPTERS) {
      const tmp = mkdtempSync(join(tmpdir(), 'check-readme-collect-'));
      try {
        const r = spawnSync(process.execPath, [join(repo, 'node_modules', 'vitest', 'vitest.mjs'), 'list'], {
          cwd: repo,
          encoding: 'utf8',
          env: { ...process.env, OASB_ADAPTER: adapter, TMPDIR: tmp, TMP: tmp, TEMP: tmp },
        });
        assert.equal(r.status, 0, `${adapter}: ${r.stderr}`);
        assert.match(r.stdout, /^src\/atomic\/ai-layer\/AT-AI-001\.prompt-input-scan\.test\.ts > /m, adapter);
        assert.deepEqual(
          readdirSync(tmp).filter((name) => /^(arp|llmg|rbuf)-lab-/.test(name)),
          [],
          `collecting the suite with OASB_ADAPTER=${adapter} left adapter data directories in the temp directory`,
        );
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  },
);

test('a badge whose message starts with a number fails, also without the count check', () => {
  const r = check(
    '[![Tests](https://img.shields.io/badge/tests-14%20passing-brightgreen)](https://example.com/oasb)\n' +
      '[![MITRE ATLAS](https://img.shields.io/badge/MITRE%20ATLAS-15%20techniques-teal)](https://atlas.mitre.org/)\n' +
      '![count](https://img.shields.io/badge/12-scenarios)\n',
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^README: line 11: the badge "tests: 14 passing" states a number typed into its URL, which the count check does not read; /m);
  assert.match(r.stderr, /^README: line 12: the badge "MITRE ATLAS: 15 techniques" states a number typed into its URL/m);
  assert.match(r.stderr, /^README: line 13: the badge "12" states a number typed into its URL/m);
  assert.match(r.stderr, /show the CI status badge, which shows the result of the latest CI run of the suite\.$/m);
});

test('a badge whose message is text, the CI status badge and a badge in a code block pass', () => {
  const r = check(
    '[![Status: stable](https://img.shields.io/badge/status-stable-green)](docs/guide.md)\n' +
      '[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)\n' +
      '![a dash](https://img.shields.io/badge/node-built--in-blue)\n' +
      '[![CI](https://github.com/opena2a-org/oasb/actions/workflows/ci.yml/badge.svg)](https://example.com/oasb)\n' +
      '\n```md\n![Tests](https://img.shields.io/badge/tests-14%20passing-brightgreen)\n```\n',
  );
  assert.equal(r.status, 0, r.stderr);
});

test("this repository's README has no badge that states a number and shows the CI status badge", () => {
  const r = spawnSync(process.execPath, [script, '--no-counts', join(repo, 'README.md')], { encoding: 'utf8' });
  assert.doesNotMatch(r.stderr, /states a number typed into its URL/);
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(repo, 'README.md'), 'utf8'), /\(https:\/\/github\.com\/opena2a-org\/oasb\/actions\/workflows\/ci\.yml\/badge\.svg\)/);
});

test('the Quick Start comment and the scoring-engine and pinned counts are each checked', () => {
  const r = checkCounts(
    COUNTED.replace('Full suite: 15 tests (14 pass', 'Full suite: 13 tests (12 pass')
      .replace('**2 scoring-engine unit tests**', '**1 scoring-engine unit tests**')
      .replace('| Pinned benchmark harness tests | 3 |', '| Pinned benchmark harness tests | 2 |'),
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr, /line 10: the Quick Start comment says 13; the test report has 15 tests\./);
  assert.match(r.stderr, /line 10: the Quick Start comment says 12; the test report has 14 passing tests\./);
  assert.match(r.stderr, /line 15: the Counts note says 1; the test report has 2 scoring-engine tests/);
  assert.match(
    r.stderr,
    /line 36: the "Pinned benchmark harness tests" row says 2; the test report has 3 tests in src\/benchmark\/pinned\./,
  );
});

test('the per-group comments and table rows are counted per source directory', () => {
  const r = checkCounts(
    COUNTED.replace('# 3 E2E tests', '# 4 E2E tests')
      .replace('# 3 tests across 2 integration scenarios', '# 3 tests across 3 integration scenarios')
      .replace('| Real OS detection | 2 |', '| Real OS detection | 3 |')
      .replace('| Scoring-engine unit tests | 2 |', '| Scoring-engine unit tests | 5 |'),
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr, /the test:e2e comment says 4; the test report has 3 tests in src\/e2e\./);
  assert.match(r.stderr, /the test:integration comment says 3; the test report has 2 test files in src\/integration\./);
  assert.match(r.stderr, /the "Real OS detection" row says 3; the test report has 2 tests in src\/e2e \(live monitors\)\./);
  assert.match(
    r.stderr,
    /the "Scoring-engine unit tests" row says 5; the test report has 2 tests in src\/benchmark outside src\/benchmark\/pinned\./,
  );
});

test('an OpenA2A CLI command the CLI does not have fails, in a code block or in prose', () => {
  const r = check('```bash\nopena2a benchmark run\nopena2a benchmark ./agent --technique T0015\n```\n\nRun `opena2a benchmark run --format json` in CI.\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^README: line 12: the OpenA2A CLI has no "benchmark run" subcommand: /m);
  assert.match(r.stderr, /^README: line 13: the OpenA2A CLI has no --technique option; /m);
  assert.match(r.stderr, /^README: line 16: the OpenA2A CLI has no "benchmark run" subcommand: /m);
  assert.match(r.stderr, /opena2a benchmark and hackmyagent secure -b oasb-1 check the OASB-1 controls/);
});

test('the OpenA2A CLI and HackMyAgent benchmark commands that exist pass', () => {
  const r = check(
    '```bash\nopena2a benchmark ./my-agent --level L2 --format json\nhackmyagent secure ./my-agent -b oasb-1\n```\n\nThe scenarios run with `npm test`; a run of them is not an `opena2a benchmark` option.\n',
  );
  assert.equal(r.status, 0, r.stderr);
});

test('this repository\'s README shows no OpenA2A CLI command the CLI does not have', () => {
  const r = spawnSync(process.execPath, [script, '--no-counts', join(repo, 'README.md')], { encoding: 'utf8' });
  assert.doesNotMatch(r.stderr, /the OpenA2A CLI has no /);
  assert.equal(r.status, 0, r.stderr);
});

test('a benchmark command whose comment names levels the command does not select fails', () => {
  const r = check(
    '```bash\n' +
      'opena2a benchmark ./my-agent --level L2   # levels L1, L2 and L3\n' +
      'opena2a benchmark ./my-agent              # OASB-1 controls at level L2\n' +
      'hackmyagent secure ./my-agent -b oasb-1 -l L3 # level L3 only\n' +
      '```\n',
  );
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    /^README: line 12: the comment names levels L1, L2 and L3, but `opena2a benchmark` with level L2 checks the OASB-1 controls of levels L1 and L2; /m,
  );
  assert.match(
    r.stderr,
    /^README: line 13: the comment names level L2, but `opena2a benchmark` with level L1 \(no --level\) checks the OASB-1 controls of level L1; /m,
  );
  assert.match(
    r.stderr,
    /^README: line 14: the comment names level L3, but `hackmyagent secure -b oasb-1` with level L3 checks the OASB-1 controls of levels L1, L2 and L3; /m,
  );
  assert.match(r.stderr, /a level adds its controls to those of the levels below it/);
});

test('a benchmark command whose comment names the levels it selects, or no level, passes', () => {
  const r = check(
    '```bash\n' +
      'opena2a benchmark ./my-agent                 # OASB-1 controls at level L1\n' +
      'opena2a benchmark ./my-agent --level=l2      # OASB-1 controls of levels L1 and L2\n' +
      'opena2a benchmark ./my-agent --format json   # rating, compliance and control coverage as JSON\n' +
      'hackmyagent secure ./my-agent -b oasb-1 --level L3 # levels L1, L2 and L3\n' +
      'hackmyagent secure ./my-agent -l L2          # no -b oasb-1: not a benchmark run, L3 not read\n' +
      '```\n\n' +
      'In prose, `opena2a benchmark ./my-agent --level L2` is followed by text about L3 that is not a comment.\n',
  );
  assert.equal(r.status, 0, r.stderr);
});

test("this repository's README names the levels each benchmark command checks", () => {
  const r = spawnSync(process.execPath, [script, '--no-counts', join(repo, 'README.md')], { encoding: 'utf8' });
  assert.doesNotMatch(r.stderr, /the comment names level/);
  assert.equal(r.status, 0, r.stderr);
});

test('a failing test is not counted as passing', () => {
  const r = checkCounts(COUNTED, { ...SUITE, 'src/baseline/BL-001.profile.test.ts': [0, 1, 0] });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /line 10: the Quick Start comment says 14; the test report has 13 passing tests\./);
  assert.match(r.stderr, /the "npm test total" row says 14; the test report has 13 passing tests\./);
});

test('a test file that no table row counts is reported', () => {
  const r = checkCounts(COUNTED, { ...SUITE, 'src/harness/adapter.test.ts': [1, 0, 0] });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no row of the "What Gets Tested" table counts the tests in src\/harness\/adapter\.test\.ts\./);
});

test('a count whose wording changed is reported as not found, not skipped', () => {
  const r = checkCounts(COUNTED.replace('# 3 atomic detection tests', '# 3 atomic tests'));
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    /the test:atomic comment .* was not found; if its wording changed, update STATEMENTS in scripts\/readme-counts\.mjs\./,
  );
});

test('a README without the stated counts fails unless --no-counts is given', () => {
  const r = checkCounts(HEAD + 'Body.\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /the introduction .* was not found/);
  assert.equal(check('Body.\n').status, 0);
});

test('inline links that resolve pass', () => {
  const r = check('See [setup](docs/guide.md#setup-steps) and [top](#quick-start).\n');
  assert.equal(r.status, 0, r.stderr);
});

test('inline link to a missing file fails', () => {
  const r = check('See [setup](docs/nowhere.md).\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /"docs\/nowhere\.md" does not exist/);
});

test('reference-style definition to a missing file fails', () => {
  const r = check('See [the guide][g].\n\n[g]: docs/nowhere.md\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /line 13: link target "docs\/nowhere\.md" does not exist/);
});

test('reference-style definition with a missing anchor fails', () => {
  const r = check('See [the guide][g].\n\n[g]: docs/guide.md#no-such-heading "Guide"\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /anchor "#no-such-heading" has no matching heading in docs\/guide\.md/);
});

test('reference-style definitions that resolve pass, including angle brackets and titles', () => {
  const r = check(
    'See [a][a], [b][b] and [c][c].\n\n' +
      '[a]: docs/guide.md#setup-steps\n' +
      '[b]: <docs/guide.md> "Guide"\n' +
      '  [c]: #guide\n' +
      '[d]: https://example.com/missing.md\n',
  );
  assert.equal(r.status, 0, r.stderr);
});

test('footnote definitions are not read as links', () => {
  const r = check('A claim.[^1]\n\n[^1]: See the methodology section.\n');
  assert.equal(r.status, 0, r.stderr);
});

test('HTML href to a missing file fails', () => {
  const r = check('<p><a href="docs/missing.html">Missing</a></p>\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /line 11: link target "docs\/missing\.html" does not exist/);
});

test('HTML href with a missing anchor fails', () => {
  const r = check("<a href='#no-such-heading'>Jump</a>\n");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /anchor "#no-such-heading" has no matching heading in README\.md/);
});

test('HTML hrefs that resolve or are absolute pass', () => {
  const r = check(
    '<a href="docs/guide.md#setup-steps">Setup</a> <a HREF="#guide">Guide</a>\n' +
      '<a href="https://example.com/missing.md">External</a> <a href="mailto:a@example.com">Mail</a>\n',
  );
  assert.equal(r.status, 0, r.stderr);
});

test('links inside inline code and fenced blocks are ignored', () => {
  const r = check(
    'Write `<a href="docs/missing.html">` or `[x]: nowhere.md` in prose.\n\n' +
      '```html\n<a href="docs/missing.html">x</a>\n```\n\n' +
      '```md\n[x]: docs/nowhere.md\n```\n',
  );
  assert.equal(r.status, 0, r.stderr);
});

test('links CommonMark renders with spaces, escapes, code spans or > in an attribute are read', () => {
  const lines = [
    '[x]( docs/nowhere.md )',
    '[x](docs/nowhere.md "T" )',
    '[x](docs/nowhere.md "a \\" b")',
    '[`x`]: docs/nowhere.md',
    '[a\\]b]: docs/nowhere.md',
    '<a title="a>b" href="docs/nowhere.md">x</a>',
    'A ``code ` x`` then [x](docs/nowhere.md) and `y`.',
    'A ``code ` x`` then <a href="docs/nowhere.md">x</a> and `y`.',
  ];
  for (const line of lines) {
    const r = check(`${line}\n`);
    assert.equal(r.status, 1, line);
    assert.match(r.stderr, /line 11: link target "docs\/nowhere\.md" does not exist/, line);
  }
});

test('inline destinations in angle brackets, with balanced parentheses or with escapes resolve', () => {
  const pages = { 'docs/a(b).md': '# A\n\n## Setup\n', 'docs/my guide.md': '# Mine\n', 'docs/a(b(c)).md': '# C\n' };
  const lines = [
    '[x](<docs/guide.md>)',
    '[x]( <docs/guide.md#setup-steps> "Guide" )',
    '[x](<docs/my guide.md>)',
    '[x](docs/a(b).md)',
    '[x](docs/a(b).md#setup "A")',
    '[x](docs/a(b(c)).md)',
    '[x](docs/a\\(b\\).md)',
    'See ([x](docs/a(b).md)) and [y](<docs/guide.md>).',
  ];
  for (const line of lines) {
    const r = check(`${line}\n`, pages);
    assert.equal(r.status, 0, `${line}\n${r.stderr}`);
  }
});

test('inline destinations in angle brackets or with parentheses that name no file fail with the path', () => {
  const cases = [
    ['[x](<docs/nowhere.md>)', 'docs/nowhere.md'],
    ['[x](<docs/no where.md> "T")', 'docs/no where.md'],
    ['[x](docs/a(b).md)', 'docs/a(b).md'],
    ['[x](docs/a\\)b.md)', 'docs/a)b.md'],
  ];
  for (const [line, target] of cases) {
    const r = check(`${line}\n`);
    assert.equal(r.status, 1, line);
    assert.ok(r.stderr.includes(`line 11: link target "${target}" does not exist`), `${line}\n${r.stderr}`);
  }
});

test('a destination CommonMark does not read as a link is not checked', () => {
  const r = check('[x](<docs/nowhere.md) and [y](docs/a(b.md) and [z](<docs/a<b.md>)\n');
  assert.equal(r.status, 0, r.stderr);
});

test('a code span ends at the next run of as many backticks, and an href inside a quoted attribute is not read', () => {
  const r = check(
    'Write ``a ` [y](docs/nowhere.md) `` and ```b `` <a href="docs/nowhere.md">```.\n\n' +
      '<a title="x href=\'docs/nowhere.md\'" href="docs/guide.md">Guide</a>\n',
  );
  assert.equal(r.status, 0, r.stderr);
});

test('a backslash-escaped backtick does not open a code span; a backslash inside a code span does not stop it closing', () => {
  const read = [
    '\\`[x](docs/nowhere.md)\\`',
    '\\`<a href="docs/nowhere.md">x</a>\\`',
    '\\``[x](docs/nowhere.md)``',
    '`a\\` [x](docs/nowhere.md)',
  ];
  for (const line of read) {
    const r = check(`${line}\n`);
    assert.equal(r.status, 1, line);
    assert.match(r.stderr, /line 11: link target "docs\/nowhere\.md" does not exist/, line);
  }
  for (const line of ['\\\\`[x](docs/nowhere.md)\\\\`', '\\```[x](docs/nowhere.md)``']) {
    const r = check(`${line}\n`);
    assert.equal(r.status, 0, `${line}\n${r.stderr}`);
  }
});

// A line of backtick runs of lengths 1, 2, 3, ..., each followed by x, so
// that no run closes another, about `size` characters long.
const unclosedRuns = (size) => {
  const runs = [];
  for (let length = 1, total = 0; total < size; total += length + 1, length++) runs.push(`${'`'.repeat(length)}x`);
  return runs.join('');
};

test('a 1 MB line of backtick runs of different lengths, none of them closed, is checked in under 2 seconds', () => {
  // Each run was read to the end of the line for a run of its length: this
  // line took 6.4 seconds.
  const line = unclosedRuns(1 << 20);
  const started = process.hrtime.bigint();
  const r = check(`${line}\n`);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(r.status, 0, r.stderr);
  assert.ok(ms < 2000, `${ms.toFixed(0)} ms for a line of ${line.length} characters`);
});

test('a backslash escapes only ASCII punctuation in a link destination, so a space after one ends it', () => {
  // The backslash is text and the space ends the destination; " b.md)" is
  // not a title, so the line holds no link.
  const r = check('[x](docs/a\\ b.md)\n');
  assert.equal(r.status, 0, r.stderr);
  // Before a letter a backslash is text that stays in the destination.
  const letter = check('[x](docs/no\\where.md)\n');
  assert.equal(letter.status, 1);
  assert.ok(letter.stderr.includes('line 11: link target "docs/no\\where.md" does not exist'), letter.stderr);
});

test('the title of a link is not read again as text; links after the link are read', () => {
  for (const line of ['[x](docs/guide.md "](docs/nowhere.md) )")', '[x](docs/guide.md "[y](docs/nowhere.md)")']) {
    const r = check(`${line}\n`);
    assert.equal(r.status, 0, `${line}\n${r.stderr}`);
  }
  const r = check('[x](docs/guide.md "T") and [y](docs/nowhere.md)\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /line 11: link target "docs\/nowhere\.md" does not exist/);
});

test('](target) is read only after link text that a [ no backslash escapes opens', () => {
  for (const line of [
    'foo](docs/nowhere.md)',
    '[x\\](docs/nowhere.md)',
    '\\[x](docs/nowhere.md)',
    '[x]y](docs/nowhere.md)',
    '[x](docs/guide.md) y](docs/nowhere.md)',
  ]) {
    const r = check(`${line}\n`);
    assert.equal(r.status, 0, `${line}\n${r.stderr}`);
  }
  for (const line of ['[x\\\\](docs/nowhere.md)', '[x\\]y](docs/nowhere.md)', '[a [b] c](docs/nowhere.md)']) {
    const r = check(`${line}\n`);
    assert.equal(r.status, 1, line);
    assert.match(r.stderr, /line 11: link target "docs\/nowhere\.md" does not exist/, line);
  }
});

test('link text that holds a link is not read as a link; an image\'s text may hold one', () => {
  for (const line of ['[a [b](docs/guide.md) c](docs/nowhere.md)', '[[b](docs/guide.md)](docs/nowhere.md)']) {
    const r = check(`${line}\n`);
    assert.equal(r.status, 0, `${line}\n${r.stderr}`);
  }
  for (const line of ['![a [b](docs/guide.md) c](docs/nowhere.md)', '[![b](docs/guide.md)](docs/nowhere.md)']) {
    const r = check(`${line}\n`);
    assert.equal(r.status, 1, line);
    assert.match(r.stderr, /line 11: link target "docs\/nowhere\.md" does not exist/, line);
  }
});

test('a [ or ] inside an autolink or raw HTML neither opens nor closes link text', () => {
  for (const line of [
    '[see <https://example.org/a]b> here](docs/nowhere.md)',
    '[a <b title="]"> c](docs/nowhere.md)',
    "[a <b title='\"]' data-x=a]b> c](docs/nowhere.md)",
    '[a <!-- ] --> b](docs/nowhere.md)',
    '[a <?x ] ?> b](docs/nowhere.md)',
    '[a <!DOCTYPE ]> b](docs/nowhere.md)',
    '[a <![CDATA[ ] ]]> b](docs/nowhere.md)',
  ]) {
    const r = check(`${line}\n`);
    assert.equal(r.status, 1, line);
    assert.match(r.stderr, /line 11: link target "docs\/nowhere\.md" does not exist/, line);
  }
  for (const line of [
    '<b title="[">x](docs/nowhere.md)',
    '<https://example.org/[>x](docs/nowhere.md)',
    '[a <b title="](docs/nowhere.md)">',
    '[a <b c=](docs/nowhere.md)>',
    // <!--> and <!---> are whole comments, so the ] after one closes the
    // link text.
    '[a <!-->] --> b](docs/nowhere.md)',
    '[a <!--->] --> b](docs/nowhere.md)',
  ]) {
    const r = check(`${line}\n`);
    assert.equal(r.status, 0, `${line}\n${r.stderr}`);
  }
  const wrapped = check('[a <b title="]">\nc](docs/nowhere.md)\n');
  assert.equal(wrapped.status, 1);
  assert.match(wrapped.stderr, /line 12: link target "docs\/nowhere\.md" does not exist/);
});

test('a < that opens no autolink or raw HTML on its line is text, so a ] after it closes link text', () => {
  for (const line of [
    '[a <b title="]" / > c](docs/nowhere.md)',
    '[a <a:x]y> c](docs/nowhere.md)',
    '[a \\<b title="]"> c](docs/nowhere.md)',
    '[a <!-- ] c](docs/nowhere.md)',
  ]) {
    const r = check(`${line}\n`);
    assert.equal(r.status, 0, `${line}\n${r.stderr}`);
  }
});

test('of a code span, an autolink and raw HTML, the one that starts first holds the others as text', () => {
  for (const line of [
    '[a <https://example.org/`]> c](docs/nowhere.md) `x`',
    '[a <b title="`]"> c](docs/nowhere.md) `x`',
    '<b `x` title="["> c](docs/nowhere.md)',
    '`<b title="`[x](docs/nowhere.md)">',
  ]) {
    const r = check(`${line}\n`);
    assert.equal(r.status, 1, line);
    assert.match(r.stderr, /line 11: link target "docs\/nowhere\.md" does not exist/, line);
  }
  const r = check('[a <b `x` title="]"> c](docs/nowhere.md)\n');
  assert.equal(r.status, 0, r.stderr);
});

test("an inline link's target or title may hold a backtick", () => {
  const target = check('[x](`docs/nowhere.md`)\n');
  assert.equal(target.status, 1);
  assert.ok(target.stderr.includes('line 11: link target "`docs/nowhere.md`" does not exist'), target.stderr);
  const title = check('[x](docs/guide.md "`") and [y](docs/nowhere.md "`")\n');
  assert.equal(title.status, 1);
  assert.match(title.stderr, /line 11: link target "docs\/nowhere\.md" does not exist/);
});

test('a 1 MB line of comment, processing instruction, CDATA and declaration openings that nothing closes is checked in under 2 seconds', () => {
  // Searched for from each opening, as a regular expression per opening
  // searches, the end of each one is read to the end of the line; on such a
  // line that did not finish in 20 seconds.
  const unit = '<!--<?<![CDATA[<!A';
  const line = unit.repeat(Math.ceil((1 << 20) / unit.length));
  const started = process.hrtime.bigint();
  const r = check(`${line}\n`);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(r.status, 0, r.stderr);
  assert.ok(ms < 2000, `${ms.toFixed(0)} ms for a line of ${line.length} characters`);
});

test('link text may wrap onto the next line of its paragraph, but not into another block', () => {
  for (const body of [
    'See the [release smoke\nguide](docs/nowhere.md).\n',
    '- See the [release smoke\n  guide](docs/nowhere.md).\n',
    '> See the [release smoke\n> guide](docs/nowhere.md).\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, /line 12: link target "docs\/nowhere\.md" does not exist/, body);
  }
  for (const body of [
    'See the [release smoke\n\nguide](docs/nowhere.md).\n',
    '## A [heading\nguide](docs/nowhere.md)\n',
    '| a | b |\n| - | - |\n| [c | d |\ne](docs/nowhere.md)\n',
    '- a [b\n- c](docs/nowhere.md)\n',
    '```\n[a\n```\nb](docs/nowhere.md)\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
});

test('link text does not wrap past a setext underline, a thematic break or an HTML block start', () => {
  for (const middle of ['---', '===', '***', '___', '- - -', '<div>', '</p>', '<!-- note -->', '<pre>', '> ---']) {
    const body = `[a\n${middle}\nb](docs/nowhere.md)\n`;
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // Link text that closes before the underline is still read, and a tag
  // that cannot interrupt a paragraph does not end it.
  for (const body of ['[a\nb](docs/nowhere.md)\n---\n', '[a\n<span>\nb](docs/nowhere.md)\n']) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, /link target "docs\/nowhere\.md" does not exist/, body);
  }
});

test('link text wraps past a line that 4 or more columns of indentation make paragraph text', () => {
  // A block that may end a paragraph starts after at most 3 columns of
  // indentation, and a tab moves on to column 4. <![cdata[ is not CDATA.
  for (const middle of ['    ---', '\t---', '    ***', '    ===', '    <div>', '    # h', '<![cdata[']) {
    const body = `[a\n${middle}\nb](docs/nowhere.md)\n`;
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, /line 13: link target "docs\/nowhere\.md" does not exist/, body);
  }
  const item = check('[a\n    - b](docs/nowhere.md)\n');
  assert.equal(item.status, 1);
  assert.match(item.stderr, /line 12: link target "docs\/nowhere\.md" does not exist/);
  for (const middle of ['   ---', '   ***', '   ===', '   <div>', '   # h', '<![CDATA[']) {
    const body = `[a\n${middle}\nb](docs/nowhere.md)\n`;
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  assert.equal(check('[a\n   - b](docs/nowhere.md)\n').status, 0);
});

test('indentation is counted from the text of the list item or block quote that holds the line', () => {
  // 6 spaces are 4 past the text of "- [a", and 4 spaces after "> " are 4
  // past the quote's text, so the --- is paragraph text there.
  for (const body of ['- [a\n      ---\n  b](docs/nowhere.md)\n', '> [a\n>     ---\n> b](docs/nowhere.md)\n']) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, /line 13: link target "docs\/nowhere\.md" does not exist/, body);
  }
  // The text of the inner item starts in column 4, so 4 spaces and --- end
  // its paragraph, as 3 spaces after "> " end a quoted one.
  for (const body of ['- x\n  - [a\n    ---\n    b](docs/nowhere.md)\n', '> [a\n>    ---\n> b](docs/nowhere.md)\n']) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // A list item with nothing on its first line ends at a blank line, so the
  // paragraph after it is not in the item and its --- is 4 columns in.
  const r = check('-\n\n  [a\n    ---\n  b](docs/nowhere.md)\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /line 15: link target "docs\/nowhere\.md" does not exist/);
});

test('a block quote ends the paragraph above it, and a line after a quoted paragraph continues it', () => {
  for (const body of ['[a\n> b](docs/nowhere.md)\n', '> [a\n> > b](docs/nowhere.md)\n', '- [a\n  > b](docs/nowhere.md)\n']) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // A line of paragraph text continues the paragraph without the > or the
  // indentation of the block that holds it.
  for (const body of ['> [a\nb](docs/nowhere.md)\n', '> > [a\n> b](docs/nowhere.md)\n', '- [a\nb](docs/nowhere.md)\n']) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, /line 12: link target "docs\/nowhere\.md" does not exist/, body);
  }
});

test('a list item ends a paragraph only when it holds text and, if ordered, starts at 1', () => {
  for (const body of ['[a\n2. b](docs/nowhere.md)\n', '[a\n10) b](docs/nowhere.md)\n']) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, /line 12: link target "docs\/nowhere\.md" does not exist/, body);
  }
  const empty = check('[a\n+ \nb](docs/nowhere.md)\n');
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /line 13: link target "docs\/nowhere\.md" does not exist/);
  // A line that does not continue the block quote holding the paragraph
  // starts a list at any number.
  for (const body of ['[a\n1. b](docs/nowhere.md)\n', '[a\n- b](docs/nowhere.md)\n', '> [a\n2. b](docs/nowhere.md)\n']) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
});

test('link text does not wrap past an empty ATX heading or an underline that \\r\\n ends, or between lines of indented code', () => {
  for (const body of ['[a\n#\nb](docs/nowhere.md)\n', '[a\r\n---\r\nb](docs/nowhere.md)\r\n', '    code [a\n    b](docs/nowhere.md)\n']) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  const r = check('[a\r\nb](docs/nowhere.md)\r\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /line 12: link target "docs\/nowhere\.md" does not exist/);
});

test('a line of ***, --- or ___ and 100,000 spaces or tabs before text is checked in under 2 seconds', () => {
  // The spaces and tabs could be split between the last mark and a [ \t]*
  // after the marks in every way: these three lines took 12.9 seconds.
  const lines = ['***' + ' '.repeat(100000) + 'x', '---' + '\t'.repeat(100000) + 'x', '___' + '\t'.repeat(100000) + 'x'];
  const started = process.hrtime.bigint();
  const r = check(`${lines.join('\n\n')}\n`);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(r.status, 0, r.stderr);
  assert.ok(ms < 2000, `${ms.toFixed(0)} ms for three lines of ${lines[0].length} characters`);
});

test('a line of 50,000 list markers before text is checked in under 2 seconds', () => {
  // A thematic break was tried at each list marker and read to the end of
  // the line before it failed: these four lines took 41.5 seconds.
  const lines = ['- '.repeat(50000) + 'x', '* '.repeat(50000) + 'x', '-\t'.repeat(50000) + 'x', '- '.repeat(50000) + 'x - - -'];
  const started = process.hrtime.bigint();
  const r = check(`${lines.join('\n\n')}\n`);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(r.status, 0, r.stderr);
  assert.ok(ms < 2000, `${ms.toFixed(0)} ms for four lines of ${lines[0].length} characters`);
});

test('a line that goes on with 50,000 list items through 100,000 spaces or 50,000 tabs is checked in under 2 seconds', () => {
  // The spaces and tabs before the text were read again for each list item
  // that the line went on with: these two pairs of lines took 15.7 seconds.
  const pairs = ['+ '.repeat(50000) + 'x\n' + ' '.repeat(100000) + 'y', '-\t'.repeat(50000) + 'x\n' + '\t'.repeat(50000) + 'y'];
  const started = process.hrtime.bigint();
  const r = check(`${pairs.join('\n\n')}\n`);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(r.status, 0, r.stderr);
  assert.ok(ms < 2000, `${ms.toFixed(0)} ms for two pairs of lines`);
});

test('a definition on its own line inside a list item is checked; one on the list marker\'s line is not', () => {
  const r = check('- item\n\n  [x]: docs/nowhere.md\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /line 13: link target "docs\/nowhere\.md" does not exist/);
  assert.equal(check('- [x]: docs/nowhere.md\n').status, 0);
});

test('a link path or anchor with a malformed %-escape is named by its line, with no stack trace', () => {
  const r = check('See [the plan](100%.md) and [setup](docs/guide.md#100%).\n', {
    'docs/how-it-works.md': '# How it works\n\nSee [the plan](100%.md) and [here](#50%off).\n',
  });
  assert.equal(r.status, 1);
  assert.deepEqual(r.stderr.trim().split('\n'), [
    'README: line 11: link target "100%.md" has a malformed %-escape; write a literal % as %25.',
    `README: line 11: anchor "#100%" has a malformed %-escape; a heading's anchor has no %, so drop the % and link a heading in docs/guide.md.`,
    'README: docs/how-it-works.md line 3: link target "100%.md" has a malformed %-escape; write a literal % as %25.',
    `README: docs/how-it-works.md line 3: anchor "#50%off" has a malformed %-escape; a heading's anchor has no %, so drop the % and link a heading in docs/how-it-works.md.`,
  ]);
});

test('an anchor with a malformed %-escape is told the anchor of the heading it names, and that anchor passes', () => {
  const heading = '## 100% coverage\n\n## Café 100%\n\n';
  const r = check(heading + 'See [x](#100%-coverage) and [y](#caf%C3%A9-100%).\n');
  assert.equal(r.status, 1);
  assert.deepEqual(r.stderr.trim().split('\n'), [
    `README: line 15: anchor "#100%-coverage" has a malformed %-escape; a heading's anchor has no %, so write "#100-coverage".`,
    `README: line 15: anchor "#caf%C3%A9-100%" has a malformed %-escape; a heading's anchor has no %, so write "#caf%C3%A9-100".`,
  ]);
  // Writing the % as %25 names no heading, since a heading's anchor has no %.
  const escaped = check(heading + 'See [x](#100%25-coverage).\n');
  assert.equal(escaped.status, 1);
  assert.match(escaped.stderr, /anchor "#100%25-coverage" has no matching heading in README\.md/);
  const advised = check(heading + 'See [x](#100-coverage) and [y](#caf%C3%A9-100).\n');
  assert.equal(advised.status, 0, advised.stderr);
});

test('a link that writes a literal % as %25 resolves', () => {
  const r = check('See [the plan](docs/100%25.md).\n', { 'docs/100%.md': '# Plan\n' });
  assert.equal(r.status, 0, r.stderr);
});

test('an anchor in a link to a directory whose name ends in .md is named by its line, with no stack trace', () => {
  const pages = { 'x.md/README.md': '# X\n\n## Setup\n' };
  const r = check('See [a](x.md#100%) and [b](x.md#setup).\n', pages);
  assert.equal(r.status, 1);
  assert.deepEqual(r.stderr.trim().split('\n'), [
    'README: line 11: link target "x.md#100%" is a directory, so its anchor names no heading; link the page in x.md that holds the heading.',
    'README: line 11: link target "x.md#setup" is a directory, so its anchor names no heading; link the page in x.md that holds the heading.',
  ]);
  const advised = check('See [a](x.md/README.md#setup) and [b](x.md).\n', pages);
  assert.equal(advised.status, 0, advised.stderr);
});

const RECALL_ONLY_FAILURE = /the Scanner Benchmark is offered for comparing products without calling it a recall-only comparison/;

test('a paragraph that offers the Scanner Benchmark for comparing products fails until it says recall-only', () => {
  const offer =
    '> For a detection comparison across products,\n' +
    '> use the [benchmark](#skills-security-benchmark) below.\n\n' +
    '## Skills Security Benchmark\n';
  const r = check(offer);
  assert.equal(r.status, 1);
  assert.match(r.stderr, new RegExp(`line 11: ${RECALL_ONLY_FAILURE.source}`));
  const fixed = check(offer.replace('a detection comparison', 'a recall-only comparison'));
  assert.equal(fixed.status, 0, fixed.stderr);
});

test('each wording of a comparison between products is read', () => {
  for (const offer of [
    'The Scanner Benchmark gives cross-product detection numbers.\n',
    'For an apples-to-apples comparison, use the Skills Security Benchmark.\n',
    'The Scanner Benchmark compares results between scanners.\n',
    '| Comparing results across products | Scanner Benchmark |\n',
    '### Comparing products across scanners with the Scanner Benchmark\n',
  ]) {
    const r = check(offer);
    assert.equal(r.status, 1, `not read: ${offer}`);
    assert.match(r.stderr, RECALL_ONLY_FAILURE);
  }
});

test('the Scanner Benchmark and a product comparison in different blocks pass', () => {
  const r = check(
    'The Scanner Benchmark scores scanners.\n\n' +
      'Compare results across products elsewhere.\n\n' +
      '| Scanner Benchmark | 270 samples |\n' +
      '| Across products | n/a |\n\n' +
      '> The Scanner Benchmark is below.\n>\n> Compare across products with care.\n\n' +
      '```md\nThe Scanner Benchmark compares results across products.\n```\n\n' +
      'Write `Scanner Benchmark across products` in code.\n',
  );
  assert.equal(r.status, 0, r.stderr);
});

test('the recall-only check ends a code span at the next run of as many backticks', () => {
  // A single backtick inside a two-backtick span does not end it, so the
  // text after the span is read and the text inside it is not.
  const after = check('Run ``a ` b``; the Scanner Benchmark compares results across scanners, see `y`.\n');
  assert.equal(after.status, 1, 'the text after ``a ` b`` is not read');
  assert.match(after.stderr, new RegExp(`line 11: ${RECALL_ONLY_FAILURE.source}`));
  const inside = check('Write ``Scanner Benchmark `x` across products`` in code.\n');
  assert.equal(inside.status, 0, inside.stderr);
});

test("this repository's README offers the Scanner Benchmark only as a recall-only comparison", () => {
  const r = spawnSync(process.execPath, [script, '--no-counts', join(repo, 'README.md')], { encoding: 'utf8' });
  assert.doesNotMatch(r.stderr, RECALL_ONLY_FAILURE);
  assert.equal(r.status, 0, r.stderr);
});

// A page whose file name carries a date, linked from line 11 of the README,
// with the given text above its first H2 and a count of that day below it.
const DATED_LINK = 'For the audit, see [docs/AUDIT-2026-06-03.md](docs/AUDIT-2026-06-03.md).\n';
const datedPage = (intro) => ({
  'docs/AUDIT-2026-06-03.md': `# Audit\n\n${intro}\n## Counts\n\n| npm test total | 245 |\n`,
});
const DATED = /^README: line 11: "docs\/AUDIT-2026-06-03\.md" is a dated page, so above its first H2 it must /m;

test('a dated page the README links fails until it says "as of" its date and links to the README', () => {
  const bare = check(DATED_LINK, datedPage('Every count in this document is measured from `npm test`.\n'));
  assert.equal(bare.status, 1);
  assert.match(bare.stderr, DATED);
  assert.match(
    bare.stderr,
    /it must say "as of 2026-06-03" and link to the README for the current figures; its counts are those of 2026-06-03 and are not compared with the suite\./,
  );

  const noLink = check(DATED_LINK, datedPage('> **As of 2026-06-03.** See the README for current counts.\n'));
  assert.equal(noLink.status, 1);
  assert.match(noLink.stderr, /it must link to the README for the current figures; /);

  const otherDate = check(DATED_LINK, datedPage('> As of 2026-06-05, see the [README](../README.md).\n'));
  assert.equal(otherDate.status, 1);
  assert.match(otherDate.stderr, /it must say "as of 2026-06-03"; /);

  const otherPage = check(DATED_LINK, datedPage('> As of 2026-06-03. See the [guide](guide.md) for current counts.\n'));
  assert.equal(otherPage.status, 1);
  assert.match(otherPage.stderr, /it must link to the README for the current figures; /);

  const belowTheCounts = check(DATED_LINK, {
    'docs/AUDIT-2026-06-03.md':
      '# Audit\n\n## Counts\n\n| npm test total | 245 |\n\nAs of 2026-06-03; see the [README](../README.md).\n',
  });
  assert.equal(belowTheCounts.status, 1);
  assert.match(belowTheCounts.stderr, DATED);
});

test('a dated page is reported once, at the first line that links it', () => {
  const r = check(DATED_LINK + '\n' + DATED_LINK, datedPage('Measured from `npm test`.\n'));
  assert.equal(r.status, 1);
  assert.equal(r.stderr.match(/is a dated page/g).length, 1, r.stderr);
  assert.match(r.stderr, DATED);
});

test('a directory whose name carries a date and ends in .md is not read as a dated page', () => {
  const r = check(DATED_LINK, { 'docs/AUDIT-2026-06-03.md/README.md': '# Audit\n' });
  assert.equal(r.status, 0, r.stderr);
});

test('a dated page that says "as of" its date and links to the README passes, on one line or wrapped', () => {
  const oneLine = check(
    DATED_LINK,
    datedPage('> **As of 2026-06-03.** For current counts see the [README](../README.md#quick-start).\n'),
  );
  assert.equal(oneLine.status, 0, oneLine.stderr);

  const wrapped = check(
    DATED_LINK,
    datedPage('> The counts below are as of\n> 2026-06-03 and are kept as recorded; the\n> [README](../README.md) has the current ones.\n'),
  );
  assert.equal(wrapped.status, 0, wrapped.stderr);
});

test('a note inside a code block or inline code does not mark a dated page', () => {
  const r = check(
    DATED_LINK,
    datedPage('```md\n> As of 2026-06-03, see the [README](../README.md).\n```\n\nWrite `as of 2026-06-03` and `[README](../README.md)`.\n'),
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr, /it must say "as of 2026-06-03" and link to the README for the current figures; /);
});

test('the dated pages this repository\'s README and the pages that took its text link say "as of" their date and link to the README', () => {
  const gaps = readFileSync(join(repo, 'docs', 'known-gaps.md'), 'utf8');
  assert.match(gaps, /\]\(AUDIT-2026-06-03\.md\)/, 'docs/known-gaps.md no longer links the 2026-06-03 audit');
  const r = spawnSync(process.execPath, [script, '--no-counts', join(repo, 'README.md')], { encoding: 'utf8' });
  assert.doesNotMatch(r.stderr, /is a dated page/);
  assert.equal(r.status, 0, r.stderr);
});

test('a dated page linked from a page that took README text is checked, and named by that page', () => {
  const r = check('See [the gaps](docs/known-gaps.md).\n', {
    'docs/known-gaps.md': '# Gaps\n\nThe audit: [audit](AUDIT-2026-06-03.md).\n',
    ...datedPage('The audit of that day.\n'),
  });
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    /^README: docs\/known-gaps\.md line 3: "AUDIT-2026-06-03\.md" is a dated page, so above its first H2 it must say "as of 2026-06-03" and link to the README for the current figures; /m,
  );
});

test('a link on a page that took README text resolves from that page', () => {
  const r = check('See [the catalog](docs/test-catalog.md).\n', {
    'docs/test-catalog.md': '# Catalog\n\n[guide](guide.md#setup-steps), [README](../README.md#guide), [missing](nope.md) and [here](#nowhere).\n',
  });
  assert.equal(r.status, 1);
  assert.deepEqual(r.stderr.trim().split('\n'), [
    'README: docs/test-catalog.md line 3: link target "nope.md" does not exist.',
    'README: docs/test-catalog.md line 3: anchor "#nowhere" has no matching heading in docs/test-catalog.md.',
  ]);
});

test('a link on a page a link leads to resolves from that page, as do the links on the pages it leads to', () => {
  const pages = {
    'CONTRIBUTING.md': '# Contributing\n\nRead the [guide](docs/guide.md#setup-steps), the [scenarios](corpus/) and [what is next](docs/next.md).\n',
    'docs/next.md': '# Next\n\n[README](../README.md#guide), [back](../CONTRIBUTING.md), [missing](gone.md) and [here](#nowhere).\n',
  };
  const r = check('See [contributing](CONTRIBUTING.md).\n', pages);
  assert.equal(r.status, 1);
  assert.deepEqual(r.stderr.trim().split('\n'), [
    'README: CONTRIBUTING.md line 3: link target "corpus/" does not exist.',
    'README: docs/next.md line 3: link target "gone.md" does not exist.',
    'README: docs/next.md line 3: anchor "#nowhere" has no matching heading in docs/next.md.',
  ]);
  const fixed = check('See [contributing](CONTRIBUTING.md).\n', {
    'CONTRIBUTING.md': pages['CONTRIBUTING.md'].replace('(corpus/)', '(https://example.com/oasb/tree/main/corpus)'),
    'docs/next.md': '# Next\n\n[README](../README.md#guide), [back](../CONTRIBUTING.md) and [here](#next).\n',
  });
  assert.equal(fixed.status, 0, fixed.stderr);
});

// A test that gives a page mode 000 is skipped where such a page can still be
// read: as root, and on Windows.
const MODE_000 = { skip: (process.platform === 'win32' || process.getuid?.() === 0) && 'a file with mode 000 can still be read here' };

test(
  'a page a link leads to that the check cannot read is named, with no stack trace',
  MODE_000,
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-readme-'));
    try {
      writeFileSync(join(dir, 'README.md'), HEAD + 'See [contributing](CONTRIBUTING.md).\n');
      writeFileSync(join(dir, 'CONTRIBUTING.md'), '# Contributing\n');
      chmodSync(join(dir, 'CONTRIBUTING.md'), 0o000);
      const r = spawnSync(process.execPath, [script, '--no-counts', join(dir, 'README.md')], { encoding: 'utf8' });
      assert.equal(r.status, 1);
      assert.equal(r.stderr.trim(), 'README: cannot read CONTRIBUTING.md, a page a link leads to: EACCES: permission denied');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

const cannotRead = (path) => `README: cannot read ${path}, a page a link leads to: EACCES: permission denied`;

test('a page an anchored link leads to that the check cannot read is named once, as without the anchor, with no stack trace', MODE_000, () => {
  const contributing = { 'CONTRIBUTING.md': '# Contributing\n' };
  for (const body of [
    'See [contributing](CONTRIBUTING.md#contributing).\n',
    'See [contributing](CONTRIBUTING.md#contributing) and [how to help](CONTRIBUTING.md).\n',
  ]) {
    const r = check(body, contributing, ['CONTRIBUTING.md']);
    assert.equal(r.status, 1, body);
    assert.equal(r.stderr.trim(), cannotRead('CONTRIBUTING.md'), body);
  }

  const fromPage = check(
    'See [contributing](CONTRIBUTING.md).\n',
    { 'CONTRIBUTING.md': '# Contributing\n\nRead [what is next](docs/next.md#next).\n', 'docs/next.md': '# Next\n' },
    ['docs/next.md'],
  );
  assert.equal(fromPage.status, 1);
  assert.equal(fromPage.stderr.trim(), cannotRead('docs/next.md'));

  // The malformed %-escape is reported too; the advice cannot name a heading.
  const malformed = check('See [contributing](CONTRIBUTING.md#100%-done).\n', contributing, ['CONTRIBUTING.md']);
  assert.equal(malformed.status, 1);
  assert.deepEqual(malformed.stderr.trim().split('\n'), [
    cannotRead('CONTRIBUTING.md'),
    'README: line 11: anchor "#100%-done" has a malformed %-escape; a heading\'s anchor has no %, so drop the % and link a heading in CONTRIBUTING.md.',
  ]);
});

test('a dated page the check cannot read is named once, with no stack trace', MODE_000, () => {
  const r = check(DATED_LINK, datedPage('Measured from `npm test`.\n'), ['docs/AUDIT-2026-06-03.md']);
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), cannotRead('docs/AUDIT-2026-06-03.md'));
});

test('a page the MITRE ATLAS Coverage section links to that the check cannot read is named once, with no stack trace', MODE_000, () => {
  const readme = withAtlas('| Exfiltration via Cyber Means | AML.T0025 | AT-NET-001 |', ' Detail: [mapping](docs/atlas.md).');
  const r = checkCounts(readme, SUITE, report(SUITE), withPage('| E2E-003 | Outbound TCP |'), script, ['docs/atlas.md']);
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), cannotRead('docs/atlas.md'));
});

const cannotReadMoved = (path) => `README: cannot read ${path}, a page that took text from the README: EACCES: permission denied`;
const ADAPTERS = { 'docs/adapters.md': '# Adapters\n' };

test('a page that took README text and that the check cannot read is named once, also when the README links it', MODE_000, () => {
  for (const body of [
    'See the adapter guide.\n',
    'See [adapters](docs/adapters.md).\n',
    'See [adapters](docs/adapters.md#adapters).\n',
    'See [adapters](docs/adapters.md#adapters) and [how to write one](docs/adapters.md).\n',
  ]) {
    const r = check(body, ADAPTERS, ['docs/adapters.md']);
    assert.equal(r.status, 1, body);
    assert.equal(r.stderr.trim(), cannotReadMoved('docs/adapters.md'), body);
  }
});

test('a page that took README text and that the check cannot read is named once when another page that took its text, or a page a link leads to, links it', MODE_000, () => {
  const r = check(
    'See [contributing](CONTRIBUTING.md).\n',
    {
      ...ADAPTERS,
      'docs/how-it-works.md': '# How it works\n\nSee [adapters](adapters.md).\n',
      'CONTRIBUTING.md': '# Contributing\n\nRead [adapters](docs/adapters.md#adapters).\n',
    },
    ['docs/adapters.md'],
  );
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), cannotReadMoved('docs/adapters.md'));
});

test('a page that took README text and that the check cannot read is named once when the MITRE ATLAS Coverage section links it', MODE_000, () => {
  const readme = withAtlas('| Exfiltration via Cyber Means | AML.T0025 | AT-NET-001 |', ' Detail: [mapping](docs/mitre-atlas-mapping.md).');
  const sources = { ...SOURCES, 'docs/mitre-atlas-mapping.md': '# Mapping\n' };
  const r = checkCounts(readme, SUITE, report(SUITE), sources, script, ['docs/mitre-atlas-mapping.md']);
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), cannotReadMoved('docs/mitre-atlas-mapping.md'));
});

test('a page that took README text offers the Scanner Benchmark only as a recall-only comparison', () => {
  const page = (text) => check('See [adapters](docs/adapters.md).\n', { 'docs/adapters.md': `# Adapters\n\n${text}\n` });
  const offered = page('The Scanner Benchmark compares results across products.');
  assert.equal(offered.status, 1);
  assert.match(offered.stderr, /^README: docs\/adapters\.md line 3: the Scanner Benchmark is offered for comparing products without calling it a recall-only comparison\./m);
  assert.equal(page('The Scanner Benchmark gives a recall-only comparison across products.').status, 0);
});

test('the counts and the What Gets Tested table on a page that took README text are compared with the suite', () => {
  const at = COUNTED.indexOf('## What Gets Tested');
  const readme = COUNTED.slice(0, at);
  const catalog = COUNTED.slice(at);
  const ok = checkCounts(readme, SUITE, report(SUITE), { ...SOURCES, 'docs/test-catalog.md': catalog });
  assert.equal(ok.status, 0, ok.stderr);
  const bad = checkCounts(readme, SUITE, report(SUITE), {
    ...SOURCES,
    'docs/test-catalog.md': catalog.replace('| Pinned benchmark harness tests | 3 |', '| Pinned benchmark harness tests | 4 |').replace('Of the 10 tests', 'Of the 11 tests'),
  });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^README: docs\/test-catalog\.md line 13: the "Pinned benchmark harness tests" row says 4; the test report has 3 tests in src\/benchmark\/pinned\.$/m);
  assert.match(bad.stderr, /^README: docs\/test-catalog\.md line 18: the MITRE ATLAS Coverage line says 11; the test report has 10 attack-scenario tests /m);
  const gone = checkCounts(readme, SUITE, report(SUITE), SOURCES);
  assert.equal(gone.status, 1);
  assert.match(gone.stderr, /^README: the "What Gets Tested" table was not found; /m);
  assert.match(gone.stderr, /^README: the MITRE ATLAS Coverage line \(.*\) was not found; /m);
});

// The README a library install holds in node_modules resolves its relative
// links against the files of the package, not the repository. npm pack writes
// the package as npm publish does, and the check runs on the README in it, so
// each link the check reads there, on the README, on the pages that took its
// text and on the pages a link leads to, such as CONTRIBUTING.md, must
// resolve to a file the package holds.
test('each relative link the check reads in the packed package resolves to a file in the package', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-readme-pack-'));
  try {
    const pack = spawnSync('npm', ['pack', '--json', '--pack-destination', dir], { cwd: repo, encoding: 'utf8' });
    assert.equal(pack.status, 0, `npm pack exited ${pack.status}:\n${pack.stderr}`);
    const tarball = join(dir, JSON.parse(pack.stdout)[0].filename);
    const untar = spawnSync('tar', ['-xzf', tarball, '-C', dir], { encoding: 'utf8' });
    assert.equal(untar.status, 0, `tar exited ${untar.status}:\n${untar.stderr}`);
    assert.match(readFileSync(join(dir, 'package', 'README.md'), 'utf8'), /\]\(CONTRIBUTING\.md\)/, 'the README no longer links CONTRIBUTING.md');
    const r = spawnSync(process.execPath, [script, '--no-counts', join(dir, 'package', 'README.md')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The tests in scripts/ are not vitest tests, so `npm test` reaches them
// through its pretest script, and the CI job reaches them through `npm test`.
const npmScripts = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).scripts;

test('npm run test:scripts runs every test file in scripts/', () => {
  const run = npmScripts['test:scripts'].split(' ');
  const files = readdirSync(join(repo, 'scripts')).filter((name) => name.endsWith('.test.mjs'));
  assert.ok(files.includes('check-readme.test.mjs'), `scripts/ was not read: ${files.join(', ')}`);
  for (const name of files) {
    assert.ok(run.includes(`scripts/${name}`), `npm run test:scripts does not run scripts/${name}`);
  }
});

test('npm test runs the tests in scripts/ before the suite, and the CI job runs npm test', () => {
  assert.equal(
    npmScripts.pretest,
    'npm run test:scripts',
    'npm test does not run the tests in scripts/: its pretest script is not "npm run test:scripts"',
  );
  const ci = readFileSync(join(repo, '.github', 'workflows', 'ci.yml'), 'utf8');
  const steps = ci.split('\n').filter((line) => /^ +run: npm test( |$)/.test(line) && !line.includes('--ignore-scripts'));
  assert.notDeepEqual(steps, [], 'no step of the CI job runs npm test with its pretest script');
});

test('npm run smoke runs the tests in scripts/ through npm run test:scripts, not a list of its own', () => {
  const lines = readFileSync(join(repo, 'scripts', 'release-smoke.sh'), 'utf8').split(/\r?\n/);
  assert.ok(lines.includes('npm run test:scripts'), 'scripts/release-smoke.sh does not run npm run test:scripts');
  const own = lines.filter((line) => /^\s*node --test\b/.test(line));
  assert.deepEqual(own, [], 'scripts/release-smoke.sh names test files itself; npm run test:scripts is the one list');
});

test('docs/testing/release-smoke.md lists every file npm run test:scripts runs', () => {
  const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  const files = pkg.scripts['test:scripts'].split(/\s+/).filter((arg) => arg.endsWith('.test.mjs'));
  assert.notDeepEqual(files, [], 'npm run test:scripts names no test file');
  const guide = readFileSync(join(repo, 'docs', 'testing', 'release-smoke.md'), 'utf8');
  const section = /^## The tests in `scripts\/`$([\s\S]*?)(?=^## )/m.exec(guide);
  assert.ok(section, 'docs/testing/release-smoke.md has no "## The tests in `scripts/`" section');
  const unlisted = files.filter((f) => !section[1].includes(`\`${f}\``));
  assert.deepEqual(unlisted, [], 'docs/testing/release-smoke.md does not list these files under "The tests in `scripts/`"');
});
