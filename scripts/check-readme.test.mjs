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

test('a ## line of a fenced code block or of an HTML block does not end the MITRE ATLAS Coverage section, and a ## line outside one does', () => {
  // CommonMark reads the ## line as code in a fenced code block, and as raw
  // HTML in a block that <div> opens, up to a blank line, so the table and
  // the link below the block are still in the section. withAtlas() puts the
  // row at line 45; the four lines added after the heading move it to 49.
  const below = (block, readme) => readme.replace('## MITRE ATLAS Coverage\n', `## MITRE ATLAS Coverage\n\n${block}`);
  const listed = withAtlas('| Exfiltration via Cyber Means | AML.T0025 | AT-NET-001, E2E-003 |');
  const linked = withAtlas('| Exfiltration via Cyber Means | AML.T0025 | AT-NET-001 |', ' Detail: [mapping](docs/atlas.md).');
  const page = withPage('| E2E-003 | Outbound TCP |');
  for (const block of ['<div>\n## Note\n</div>\n', '```bash\n## Note\n```\n']) {
    let r = checkCounts(below(block, listed));
    assert.equal(r.status, 1, block);
    assert.equal(r.stderr.trim(), `README: line 49: ${SKIPPED_E2E_003}`, block);
    r = checkCounts(below(block, linked), SUITE, report(SUITE), page);
    assert.equal(r.status, 1, block);
    assert.equal(r.stderr.trim(), `README: docs/atlas.md line 6: ${SKIPPED_E2E_003}`, block);
  }
  // An H2 ends the section, so what is below it is not read.
  let r = checkCounts(below('## Note\n', listed));
  assert.equal(r.status, 0, r.stderr);
  r = checkCounts(below('## Note\n', linked), SUITE, report(SUITE), page);
  assert.equal(r.status, 0, r.stderr);
});

// CommonMark reads a ## line as code in a fenced code block, and as raw HTML
// in a block that <!-- opens, up to the line that holds -->, or in one that
// <div> opens, up to a blank line, so the section starts at the heading
// below the block, and the table and the link below that heading are in it.
// withAtlas() puts the row at line 45; the block and the blank line after
// it, added before the heading, move it to 49.
for (const [kind, block] of [
  ['a block that <!-- opens', '<!--\n## MITRE ATLAS Coverage\n-->\n'],
  ['a block that <div> opens', '<div>\n## MITRE ATLAS Coverage\n</div>\n'],
  ['a fenced code block', '```markdown\n## MITRE ATLAS Coverage\n```\n'],
]) {
  test(`a ## MITRE ATLAS Coverage line of ${kind} does not start the MITRE ATLAS Coverage section`, () => {
    const before = (readme) => readme.replace('## MITRE ATLAS Coverage\n', `${block}\n## MITRE ATLAS Coverage\n`);
    let r = checkCounts(before(withAtlas('| Exfiltration via Cyber Means | AML.T0025 | AT-NET-001, E2E-003 (skipped) |')));
    assert.equal(r.status, 0, r.stderr);
    r = checkCounts(before(withAtlas('| Exfiltration via Cyber Means | AML.T0025 | AT-NET-001, E2E-003 |')));
    assert.equal(r.status, 1);
    assert.equal(r.stderr.trim(), `README: line 49: ${SKIPPED_E2E_003}`);
    const linked = withAtlas('| Exfiltration via Cyber Means | AML.T0025 | AT-NET-001 |', ' Detail: [mapping](docs/atlas.md).');
    r = checkCounts(before(linked), SUITE, report(SUITE), withPage('| E2E-003 | Outbound TCP |'));
    assert.equal(r.status, 1);
    assert.equal(r.stderr.trim(), `README: docs/atlas.md line 6: ${SKIPPED_E2E_003}`);
  });
}

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

test('link text wraps past a line that starts with | when no delimiter row makes it a table header', () => {
  for (const body of [
    'see [the\n|guide| page](docs/nowhere.md)\n',
    '> see [the\n> | guide | page](docs/nowhere.md)\n',
    // A delimiter row with a different number of cells does not start a table.
    'see [the\n| guide | page](docs/nowhere.md)\n| - |\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, /line 12: link target "docs\/nowhere\.md" does not exist/, body);
  }
  // A link that opens on a | line that is paragraph text wraps onto the next line.
  const opened = check('| see [the\nguide](docs/nowhere.md) |\n');
  assert.equal(opened.status, 1);
  assert.match(opened.stderr, /line 12: link target "docs\/nowhere\.md" does not exist/);
  // With a delimiter row, the | line is a table header and the rows below are table rows.
  for (const body of ['[a\n| t |\n| - |\nb](docs/nowhere.md)\n', '[a\n|t|u|\n|:-|-:|\n| [c | d |\ne](docs/nowhere.md)\n']) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
});

test('the lines of a table are table rows whether or not they start with |, up to the line that ends the table', () => {
  // markdown-it 14.1.1 and micromark 4.0.3 with micromark-extension-gfm-table
  // 2.1.2 render none of these with a link: the header row, the delimiter
  // row or a body row does not start with |, and the lines after it are
  // still rows of the table, so link text does not run on from one row to
  // the next. A header row ends the paragraph above it.
  for (const body of [
    '| t | u |\n--- | ---\n| [c | d |\ne](docs/nowhere.md)\n',
    't | u\n|---|---|\n| [c | d |\ne](docs/nowhere.md)\n',
    'a | b\n-|-\n| [c | d |\ne](docs/nowhere.md)\n',
    'a | b\n:-: | --:\n| [c | d |\ne](docs/nowhere.md)\n',
    '| bar | baz |\n| - | - |\n| bar | baz |\nbar\n| [c | d |\ne](docs/nowhere.md)\n',
    '[a\nt | u\n--- | ---\nb](docs/nowhere.md)\n',
    '> a | b\n> -|-\n> [c\n> d](docs/nowhere.md)\n',
    '- a | b\n  -|-\n  [c\n  d](docs/nowhere.md)\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // Both render each of these with a link to docs/nowhere.md: a code span
  // does not run on from one row to the next; a line that opens a block
  // quote or list item, or leaves the block quote that holds the table,
  // ends it; a line that goes on with a block quote's paragraph lazily is
  // not a header row; and a delimiter row that opens a list item (- | -),
  // is indented 4 columns, opens a block quote the header row is not in, or
  // is a setext underline (-), or a header row indented 4 columns that goes
  // on with a paragraph, starts no table.
  for (const [body, n] of [
    ['| a | b |\n--- | ---\n| `c | d |\n| [e](docs/nowhere.md) | f` |\n', 14],
    ['| a |\n| - |\n> | [b |\n> c](docs/nowhere.md)\n', 14],
    ['| a |\n| - |\n- | [b |\n  c](docs/nowhere.md)\n', 14],
    ['| a |\n| - |\n- [b\n  c](docs/nowhere.md)\n', 14],
    ['> | a |\n> | - |\n| [b |\nc](docs/nowhere.md)\n', 14],
    ['> foo\n| a | b |\n| - | - |\n[c\nd](docs/nowhere.md)\n', 15],
    ['| a | b |\n- | -\n| [c |\nd](docs/nowhere.md)\n', 14],
    ['| a | b |\n    --- | ---\n| [c |\nd](docs/nowhere.md)\n', 14],
    ['| a | b |\n> | - | - |\n| [c | d |\ne](docs/nowhere.md)\n', 14],
    ['| a |\n-\n| [b |\nc](docs/nowhere.md)\n', 14],
    ['foo\n    a | b\n-|-\n[c\nd](docs/nowhere.md)\n', 15],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`line ${n}: link target "docs/nowhere\\.md" does not exist`), body);
  }
});

test("a line that goes on with a list item's paragraph lazily is a table header row when a delimiter row in the list item follows it, and one that leaves out a block quote marker is paragraph text", () => {
  // markdown-it 14.1.0 and micromark 4.0.2 with micromark-extension-gfm-table
  // 2.1.1 render each of these with a link to docs/nowhere.md: the header
  // row goes on with the list item's paragraph lazily, without the item's
  // indentation, and the delimiter row is in the list item, indented by
  // the item's width or by up to 2 columns more, so the code span opened
  // in the paragraph does not run on into the row. The header row need not
  // start with |.
  for (const [body, n] of [
    ['- see `x\n| [y](docs/nowhere.md) | z` |\n  |---|---|\n', 12],
    ['1. see `x\n| [y](docs/nowhere.md) | z` |\n   |---|---|\n', 12],
    ['- see `x\n| [y](docs/nowhere.md) | z` |\n   |---|---|\n', 12],
    ['- see `x\n| [y](docs/nowhere.md) | z` |\n    |---|---|\n', 12],
    ['> - see `x\n> | [y](docs/nowhere.md) | z` |\n>   |---|---|\n', 12],
    ['- a\n  - see `x\n  | [y](docs/nowhere.md) | z` |\n    |---|---|\n', 13],
    ['- see `x\n| [y](docs/nowhere.md) | z` |\n  | --- | --- |\n  | c | d |\n', 12],
    ['- see `x\n[y](docs/nowhere.md) | z`\n  ---|---\n', 12],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`line ${n}: link target "docs/nowhere\\.md" does not exist`), body);
  }
  // Both render none of these with a link: link text opened in the
  // paragraph does not run on into the header row; and a delimiter row
  // that leaves the list item, or holds fewer cells than the header row,
  // starts no table, so the code span runs on through the | line.
  for (const body of [
    '- see [the\n| docs](docs/nowhere.md) | z |\n  |---|---|\n',
    '- see `x\n| [y](docs/nowhere.md) | z` |\n|---|---|\n',
    '- see `x\n| [y](docs/nowhere.md) | z` |\n  |---|\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // A line that goes on with a paragraph lazily without a block quote
  // marker of the line above, with or without a list item's indentation,
  // is paragraph text, as markdown-it 14.1.0 reads it: no table starts at
  // it, so the code span opened in the paragraph runs on through the | line
  // and holds the link. micromark 4.0.2 with micromark-extension-gfm-table
  // 2.1.1 starts a table inside the block quote at such a line and renders
  // the link; the check reads these three as markdown-it does.
  for (const body of [
    '> see `x\n| [y](docs/nowhere.md) | z` |\n> |---|---|\n',
    '- > see `x\n| [y](docs/nowhere.md) | z` |\n  > |---|---|\n',
    '> - see `x\n| [y](docs/nowhere.md) | z` |\n>   |---|---|\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // On such a line, link text wraps as onto any other line of the
  // paragraph: markdown-it 14.1.0 renders the first of these with a link
  // and micromark 4.0.2 without one. Both render the other three as the
  // check reads them: a link to docs/nowhere.md on the line named, and
  // none to docs/missing.md, which a code span holds.
  for (const [body, n] of [
    ['> see [the\n| docs](docs/nowhere.md) | z |\n> |---|---|\n', 12],
    ['> see\n[y](docs/guide.md) | z`\n> | --- | --- |\n>  | `c | d |\n>  | [e](docs/nowhere.md) | f` |\n', 15],
    ['- > see `x\n  y](docs/guide.md) | z\n  > |:-|:-|\n  >   | `c | d |\n| [e](docs/nowhere.md) | f` |\n', 15],
    ['>> see\n   [y](docs/nowhere.md) | z`\n>> |:-|:-|\n    x | y\n    [k](docs/missing.md) `\n', 12],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.deepEqual(r.stderr.trim().split('\n'), [`README: line ${n}: link target "docs/nowhere.md" does not exist.`], body);
  }
});

test("a line that goes on with a list item's paragraph lazily over a delimiter row 4 or more columns past the containers the line goes on with starts a paragraph there", () => {
  // The delimiter row is in the list item, so the lazy line ends the
  // item's paragraph and the item. markdown-it 14.1.0 and 14.1.1 start no
  // table there, as the delimiter row is 4 or more columns past the block
  // quotes and list items the lazy line goes on with, and read the lazy
  // line and the lines after it as one paragraph after the list item.
  // micromark 4.0.2 with micromark-extension-gfm-table 2.1.1 reads a table
  // in the list item, with the lines after the delimiter row as body rows.
  // Both render a link to docs/nowhere.md on the line named, and the code
  // span that runs on from the lazy line in markdown-it does not hold it.
  for (const [body, n] of [
    ['- see\nx | `y\n    |---|---|\n  z` | [m](docs/nowhere.md) |\n  | `c | d |\n', 14],
    ['- see\nx | `y\n     |---|---|\n  z` | [m](docs/nowhere.md) |\n  | `c | d |\n', 14],
    ['- see\nx | `y\n\t|---|---|\n  z` | [m](docs/nowhere.md) |\n  | `c | d |\n', 14],
    ['1. see\nx | `y\n    |---|---|\n   z` | [m](docs/nowhere.md) |\n   | `c | d |\n', 14],
    ['- a\n  - see\n  x | `y\n      |---|---|\n    z` | [m](docs/nowhere.md) |\n    | `c | d |\n', 15],
    ['> - see\n> x | `y\n>     |---|---|\n>   z` | [m](docs/nowhere.md) |\n>   | `c | d |\n', 14],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.deepEqual(r.stderr.trim().split('\n'), [`README: line ${n}: link target "docs/nowhere.md" does not exist.`], body);
  }
});

test('a header row that holds no | starts a table when its delimiter row holds a | or a :, unless the line follows a table row or goes on with a paragraph lazily', () => {
  // markdown-it 14.1.0 and 14.1.1 read the first two lines of each of these
  // as a paragraph and the third as the header row of a table under the
  // delimiter row ---. micromark 4.0.2 with micromark-extension-gfm-table
  // 2.1.1 reads the first line as the header row of a table, the third as
  // a body row, and --- as a thematic break. Neither renders a link.
  for (const body of ['[a\n|:-\n| e](docs/nowhere.md) |\n---\n', '[a\n:-\n| e](docs/nowhere.md) |\n---\n']) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // markdown-it starts no table at a header row that holds no |, and
  // renders a link to docs/nowhere.md in each of these, while micromark
  // starts one at the line above the delimiter row and renders no link.
  // The check reads them as micromark does.
  for (const body of ['[a\nb](docs/nowhere.md)\n:-\n', 'abc\n|:-\n| [x |\ny](docs/nowhere.md) |\n']) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // micromark starts no table at a line that follows a table row and
  // leaves the block quote or list item that holds the table, nor does the
  // check, at such a header row that holds no |; and a line that goes on
  // with a list item's paragraph lazily and holds no | is paragraph text,
  // as markdown-it reads it. Both renderers render a link to
  // docs/nowhere.md on the line named.
  for (const [body, n] of [
    ['> | a |\n> | - |\nabc\n:-\n[x\ny](docs/nowhere.md)\n', 16],
    ['1. | a |\n   | - |\nabc\n:-\n[x\ny](docs/nowhere.md)\n', 16],
    ['1. see\nabc\n   :-\n  | [e](docs/guide.md) | f` |\n z` | [m](docs/nowhere.md) |\n', 15],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.deepEqual(r.stderr.trim().split('\n'), [`README: line ${n}: link target "docs/nowhere.md" does not exist.`], body);
  }
});

test('the cells of a table row are read one at a time, and a row holds no definition and no cell past those of its header row', () => {
  // markdown-it 14.1.0 and 14.1.1, and micromark 4.0.2 with
  // micromark-extension-gfm-table 2.1.1, read the text of each cell of a
  // row on its own, show as many cells of a row as its table's header row
  // holds, and read a line of a table that looks like a definition as a
  // row, its cells holding its text. Neither renders a link in any of
  // these: link text does not run on from one cell to the next, the link
  // in the third is in a second cell of a table of one column, and no
  // definition is read on a row.
  for (const body of [
    '| a | b |\n| - | - |\n| [c | d](docs/nowhere.md) |\n',
    '| [a | b](docs/nowhere.md) |\n| - | - |\n',
    '| a |\n| - |\n| b | [c](docs/nowhere.md) |\n',
    '| a |\n| - |\n[x]: docs/nowhere.md\n',
    '| a | b |\n| - | - |\n[x]: docs/nowhere.md\n',
    '[x]: docs/nowhere.md | b\n| - | - |\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // Both render a link here: a code span does not run on from one cell to
  // the next, and a | after a backslash is text in a cell.
  for (const body of ['| a | b |\n| - | - |\n| `c | [d](docs/nowhere.md) ` |\n', '| a |\n| - |\n| [c \\| d](docs/nowhere.md) |\n']) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.deepEqual(r.stderr.trim().split('\n'), ['README: line 13: link target "docs/nowhere.md" does not exist.'], body);
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

test('an inline link on a line of indented code is not read; one on a paragraph line indented as far is, and so is an href', () => {
  // Indented code starts 4 or more columns past where the text of the block
  // quote or list item that holds the line starts, a tab moving on to column
  // 4, on a line that does not go on with a paragraph. Its text is shown as
  // written, so it holds no inline link. Inside an HTML block such a line is
  // raw HTML, where an inline link is text too, but an href is a link. A
  // line whose text starts with | may be a paragraph, not a table row, and
  // then the line indented 4 columns after it goes on with that paragraph.
  for (const body of [
    'Text.\n\n    [x](docs/nowhere.md)\n',
    'Text.\n\n\t[x](docs/nowhere.md)\n',
    '- item\n\n        [x](docs/nowhere.md)\n',
    '- item\n\n      [x](docs/nowhere.md)\n',
    '1.     [x](docs/nowhere.md)\n\n   text\n\n       [y](docs/nowhere.md)\n',
    '> Text.\n>\n>     [x](docs/nowhere.md)\n',
    'Text.\n>     [x](docs/nowhere.md)\n',
    '```\nx\n```\n    [x](docs/nowhere.md)\n',
    '### Heading\n    [x](docs/nowhere.md)\n',
    '<div>\n    [x](docs/nowhere.md)\n</div>\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  for (const [body, n] of [
    ['Text.\n    [x](docs/nowhere.md)\n', 12],
    ['- item\n\n    [x](docs/nowhere.md)\n', 13],
    ['> Text.\n>\n>    [x](docs/nowhere.md)\n', 13],
    ['> Text.\n    [x](docs/nowhere.md)\n', 12],
    ['    code\n[x](docs/nowhere.md)\n', 12],
    ['<table>\n  <tr>\n    <td><a href="docs/nowhere.md">x</a></td>\n  </tr>\n</table>\n', 13],
    ['<p align="center">\n    <a href="docs/nowhere.md"><img src="logo.png"></a>\n</p>\n', 12],
    ['<pre>\ntext\n\n    <a href="docs/nowhere.md">x</a>\n</pre>\n', 14],
    ['| a\n    [x](docs/nowhere.md)\n', 12],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`line ${n}: link target "docs/nowhere\\.md" does not exist`), body);
  }
});

test('an inline link on a line of indented code after a table row is not read', () => {
  // markdown-it 14.1.0 and 14.1.1, and micromark 4.0.2 with
  // micromark-extension-gfm-table 2.1.1, end a table at a line indented 4
  // or more columns past the block quotes and list items that hold it, and
  // render that line as a code block, with no link.
  const r = check('| a |\n| - |\n    [x](docs/nowhere.md)\n');
  assert.equal(r.status, 0, r.stderr);
  // Both render the link to docs/one.md and none to docs/two.md: the last
  // two lines are a code block, after a table whose header row goes on
  // with the list item's paragraph lazily.
  const lazy = check('- see\n| [y](docs/one.md) | z |\n  -|-\n      | `c | d |\n      | [e](docs/two.md) | f` |\n');
  assert.equal(lazy.status, 1);
  assert.deepEqual(lazy.stderr.trim().split('\n'), ['README: line 12: link target "docs/one.md" does not exist.']);
});

test('a line that opens a block quote or list item and then indented code after a | line that is paragraph text holds no inline link', () => {
  // With no delimiter row after it, the | line is paragraph text. A block
  // quote or list item interrupts that paragraph, and 4 more columns after
  // its marker start indented code inside it, shown as written. A line that
  // goes on with the block quote and the paragraph is paragraph text.
  for (const body of ['| a\n>     [x](docs/nowhere.md)\n', '| a\n-     [x](docs/nowhere.md)\n', '- | a\n  >     [x](docs/nowhere.md)\n']) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  const r = check('> | a\n>     [x](docs/nowhere.md)\n');
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

test('a page that opens 50,000 list items and then holds 50,000 blank lines, or lines of a lone >, is checked in under 2 seconds', () => {
  // Each such line went on with the list items one at a time, and the list
  // of them was copied for each line: these two pages took 14.5 seconds.
  const n = 50000;
  const deep = ' '.repeat(2 * n);
  const pages = {
    'docs/blank.md': `${'+ '.repeat(n)}x\n${'\n'.repeat(n)}${deep}[a\n${deep}b](nowhere.md)\n`,
    'docs/quoted.md': `> ${'+ '.repeat(n)}x\n${'>\n'.repeat(n)}> ${deep}[a\n> ${deep}b](nowhere.md)\n`,
  };
  const started = process.hrtime.bigint();
  const r = check('[blank](docs/blank.md) and [quoted](docs/quoted.md)\n', pages);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  // Those lines go on with every list item, so the line after them that is
  // indented into the innermost one is paragraph text, and its link text
  // wraps onto the next line.
  assert.equal(r.status, 1);
  assert.deepEqual(r.stderr.trim().split('\n'), [
    `README: docs/blank.md line ${n + 3}: link target "nowhere.md" does not exist.`,
    `README: docs/quoted.md line ${n + 3}: link target "nowhere.md" does not exist.`,
  ]);
  assert.ok(ms < 2000, `${ms.toFixed(0)} ms for two pages of ${n + 3} lines`);
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

test('a page that opens 100,000 list items, or block quotes, and then holds 100,000 lines of a lone | is checked in under 2 seconds', () => {
  // Each | line goes on with the paragraph lazily, and the next line holds
  // only the characters of a delimiter row, so tableHeader() read it with
  // a copy of the list of containers, made for each such line: these two
  // pages took 5.4 to 15.3 seconds in four runs, and the block quote page
  // 5.4 seconds alone while a lazy line that leaves out a block quote
  // marker was read as a header row.
  const n = 100000;
  const pages = {
    'docs/items.md': `${'+ '.repeat(n)}x\n${'|\n'.repeat(n)}`,
    'docs/quoted.md': `${'> '.repeat(n)}x\n${'|\n'.repeat(n)}`,
  };
  const started = process.hrtime.bigint();
  const r = check('[items](docs/items.md) and [quoted](docs/quoted.md)\n', pages);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(r.status, 0, r.stderr);
  assert.ok(ms < 2000, `${ms.toFixed(0)} ms for two pages of ${n + 1} lines`);
});

test('a code span may run on to a later line of its paragraph, and a [ or a link inside it is not read', () => {
  // markdown-it 14.1.0 renders none of these with a link or a definition.
  for (const body of [
    'a `[x\ny` ](docs/nowhere.md)\n',
    'a `[x\nb](docs/nowhere.md)\nc` d\n',
    // `` has no closing run of two backticks, so it is text, and the ` after
    // it opens a span that the ` on the next line closes.
    'a `` b `[x\ny` ](docs/nowhere.md)\n',
    '> a `[x\n> y` ](docs/nowhere.md)\n',
    '- a `[x\n  y` ](docs/nowhere.md)\n',
    'a `x\n[y](docs/nowhere.md)\nz`\n',
    'a `x\n<a href="docs/nowhere.md">y</a>\nz`\n',
    'a `x\n[y]: docs/nowhere.md\nz`\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // markdown-it 14.1.0 renders each of these with the link or definition:
  // after a span that closes on the next line; after a run that no run of as
  // many backticks closes; after a blank line, a list item, a heading, a
  // table row, a fence, a thematic break, a setext underline or an HTML block
  // start, which a span does not run past; and after an escaped backtick,
  // which opens none.
  for (const [body, line] of [
    ['a `x\ny` [z](docs/nowhere.md)\n', 12],
    ['a ``[x\ny` ](docs/nowhere.md)\n', 12],
    ['a `x\n\n[z](docs/nowhere.md) y`\n', 13],
    ['- a `x\n- [z](docs/nowhere.md) y`\n', 12],
    ['a `x\n## [z](docs/nowhere.md) y`\n', 12],
    ['a `x\n| a | b |\n| - | - |\n| [z](docs/nowhere.md) | y` |\n', 14],
    ['a `x\n```\nb\n```\n[z](docs/nowhere.md) y`\n', 15],
    ['a `x\n***\n[z](docs/nowhere.md) y`\n', 13],
    ['a `x\n---\n[z](docs/nowhere.md) y`\n', 13],
    ['a `x\n<!-- c -->\n[z](docs/nowhere.md) y`\n', 13],
    ['a \\`x\n[z](docs/nowhere.md) y`\n', 12],
    ['a `x\n\n[y]: docs/nowhere.md\nz`\n', 13],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`line ${line}: link target "docs/nowhere\\.md" does not exist`), body);
  }
});

test('a code span runs on to the lines that go on with its paragraph as link text does, and no further', () => {
  // An ordered list item that starts at 2 and a --- after 4 spaces do not
  // end a paragraph, and a line without > goes on with a quoted paragraph,
  // so the span from the first line holds the [ or the link.
  for (const body of [
    'a `x\n2. [y](docs/nowhere.md) z`\n',
    'a `x\n    ---\n[y](docs/nowhere.md) z`\n',
    '> a `[x\ny` ](docs/nowhere.md)\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // A block quote ends the paragraph above it, and a quote inside a quote
  // ends a quoted one, so the span does not run on to the link.
  for (const body of ['a `x\n> [z](docs/nowhere.md) y`\n', '> a `x\n> > [z](docs/nowhere.md) y`\n']) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, /line 12: link target "docs\/nowhere\.md" does not exist/, body);
  }
});

test('a code span runs on past a line that starts with | when no delimiter row makes it a table header, and not past a header', () => {
  // No delimiter row with as many cells follows the | line, so it is text of
  // the paragraph, and the span from the first line holds the link.
  for (const body of [
    'a `x\n| [y](docs/nowhere.md) z`\n',
    'a `x\n|guide|\n[y](docs/nowhere.md) z`\n',
    '> a `x\n> | [y](docs/nowhere.md) z`\n',
    '- a `x\n  | [y](docs/nowhere.md) z`\n',
    'a `x\n| [y](docs/nowhere.md) | z` |\n| - |\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // A delimiter row with as many cells makes the | line a table's header
  // row, which ends the paragraph above it, so the span does not run on.
  for (const body of ['a `x\n| [z](docs/nowhere.md) y` |\n| - |\n', '> a `x\n> | [z](docs/nowhere.md) y` |\n> | - |\n']) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, /line 12: link target "docs\/nowhere\.md" does not exist/, body);
  }
});

test('a backtick inside an autolink, a tag or a link title opens no code span on to a later line, and a span that opens holds the tags after it', () => {
  // markdown-it 14.1.0 and commonmark.js 0.31.2 render each of these with the
  // link or the href of the second line, as the backtick on the first line
  // is part of a tag, an autolink or a link title.
  for (const body of [
    'a <b title="`">\n[z](docs/nowhere.md) y`\n',
    'a <https://example.org/`>\n[z](docs/nowhere.md) y`\n',
    '[x](docs/guide.md "`")\n[z](docs/nowhere.md) y`\n',
    'a <b title="`">\n<a href="docs/nowhere.md">y</a> z`\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, /line 12: link target "docs\/nowhere\.md" does not exist/, body);
  }
  // They render none of these with a link or an href: a code span holds the
  // [ or the tag, from the first line to a backtick on the second, which may
  // sit in a tag's attribute, as it does in the first.
  for (const body of [
    'a `[x\n<b title="`"> ](docs/nowhere.md)\n',
    'a `x <a href="docs/nowhere.md">\ny`\n',
    'a `x\ny` `<a href="docs/nowhere.md">`\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
});

test('a fence inside a block quote ends the paragraph above it, so a backtick there opens no code span past it', () => {
  // A fence of backticks, or of tildes, which a backtick may follow, after
  // the > of the quote that holds the paragraph, after the indentation of a
  // list item in that quote, after a quote inside the quote or inside a list
  // item, after a tab or after 3 more spaces, ends the paragraph, and the
  // backtick before the link has no run to close it there, also when one
  // follows the block.
  for (const body of [
    '> a `x [y](docs/nowhere.md)\n> ```\n> z`\n> ```\n',
    '> a `x [y](docs/nowhere.md)\n> ~~~\n> z`\n> ~~~\n',
    '> - a `x [y](docs/nowhere.md)\n>   ```\n>   z`\n>   ```\n',
    '> a `x [y](docs/nowhere.md)\n> ```\n> z\n> ```\n> w`\n',
    '> a `x [y](docs/nowhere.md)\n> ~~~ z`\n',
    '> > a `x [y](docs/nowhere.md)\n> > ```\n> > z`\n',
    '- > a `x [y](docs/nowhere.md)\n  > ```\n  > z`\n',
    '> a `x [y](docs/nowhere.md)\n>\t```\n> z`\n',
    '> a `x [y](docs/nowhere.md)\n>    ```\n> z`\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, /line 11: link target "docs\/nowhere\.md" does not exist/, body);
  }
  // None of these is a fence, and each goes on with the paragraph, so the
  // backtick before the link opens a span that the one after it closes:
  // backticks with a backtick after them, backticks 4 columns past the text
  // of the quote, and an ordered list item that starts at 2.
  for (const body of [
    '> a `x [y](docs/nowhere.md)\n> ```z`\n',
    '> a `x [y](docs/nowhere.md)\n>     ```\n> z`\n',
    '> a `x [y](docs/nowhere.md)\n> 2. ```\n> z`\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
});

test('no line of a fenced code block inside a block quote has links, to its closing fence or the end of the quote or list item that holds it', () => {
  // The block runs on past a fence of the other character, a shorter one,
  // one with text after it or one 4 columns in, past a blank quoted line, a
  // > and lines indented for a list item that holds the block or its quote,
  // and to the end of the page when no fence closes it. Its opening fence
  // holds no link.
  for (const body of [
    '> ```\n> [y](docs/nowhere.md)\n> ```\n',
    '> ~~~\n> [y](docs/nowhere.md)\n> ~~~\n',
    '> ~~~\n> <a href="docs/nowhere.md">y</a>\n> ~~~\n',
    '> ```\n> [y](docs/nowhere.md)\n',
    '> ```js [y](docs/nowhere.md)\n> a\n> ```\n',
    '> ~~~\n> ```\n> [y](docs/nowhere.md)\n> ~~~\n',
    '> ````\n> ```\n> [y](docs/nowhere.md)\n',
    '> ```\n> ``` x\n> [y](docs/nowhere.md)\n> ```\n',
    '> ```\n>     ```\n> [y](docs/nowhere.md)\n',
    '> ```\n>\n> [y](docs/nowhere.md)\n> ```\n',
    '> ```\n> > ```\n> [y](docs/nowhere.md)\n',
    '> - ```\n>\n>   [y](docs/nowhere.md)\n',
    '- > ```\n  > [y](docs/nowhere.md)\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // A fence of the same character at least as long, after at most 3 spaces,
  // closes it; a line without > ends the quote and the block, as a blank
  // line does, and a line not indented for the list item ends the item.
  for (const [body, line] of [
    ['> ```\n> a\n> ````\n> [y](docs/nowhere.md)\n> ```\n', 14],
    ['> ```\n> a\n>    ```\n> [y](docs/nowhere.md)\n', 14],
    ['> ```\n> a\n[y](docs/nowhere.md)\n', 13],
    ['> ```\n> a\n\n[y](docs/nowhere.md)\n', 14],
    ['> - ```\n> [y](docs/nowhere.md)\n', 12],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`line ${line}: link target "docs/nowhere\\.md" does not exist`), body);
  }
});

test('a fenced code block whose fence starts its line runs on past a shorter fence and a fence with text after it', () => {
  // The link's line is in the block: after a fence with text after it,
  // inside a block of 4 backticks after a fence of 3, and inside a block of
  // 4 tildes after a fence of 3.
  for (const body of [
    '```\nnpm i\n``` x\n[y](docs/nowhere.md)\n```\n',
    '````\n```\n[y](docs/nowhere.md)\n```\n````\n',
    '~~~~\n~~~\n[y](docs/nowhere.md)\n~~~~\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // A run of the same character at least as long, with only spaces and tabs
  // after it, closes the block, and the line after it is read.
  for (const [body, line] of [
    ['````\na\n`````\n[y](docs/nowhere.md)\n', 14],
    ['```\na\n``` \t\n[y](docs/nowhere.md)\n', 14],
    ['~~~\na\n~~~~\n[y](docs/nowhere.md)\n', 14],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`line ${line}: link target "docs/nowhere\\.md" does not exist`), body);
  }
});

test('a fenced code block whose fence starts its line runs on past a fence 4 or more columns past where the text of the list items that hold it starts', () => {
  // Such a fence is code, not a closing fence: 4 spaces or a tab in at the
  // top level, and 4 columns past where the text of a bullet or an ordered
  // list item starts. The link's line is in the block.
  for (const body of [
    '```\na\n    ```\n[y](docs/nowhere.md)\n```\n',
    '~~~\na\n\t~~~\n[y](docs/nowhere.md)\n~~~\n',
    '- x\n\n  ```\n  a\n      ```\n  [y](docs/nowhere.md)\n  ```\n',
    '1. x\n\n   ```\n   a\n       ```\n   [y](docs/nowhere.md)\n   ```\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // A fence at most 3 columns past where that text starts closes the block,
  // and the line after it is read.
  for (const [body, line] of [
    ['```\na\n   ```\n[y](docs/nowhere.md)\n', 14],
    ['- x\n\n  ```\n  a\n     ```\n  [y](docs/nowhere.md)\n', 16],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`line ${line}: link target "docs/nowhere\\.md" does not exist`), body);
  }
});

test('no line after a fence where the text of a list item starts has links, to its closing fence or the end of the list items that hold it', () => {
  // The fence follows the marker of a list item that the line opens: a
  // bullet or an ordered item, after a tab, after a second marker, in an
  // item that a bullet opens inside another or that starts at 1 after a
  // paragraph. The block runs on past a blank line, a shorter fence, one of
  // the other character, one with text after it and one 4 columns past the
  // item's text, and to the end of the page when no fence closes it.
  for (const body of [
    '- ```\n  [y](docs/nowhere.md)\n  ```\n',
    '1. ~~~\n   [y](docs/nowhere.md)\n   ~~~\n',
    '1) ```\n   [y](docs/nowhere.md)\n   ```\n',
    '* ```js\n  <a href="docs/nowhere.md">y</a>\n  ```\n',
    '-\t```\n\t[y](docs/nowhere.md)\n\t```\n',
    '- - ```\n    [y](docs/nowhere.md)\n    ```\n',
    '- a\n  - ```\n    [y](docs/nowhere.md)\n    ```\n',
    'a\n1. ```\n   [y](docs/nowhere.md)\n   ```\n',
    '- ```\n\n  [y](docs/nowhere.md)\n  ```\n',
    '- ````\n  ```\n  [y](docs/nowhere.md)\n  ````\n',
    '- ```\n  ~~~\n  [y](docs/nowhere.md)\n  ```\n',
    '- ```\n  ``` x\n  [y](docs/nowhere.md)\n  ```\n',
    '- ```\n      ```\n  [y](docs/nowhere.md)\n  ```\n',
    '- ```\n  [y](docs/nowhere.md)\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // A fence of the same character at least as long, at most 3 spaces past
  // the item's text and with only spaces after it, closes the block, and the
  // lines after it are read: in the item, after a blank line, or in the next
  // list item. A line not indented for the item ends the item, and so the
  // block. None of the last three is a fence: an ordered item that starts at
  // 2 does not end the paragraph above it, 5 spaces after a marker start
  // indented code, and a backtick may not follow a run of them.
  for (const [body, line] of [
    ['- ```\n  a\n  ```\n  [y](docs/nowhere.md)\n', 14],
    ['- ```\n  a\n   ```\n  [y](docs/nowhere.md)\n', 14],
    ['- ````\n  a\n  `````\n  [y](docs/nowhere.md)\n', 14],
    ['- ~~~\n  a\n  ~~~  \n  [y](docs/nowhere.md)\n', 14],
    ['- ```\n  a\n  ```\n\n[y](docs/nowhere.md)\n', 15],
    ['- ```\n  a\n  ```\n- [y](docs/nowhere.md)\n', 14],
    ['- ```\n  a\n[y](docs/nowhere.md)\n', 13],
    ['- ```\n- [y](docs/nowhere.md)\n', 12],
    ['a\n2. ```\n[y](docs/nowhere.md)\n', 13],
    ['-     ```\n  [y](docs/nowhere.md)\n', 12],
    ['- ``` `\n  [y](docs/nowhere.md)\n', 12],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`line ${line}: link target "docs/nowhere\\.md" does not exist`), body);
  }
});

test('no link is read on the opening or closing line of a fenced code block, and one after the block is', () => {
  // What follows the run of an opening fence is the block's info string,
  // and a line of ``` or ~~~ with text after its run closes no block as
  // CommonMark reads it, so it is code. The fence starts the line, is
  // indented for the list item that holds it, or follows a list marker.
  for (const body of [
    '```bash [x](docs/nowhere.md)\nnpm i\n```\n',
    '```\nnpm i\n``` [x](docs/nowhere.md)\n',
    '~~~ [x](docs/nowhere.md)\nnpm i\n~~~\n',
    '~~~\nnpm i\n~~~ [x](docs/nowhere.md)\n',
    '```html <a href="docs/nowhere.md">x</a>\nnpm i\n```\n',
    '```\nnpm i\n``` <a href="docs/nowhere.md">x</a>\n',
    '- a\n\n  ```bash [x](docs/nowhere.md)\n  npm i\n  ```\n',
    '- ```bash [x](docs/nowhere.md)\n  npm i\n  ```\n',
    '1. ~~~ [x](docs/nowhere.md)\n   npm i\n   ~~~\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // The link on the line after the block is read, and the one on its
  // opening fence is not.
  for (const body of [
    '```bash [x](docs/nowhere.md)\nnpm i\n```\n[y](docs/nowhere.md)\n',
    '- ```bash [x](docs/nowhere.md)\n  npm i\n  ```\n  [y](docs/nowhere.md)\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.deepEqual(r.stderr.trim().split('\n'), ['README: line 14: link target "docs/nowhere.md" does not exist.'], body);
  }
});

test('a fenced code block whose fence starts a later line of a list item ends with the list items that hold it, and the lines after it are read', () => {
  // The block ends at a line that is not indented for the list item that
  // holds it: the link's line, after a blank line or none, in a bullet or
  // an ordered item and in a block of backticks or of tildes; a list item
  // that the link's line opens; the link's line indented for the outer item
  // of two, when the block is in the inner one; and a fence of the same
  // character, which opens another block, closed on the line above the
  // link, rather than closing this one.
  for (const [body, line] of [
    ['- a\n\n  ```\n  x\n\n[y](docs/nowhere.md)\n', 16],
    ['- a\n\n  ~~~\n  x\n[y](docs/nowhere.md)\n', 15],
    ['1. a\n\n   ```\n   x\n\n[y](docs/nowhere.md)\n', 16],
    ['- a\n  ```\n  x\n- [y](docs/nowhere.md)\n', 14],
    ['- a\n  - b\n\n    ```\n    x\n\n  [y](docs/nowhere.md)\n', 17],
    ['- a\n\n  ```\n  x\n```\n```\n[y](docs/nowhere.md)\n', 17],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`line ${line}: link target "docs/nowhere\\.md" does not exist`), body);
  }
  // The block holds a line indented for the list items that hold it, past
  // one blank line or two, in the inner item of two and further in. A fence
  // that is not indented for the item opens a block that holds the link, and
  // a line 4 columns in that is not indented for an item 5 columns wide is
  // indented code.
  for (const body of [
    '- a\n\n  ```\n  x\n\n  [y](docs/nowhere.md)\n',
    '- a\n\n  ```\n\n\n  [y](docs/nowhere.md)\n',
    '- a\n  - b\n\n    ```\n    x\n\n    [y](docs/nowhere.md)\n',
    '- a\n\n  ```\n  x\n      [y](docs/nowhere.md)\n',
    '- a\n\n  ```\n  x\n```\n[y](docs/nowhere.md)\n```\n',
    '10.  a\n\n     ```\n     x\n    [y](docs/nowhere.md)\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // A heading after the list item is not in the block, so a link to it
  // resolves.
  const r = check('See [next](#next).\n\n- a\n\n  ```\n  x\n## Next\n');
  assert.equal(r.status, 0, r.stderr);
});

test('a heading after a fenced code block in a list item holds its anchor', () => {
  // The fence that closes the block starts its line, and was read as the
  // start of another block, which ran on to the end of the page.
  const r = check('See [next](#next).\n\n- ```\n  a\n  ```\n\n## Next\n');
  assert.equal(r.status, 0, r.stderr);
});

test('a # line of an HTML block holds no anchor, and a heading after the block does', () => {
  // CommonMark reads each line of the block as raw HTML: in a block that
  // <div> or <details> opens, up to a blank line, also after a line of ```
  // there, and in a comment, up to -->. GitHub shows such a line as text,
  // with no heading and no anchor, so it does not count for #setup-1 either.
  for (const [body, anchor, where] of [
    ['[s](#setup)\n\n<div>\n## Setup\n</div>\n', '#setup', 'README.md'],
    ['[s](#setup)\n\n<div>\n```\n## Setup\n</div>\n', '#setup', 'README.md'],
    ['[s](#setup)\n\n<details>\n## Setup\n</details>\n', '#setup', 'README.md'],
    ['[s](#setup)\n\n<!--\n## Setup\n-->\n', '#setup', 'README.md'],
    ['[s](#setup-1)\n\n## Setup\n\n<div>\n## Setup\n</div>\n', '#setup-1', 'README.md'],
    ['[s](docs/guide.md#setup)\n', '#setup', 'docs/guide.md'],
  ]) {
    const r = check(body, { 'docs/guide.md': '# Guide\n\n<div>\n## Setup\n</div>\n' });
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`^README: line 11: anchor "${anchor}" has no matching heading in ${where.replace('.', '\\.')}\\.$`, 'm'), body);
  }
  // A blank line ends a <div> block, and a comment that ends on its first
  // line is that line alone: the heading after each holds the anchor.
  for (const body of ['[s](#setup)\n\n<div>\n</div>\n\n## Setup\n', '[s](#setup)\n\n<!-- x -->\n## Setup\n']) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
});

test("a ## line of an HTML block is not the README's first H2, and a ## line after the block is", () => {
  // CommonMark reads each line of the block as raw HTML: in a block that
  // <div> opens, up to a blank line, and in a comment, up to -->. No
  // heading starts on such a line, so it is not the Quick Start.
  const dir = mkdtempSync(join(tmpdir(), 'check-readme-'));
  try {
    const run = (readme) => {
      writeFileSync(join(dir, 'README.md'), readme);
      return spawnSync(process.execPath, [script, '--no-counts', join(dir, 'README.md')], { encoding: 'utf8' });
    };
    const command = '\n```bash\nnpm test\n```\n';
    const none = run(`# Title\n\n<div>\n## Quick Start\n</div>\n${command}`);
    assert.equal(none.status, 1);
    assert.match(none.stderr, /^README: README has no H2 heading; the first one must be "## Quick Start"\.$/m);
    const other = run(`# Title\n\n<div>\n## Quick Start\n</div>\n\n## Install\n${command}`);
    assert.equal(other.status, 1);
    assert.match(other.stderr, /^README: first H2 is "Install" at line 7; it must be "Quick Start"\.$/m);
    // The line that holds a comment's --> ends the block, and a blank line
    // ends a <div> block: the ## line after each is the first H2.
    for (const [readme, at] of [
      [`# Title\n\n<!--\n## Install\n-->\n## Quick Start\n${command}`, 6],
      [`# Title\n\n<div>\n## Install\n</div>\n\n## Quick Start\n${command}`, 7],
    ]) {
      const r = run(readme);
      assert.equal(r.status, 0, `${readme}\n${r.stderr}`);
      assert.match(r.stdout, new RegExp(`, Quick Start at line ${at}, `), readme);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a fenced code block in a list item is a code block to the first-command and benchmark-comment checks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-readme-'));
  try {
    const run = (readme) => {
      writeFileSync(join(dir, 'README.md'), readme);
      return spawnSync(process.execPath, [script, '--no-counts', join(dir, 'README.md')], { encoding: 'utf8' });
    };
    // The language is read after the fence, past the list marker before it.
    const shell = run('# Title\n\n## Quick Start\n\n1. ```bash\n   npm test\n   ```\n');
    assert.equal(shell.status, 0, shell.stderr);
    assert.match(shell.stdout, /first command at line 6,/);
    const js = run('# Title\n\n## Quick Start\n\n- ```js\n  x()\n  ```\n\nnpm test\n');
    assert.equal(js.status, 1);
    assert.match(js.stderr, /^README: no shell code block with a command starts before line 30; /m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const r = check('- ```bash\n  opena2a benchmark ./my-agent   # OASB-1 controls at level L2\n  ```\n');
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    /^README: line 12: the comment names level L2, but `opena2a benchmark` with level L1 \(no --level\) checks the OASB-1 controls of level L1; /m,
  );
});

test('a line of ``` or ~~~ 4 or more columns past where the text of the list items that hold it starts opens no fence, so the lines after it are read', () => {
  // markdown-it 14.1.0 and commonmark.js 0.31.2 render each of these with the
  // link: the line goes on with the paragraph above it, with ``` or ~~~ after
  // 4 spaces or a tab, 4 columns past the text of a list item, lazily inside
  // a block quote, and 7 columns in after a paragraph line 3 spaces in; with
  // no paragraph above it, it is indented code, and the link's line after it
  // starts a paragraph; and the ``` after the link opens a fence rather than
  // closing one.
  for (const [body, line] of [
    ['a\n    ```\n    [y](docs/nowhere.md)\n', 13],
    ['a\n    ~~~\n    [y](docs/nowhere.md)\n', 13],
    ['a\n\t```\n\t[y](docs/nowhere.md)\n', 13],
    ['- a\n  b\n      ```\n      [y](docs/nowhere.md)\n', 14],
    ['> a\n    ```\n    [y](docs/nowhere.md)\n', 13],
    ['   a\n       ```\n       [y](docs/nowhere.md)\n', 13],
    ['    ```\n[y](docs/nowhere.md)\n', 12],
    ['a\n    ```\n[y](docs/nowhere.md)\n```\n', 13],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`line ${line}: link target "docs/nowhere\\.md" does not exist`), body);
  }
  // They render none of these with the link: with no paragraph above it, the
  // line is indented code, as is the link's line; 2 columns past the text of
  // a list item, or as far in as the text of an item 4 columns wide, it opens
  // a fence that holds the link; and a ``` at the start of the line after it
  // opens a fence that holds the link.
  for (const body of [
    '\n    ```\n    [y](docs/nowhere.md)\n',
    '- a\n    ```\n    [y](docs/nowhere.md)\n    ```\n',
    '1.  a\n\n    ```\n    [y](docs/nowhere.md)\n',
    'a\n    ```\n```\n[y](docs/nowhere.md)\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // A heading after such a line is not in a fence, so a link to it resolves.
  const r = check('[s](#setup)\n\na\n    ```\n## Setup\n');
  assert.equal(r.status, 0, r.stderr);
});

test('a line that starts with a run of backticks that a backtick follows on the line opens no fence and closes none', () => {
  // CommonMark allows no backtick in the info string of a backtick fence, and
  // markdown-it 14.1.1 and micromark 4.0.2 render each of these with the
  // link: the line is paragraph text with 3 backticks or 4, 2 spaces in,
  // after a paragraph line and in a list item, and the link on the line
  // after it goes on with its paragraph.
  for (const [body, line] of [
    ['```x`y [x](docs/nowhere.md)\n', 11],
    ['````x`y [x](docs/nowhere.md)\n', 11],
    ['  ```x`y [x](docs/nowhere.md)\n', 11],
    ['a\n```x`y [x](docs/nowhere.md)\n', 12],
    ['- a\n\n  ```x`y [x](docs/nowhere.md)\n', 13],
    ['``` `y`\n[x](docs/nowhere.md)\n', 12],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.deepEqual(r.stderr.trim().split('\n'), [`README: line ${line}: link target "docs/nowhere.md" does not exist.`], body);
  }
  // Inside a block of backticks such a line is code and closes no block, so
  // the link on the line after it is code, the fence after that closes the
  // block rather than opening one, and the link after the block is read.
  for (const [body, line] of [
    ['```\n```x`y\n[x](docs/nowhere.md)\n```\n[y](docs/nowhere.md)\n', 15],
    ['```\nnpm i\n``` `y`\n[x](docs/nowhere.md)\n```\n[y](docs/nowhere.md)\n', 16],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.deepEqual(r.stderr.trim().split('\n'), [`README: line ${line}: link target "docs/nowhere.md" does not exist.`], body);
  }
  // A heading after such a line is not in a fence, so a link to it resolves,
  // and a fence of tildes, whose info string may hold a backtick, opens a
  // block whose opening line holds no link.
  for (const body of ['[s](#setup)\n\n```x`y\n## Setup\n', '~~~ `x` [x](docs/nowhere.md)\nnpm i\n~~~\n']) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
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

test('a link to the README inside a code span that runs on to the next line does not mark a dated page', () => {
  // markdown-it 14.1.0 renders the span from `[the to README` and no link.
  const r = check(DATED_LINK, datedPage('As of 2026-06-03; see `[the\nREADME` ](../README.md) for the current figures.\n'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, DATED);
  assert.match(r.stderr, /it must link to the README for the current figures; /);
});

test('a note inside a code span that runs on to a later line of its paragraph does not mark a dated page, and one after that span does', () => {
  // The span opens on one line of a paragraph and closes on a later one:
  // with the note on a line of its own or across two lines, in a block
  // quote, and in a list item whose paragraph goes on lazily.
  for (const intro of [
    'a `\nAs of 2026-06-03.\nd`\n\nSee the [README](../README.md) for the current figures.\n',
    'a `As of\n2026-06-03.` d\n\nSee the [README](../README.md) for the current figures.\n',
    '> a `\n> As of 2026-06-03.\n> d`\n\nSee the [README](../README.md) for the current figures.\n',
    '- a `\nAs of 2026-06-03.\nd`\n\nSee the [README](../README.md) for the current figures.\n',
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
  // A blank line ends the paragraph, so the backtick above it opens no
  // span; and the note after a span that closes on its line is read.
  for (const intro of [
    'a `\n\nAs of 2026-06-03; see the [README](../README.md). d`\n',
    'The counts below, from `npm\ntest`, are as of 2026-06-03; see the [README](../README.md).\n',
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test("a dated page's note is read without the code spans of its line as the links are", () => {
  // A backtick after a backslash is text, so the note between two of them
  // is read; a run of two backticks is closed by the next run of two, so
  // the single backtick inside such a span does not close it.
  const escaped = check(DATED_LINK, datedPage('\\`As of 2026-06-03.\\` See the [README](../README.md) for the current figures.\n'));
  assert.equal(escaped.status, 0, escaped.stderr);
  const doubled = check(DATED_LINK, datedPage('`` As of 2026-06-03 ` `` See the [README](../README.md) for the current figures.\n'));
  assert.equal(doubled.status, 1);
  assert.match(doubled.stderr, DATED);
  assert.match(doubled.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./);
});

test("a dated page's link to the README before a fenced code block in a block quote, or after it, is read, and one inside it is not", () => {
  // In the first, the fence ends the paragraph, so the backtick before the
  // link is text; in the second, a fence closes the block before the link.
  for (const intro of [
    '> As of 2026-06-03, see `the [README](../README.md).\n> ```\n> z`\n> ```\n',
    '> As of 2026-06-03.\n> ~~~\n> x\n> ~~~\n> See the [README](../README.md) for the current figures.\n',
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  for (const intro of [
    '> As of 2026-06-03.\n> ~~~\n> See the [README](../README.md) for the current figures.\n> ~~~\n',
    '> As of 2026-06-03.\n> ```\n> See the [README](../README.md) for the current figures.\n',
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must link to the README for the current figures; /, intro);
  }
});

test('a note inside a fenced code block in a block quote does not mark a dated page, and one after the block does', () => {
  // The note sits in the block, in the info string of its opening fence, in
  // a block that the end of the block quote closes or that a shorter fence
  // inside it does not close, in a block in a nested block quote or in a
  // list item of a block quote, or in a block below the link to the README;
  // the link is read in each.
  for (const intro of [
    '> ```\n> As of 2026-06-03.\n> ```\n> See the [README](../README.md) for the current figures.\n',
    '> ~~~text\n> As of 2026-06-03.\n> ~~~\n> See the [README](../README.md) for the current figures.\n',
    '> ```As of 2026-06-03.\n> x\n> ```\n> See the [README](../README.md) for the current figures.\n',
    '> ```\n> As of 2026-06-03.\n\nSee the [README](../README.md) for the current figures.\n',
    '> ````\n> ```\n> As of 2026-06-03.\n> ````\n> See the [README](../README.md) for the current figures.\n',
    '> > ```\n> > As of 2026-06-03.\n> > ```\n> See the [README](../README.md) for the current figures.\n',
    '> - item\n>\n>   ```\n>   As of 2026-06-03.\n>   ```\n>\n> See the [README](../README.md) for the current figures.\n',
    '> See the [README](../README.md) for the current figures.\n>\n> ```\n> As of 2026-06-03.\n> ```\n',
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
  for (const intro of [
    '> ```\n> x\n> ```\n> As of 2026-06-03; see the [README](../README.md).\n',
    '> ```\n> x\n\nAs of 2026-06-03; see the [README](../README.md).\n',
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test("a dated page's note or link to the README inside a fenced code block in a list item is not read, and one after that block is", () => {
  const inside = check(DATED_LINK, datedPage('As of 2026-06-03.\n\n- ```\n  See the [README](../README.md) for the current figures.\n  ```\n'));
  assert.equal(inside.status, 1);
  assert.match(inside.stderr, DATED);
  assert.match(inside.stderr, /it must link to the README for the current figures; /);
  const note = check(DATED_LINK, datedPage('- ```\n  As of 2026-06-03.\n  ```\n\nSee the [README](../README.md) for the current figures.\n'));
  assert.equal(note.status, 1);
  assert.match(note.stderr, DATED);
  assert.match(note.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./);
  for (const intro of [
    'As of 2026-06-03.\n\n- ```\n  x\n  ```\n\nSee the [README](../README.md) for the current figures.\n',
    '- ```\n  x\n  ```\n\nAs of 2026-06-03; see the [README](../README.md).\n',
  ]) {
    const after = check(DATED_LINK, datedPage(intro));
    assert.equal(after.status, 0, `${intro}\n${after.stderr}`);
  }
});

test("a dated page's note and link to the README after a fenced code block in a list item are read with the list items that hold them", () => {
  // The line after the block goes on with the outer list item, and is not
  // read as indented code; `2. ```` cannot interrupt a paragraph, so it and
  // the line after it are paragraph text, not a fenced code block.
  for (const intro of [
    'As of 2026-06-03.\n\n10. - ```bash\n      npm i\n    See the [README](../README.md) for the current figures.\n',
    '10. - ```bash\n      npm i\n    As of 2026-06-03; see the [README](../README.md).\n',
    'As of 2026-06-03.\n\n10. ```bash\n    npm test\n    ```\n    See the [README](../README.md) for the current figures.\n',
    'As of 2026-06-03.\n\n- a\n```\nx\n```\n  b\n2. ```\n   See the [README](../README.md) for the current figures.\n',
    '- a\n```\nx\n```\n  b\n2. ```\n   As of 2026-06-03; see the [README](../README.md).\n',
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test("a dated page's link to the README on the opening or closing line of a fenced code block is not read, and one after the block is", () => {
  // The link sits in the info string of an opening fence that starts its
  // line or follows a list marker, or after the run of a line of ``` that
  // closes no block as CommonMark reads it.
  for (const intro of [
    'As of 2026-06-03.\n\n```text [README](../README.md)\nx\n```\n',
    'As of 2026-06-03.\n\n~~~ See the [README](../README.md) for the current figures.\nx\n~~~\n',
    'As of 2026-06-03.\n\n- ```text [README](../README.md)\n  x\n  ```\n',
    'As of 2026-06-03.\n\n```\nx\n``` See the [README](../README.md) for the current figures.\n',
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must link to the README for the current figures; /, intro);
  }
  const after = check(
    DATED_LINK,
    datedPage('As of 2026-06-03.\n\n```text [README](../README.md)\nx\n```\n\nSee the [README](../README.md) for the current figures.\n'),
  );
  assert.equal(after.status, 0, after.stderr);
});

test("a dated page's link to the README is read from its lines as written, and not from a line of indented code", () => {
  // With the code span or the "> " taken out, as the "as of" note is read,
  // the first two lines would start with 4 spaces or a tab and be read as
  // indented code. A backtick after a backslash is text, so the link
  // between two of them is read, while a code span that two backticks open
  // and close holds a link as text.
  for (const intro of [
    '`npm test`    counts are as of 2026-06-03; see the [README](../README.md).\n',
    '> As of 2026-06-03.\n>\n> \tSee the [README](../README.md) for the current counts.\n',
    'As of 2026-06-03, see the \\`[README](../README.md)\\`.\n',
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  for (const intro of [
    'As of 2026-06-03.\n\n    See the [README](../README.md) for the current counts.\n',
    'As of 2026-06-03, see ``[README](../README.md)``.\n',
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, /it must link to the README for the current figures; /, intro);
  }
});

test('a note inside an indented code block does not mark a dated page, and one that goes on with a paragraph does', () => {
  // The note sits in indented code: 4 columns in after a heading and a
  // blank line, 4 columns past a block quote's "> ", after a tab, and 4
  // columns past where a list item's text starts.
  for (const intro of [
    '    As of 2026-06-03.\n\nSee the [README](../README.md) for the current figures.\n',
    '>     As of 2026-06-03.\n\nSee the [README](../README.md) for the current figures.\n',
    '\tAs of 2026-06-03.\n\nSee the [README](../README.md) for the current figures.\n',
    '- item\n\n      As of 2026-06-03.\n\nSee the [README](../README.md) for the current figures.\n',
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
  // Indented code does not interrupt a paragraph, so this indented line is
  // paragraph text.
  const lazy = check(
    DATED_LINK,
    datedPage('The counts below are kept as recorded,\n    as of 2026-06-03; see the [README](../README.md).\n'),
  );
  assert.equal(lazy.status, 0, lazy.stderr);
});

test('a line of ``` 4 or more columns past where the text of the list items that hold it starts opens no code block to the other checks either', () => {
  // After a paragraph line, such a line and the lines after it go on with
  // the paragraph: no command block starts there, a comment there is not one
  // in a code block, and a dated page's note and link to the README there
  // are read.
  const dir = mkdtempSync(join(tmpdir(), 'check-readme-'));
  try {
    writeFileSync(join(dir, 'README.md'), '# Title\n\n## Quick Start\n\nRun:\n    ```bash\n    npm test\n    ```\n');
    const shell = spawnSync(process.execPath, [script, '--no-counts', join(dir, 'README.md')], { encoding: 'utf8' });
    assert.equal(shell.status, 1);
    assert.match(shell.stderr, /^README: no shell code block with a command starts before line 30; /m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const comment = check('a\n    ```bash\n    opena2a benchmark ./my-agent   # OASB-1 controls at level L2\n');
  assert.equal(comment.status, 0, comment.stderr);
  const dated = check(DATED_LINK, datedPage('a\n    ```\nAs of 2026-06-03; see the [README](../README.md).\n'));
  assert.equal(dated.status, 0, dated.stderr);
});

test('a note on an indented line of an HTML block marks a dated page, and one after the block ends does not', () => {
  // The line after a block tag such as <div> or <details> goes on with the
  // HTML block that the tag opens, also in a block quote or a list item
  // that holds the block, and the lines after <pre> go on with its block up
  // to </pre>, past a blank line too. Their text is raw HTML, not indented
  // code, and an href on such a line is a link.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<div>\n    As of 2026-06-03.\n</div>\n\n${see}`,
    `<details>\n    As of 2026-06-03.\n</details>\n\n${see}`,
    `> <div>\n>     As of 2026-06-03.\n> </div>\n\n${see}`,
    `- <div>\n      As of 2026-06-03.\n  </div>\n\n${see}`,
    `<pre>\nx\n\n    As of 2026-06-03.\n</pre>\n\n${see}`,
    '<div>\n    As of 2026-06-03; see the <a href="../README.md">README</a>.\n</div>\n',
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  // A blank line ends a <div> block, and so does a ">" line in the block
  // quote that holds it; a line without the ">" ends that block quote, and
  // so the block. A <pre> block or a comment that ends on its first line is
  // that line alone. The indented line after each is code.
  for (const intro of [
    `<div>\n\n    As of 2026-06-03.\n\n${see}`,
    `> <div>\n>\n>     As of 2026-06-03.\n\n${see}`,
    `> <div>\n    As of 2026-06-03.\n\n${see}`,
    `<pre>x</pre>\n    As of 2026-06-03.\n\n${see}`,
    `<!-- x -->\n    As of 2026-06-03.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
});

test('a fenced code block whose fence starts a later line of a list item ends with the list items that hold it to the other checks too', () => {
  // A line that is not indented for the item is not in the block: it is not
  // a command in a shell block, a comment on it is not one in a code block,
  // and a dated page's note and link to the README on it are read.
  const dir = mkdtempSync(join(tmpdir(), 'check-readme-'));
  try {
    writeFileSync(join(dir, 'README.md'), '# Title\n\n## Quick Start\n\n- Install:\n\n  ```bash\n  # install\nnpm test\n');
    const shell = spawnSync(process.execPath, [script, '--no-counts', join(dir, 'README.md')], { encoding: 'utf8' });
    assert.equal(shell.status, 1);
    assert.match(shell.stderr, /^README: no shell code block with a command starts before line 30; /m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const comment = check('- a\n\n  ```bash\n  x\nopena2a benchmark ./my-agent   # OASB-1 controls at level L2\n');
  assert.equal(comment.status, 0, comment.stderr);
  const dated = check(DATED_LINK, datedPage('- a\n\n  ```\n  x\nAs of 2026-06-03; see the [README](../README.md).\n'));
  assert.equal(dated.status, 0, dated.stderr);
});

test('a line of ``` or ~~~ inside an HTML block opens no code block, so a note after it marks a dated page, and one after the block ends does not', () => {
  // Each line of an HTML block is raw HTML: in a block that a block tag
  // such as <div> opens up to a blank line, in one that <pre> opens past a
  // blank line up to </pre>, and in a comment up to -->. A line there that
  // starts with 3 or more backticks or tildes, also after the > of a block
  // quote that holds the block or a list marker, opens no fenced code block.
  // A note inside the comment is not shown, so the one in a comment follows
  // its end, on the line that holds it.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    '<div>\n```\n    As of 2026-06-03.\n```\n</div>\n\n' + see,
    '<details>\n~~~\nAs of 2026-06-03.\n~~~\n</details>\n\n' + see,
    '<pre>\n\n```\nAs of 2026-06-03.\n```\n</pre>\n\n' + see,
    '<!--\n```\n--> As of 2026-06-03.\n\n' + see,
    '> <div>\n> ```\n> As of 2026-06-03.\n> ```\n> </div>\n\n' + see,
    '<div>\n- ```\n  As of 2026-06-03.\n  ```\n</div>\n\n' + see,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  // A blank line ends a <div> block; a line without the ">" of the block
  // quote that holds one ends that block quote, and so the block; and a
  // comment that ends on its first line is that line alone. A fence after
  // each opens a code block, which holds the note.
  for (const intro of [
    '<div>\n\n```\nAs of 2026-06-03.\n```\n\n' + see,
    '> <div>\n```\nAs of 2026-06-03.\n```\n\n' + see,
    '<!-- x -->\n```\nAs of 2026-06-03.\n```\n\n' + see,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
});

test('a list marker on a line of an HTML block opens no list item, so a note indented 4 columns after the blank line that ends the block is code', () => {
  // CommonMark reads each line of a block that <div> opens, up to a blank
  // line, as raw HTML, a list marker too. The line after that blank line,
  // 4 columns past where the text of the block quotes and list items that
  // hold the block starts, is indented code, and the note there does not
  // mark a dated page.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<div>\n- x\n\n    As of 2026-06-03.\n\n${see}`,
    `<div>\n- \`\`\`\n\n    As of 2026-06-03.\n\n${see}`,
    `<div>\n1. x\n\n    As of 2026-06-03.\n\n${see}`,
    `> <div>\n> - x\n>\n>     As of 2026-06-03.\n\n${see}`,
    `- <div>\n  - x\n\n      As of 2026-06-03.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
  // A note indented less is a paragraph, also in the list item that holds
  // the block, and one in a block that <pre> opens is raw HTML up to
  // </pre>, past a blank line: each marks a dated page.
  for (const intro of [
    `<div>\n- x\n\nAs of 2026-06-03.\n\n${see}`,
    `- <div>\n  - x\n\n  As of 2026-06-03.\n\n${see}`,
    `<pre>\n- x\n\n    As of 2026-06-03.\n</pre>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  // Check 4 reads the same lines: an inline link on the indented line is
  // code, and one on a line that is not indented is read.
  const code = check('<div>\n- x\n\n    [y](docs/nowhere.md)\n');
  assert.equal(code.status, 0, code.stderr);
  const text = check('<div>\n- x\n\n[y](docs/nowhere.md)\n');
  assert.equal(text.status, 1);
  assert.match(text.stderr, /^README: line 14: link target "docs\/nowhere\.md" does not exist\.$/m);
});

test('a line of ``` inside an HTML block opens no code block to the other checks either', () => {
  // The Quick Start's command in a <div> block is raw HTML, not a command
  // block; a comment on an `opena2a benchmark` line there is not one in a
  // code block; and an href on a line after such a line is a link.
  const dir = mkdtempSync(join(tmpdir(), 'check-readme-'));
  try {
    writeFileSync(join(dir, 'README.md'), '# Title\n\n## Quick Start\n\n<div>\n```bash\nnpm test\n```\n</div>\n');
    const shell = spawnSync(process.execPath, [script, '--no-counts', join(dir, 'README.md')], { encoding: 'utf8' });
    assert.equal(shell.status, 1);
    assert.match(shell.stderr, /^README: no shell code block with a command starts before line 30; /m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const comment = check('<div>\n```bash\nopena2a benchmark ./my-agent   # OASB-1 controls at level L2\n```\n</div>\n');
  assert.equal(comment.status, 0, comment.stderr);
  const href = check('<div>\n```\n<a href="docs/nowhere.md">x</a>\n```\n</div>\n');
  assert.equal(href.status, 1);
  assert.match(href.stderr, /^README: line 13: link target "docs\/nowhere\.md" does not exist\.$/m);
});

test('a markdown link on a line of an HTML block is text, not a link, and an href there is a link', () => {
  // The text of each line of an HTML block, the line that opens it
  // included, is raw HTML, in which CommonMark reads no inline link,
  // definition or table cell.
  const see = 'See the [README](../README.md) for the current figures.';
  for (const intro of [
    `<div>\nAs of 2026-06-03. ${see}\n</div>\n`,
    `<div>As of 2026-06-03. ${see}</div>\n`,
    `> <div>\n> As of 2026-06-03. ${see}\n> </div>\n`,
    `<div>\nAs of 2026-06-03.\n| ${see} |\n</div>\n`,
    `<div>\nAs of 2026-06-03.\n[readme]: ../README.md\n</div>\n`,
    // Link text that opens on such a line holds no link on a later line.
    `As of 2026-06-03.\n\n<!--\nSee the [README\n-->\n](../README.md) for the current figures.\n`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must link to the README for the current figures; /, intro);
  }
  // An href on such a line is a link, and so is a markdown link on a line
  // after the blank line that ends the block.
  for (const intro of [
    '<div>\nAs of 2026-06-03. See the <a href="../README.md">README</a> for the current figures.\n</div>\n',
    `<div>\nAs of 2026-06-03.\n</div>\n\n${see}\n`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  // Check 4 resolves no markdown link on such a line, and does resolve an
  // href there.
  const text = check('<div>\nSee [the page](nope.md).\n</div>\n');
  assert.equal(text.status, 0, text.stderr);
  const href = check('<div>\nSee <a href="nope.md">the page</a>.\n</div>\n');
  assert.equal(href.status, 1);
  assert.match(href.stderr, /^README: line 12: link target "nope\.md" does not exist\.$/m);
});

test('an href between backticks on a line of an HTML block is a link, as a backtick in raw HTML is text', () => {
  // Check 4 resolves such an href with both backticks on its line, or one
  // of them on an earlier line of the block, on a line that lineStart()
  // reads as text, as indented code or as a table row, and in a block quote
  // that holds the block.
  for (const [body, line] of [
    ['<div>\nSee `<a href="nope.md">the page</a>`.\n</div>\n', 12],
    ['<div>\n    See `<a href="nope.md">the page</a>`.\n</div>\n', 12],
    ['<div>\n| See `<a href="nope.md">the page</a>` |\n| --- |\n</div>\n', 12],
    ['> <div>\n> See `<a href="nope.md">the page</a>`.\n> </div>\n', 12],
    ['<div>\nSee `the\n<a href="nope.md">page</a>`.\n</div>\n', 13],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`^README: line ${line}: link target "nope\\.md" does not exist\\.$`, 'm'), body);
  }
  // In a paragraph, also one after the blank line that ends such a block,
  // the backticks make a code span, which holds no link.
  for (const body of ['See `<a href="nope.md">the page</a>`.\n', '<div>\nx\n</div>\n\nSee `<a href="nope.md">the page</a>`.\n']) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // The dated-page check, which reads links with the same reader, reads
  // such an href as the page's link to the README.
  const dated = check(DATED_LINK, datedPage('<div>\nAs of 2026-06-03. See the `<a href="../README.md">README</a>` for the current figures.\n</div>\n'));
  assert.equal(dated.status, 0, dated.stderr);
});

test('a line of an HTML block of 50,000 tag starts that no > follows is checked in under 2 seconds', () => {
  // Each < was read on to the end of the line for an href, so the time grew
  // with the square of the line's length: the page with the line of <a took
  // 17.8 seconds to check.
  const see = 'See the [README](../README.md) for the current figures.';
  for (const unit of ['<a', '<a b="', '<textarea ']) {
    const line = unit.repeat(50000);
    const started = process.hrtime.bigint();
    const r = check(DATED_LINK, datedPage(`As of 2026-06-03.\n\n<div>\n${line}\n</div>\n\n${see}\n`));
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(r.status, 0, r.stderr);
    assert.ok(ms < 2000, `${ms.toFixed(0)} ms for a line of ${line.length} characters of ${unit}`);
  }
  // A tag that no > ends reads on past the other < on the line to an href,
  // and a tag that a > ends holds no href after it.
  const open = check(`<div>\n${'<a'.repeat(50000)} href="docs/nowhere.md">x</a>\n</div>\n`);
  assert.equal(open.status, 1);
  assert.match(open.stderr, /^README: line 12: link target "docs\/nowhere\.md" does not exist\.$/m);
  const ended = check(`<div>\n${'<a>'.repeat(50000)} href="docs/nowhere.md"\n</div>\n`);
  assert.equal(ended.status, 0, ended.stderr);
});

test('a note and link on the lines after the line that ends an HTML block are read with the code spans of their paragraph', () => {
  // lineStart() reads the lines of a comment after its first, and the
  // lines after the one that ends it, as one paragraph, each line of which
  // is read with its own code spans. Read with those of another line, the
  // note on a line after the comment is read on the wrong part of it, and
  // a run of backticks there at an index on another line, which does not
  // finish; so the check is run here with a time limit.
  const see = 'See the [README](../README.md) for the current figures.';
  const dated = (intro) => {
    const dir = mkdtempSync(join(tmpdir(), 'check-readme-'));
    try {
      mkdirSync(join(dir, 'docs'));
      writeFileSync(join(dir, 'README.md'), HEAD + DATED_LINK);
      for (const [path, text] of Object.entries(datedPage(intro))) writeFileSync(join(dir, path), text);
      const r = spawnSync(process.execPath, [script, '--no-counts', join(dir, 'README.md')], { encoding: 'utf8', timeout: 30_000 });
      assert.equal(r.signal, null, `${intro}\nthe check did not finish in 30 seconds`);
      return r;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  for (const intro of [
    `<!--\na comment\n-->\nAs of 2026-06-03. ${see}\n`,
    `<!--\n-->\nAs of 2026-06-03.\n${see}\n`,
    `> <!--\n> a comment\n> -->\n> As of 2026-06-03. ${see}\n`,
    `<script>\nlet a;\n</script>\nAs of 2026-06-03. ${see}\n`,
  ]) {
    const r = dated(intro);
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  // A code span that a line after the comment opens holds the note.
  const span = dated(`<!--\na comment\n-->\nx \`\nAs of 2026-06-03.\n\` y\n\n${see}\n`);
  assert.equal(span.status, 1, span.stderr);
  assert.match(span.stderr, DATED);
  assert.match(span.stderr, /it must say "as of 2026-06-03"; /);
});

test('a note inside an HTML comment, processing instruction, declaration, CDATA section, <script> or <style> does not mark a dated page', () => {
  // No text of these in an HTML block is read as the note, whether one opens
  // the block or sits inside a block that <div> or <details> opens, and a
  // line break inside one is not a space between the words around it.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<!-- As of 2026-06-03. -->\n\n${see}`,
    `<style>\nAs of 2026-06-03.\n</style>\n\n${see}`,
    `<!--\n    As of 2026-06-03.\n-->\n\n${see}`,
    `<script>\nAs of 2026-06-03.\n</script>\n\n${see}`,
    `<?note As of 2026-06-03. ?>\n\n${see}`,
    `<!NOTE As of 2026-06-03.>\n\n${see}`,
    `<![CDATA[As of 2026-06-03.]]>\n\n${see}`,
    `<!--\nAs of 2026-06-03.\n\n-->\n\n${see}`,
    `> <!--\n> As of 2026-06-03.\n> -->\n\n${see}`,
    `- <!--\n  As of 2026-06-03.\n  -->\n\n${see}`,
    `> <!NOTE\n> As of 2026-06-03.\n> >\n\n${see}`,
    `<div>\n<!-- As of 2026-06-03. -->\n</div>\n\n${see}`,
    `<details>\n<style>\nAs of 2026-06-03.\n</style>\n</details>\n\n${see}`,
    `<!-- a --> <!-- As of 2026-06-03. -->\n\n${see}`,
    `<div>As of<!--\n-->2026-06-03.</div>\n\n${see}`,
    `<!--\n\`\`\`\nAs of 2026-06-03.\n\`\`\`\n-->\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
  // The text after the end of one of these is shown, on the line that holds
  // the end too, as is the text of a block that <pre> or <textarea> opens.
  for (const intro of [
    `<!-- draft --> As of 2026-06-03.\n\n${see}`,
    `<!--> As of 2026-06-03.\n\n${see}`,
    `<script>x</script> As of 2026-06-03.\n\n${see}`,
    `<!--\nx\n-->\nAs of 2026-06-03.\n\n${see}`,
    `<div>\n<!-- x -->\nAs of 2026-06-03.\n</div>\n\n${see}`,
    `<div>As of <!--\n--> 2026-06-03.</div>\n\n${see}`,
    `<pre>\nAs of 2026-06-03.\n</pre>\n\n${see}`,
    `<textarea>\nAs of 2026-06-03.\n</textarea>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test('a note inside a <textarea> marks a dated page, also inside a comment, processing instruction or <style> there, as none of these starts in escapable raw text', () => {
  // The text of a <textarea> runs to </textarea>, and a <!--, <? or <style
  // in it is text: the note is read there, on the line that opens the
  // element and on the later lines of its block, and a line break in it is
  // a space between the words around it.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<textarea>\n<!-- As of 2026-06-03. -->\n</textarea>\n\n${see}`,
    `<textarea><!-- As of 2026-06-03. --></textarea>\n\n${see}`,
    `<div>\n<textarea>\n<!-- As of 2026-06-03. -->\n</textarea>\n</div>\n\n${see}`,
    `<textarea>\n<?note As of 2026-06-03. ?>\n</textarea>\n\n${see}`,
    `<textarea>\n<style>As of 2026-06-03.</style>\n</textarea>\n\n${see}`,
    `> <textarea>\n> <!-- As of 2026-06-03. -->\n> </textarea>\n\n${see}`,
    `- <textarea>\n  <!-- As of 2026-06-03. -->\n  </textarea>\n\n${see}`,
    `<TEXTAREA rows="2">\n<!-- As of\n2026-06-03. -->\n</TEXTAREA>\n\n${see}`,
    `<div>\n<!-- x --> <textarea><!--\nAs of 2026-06-03.\n--></textarea>\n</div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  // Outside a <textarea> they still hide the note: after its </textarea>,
  // and where the <textarea> is itself inside a comment or a <script>. A
  // comment inside a <textarea> is text, so it does not join the words on
  // either side of it either.
  for (const intro of [
    `<textarea>As of <!-- x --> 2026-06-03.</textarea>\n\n${see}`,
    `<textarea>x</textarea> <!-- As of 2026-06-03. -->\n\n${see}`,
    `<div>\n<textarea>\n</textarea>\n<!-- As of 2026-06-03. -->\n</div>\n\n${see}`,
    `<div>\n<!-- <textarea> -->\n<!-- As of 2026-06-03. -->\n</div>\n\n${see}`,
    `<div>\n<script>\n<textarea>\n</script>\n<!-- As of 2026-06-03. -->\n</div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
});

test('a note in a comment inside a <textarea> in a paragraph, a heading or a table cell marks a dated page, as a browser shows it as the text of the element', () => {
  // <textarea/> is a start tag to a browser, and opens no HTML block, so the
  // line is a paragraph. A comment after the element's end tag, also one
  // with a space before its >, still hides the note.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `Hello <textarea><!-- As of 2026-06-03. --></textarea> world.\n\n${see}`,
    `<textarea/><!-- As of 2026-06-03. --></textarea>\n\n${see}`,
    `Hello <TEXTAREA rows="2"><?note As of 2026-06-03. ?></TEXTAREA> world.\n\n${see}`,
    `> Hello <textarea><!-- As of 2026-06-03. --></textarea> world.\n\n${see}`,
    `### Hello <textarea><!-- As of 2026-06-03. --></textarea> world\n\n${see}`,
    `| a | b |\n| - | - |\n| <textarea><!-- As of 2026-06-03. --></textarea> | x |\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  for (const intro of [
    `Hello <textarea>x</textarea> <!-- As of 2026-06-03. --> world.\n\n${see}`,
    `Hello <textarea>x</textarea > <!-- As of 2026-06-03. --> world.\n\n${see}`,
    `Hello <!-- <textarea> As of 2026-06-03. --> world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
  }
});

test('a </textarea> end tag inside a comment, processing instruction, CDATA section, declaration or attribute value in a paragraph, a heading or a table cell ends the <textarea>, as a browser ends it there', () => {
  // A renderer passes raw HTML on as written, and a browser ends the text of
  // a <textarea> at the first </textarea> in it, so what follows that end
  // tag inside the comment is raw HTML: a second <!-- there starts a comment
  // that hides the note, as on a line of an HTML block, and a <script> or a
  // <!-- that it leaves open hides the rest of the line.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `Hello <textarea><!-- </textarea><!-- As of 2026-06-03. --> --></textarea> world.\n\n${see}`,
    `Hello <textarea><!-- </textarea ><!-- As of 2026-06-03. --> --></textarea> world.\n\n${see}`,
    `<div>\nHello <textarea><!-- </textarea><!-- As of 2026-06-03. --> --></textarea> world.\n</div>\n\n${see}`,
    `> Hello <textarea><!-- </textarea><!-- As of 2026-06-03. --> --></textarea> world.\n\n${see}`,
    `### Hello <textarea><!-- </textarea><!-- As of 2026-06-03. --> --></textarea> world\n\n${see}`,
    `| a | b |\n| - | - |\n| <textarea><!-- </textarea><!-- As of 2026-06-03. --> --></textarea> | x |\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- As of 2026-06-03. --> ?></textarea> world.\n\n${see}`,
    `Hello <textarea><![CDATA[ </textarea><!-- As of 2026-06-03. --> ]]></textarea> world.\n\n${see}`,
    `Hello <textarea><!X </textarea><!-- As of 2026-06-03. --></textarea> world.\n\n${see}`,
    `Hello <textarea><b title="</textarea><!-- As of 2026-06-03. -->"></textarea> world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> --> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?> As of 2026-06-03. world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
  // Text after that end tag inside the comment, and after the comment, is
  // shown, and so is the text of a <textarea> that opens there.
  for (const intro of [
    `Hello <textarea><!-- </textarea> As of 2026-06-03. --> world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><!-- x --> --> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><textarea> --><!-- As of 2026-06-03. --></textarea> world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test('a <textarea> or <!-- inside the quoted value of an attribute on a line of an HTML block starts nothing, and a </textarea > end tag ends a <textarea>', () => {
  // A browser reads a < inside an attribute value as part of the value, so
  // a comment after it still hides the note, and a <!-- there hides none.
  // HTML ends a <textarea> at an end tag with white space before its >.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<div title="<textarea>">\n<!-- As of 2026-06-03. -->\n</div>\n\n${see}`,
    `<div><img alt="<textarea>"> <!-- As of 2026-06-03. --></div>\n\n${see}`,
    `<div title='<textarea>'>\n<!-- As of 2026-06-03. -->\n</div>\n\n${see}`,
    `<div\n  title="<textarea>">\n<!-- As of 2026-06-03. -->\n</div>\n\n${see}`,
    `<div title="a\n<textarea>">\n<!-- As of 2026-06-03. -->\n</div>\n\n${see}`,
    `<div>\n<textarea>\nx\n</textarea >\n<!-- As of 2026-06-03. -->\n</div>\n\n${see}`,
    `<div>\n<textarea>x</TEXTAREA\t> <!-- As of 2026-06-03. -->\n</div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
  for (const intro of [
    `<div title="<!--">\nAs of 2026-06-03.\n</div>\n\n${see}`,
    `<div title = '<script>'>\nAs of 2026-06-03.\n</div>\n\n${see}`,
    `<div>\n<textarea/><!-- As of 2026-06-03. --></textarea>\n</div>\n\n${see}`,
    `<div>\n<textarea>\n<!-- As of 2026-06-03. </textarea >\n</div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test("a dated page's note inside the quoted value of an attribute is not read, on a line of an HTML block or in a paragraph, a heading or a table cell, as a browser shows no part of a tag", () => {
  // A tag's text, with its attributes and their quoted values, also one
  // that runs on to a later line of an HTML block, is left out, and the
  // words on either side of an inline tag, such as <span>, or of a line
  // break inside one, join with no space, as a browser shows them. Inside
  // a <textarea> a tag is text, which a browser shows as written, and the
  // target of an autolink is its text. A </textarea> inside a comment ends
  // the <textarea>, and a quoted value that a tag after it opens in the
  // comment runs on past the comment, so the rest of the line is left out.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<div title="As of 2026-06-03.">x</div>\n\n${see}`,
    `<div title='As of 2026-06-03.'>x</div>\n\n${see}`,
    `<div title="\nAs of 2026-06-03.\n">x</div>\n\n${see}`,
    `<div\n  title="As of 2026-06-03.">x</div>\n\n${see}`,
    `> <div title="As of 2026-06-03.">x</div>\n\n${see}`,
    '<div><a href="../README.md" title="As of 2026-06-03.">README</a></div>\n',
    `<textarea title="As of 2026-06-03.">x</textarea>\n\n${see}`,
    `<div>\n<textarea\n  title="As of 2026-06-03.">x</textarea>\n</div>\n\n${see}`,
    `<textarea>As <b>of</b> 2026-06-03.</textarea>\n\n${see}`,
    `Hello <span title="As of 2026-06-03.">x</span> world.\n\n${see}`,
    `Hello <span title='As of 2026-06-03.'>x</span> world.\n\n${see}`,
    `Hello <img alt="As of 2026-06-03."/> world.\n\n${see}`,
    `> Hello <span title="As of 2026-06-03.">x</span> world.\n\n${see}`,
    `### Hello <span title="As of 2026-06-03.">x</span> world\n\n${see}`,
    `| a | b |\n| - | - |\n| <span title="As of 2026-06-03.">x</span> | x |\n\n${see}`,
    `Hello <textarea title="As of 2026-06-03.">x</textarea> world.\n\n${see}`,
    `Hello <textarea>As <b>of</b> 2026-06-03.</textarea> world.\n\n${see}`,
    `As <https://example.com>of 2026-06-03.\n\n${see}`,
    `Hello <textarea><!-- </textarea><b title="x --> As of 2026-06-03." y> world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
  for (const intro of [
    `<div title="x">As of 2026-06-03.</div>\n\n${see}`,
    `<div title="\nx\n">As of 2026-06-03.</div>\n\n${see}`,
    `<div>As<span class="x"> of 2026-06-03.</span></div>\n\n${see}`,
    `<div>A<span class="x">s of 2026-06-03.</span></div>\n\n${see}`,
    `<div>A<span\n  class="x">s of 2026-06-03.</span></div>\n\n${see}`,
    `<textarea title="x">As of 2026-06-03.</textarea>\n\n${see}`,
    `<textarea\n  title="x">As of 2026-06-03.</textarea>\n\n${see}`,
    `Hello <span title="x">As of 2026-06-03.</span> world.\n\n${see}`,
    `Hello A<span class="x">s of 2026-06-03.</span> world.\n\n${see}`,
    `Hello <textarea title="x">As of 2026-06-03.</textarea> world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><b title="x"> As of 2026-06-03. --> world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test('a <textarea> ends at an end tag with an attribute, on a line of an HTML block or inside raw HTML in a paragraph or a table cell, as a browser ends it, and no part of that tag is read', () => {
  // A browser ends the element at </textarea before white space, a / or a
  // >, so an end tag with an attribute, also one that runs on to a later
  // line of the block, ends it, and no part of that tag is shown. In a
  // paragraph such an end tag ends the element where the renderer passes it
  // on as written, as inside a comment; outside raw HTML it is text, as
  // CommonMark reads no attribute in an end tag, and so is shown as the
  // element's text. </textareax is no end tag.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `${see}\n<textarea></textarea title="As of 2026-06-03.">\n`,
    `<div>\n<textarea>x</textarea title="As of 2026-06-03.">\n</div>\n\n${see}`,
    `<div>\n<textarea>x</textarea\n  title="As of 2026-06-03.">\n</div>\n\n${see}`,
    `<div>\n<textarea>x</textarea/ title="As of 2026-06-03.">\n</div>\n\n${see}`,
    `> <div>\n> <textarea>x</textarea title="As of 2026-06-03.">\n> </div>\n\n${see}`,
    `Hello <textarea><!-- </textarea title="As of 2026-06-03."> --> world.\n\n${see}`,
    `Hello <textarea><!-- </textarea --><!-- As of 2026-06-03. --> world.\n\n${see}`,
    `| a | b |\n| - | - |\n| <textarea><!-- </textarea title="As of 2026-06-03."> --> | x |\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
  for (const intro of [
    `<div>\n<textarea>As of 2026-06-03.</textarea title="x">\n</div>\n\n${see}`,
    `<div>\n<textarea>x</textarea title="x"> As of 2026-06-03.\n</div>\n\n${see}`,
    `<div>\n<textarea>As of 2026-06-03.</textarea >\n</div>\n\n${see}`,
    `${see}\n<textarea>As of 2026-06-03.</textarea title="x">\n`,
    `<textarea></textareax As of 2026-06-03.</textarea>\n\n${see}`,
    `Hello <textarea><!-- </textarea title="x"> As of 2026-06-03. --> world.\n\n${see}`,
    `Hello <textarea>x</textarea title="As of 2026-06-03."> world.\n\n${see}`,
    `Hello <textarea>As of 2026-06-03.</textarea > world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test("a dated page's words on either side of a <br> or of a block's start or end tag are read apart, as a browser shows them on lines or in cells of their own", () => {
  // A <br>, also <br/>, <BR> or </br>, and a start tag or an end tag of an
  // element that a browser shows as a block, a list item, a table, or a
  // caption, row or cell of a table, such as <p>, <div>, <li> or <td>, part
  // the words on either side, on a line of an HTML block, also where the
  // tag runs on to a later line, and in a paragraph, a heading or a table
  // cell, also inside the raw HTML after a </textarea> in a comment. The
  // words on either side of any other tag, such as <span>, <b>, <img> or
  // <wbr>, or <brx>, whose name only starts with br, join.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `Report<br>As of 2026-06-03.\n\n${see}`,
    `Report<br/>As of 2026-06-03.\n\n${see}`,
    `Report<BR>As of 2026-06-03.\n\n${see}`,
    `Report</br>As of 2026-06-03.\n\n${see}`,
    `Report<hr>As of 2026-06-03.\n\n${see}`,
    `> Report<br>As of 2026-06-03.\n\n${see}`,
    `### Audit<br>As of 2026-06-03\n\n${see}`,
    `| Snapshot<br>As of 2026-06-03 | x |\n\n${see}`,
    `| a | b |\n| - | - |\n| Report<br>As of 2026-06-03. | x |\n\n${see}`,
    `Hello <textarea><!-- x</textarea><br>As of 2026-06-03. --> world.\n\n${see}`,
    `<div>Report<br>As of 2026-06-03.</div>\n\n${see}`,
    `<div>Report<br\n  class="x">As of 2026-06-03.</div>\n\n${see}`,
    `<div>Report</div><div>As of 2026-06-03.</div>\n\n${see}`,
    `<p>Report</p><p>As of 2026-06-03.</p>\n\n${see}`,
    `<table><tr><td>Status</td><td>As of 2026-06-03.</td></tr></table>\n\n${see}`,
    `<ul><li>Report</li><li>As of 2026-06-03.</li></ul>\n\n${see}`,
    `<h3>Report</h3><p>As of 2026-06-03.</p>\n\n${see}`,
    `> <div>Report<br>As of 2026-06-03.</div>\n\n${see}`,
    '<p align="center"><b>OASB audit</b><br>As of 2026-06-03, see the <a href="../README.md">README</a> for the current figures.</p>\n',
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  for (const intro of [
    `Report<span>As of 2026-06-03.</span>\n\n${see}`,
    `Report<wbr>As of 2026-06-03.\n\n${see}`,
    `Report<img src="x.png">As of 2026-06-03.\n\n${see}`,
    `Report<brx>As of 2026-06-03.\n\n${see}`,
    `### Audit<b>As of 2026-06-03</b>\n\n${see}`,
    `| a | b |\n| - | - |\n| Report<b>As of 2026-06-03.</b> | x |\n\n${see}`,
    `<div>Report<b>As of 2026-06-03.</b></div>\n\n${see}`,
    `<div>Report<img src="x.png">As of 2026-06-03.</div>\n\n${see}`,
    `<div>Report<br-x>As of 2026-06-03.</div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
});

test('a declaration that runs on in a nested block quote is not ended by a > marker of the inner quote after more than one space', () => {
  // `>   > ` is two block quote markers, so the second > ends no
  // declaration; after 5 spaces the > is text in the paragraph, and ends it.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `> > Hello <!NOTE x\n>   > As of 2026-06-03. y> world.\n\n${see}`,
    `> > Hello <!NOTE x\n>    > As of 2026-06-03. y> world.\n\n${see}`,
    `> > Hello <!NOTE x\n> > As of 2026-06-03. y> world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
  }
  const r = check(DATED_LINK, datedPage(`> Hello <!NOTE x\n>     > As of 2026-06-03. world.\n\n${see}`));
  assert.equal(r.status, 0, r.stderr);
});

test('a note between backticks on a line of an HTML block marks a dated page, as a backtick in raw HTML is text, and a backtick there keeps no comment from opening', () => {
  // A renderer passes the text of an HTML block on as written, so a
  // backtick there opens no code span, and the note is read on the whole
  // line, as an href there is: between two backticks on its line, also two
  // on two lines of the block, in a block quote, as a run of two, after a
  // backslash, on a line indented 4 columns, in a table row, in a block
  // that <details> or <pre> opens, in a list item, and after the --> that
  // ends a comment, on its line.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    '<div>\n`As of 2026-06-03.` See the <a href="../README.md">README</a> for the current figures.\n</div>\n',
    `<div>\na \`\nAs of 2026-06-03.\nd\`\n</div>\n\n${see}`,
    `> <div>\n> a \`\n> As of 2026-06-03.\n> d\`\n> </div>\n\n${see}`,
    `<div>\n\`\` As of 2026-06-03 \` \`\`\n</div>\n\n${see}`,
    `<div>\n\\\`As of 2026-06-03.\\\`\n</div>\n\n${see}`,
    `<div>\n    \`As of 2026-06-03.\`\n</div>\n\n${see}`,
    `<div>\n| \`As of 2026-06-03.\` |\n| --- |\n</div>\n\n${see}`,
    `<details>\n\`As of 2026-06-03.\`\n</details>\n\n${see}`,
    `<pre>\n\n\`As of 2026-06-03.\`\n</pre>\n\n${see}`,
    `- <div>\n  \`As of 2026-06-03.\`\n  </div>\n\n${see}`,
    `<!-- x --> \`As of 2026-06-03.\`\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  // A comment starts at <!-- and ends at --> also between backticks: the
  // note after a <!-- that no --> follows is not read, and the note after
  // the --> that ends a comment is.
  for (const intro of [
    `<div>\n\`<!--\` As of 2026-06-03.\n</div>\n\n${see}`,
    `<div>\nx \` <!--\ny \` As of 2026-06-03.\n</div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
  for (const intro of [
    `<div>\n<!-- x \`-->\` As of 2026-06-03.\n</div>\n\n${see}`,
    `<div>\n\`a <!-- \` --> As of 2026-06-03 \`\n</div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  // In a paragraph, also one after the blank line that ends such a block,
  // the backticks make a code span, which holds no note.
  for (const intro of [`\`As of 2026-06-03.\` ${see}`, `<div>\nx\n</div>\n\n\`As of 2026-06-03.\` ${see}`]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
});

test("a ## line of an HTML block is not a dated page's first H2, so a note below it marks the page, and one below a ## line after the block does not", () => {
  // CommonMark reads each line of the block as raw HTML: in a block that
  // <div> or <details> opens, up to a blank line, also after a line of ```
  // there, in one that <pre> opens, past a blank line up to </pre>, and in
  // a comment, up to -->. No heading starts on such a line, so the page's
  // first H2 is the first ## line after the block.
  const page = (block) => ({
    'docs/AUDIT-2026-06-03.md': `# Audit\n\n${block}\nAs of 2026-06-03. See the [README](../README.md).\n\n## Real\n\n| npm test total | 245 |\n`,
  });
  for (const block of [
    '<div>\n## Counts\n</div>\n',
    '<details>\n## Counts\n</details>\n',
    '<div>\n```\n## Counts\n</div>\n',
    '<!--\n## Counts\n-->\n',
    '<pre>\n## Counts\n\n## More\n</pre>\n',
  ]) {
    const r = check(DATED_LINK, page(block));
    assert.equal(r.status, 0, `${block}\n${r.stderr}`);
  }
  // A blank line ends a <div> block, a line without the ">" of the block
  // quote that holds one ends that block quote, and so the block, and a
  // comment that ends on its first line is that line alone: the ## line
  // after each is the page's first H2, and the note below it is not read.
  for (const block of ['<div>\n</div>\n\n## Counts\n', '> <div>\n## Counts\n', '<!-- x -->\n## Counts\n']) {
    const r = check(DATED_LINK, page(block));
    assert.equal(r.status, 1, block);
    assert.match(r.stderr, DATED, block);
    assert.match(r.stderr, /it must say "as of 2026-06-03" and link to the README for the current figures; /, block);
  }
});

test('a note inside a comment, processing instruction, declaration or CDATA section in a paragraph, a heading or a table cell does not mark a dated page', () => {
  // None of these shows its text where it sits inline either, also where it
  // runs on to a later line of its paragraph, in a block quote or a list
  // item, and a line break inside one is not a space between the words
  // around it. A > marker of a block quote ends no declaration.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `Hello <!-- As of 2026-06-03. --> world.\n\n${see}`,
    `| <!-- As of 2026-06-03. --> | x |\n| - | - |\n\n${see}`,
    `### Audit <!-- As of 2026-06-03. -->\n\n${see}`,
    `Hello <?note As of 2026-06-03. ?> world.\n\n${see}`,
    `Hello <!NOTE As of 2026-06-03.> world.\n\n${see}`,
    `Hello <![CDATA[As of 2026-06-03.]]> world.\n\n${see}`,
    `Hello <!-- As of\n2026-06-03. --> world.\n\n${see}`,
    `Hello <!--\nAs of 2026-06-03.\n--> world.\n\n${see}`,
    `Hello <?note\nAs of 2026-06-03.\n?> world.\n\n${see}`,
    `> Hello <!-- As of\n> 2026-06-03. --> world.\n\n${see}`,
    `> Hello <!NOTE x\n> As of 2026-06-03.> world.\n\n${see}`,
    `- Hello <!-- As of\n2026-06-03. --> world.\n\n${see}`,
    `As of<!--\n-->2026-06-03.\n\n${see}`,
    `Hello <!-- As of 2026-06-03. \` --> x \`\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
  // The text after the end of one is read, also on the line that holds the
  // end, and a backtick inside one, or inside a tag, opens no code span. A
  // <!-- inside a code span opens no comment, nor does one whose end its
  // paragraph does not hold, and a cell of a table row ends what opens in
  // it, a code span too.
  for (const intro of [
    `Draft <!-- x --> as of 2026-06-03.\n\n${see}`,
    `Draft <!--\nx\n--> as of 2026-06-03.\n\n${see}`,
    `As of <!--\n--> 2026-06-03.\n\n${see}`,
    `Draft <!-- \` --> as of 2026-06-03 \`.\n\n${see}`,
    `Draft <b title="\`">as of 2026-06-03</b> \`.\n\n${see}`,
    `Draft <!--\nx \`-->\` as of 2026-06-03.\n\n${see}`,
    `\`<!--\` As of 2026-06-03. \`-->\`\n\n${see}`,
    `Hello <!-- As of 2026-06-03.\n\n${see}`,
    `Hello <!-- As of 2026-06-03.\n\n--> world.\n\n${see}`,
    `| <!-- x | As of 2026-06-03. --> |\n| - | - |\n\n${see}`,
    `| \`a | As of 2026-06-03. | b\` |\n| - | - | - |\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
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

test('a ## line of a fenced code block or of an HTML block does not end the What Gets Tested section, and a ## line outside one does', () => {
  // CommonMark reads the ## line as code in a fenced code block, and as raw
  // HTML in a block that <div> opens, up to a blank line, so the table below
  // it is still in the section. The four lines added after the heading move
  // the "Pinned benchmark harness tests" row from line 36 to line 40.
  const below = (block, text) => text.replace('## What Gets Tested\n', `## What Gets Tested\n\n${block}`);
  const wrong = (text) => text.replace('| Pinned benchmark harness tests | 3 |', '| Pinned benchmark harness tests | 4 |');
  const ROW = 'the "Pinned benchmark harness tests" row says 4; the test report has 3 tests in src/benchmark/pinned.';
  for (const block of ['<div>\n## Note\n</div>\n', '```bash\n## Note\n```\n']) {
    const ok = checkCounts(below(block, COUNTED));
    assert.equal(ok.status, 0, `${block}\n${ok.stderr}`);
    const bad = checkCounts(wrong(below(block, COUNTED)));
    assert.equal(bad.status, 1, block);
    assert.equal(bad.stderr.trim(), `README: line 40: ${ROW}`, block);
  }
  // The same on a page that took README text, where the README's text from
  // the heading on moved to docs/test-catalog.md.
  const at = COUNTED.indexOf('## What Gets Tested');
  const page = (catalog) => checkCounts(COUNTED.slice(0, at), SUITE, report(SUITE), { ...SOURCES, 'docs/test-catalog.md': catalog });
  const catalog = below('<div>\n## Note\n</div>\n', COUNTED.slice(at));
  const ok = page(catalog);
  assert.equal(ok.status, 0, ok.stderr);
  const bad = page(wrong(catalog));
  assert.equal(bad.status, 1);
  assert.equal(bad.stderr.trim(), `README: docs/test-catalog.md line 17: ${ROW}`);
  // An H2 ends the section, so the table below it is not read.
  for (const r of [checkCounts(below('## Note\n', COUNTED)), page(below('## Note\n', COUNTED.slice(at)))]) {
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^README: the "What Gets Tested" table was not found; /m);
  }
});

test('a | line of a fenced code block or of an HTML block in the What Gets Tested section is no row of the table', () => {
  // CommonMark reads the | line as code in a fenced code block, as raw HTML
  // in a block that <div> opens, up to a blank line, and in one that <!--
  // opens, up to the line that holds -->, so the rows of the section are
  // those of the table, with the block above or below it. The four lines
  // added after the heading move the "Pinned benchmark harness tests" row
  // from line 36 to line 40; on a page that took README text, where the
  // README's text from the heading on moved to docs/test-catalog.md, the
  // row is at line 13, and at line 17 with those lines.
  const TOTAL = '| **`npm test` total** | **15** | (14 pass, 1 skipped on every platform) | |\n';
  const above = (block, text) => text.replace('## What Gets Tested\n', `## What Gets Tested\n\n${block}`);
  const below = (block, text) => text.replace(TOTAL, `${TOTAL}\n${block}`);
  const wrong = (text) => text.replace('| Pinned benchmark harness tests | 3 |', '| Pinned benchmark harness tests | 4 |');
  const ROW = 'the "Pinned benchmark harness tests" row says 4; the test report has 3 tests in src/benchmark/pinned.';
  const at = COUNTED.indexOf('## What Gets Tested');
  const page = (catalog) => checkCounts(COUNTED.slice(0, at), SUITE, report(SUITE), { ...SOURCES, 'docs/test-catalog.md': catalog });
  for (const block of ['```text\n| Fake row | 99 |\n```\n', '~~~\n| Fake row | 99 |\n~~~\n', '<div>\n| Fake row | 99 |\n</div>\n', '<!--\n| Fake row | 99 |\n-->\n']) {
    for (const [place, line, pageLine] of [[above, 40, 17], [below, 36, 13]]) {
      const ok = checkCounts(place(block, COUNTED));
      assert.equal(ok.status, 0, `${block}\n${ok.stderr}`);
      const bad = checkCounts(wrong(place(block, COUNTED)));
      assert.equal(bad.status, 1, block);
      assert.equal(bad.stderr.trim(), `README: line ${line}: ${ROW}`, block);
      const okPage = page(place(block, COUNTED.slice(at)));
      assert.equal(okPage.status, 0, `${block}\n${okPage.stderr}`);
      const badPage = page(wrong(place(block, COUNTED.slice(at))));
      assert.equal(badPage.status, 1, block);
      assert.equal(badPage.stderr.trim(), `README: docs/test-catalog.md line ${pageLine}: ${ROW}`, block);
    }
  }
});

test('a ## What Gets Tested line of a fenced code block or of an HTML block does not start the What Gets Tested section', () => {
  // CommonMark reads the ## line as code in a fenced code block, as raw HTML
  // in a block that <!-- opens, up to the line that holds -->, and in one
  // that <div> opens, up to a blank line, so the section starts at the
  // heading below the block, and the table checked is the one below that
  // heading. The block and the blank line after it, added before the
  // heading, move the "Pinned benchmark harness tests" row from line 36 to
  // line 44, or 43 with the <div> block, which holds no blank line; on a
  // page that took README text, where the README's text from the heading on
  // moved to docs/test-catalog.md, from line 13 to line 21, or 20.
  const TABLE = '| Category | Tests | Source | What |\n|---|---|---|---|\n| Fake | 99 | `src/atomic` | x |\n';
  const before = (block, text) => text.replace('## What Gets Tested\n', `${block}\n## What Gets Tested\n`);
  const wrong = (text) => text.replace('| Pinned benchmark harness tests | 3 |', '| Pinned benchmark harness tests | 4 |');
  const ROW = 'the "Pinned benchmark harness tests" row says 4; the test report has 3 tests in src/benchmark/pinned.';
  const at = COUNTED.indexOf('## What Gets Tested');
  const page = (catalog) => checkCounts(COUNTED.slice(0, at), SUITE, report(SUITE), { ...SOURCES, 'docs/test-catalog.md': catalog });
  for (const [block, line, pageLine] of [
    [`<!--\n## What Gets Tested\n\n${TABLE}-->\n`, 44, 21],
    [`<div>\n## What Gets Tested\n${TABLE}</div>\n`, 43, 20],
    [`\`\`\`markdown\n## What Gets Tested\n\n${TABLE}\`\`\`\n`, 44, 21],
  ]) {
    const ok = checkCounts(before(block, COUNTED));
    assert.equal(ok.status, 0, `${block}\n${ok.stderr}`);
    const bad = checkCounts(wrong(before(block, COUNTED)));
    assert.equal(bad.status, 1, block);
    assert.equal(bad.stderr.trim(), `README: line ${line}: ${ROW}`, block);
    const okPage = page(before(block, COUNTED.slice(at)));
    assert.equal(okPage.status, 0, `${block}\n${okPage.stderr}`);
    const badPage = page(wrong(before(block, COUNTED.slice(at))));
    assert.equal(badPage.status, 1, block);
    assert.equal(badPage.stderr.trim(), `README: docs/test-catalog.md line ${pageLine}: ${ROW}`, block);
  }
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
