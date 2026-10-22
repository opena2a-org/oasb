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
  // HTML in a block that <div> opens, or <span> alone on a line (kind 7), up
  // to a blank line, so the table and the link below the block are still in
  // the section. withAtlas() puts the row at line 45; the four lines added
  // after the heading move it to 49.
  const below = (block, readme) => readme.replace('## MITRE ATLAS Coverage\n', `## MITRE ATLAS Coverage\n\n${block}`);
  const listed = withAtlas('| Exfiltration via Cyber Means | AML.T0025 | AT-NET-001, E2E-003 |');
  const linked = withAtlas('| Exfiltration via Cyber Means | AML.T0025 | AT-NET-001 |', ' Detail: [mapping](docs/atlas.md).');
  const page = withPage('| E2E-003 | Outbound TCP |');
  for (const block of ['<div>\n## Note\n</div>\n', '<span>\n## Note\n</span>\n', '```bash\n## Note\n```\n']) {
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
// <div> opens, up to a blank line, as in one that an open tag or a closing
// tag alone on a line opens (kind 7), such as <span>, </span> or
// <span class="note">, so the section starts at the heading below the block,
// and the table and the link below that heading are in it. withAtlas() puts
// the row at line 45; the block and the blank line after it, added before
// the heading, move it to 49.
for (const [kind, block] of [
  ['a block that <!-- opens', '<!--\n## MITRE ATLAS Coverage\n-->\n'],
  ['a block that <div> opens', '<div>\n## MITRE ATLAS Coverage\n</div>\n'],
  ['a block that <span> opens', '<span>\n## MITRE ATLAS Coverage\n</span>\n'],
  ['a block that </span> opens', '</span>\n## MITRE ATLAS Coverage\n<span>\n'],
  ['a block that <span class="note"> opens', '<span class="note">  \n## MITRE ATLAS Coverage\n</span>\n'],
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

test('a tag alone on a line that goes on with a paragraph, or a tag with text after it on its line, opens no HTML block, so the ## MITRE ATLAS Coverage line below it starts the section', () => {
  // An HTML block of kind 7 cannot interrupt a paragraph, so <span> on a
  // line that goes on with one, also lazily without the > of the block quote
  // that holds it, is paragraph text, and a tag with text after it on its
  // line opens no such block. The ## line below each is an H2, which starts
  // the section, so the section ends at the ## MITRE ATLAS Coverage heading
  // below it, and the table below that heading is not read.
  for (const block of [
    'Text.\n<span>\n## MITRE ATLAS Coverage\n</span>\n',
    '> Text.\n<span>\n## MITRE ATLAS Coverage\n</span>\n',
    '<span>Text.\n## MITRE ATLAS Coverage\n</span>\n',
  ]) {
    const before = (readme) => readme.replace('## MITRE ATLAS Coverage\n', `${block}\n## MITRE ATLAS Coverage\n`);
    const r = checkCounts(before(withAtlas('| Exfiltration via Cyber Means | AML.T0025 | AT-NET-001, E2E-003 |')));
    assert.equal(r.status, 0, `${block}\n${r.stderr}`);
  }
});

test('a markdown link on a line of an HTML block that a tag alone on a line opens is not resolved, and one in a paragraph that such a line goes on with is', () => {
  // CommonMark reads each line of a block that an open tag or a closing tag
  // alone on a line opens (kind 7), up to a blank line, as raw HTML, where
  // [the page](docs/nowhere.md) is text. Such a block starts on a line that
  // follows no paragraph text, or that opens a block quote or list item,
  // also below a paragraph. It cannot interrupt a paragraph, so on a line
  // that goes on with one the tag is paragraph text, and so is the link
  // below it, as it is after the blank line that ends the block and after a
  // tag with text after it on its line.
  for (const body of [
    '<span>\nSee [the page](docs/nowhere.md).\n</span>\n',
    '</span>\nSee [the page](docs/nowhere.md).\n',
    '<img src="logo.png" />\nSee [the page](docs/nowhere.md).\n',
    '> <span>\n> See [the page](docs/nowhere.md).\n',
    'Text.\n> <span>\n> See [the page](docs/nowhere.md).\n',
    'Text.\n- <span>\n  See [the page](docs/nowhere.md).\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  for (const [body, line] of [
    ['Text.\n<span>\nSee [the page](docs/nowhere.md).\n', 13],
    ['> Text.\n> <span>\n> See [the page](docs/nowhere.md).\n', 13],
    ['- Text.\n<span>\n  See [the page](docs/nowhere.md).\n', 13],
    ['<span>\n\nSee [the page](docs/nowhere.md).\n', 13],
    ['<span>Text.\nSee [the page](docs/nowhere.md).\n', 12],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`^README: line ${line}: link target "docs/nowhere\\.md" does not exist\\.$`, 'm'), body);
  }
});

test('a tag with a no-break space after it, or in place of a space or tab in it, opens no HTML block, so a markdown link on the line below it is resolved', () => {
  // CommonMark reads only spaces and tabs as white space in a tag and after
  // the tag that opens a block of kind 7, so with a no-break space (U+00A0)
  // in either place the tag line is paragraph text, and so is the link
  // below it. With a tab in its place, the tag opens such a block, as it
  // does with a no-break space inside a quoted attribute value.
  for (const tag of ['<span> ', '<span class="note">', '</span >']) {
    const r = check(`${tag}\nSee [the page](docs/nowhere.md).\n`);
    assert.equal(r.status, 1, tag);
    assert.match(r.stderr, /^README: line 12: link target "docs\/nowhere\.md" does not exist\.$/m, tag);
  }
  for (const tag of ['<span>\t', '<span\tclass="note">', '</span\t>', '<span title="a b">']) {
    const r = check(`${tag}\nSee [the page](docs/nowhere.md).\n`);
    assert.equal(r.status, 0, `${tag}\n${r.stderr}`);
  }
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

test('a [ or ] inside raw HTML that ends on a later line of its paragraph neither opens nor closes link text', () => {
  // commonmark.js 0.31.2 and markdown-it 14.1.0 read raw HTML in the lines
  // of a paragraph joined by line breaks, so a tag's quoted value or white
  // space may hold the break, and a comment, processing instruction, CDATA
  // section or declaration may end on a later line. Both render each of
  // these with a link to docs/nowhere.md, on the paragraph's last line.
  for (const body of [
    '[a <b title="]\n"> b](docs/nowhere.md)\n',
    '[a <b title="]\nc\n"> b](docs/nowhere.md)\n',
    '> [a <b title="]\n> "> b](docs/nowhere.md)\n',
    '> [a <b title="]\n"> b](docs/nowhere.md)\n',
    '- [a <b title="]\n  "> b](docs/nowhere.md)\n',
    '[a <!-- ]\n--> b](docs/nowhere.md)\n',
    '[a <? ]\n?> b](docs/nowhere.md)\n',
    '[a <![CDATA[ ]\n]]> b](docs/nowhere.md)\n',
    '[a <!X ]\nb> c](docs/nowhere.md)\n',
    // The > of a block quote that a line goes on with is no part of the
    // paragraph's text, so it ends no tag or declaration, while a > that
    // starts the text of a line 4 or more columns in ends a closing tag.
    '> [a <b\n> title="]"> b](docs/nowhere.md)\n',
    '> [a <!X ]\n> b> c](docs/nowhere.md)\n',
    '[a </b\n    > b](docs/nowhere.md)\n',
    // A backtick inside such a tag opens no code span.
    'x <b title="`\n"> [z](docs/nowhere.md) y`\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    const line = 10 + body.trimEnd().split('\n').length;
    assert.match(r.stderr, new RegExp(`line ${line}: link target "docs/nowhere\\.md" does not exist`), body);
  }
  // They render none of these with a link: the [ or ] is inside raw HTML
  // that ends on the next line, or that line starts inside it and holds no
  // link or definition.
  for (const body of [
    '<b title="[\n">x](docs/nowhere.md)\n',
    'x <!-- [\n-->x](docs/nowhere.md)\n',
    '<b title="x\n[y](docs/nowhere.md)">\n',
    '<b title="x\n[a]: docs/nowhere.md">\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
});

test('a < that opens no autolink or raw HTML in its paragraph is text, so a ] after it closes link text', () => {
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

test('an href is read after a backtick inside a tag, a comment, an autolink or a link title, which opens no code span', () => {
  // commonmark.js 0.31.2 and markdown-it 14.1.0 render each of these with
  // the href: the backtick inside the tag, the comment, the autolink or the
  // title is text, so the backtick before y or z opens no code span with it.
  for (const body of [
    '<a title="`" href="docs/nowhere.md">x</a> `y`\n',
    'x <!-- ` --> <a href="docs/nowhere.md">x</a> `y`\n',
    'x <https://example.org/`> <a href="docs/nowhere.md">x</a> `y`\n',
    '[x](docs/guide.md "`") <a href="docs/nowhere.md">y</a> `z`\n',
    '| h |\n| - |\n| <a title="`" href="docs/nowhere.md">x</a> `y` |\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    const line = 10 + body.trimEnd().split('\n').length;
    assert.match(r.stderr, new RegExp(`line ${line}: link target "docs/nowhere\\.md" does not exist`), body);
  }
  // Both render this one without the href: a code span opens at the
  // backtick after the tag and holds the <a>.
  const held = check('<b title="`"> `x <a href="docs/nowhere.md">y</a> `\n');
  assert.equal(held.status, 0, held.stderr);
});

test('an href is read in a tag that starts on an earlier line of its paragraph, and not inside another tag\'s quoted value, a comment or a link title', () => {
  // markdown-it 14.1.0 and commonmark.js 0.31.2 render each of these with
  // the <a>, and parse5 7.3.0, which parses HTML as the HTML standard
  // does, reads a link to docs/nowhere.md in what they render. The href is
  // on the paragraph's last line, in a tag that starts on an earlier line,
  // also in a block quote, in a list item or after a code span that runs on
  // to the line the tag starts on, or in a tag after one that does.
  for (const [body, line] of [
    ['<a title="x\ny" href="docs/nowhere.md">z</a>\n', 12],
    ['x <a title="x"\nhref="docs/nowhere.md">z</a>\n', 12],
    ['<a title="x\ny\nz" href="docs/nowhere.md">w</a>\n', 13],
    ['> <a title="x\n> y" href="docs/nowhere.md">z</a>\n', 12],
    ['- <a title="x\n  y" href="docs/nowhere.md">z</a>\n', 12],
    ['a `x\ny` <a title="p\nq" href="docs/nowhere.md">z</a>\n', 13],
    ['<b title="x\ny">z</b> <a href="docs/nowhere.md">w</a>\n', 12],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`^README: line ${line}: link target "docs/nowhere\\.md" does not exist\\.$`, 'm'), body);
  }
  // parse5 reads no link to docs/nowhere.md in what they render of these:
  // the <a> is inside the quoted value of another tag, which may hold a
  // line break, in a paragraph, a block quote, a heading or a table cell;
  // inside a comment, a processing instruction, a declaration, a CDATA
  // section or a link's title; or it is text, as a backslash escapes its <
  // or no white space follows its quoted value.
  for (const body of [
    '<b title="<a href=\'docs/nowhere.md\'>">x</b>\n',
    '<b title="x\n<a href=\'docs/nowhere.md\'>">\n',
    'x <b title=\'<a href="docs/nowhere.md">\'>y</b>\n',
    '> <b title="<a href=\'docs/nowhere.md\'>">x</b>\n',
    '## <b title="<a href=\'docs/nowhere.md\'>">x</b>\n',
    '| h |\n| - |\n| <b title="<a href=\'docs/nowhere.md\'>">x</b> |\n',
    'x <!-- <a href="docs/nowhere.md"> -->\n',
    'x <? <a href="docs/nowhere.md"> ?>\n',
    'x <!X <a href="docs/nowhere.md">\n',
    'x <![CDATA[ <a href="docs/nowhere.md"> ]]>\n',
    '[x](docs/guide.md "<a href=\'docs/nowhere.md\'>")\n',
    '\\<a href="docs/nowhere.md">x\n',
    '<a href="docs/nowhere.md"y>x</a>\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
});

test('an href is read in a tag after the first > inside a processing instruction or CDATA section, or after a --!> inside a comment, where a browser ends it', () => {
  // A browser reads <? and <![CDATA[ as the start of a bogus comment, which
  // ends at the first > after it, and ends a comment at a --!> after its
  // <!--, before the ?>, ]]> or --> at which CommonMark ends each of these.
  // commonmark.js 0.31.2 and markdown-it 14.1.0 (html: true) pass each of
  // these on as raw HTML, and parse5 7.3.0 reads a link to docs/nowhere.md
  // in what they render: in a tag after that end, on its line or on a later
  // line of the paragraph, also in a heading, a table row, a block quote or
  // a list item, in a tag that CommonMark reads as text and the HTML
  // tokenizer as a tag, such as <a b="c"href="docs/nowhere.md">, and after
  // a comment or a bogus comment that ends before the tag.
  for (const [body, line] of [
    ['x <? > <a href="docs/nowhere.md">y</a> ?>\n', 11],
    ['x <![CDATA[ > <a href="docs/nowhere.md">y</a> ]]>\n', 11],
    ['x <!-- --!> <a href="docs/nowhere.md">y</a> -->\n', 11],
    ['x <!----!> <a href="docs/nowhere.md">y</a> -->\n', 11],
    ['x <? >\n<a href="docs/nowhere.md">y</a> ?>\n', 12],
    ['x <? > <a title="z"\nhref="docs/nowhere.md">y</a> ?>\n', 12],
    ['## x <? > <a href="docs/nowhere.md">y</a> ?>\n', 11],
    ['| h |\n| - |\n| x <? > <a href="docs/nowhere.md">y</a> ?> |\n', 13],
    ['> x <? >\n> <a href="docs/nowhere.md">y</a> ?>\n', 12],
    ['- x <![CDATA[ >\n  <a href="docs/nowhere.md">y</a> ]]>\n', 12],
    ["x <? > <A HREF='docs/nowhere.md'>y</A> ?>\n", 11],
    ['x <? > <a b"c href="docs/nowhere.md">y</a> ?>\n', 11],
    ['x <? > <a/href="docs/nowhere.md">y</a> ?>\n', 11],
    ['x <? > <a b="c"href="docs/nowhere.md">y</a> ?>\n', 11],
    ['x <!-- --!> <? > <a href="docs/nowhere.md"> ?> -->\n', 11],
    ['x <? > </> <a href="docs/nowhere.md">y</a> ?>\n', 11],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`^README: line ${line}: link target "docs/nowhere\\.md" does not exist\\.$`, 'm'), body);
  }
  // parse5 reads no link to docs/nowhere.md in what they render of these:
  // the first > after the <? or <![CDATA[ is the tag's own; the --!> of
  // <!--!> and <!---!> takes its dashes from the <!--, so the comment runs
  // on to the -->; the tag is inside a comment or a bogus comment that the
  // rest opens, from <!--, <?, <! or </ and a space, or inside the quoted
  // value of another tag; the href is that of a closing tag; the tag's
  // first attribute starts with =, so the > in its quoted value ends the
  // tag; a quote in an attribute's name opens no value, so the href is
  // inside the quoted value of the next attribute; or the tag's first href
  // is docs/guide.md, as a browser drops a later one.
  for (const body of [
    'x <? <a href="docs/nowhere.md"> ?>\n',
    'x <![CDATA[ <a href="docs/nowhere.md"> ]]>\n',
    'x <!--!> <a href="docs/nowhere.md">y</a> -->\n',
    'x <!---!> <a href="docs/nowhere.md">y</a> -->\n',
    'x <? > <!-- <a href="docs/nowhere.md"> --> ?>\n',
    'x <? > <?x <a href="docs/nowhere.md"> ?>\n',
    'x <? > <!x <a href="docs/nowhere.md"> ?>\n',
    'x <? > </ <a href="docs/nowhere.md"> ?>\n',
    'x <? > <b title="<a href=\'docs/nowhere.md\'>">y</b> ?>\n',
    'x <? > </b href="docs/nowhere.md"> ?>\n',
    'x <? > <a ="z>" href="docs/nowhere.md">y</a> ?>\n',
    'x <? > <a x\' b="y\' href=\'docs/nowhere.md">z</a> ?>\n',
    'x <? > <a href="docs/guide.md" href="docs/nowhere.md">y</a> ?>\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
});

test('an href is not read in the text of a <script>, <style>, <textarea>, <title>, <xmp>, <iframe>, <noembed>, <noframes>, <noscript> or <plaintext> element in a paragraph, a heading or a table cell, up to the end tag at which a browser ends the element', () => {
  // A browser reads the text of these elements as text, not as HTML. In the
  // HTML a CommonMark renderer makes of each of these lines, which passes
  // the elements and the <a> on as raw HTML, WebKit (the HTML import of
  // textutil on macOS 26.6.2) reads no link to docs/nowhere.md: the <a> is
  // inside the element, which the line opens, also after where a browser
  // ends a processing instruction, in a heading, a table cell or on the
  // next line of the paragraph, with its name in any case or a / before
  // its >; a tag whose name only starts with the element's, an end tag in
  // a code span, which a renderer writes as text, and </plaintext> end
  // none of them; and in the <script> of each of the last three lines, the
  // first </script>, which follows <!-- and then <script with no --> between
  // them, ends none.
  const NAMES = ['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext'];
  for (const body of [
    ...NAMES.map((name) => `x <${name}> <a href="docs/nowhere.md">y</a> </${name}>\n`),
    ...NAMES.map((name) => `x <? > <${name}> <a href="docs/nowhere.md">y</a> </${name}> ?>\n`),
    '## x <textarea> <a href="docs/nowhere.md">y</a> </textarea>\n',
    '| h |\n| - |\n| x <textarea> <a href="docs/nowhere.md">y</a> </textarea> |\n',
    'x <textarea>\n<a href="docs/nowhere.md">y</a> </textarea>\n',
    'x <? > <textarea> ?> <a href="docs/nowhere.md">y</a>\n',
    'x <TEXTAREA> <a href="docs/nowhere.md">y</a> </TEXTAREA>\n',
    'x <textarea/> <a href="docs/nowhere.md">y</a> </textarea>\n',
    'x <textarea> </textareax> <a href="docs/nowhere.md">y</a>\n',
    'x <textarea> `</textarea>` <a href="docs/nowhere.md">y</a>\n',
    'x <plaintext> </plaintext> <a href="docs/nowhere.md">y</a>\n',
    'x <script> <!-- <script> </script> <a href="docs/nowhere.md">y</a> --> </script>\n',
    'x <script> <!-- <script> </script> <a href="docs/nowhere.md"> -->\n',
    'x <script> <? <!-- <script> ?> </script> <a href="docs/nowhere.md">y</a>\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // WebKit reads a link to docs/nowhere.md in the HTML of each of these:
  // the <a> follows the end tag at which a browser ends the element, in
  // any case, also inside a comment, a processing instruction or another
  // tag's quoted value, on a later line of the paragraph, in a heading or
  // in a table cell, or in a <script> after <!-- and no <script>; or it
  // comes before the start tag, or after a tag whose name only starts with
  // the element's.
  for (const [body, line] of [
    ['x <textarea> </textarea> <a href="docs/nowhere.md">y</a>\n', 11],
    ['x <textarea> </TEXTAREA> <a href="docs/nowhere.md">y</a>\n', 11],
    ['x <? > <textarea> </textarea> <a href="docs/nowhere.md">y</a> ?>\n', 11],
    ['x <textarea> <!-- </textarea> <a href="docs/nowhere.md">y</a> -->\n', 11],
    ['x <textarea> <? </textarea> <a href="docs/nowhere.md">y</a> ?>\n', 11],
    ['x <textarea> <b title="</textarea><a href=\'docs/nowhere.md\'>">y</b>\n', 11],
    ['x <textarea>\ny </textarea> <a href="docs/nowhere.md">z</a>\n', 12],
    ['## x <style> </style> <a href="docs/nowhere.md">y</a>\n', 11],
    ['| h |\n| - |\n| x <title> </title> <a href="docs/nowhere.md">y</a> |\n', 13],
    ['x <script> <!-- --> </script> <a href="docs/nowhere.md">y</a>\n', 11],
    ['x <script> <? <!-- ?> </script> <a href="docs/nowhere.md">y</a>\n', 11],
    ['x <a href="docs/nowhere.md">y</a> <textarea> z </textarea>\n', 11],
    ['x <textareax> <a href="docs/nowhere.md">y</a>\n', 11],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`^README: line ${line}: link target "docs/nowhere\\.md" does not exist\\.$`, 'm'), body);
  }
});

test('a line of 100,000 tags inside a <textarea> or <script>, which no end tag ends or one ends at the end of the line, is checked in under 2 seconds', () => {
  // The end tag of the element is searched for with one searcher() of the
  // paragraph, so the line is not read again from each tag inside it. The
  // href after the </textarea> at the end of the last line is the only
  // one read on it.
  const tags = '<a href="docs/nowhere.md">'.repeat(100000);
  for (const [line, failures] of [
    [`x <textarea>${tags}`, 0],
    [`x <script>${'<!-- --><a href="docs/nowhere.md">'.repeat(100000)}`, 0],
    [`x <textarea>${tags}</textarea><a href="docs/nowhere.md">`, 1],
  ]) {
    const started = process.hrtime.bigint();
    const r = check(`${line}\n`);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(r.status, failures === 0 ? 0 : 1, r.stderr.slice(0, 500));
    assert.equal((r.stderr.match(/link target "docs\/nowhere\.md" does not exist/g) ?? []).length, failures, r.stderr.slice(0, 500));
    assert.ok(ms < 2000, `${ms.toFixed(0)} ms for a line of ${line.length} characters`);
  }
});

test('an href whose value is unquoted, or in quotes and holds a line break, is read, without the tabs and line breaks that a browser removes from a URL', () => {
  // CommonMark reads an open tag as raw HTML when an attribute's value is
  // unquoted, or in quotes and holds a line break. A browser reads an
  // unquoted value up to white space or a >, and the URL parser removes
  // each tab, line feed and carriage return from a URL: textutil on macOS
  // 26.6.2 reads <a href=docs/one.md>, and <a href="docs/ with two.md"> on
  // the next line, as links to docs/one.md and docs/two.md. Each of these
  // has a link to docs/nowhere.md, named with the line that holds the quote
  // that opens the href's value, or its first character when it is
  // unquoted: in a paragraph, also in a block quote or a list item, whose
  // > markers and indentation CommonMark leaves out of the paragraph's
  // text, and in a tag that starts on an earlier line; in a heading and a
  // table cell; after a > inside <? or <![CDATA[, or after a --!> inside a
  // comment, where a browser ends it; and on a line of an HTML block or of
  // indented code.
  for (const [body, line] of [
    ['x <a href=docs/nowhere.md>y</a>\n', 11],
    ['x <a href="docs/\nnowhere.md">y</a>\n', 11],
    ["x <a href='docs/\nnowhere.md'>y</a>\n", 11],
    ['x <a href="docs/\r\nnowhere.md">y</a>\r\n', 11],
    ['x <a href="docs/now\there.md">y</a>\n', 11],
    ['> x <a href="docs/\n> nowhere.md">y</a>\n', 11],
    ['- x <a href="docs/\n  nowhere.md">y</a>\n', 11],
    ['x <a href="docs/\n   nowhere.md">y</a>\n', 11],
    ['x <a\nhref=docs/nowhere.md>y</a>\n', 12],
    ['x <a href=\ndocs/nowhere.md>y</a>\n', 12],
    ['x <a href="\ndocs/nowhere.md">y</a>\n', 11],
    ['x <a title=t href=docs/nowhere.md>y</a>\n', 11],
    ['x <A HREF = docs/nowhere.md title="t">y</A>\n', 11],
    ['## x <a href=docs/nowhere.md>y</a>\n', 11],
    ['| h |\n| - |\n| <a href=docs/nowhere.md>x</a> |\n', 13],
    ['x <? > <a href=docs/nowhere.md>y</a> ?>\n', 11],
    ['x <![CDATA[ > <a href=docs/nowhere.md>y</a> ]]>\n', 11],
    ['x <!-- --!> <a href=docs/nowhere.md>y</a> -->\n', 11],
    ['x <? > <a href="docs/\nnowhere.md">y</a> ?>\n', 11],
    ['> x <? > <a href="docs/\n> nowhere.md">y</a> ?>\n', 11],
    ['<div>\n<a href=docs/nowhere.md>x</a>\n</div>\n', 12],
    ['    <a href=docs/nowhere.md>x</a>\n', 11],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`^README: line ${line}: link target "docs/nowhere\\.md" does not exist\\.$`, 'm'), body);
  }
  const anchor = check('x <a href=#no-such-heading>y</a>\n');
  assert.equal(anchor.status, 1);
  assert.match(anchor.stderr, /^README: line 11: anchor "#no-such-heading" has no matching heading in README\.md\.$/m);
  // Each of these links to docs/guide.md, which exists: CommonMark leaves
  // the > of the block quote out of the paragraph's text, the URL parser
  // removes the line break and the tab, and a browser reads the first href
  // of a tag and drops a later one. textutil reads an href of docs/fo, a
  // tab and ur.md as a link to docs/four.md, and <a href=docs/three.md
  // href="docs/other.md"> as one to docs/three.md.
  for (const body of [
    'x <a href=docs/guide.md#setup-steps>y</a>\n',
    'x <a href="docs/\nguide.md">y</a>\n',
    '> x <a href="docs/\n> guide.md">y</a>\n',
    'x <a href="docs/gu\tide.md">y</a>\n',
    '<div>\n<a href="docs/gu\tide.md">x</a>\n</div>\n',
    'x <? > <a href="docs/gu\tide.md">y</a> ?>\n',
    'x <a href=docs/guide.md href="docs/nowhere.md">y</a>\n',
    'x <? > <a href=docs/guide.md href="docs/nowhere.md">y</a> ?>\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // None of these links to docs/nowhere.md: a backslash escapes the <; the
  // tag is inside another tag's quoted value, a comment, a code span or a
  // link's title; the first > after the <? is the tag's own; or the
  // attribute is named data-href.
  for (const body of [
    '\\<a href=docs/nowhere.md>x\n',
    '<b title="<a href=docs/nowhere.md>">x</b>\n',
    'x <!-- <a href=docs/nowhere.md> -->\n',
    '`<a href=docs/nowhere.md>`\n',
    '[x](docs/guide.md "<a href=docs/nowhere.md>")\n',
    'x <? <a href=docs/nowhere.md> ?>\n',
    'x <a data-href=docs/nowhere.md>y</a>\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
});

test('a line of a tag of 50,000 attributes href=a, each after a no-break space, is checked in under 2 seconds', () => {
  // A line of an HTML block or of indented code is tested for an href at
  // each index, and a no-break space is white space to that test, while an
  // unquoted value runs on past one; a test that read the whole value would
  // read the rest of the line from each no-break space. The line is checked
  // in an HTML block, as indented code and in a paragraph. The tag's first
  // href is docs/guide.md, which exists.
  const tag = `<a href="docs/guide.md"${' href=a'.repeat(50000)}>x</a>`;
  for (const body of [`<div>\n${tag}\n</div>\n`, `    ${tag}\n`, `x ${tag}\n`]) {
    const started = process.hrtime.bigint();
    const r = check(body);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(r.status, 0, r.stderr.slice(0, 500));
    assert.ok(ms < 2000, `${ms.toFixed(0)} ms for a line of ${tag.length} characters after ${JSON.stringify(body.slice(0, 4))}`);
  }
});

test('a line of 200,000 tags with an href, outside a processing instruction or inside one, is checked without a RangeError', () => {
  // Given as the arguments of one push(), the targets of a line of 130,000
  // such tags threw a RangeError (Maximum call stack size exceeded) on
  // Node.js 26.12.0, and those of a line of 120,000 did not.
  const tags = '<a href="docs/guide.md">'.repeat(200000);
  for (const line of [`x ${tags}`, `x <? >${tags} ?>`]) {
    const r = check(`${line}\n`);
    assert.equal(r.status, 0, r.stderr.slice(0, 500));
  }
});

test('an href inside an image that a destination follows is not read, in a paragraph, a heading or a table cell, and one after a ![ that opens no image is', () => {
  // commonmark.js 0.31.2 writes the description of an image into the alt
  // attribute of the <img>, and markdown-it 14.1.0 writes it there as
  // escaped text, so parse5 7.3.0 reads no link to docs/nowhere.md in what
  // either renders of these: the <a> is in an image that a destination
  // follows, also where the tag starts on an earlier line or the ] or the
  // title is on a later line, in a block quote, in a list item, in the
  // description of another image, in link text, inside a ![ that opens no
  // image, in a heading or in a table cell.
  for (const body of [
    "![<a href='docs/nowhere.md'>x</a>](docs/guide.md)\n",
    '![<a\nhref="docs/nowhere.md">x</a>](docs/guide.md)\n',
    "![<a href='docs/nowhere.md'>x</a>\n](docs/guide.md)\n",
    "![<a href='docs/nowhere.md'>x</a>](docs/guide.md\n\"t\")\n",
    "> ![<a\n> href='docs/nowhere.md'>x</a>](docs/guide.md)\n",
    "- ![<a\n  href='docs/nowhere.md'>x</a>](docs/guide.md)\n",
    "![a ![<a href='docs/nowhere.md'>x</a>](docs/guide.md)](docs/guide.md)\n",
    "![[<a href='docs/nowhere.md'>x</a>](docs/guide.md)](docs/guide.md)\n",
    "[![<a href='docs/nowhere.md'>x</a>](docs/guide.md)](docs/guide.md)\n",
    "![![<a href='docs/nowhere.md'>x</a>](docs/guide.md)] y\n",
    "## ![<a href='docs/nowhere.md'>x</a>](docs/guide.md)\n",
    "| h |\n| - |\n| ![<a href='docs/nowhere.md'>x</a>](docs/guide.md) |\n",
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // Both render these with a link to docs/nowhere.md: the ![ opens no
  // image, as no destination follows its ], the paragraph ends before a ]
  // closes it or a backslash escapes the !, in a paragraph, a heading or a
  // table cell.
  for (const [body, line] of [
    ["![<a href='docs/nowhere.md'>x</a>] y\n", 11],
    ["![<a href='docs/nowhere.md'>x</a>] (docs/guide.md)\n", 11],
    ["![<a href='docs/nowhere.md'>x</a>\nmore\n", 11],
    ["\\![<a href='docs/nowhere.md'>x</a>](docs/guide.md)\n", 11],
    ["## ![<a href='docs/nowhere.md'>x</a>] y\n", 11],
    ["| h |\n| - |\n| ![<a href='docs/nowhere.md'>x</a>] y |\n", 13],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`^README: line ${line}: link target "docs/nowhere\\.md" does not exist\\.$`, 'm'), body);
  }
  // An href after an image is read, and the one inside it is not.
  const after = check("![<a href='docs/nowhere.md'>x</a>](docs/guide.md) <a href='docs/missing.md'>y</a>\n");
  assert.equal(after.status, 1);
  assert.match(after.stderr, /^README: line 11: link target "docs\/missing\.md" does not exist\.$/m);
  assert.doesNotMatch(after.stderr, /nowhere/);
});

test('raw HTML inside an image that a destination follows opens and ends no <script>, <textarea> or other element whose text a browser reads as text, in a paragraph, a heading or a table cell', () => {
  // markdown-it 14.1.0 writes the description of an image as escaped text
  // in the alt attribute of the <img>. WebKit (the HTML import of textutil
  // on macOS 26.6.2) reads a link to docs/nowhere.md in
  // <p><img src="docs/guide.md" alt="&lt;textarea&gt;"> <a href="docs/nowhere.md">y</a></p>,
  // also with each of the other nine names in place of textarea, with the
  // alt text &lt;? &gt; &lt;textarea&gt; ?&gt;, and with the start tag as
  // written in the alt attribute. In the HTML of each of these, with the
  // description as escaped text in the alt attribute, it reads one too:
  // the <a> follows the image, also where the image's ] is on the next
  // line, in a block quote, in link text, in a heading or in a table cell,
  // and after a </textarea> that follows the image and ends the <textarea>
  // before it.
  const NAMES = ['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext'];
  for (const [body, line] of [
    ...NAMES.map((name) => [`![<${name}>](docs/guide.md) <a href="docs/nowhere.md">y</a>\n`, 11]),
    ['![<? > <textarea> ?>](docs/guide.md) <a href="docs/nowhere.md">y</a>\n', 11],
    ['![<textarea>\n](docs/guide.md) <a href="docs/nowhere.md">y</a>\n', 12],
    ['> ![<textarea>](docs/guide.md) <a href="docs/nowhere.md">y</a>\n', 11],
    ['[![<textarea>](docs/guide.md)](docs/guide.md) <a href="docs/nowhere.md">y</a>\n', 11],
    ['## ![<textarea>](docs/guide.md) <a href="docs/nowhere.md">y</a>\n', 11],
    ['| h |\n| - |\n| ![<textarea>](docs/guide.md) <a href="docs/nowhere.md">y</a> |\n', 13],
    ['x <textarea> ![</textarea>](docs/guide.md) </textarea> <a href="docs/nowhere.md">y</a>\n', 11],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`^README: line ${line}: link target "docs/nowhere\\.md" does not exist\\.$`, 'm'), body);
  }
  // WebKit reads no link to docs/nowhere.md in the HTML of these, with an
  // image's description as escaped text in the alt attribute: the
  // </textarea> in the image ends no <textarea>, and a <textarea> after the
  // image, or after a ![ that opens no image, as no destination follows
  // its ], opens one, as a renderer passes it on as written. Where the alt
  // attribute holds </textarea> as written, WebKit ends the <textarea>
  // there, and reads a link in the first of these and none in the second,
  // whose <textarea> after that end opens another.
  for (const body of [
    'x <textarea> ![</textarea>](docs/guide.md) <a href="docs/nowhere.md">y</a>\n',
    'x <textarea> ![</textarea><textarea>](docs/guide.md) <a href="docs/nowhere.md">y</a>\n',
    '![x](docs/guide.md) <textarea> <a href="docs/nowhere.md">y</a>\n',
    '![<textarea>] <a href="docs/nowhere.md">y</a>\n',
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
});

test('an href inside an image whose reference a definition on the page names is not read, and one inside an image whose reference none names is', () => {
  // markdown-it 14.1.0 (html: true) writes the description of an image whose
  // reference a definition on the page names, a tag in it as well, as
  // escaped text into the alt attribute of the <img>, and commonmark.js
  // 0.31.2 writes it there too, so parse5 7.3.0 reads no link to
  // docs/nowhere.md in what either renders of these: the label after the ]
  // names a definition after the image or before it, also one written in
  // other case and white space, one on the line after another definition,
  // one with a title, one in a list item, one above a line of dashes and one
  // of a data:image/png destination, and the image is in a paragraph, a
  // block quote, a list item, link text, the description of a ![ that opens
  // no image, a heading or a table cell.
  for (const body of [
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n[ref]: docs/guide.md\n",
    "[ref]: docs/guide.md\n\n![<a href='docs/nowhere.md'>x</a>][ref]\n",
    "![<a\nhref='docs/nowhere.md'>x</a>][My\n  REF]\n\n[my\tref]: docs/guide.md\n",
    "![<a href='docs/nowhere.md'>x</a>][a b]\n\n[A B]: docs/guide.md\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n[a]: docs/guide.md\n[ref]: <docs/guide.md> \"Guide\"\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n- item\n\n  [ref]: docs/guide.md 'Guide'\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n[ref]: docs/guide.md (Guide)\n---\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n[ref]: data:image/png;base64,x\n",
    "> ![<a href='docs/nowhere.md'>x</a>][ref]\n\n[ref]: docs/guide.md\n",
    "- ![<a href='docs/nowhere.md'>x</a>][ref]\n\n[ref]: docs/guide.md\n",
    "[![<a href='docs/nowhere.md'>x</a>][ref]](docs/guide.md)\n\n[ref]: docs/guide.md\n",
    "![a ![<a href='docs/nowhere.md'>x</a>][ref] b][none]\n\n[ref]: docs/guide.md\n",
    "## ![<a href='docs/nowhere.md'>x</a>][ref]\n\n[ref]: docs/guide.md\n",
    "| h |\n| - |\n| ![<a href='docs/nowhere.md'>x</a>][ref] |\n\n[ref]: docs/guide.md\n",
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // Both render these with a link to docs/nowhere.md, as no definition
  // names the image's reference and the ![ opens no image: the page holds
  // none of that label ([nope] after the ] is looked up, not the
  // description), or what reads as one goes on with the image's paragraph,
  // follows other text of its paragraph, is code, raw HTML or the header row
  // of a table, has more than spaces after its destination or title, or has
  // a title with no space before it or one that does not close.
  for (const body of [
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n[other]: docs/guide.md\n",
    "![<a href='docs/nowhere.md'>x</a>][nope]\n\n[ref]: docs/guide.md\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n[ref]: docs/guide.md\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\ntext\n[ref]: docs/guide.md\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n[a]: docs/guide.md\ntext\n[ref]: docs/guide.md\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n```\n[ref]: docs/guide.md\n```\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n<div>\n[ref]: docs/guide.md\n</div>\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n    [ref]: docs/guide.md\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n[ref]: docs/guide.md | y\n--- | ---\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n[ref]: docs/guide.md junk\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n[ref]: docs/guide.md \"Guide\" junk\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n[ref]: <docs/guide.md>\"Guide\"\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n[ref]: docs/guide.md \"Guide\n",
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, /^README: line 11: link target "docs\/nowhere\.md" does not exist\.$/m, body);
  }
  // One of the two renders a link to docs/nowhere.md in each of these, so
  // the href is read. commonmark.js reads no definition with a tab after
  // its ]: and no label longer than 999 characters, and does not make a
  // no-break space in a label a space. markdown-it reads no definition whose
  // destination starts with javascript:, so it reads the line after one as
  // text of that paragraph; it reads the label after a ] up to the ] that
  // closes the [ before b, and a ` in a label as the start of a code span
  // that the ` after c ends; and it reads no image where the ( after the ]
  // starts no destination, where commonmark.js looks up the description.
  for (const body of [
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n[ref]:\tdocs/guide.md\n",
    `![<a href='docs/nowhere.md'>x</a>][${'a'.repeat(1000)}]\n\n[${'a'.repeat(1000)}]: docs/guide.md\n`,
    "![<a href='docs/nowhere.md'>x</a>][a b]\n\n[a b]: docs/guide.md\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n[ref]: javascript:alert(1)\n",
    "![<a href='docs/nowhere.md'>x</a>][ref]\n\n[a]: javascript:alert(1)\n[ref]: docs/guide.md\n",
    "![<a href='docs/nowhere.md'>x</a>][a[b]c]\n\n[<a href='docs/nowhere.md'>x</a>]: docs/guide.md\n",
    "![<a href='docs/nowhere.md'>x</a>][a`b] `c]`\n\n[a`b]: docs/guide.md\n",
    "![<a href='docs/nowhere.md'>x</a>](\n\n[<a href='docs/nowhere.md'>x</a>]: docs/guide.md\n",
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, /^README: line 11: link target "docs\/nowhere\.md" does not exist\.$/m, body);
  }
  // A label of [] after the ], or none, is the description, so the
  // definition that names the image holds the same <a> in its label, which
  // neither renders either. Check 4 reads that href on the definition's
  // line, as it reads the hrefs on each line it reads a definition on, and
  // reports that line (13) alone.
  for (const body of [
    "![<a href='docs/nowhere.md'>x</a>][]\n\n[<a href='docs/nowhere.md'>x</a>]: docs/guide.md\n",
    "![<a href='docs/nowhere.md'>x</a>]\n\n[<A HREF='docs/nowhere.md'>X</A>]: docs/guide.md\n",
    "![<a href='docs/nowhere.md'>x</a>] [ref]\n\n[<a href='docs/nowhere.md'>x</a>]: docs/guide.md\n",
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.equal(r.stderr.trim(), 'README: line 13: link target "docs/nowhere.md" does not exist.', body);
  }
  // An href after such an image is read, and the one inside it is not.
  const after = check("![<a href='docs/nowhere.md'>x</a>][ref] <a href='docs/missing.md'>y</a>\n\n[ref]: docs/guide.md\n");
  assert.equal(after.status, 1);
  assert.match(after.stderr, /^README: line 11: link target "docs\/missing\.md" does not exist\.$/m);
  assert.doesNotMatch(after.stderr, /nowhere/);
});

test('the MITRE ATLAS Coverage section and a dated page read no link inside an image whose reference a definition elsewhere on the page names', () => {
  // The definition is below the section and below the dated page's first
  // H2, outside the lines that checks 7 and 9 read links on, and both
  // renderers write the <a> in the image into its alt attribute, so the
  // section links no page and the dated page does not link the README.
  const readme = (definition) =>
    `${withAtlas('| Exfiltration via Cyber Means | AML.T0025 | AT-NET-001 |', " Detail: ![<a href='docs/atlas.md'>mapping</a>][atlas].")}\n${definition}\n`;
  let r = checkCounts(readme('[atlas]: docs/atlas.md'), SUITE, report(SUITE), withPage('| E2E-003 | Outbound TCP |'));
  assert.equal(r.status, 0, r.stderr);
  r = checkCounts(readme('[other]: docs/atlas.md'), SUITE, report(SUITE), withPage('| E2E-003 | Outbound TCP |'));
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), `README: docs/atlas.md line 6: ${SKIPPED_E2E_003}`);

  const page = (definition) => ({
    'docs/AUDIT-2026-06-03.md': `# Audit\n\n> As of 2026-06-03, see ![<a href="../README.md">the README</a>][readme].\n\n## Counts\n\n| npm test total | 245 |\n\n${definition}\n`,
  });
  r = check(DATED_LINK, page('[readme]: ../README.md'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, DATED);
  assert.match(r.stderr, /it must link to the README for the current figures; /);
  r = check(DATED_LINK, page('[other]: ../README.md'));
  assert.equal(r.status, 0, r.stderr);
});

test('raw HTML inside an image whose reference a definition on the page names opens and ends no <script>, <textarea> or other element whose text a browser reads as text, as in an image that a destination follows', () => {
  // commonmark.js 0.31.2 writes the description of such an image into the
  // alt attribute of the <img> as written, and markdown-it 14.1.0 (html:
  // true) writes it there as escaped text. parse5 7.3.0 reads a link to
  // docs/nowhere.md in what each renders of these: the <a> follows the
  // image, also with each of the other nine names in place of textarea,
  // with <? > <textarea> ?> as the description, with the label in other
  // case, with [] or no label after the ] and the description as the
  // definition's label, with the definition above the image, with the
  // image's ] on the next line, and with the image in a block quote, a list
  // item, a heading or a table cell.
  const NAMES = ['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext'];
  for (const [body, line] of [
    ...NAMES.map((name) => [`![x <${name}>][ref] <a href='docs/nowhere.md'>y</a>\n\n[ref]: docs/guide.md\n`, 11]),
    ["![<? > <textarea> ?>][ref] <a href='docs/nowhere.md'>y</a>\n\n[ref]: docs/guide.md\n", 11],
    ["![x <textarea>][REF] <a href='docs/nowhere.md'>y</a>\n\n[ref]: docs/guide.md\n", 11],
    ["![x <textarea>][] <a href='docs/nowhere.md'>y</a>\n\n[x <textarea>]: docs/guide.md\n", 11],
    ["![x <textarea>] <a href='docs/nowhere.md'>y</a>\n\n[x <textarea>]: docs/guide.md\n", 11],
    ["[ref]: docs/guide.md\n\n![x <textarea>][ref] <a href='docs/nowhere.md'>y</a>\n", 13],
    ["![x <textarea>\n][ref] <a href='docs/nowhere.md'>y</a>\n\n[ref]: docs/guide.md\n", 12],
    ["> ![x <textarea>][ref] <a href='docs/nowhere.md'>y</a>\n\n[ref]: docs/guide.md\n", 11],
    ["- ![x <textarea>][ref] <a href='docs/nowhere.md'>y</a>\n\n[ref]: docs/guide.md\n", 11],
    ["## ![x <textarea>][ref] <a href='docs/nowhere.md'>y</a>\n\n[ref]: docs/guide.md\n", 11],
    ["| h |\n| - |\n| ![x <textarea>][ref] <a href='docs/nowhere.md'>y</a> |\n\n[ref]: docs/guide.md\n", 13],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`^README: line ${line}: link target "docs/nowhere\\.md" does not exist\\.$`, 'm'), body);
  }
  // An end tag in such an image ends no such element either, so the href
  // after the image is not read in these, as in
  // x <textarea> ![</textarea>](docs/guide.md) <a href="docs/nowhere.md">y</a>.
  // markdown-it writes the end tag as escaped text in the alt attribute, and
  // parse5 reads no link to docs/nowhere.md in what it renders; commonmark.js
  // writes it there as written, which ends the element, and parse5 reads one
  // in what it renders. No end tag ends a <plaintext>.
  for (const body of [
    ...NAMES.filter((name) => name !== 'plaintext').map((name) => `x <${name}> ![</${name}>][ref] <a href='docs/nowhere.md'>y</a>\n\n[ref]: docs/guide.md\n`),
    "x <textarea> ![x <textarea> </textarea>][ref] <a href='docs/nowhere.md'>y</a>\n\n[ref]: docs/guide.md\n",
  ]) {
    const r = check(body);
    assert.equal(r.status, 0, `${body}\n${r.stderr}`);
  }
  // With no definition of the label on the page the ![ opens no image, so
  // the start tag opens the <textarea> and the end tag ends it: parse5
  // reads no link to docs/nowhere.md in what either renders of the first,
  // and one in what each renders of the second.
  let r = check("![x <textarea>][ref] <a href='docs/nowhere.md'>y</a>\n\n[other]: docs/guide.md\n");
  assert.equal(r.status, 0, r.stderr);
  r = check("x <textarea> ![</textarea>][ref] <a href='docs/nowhere.md'>y</a>\n\n[other]: docs/guide.md\n");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^README: line 11: link target "docs\/nowhere\.md" does not exist\.$/m);
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

test('an inline link indented 4 or more columns after a | line that is paragraph text is read where that line keeps a list item or a paragraph open', () => {
  // A line that starts with | is paragraph text when no table row precedes
  // it and no delimiter row with as many cells follows it, also where it
  // goes on with a list item's paragraph lazily. The list item then stays
  // open, and after a blank line the line indented 5 columns, 3 past the
  // item's text, is a paragraph in it. After b, | - | - | has 2 cells to
  // b's 1, no delimiter row follows | a | b |, and no ordered list that
  // starts at 2, empty list item or indented code interrupts a paragraph,
  // so the line after two tabs goes on with b's paragraph.
  for (const [body, n] of [
    ['* item\n| a\n\n     [x](docs/nowhere.md)\n', 14],
    ['b\n| - | - |\n| a | b |\n2) two\n1.\n\t\t[x](docs/nowhere.md)\n', 16],
  ]) {
    const r = check(body);
    assert.equal(r.status, 1, body);
    assert.match(r.stderr, new RegExp(`line ${n}: link target "docs/nowhere\\.md" does not exist`), body);
  }
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
  // <div> opens, or <span> alone on a line (kind 7), up to a blank line, and
  // in a comment, up to -->. No heading starts on such a line, so it is not
  // the Quick Start.
  const dir = mkdtempSync(join(tmpdir(), 'check-readme-'));
  try {
    const run = (readme) => {
      writeFileSync(join(dir, 'README.md'), readme);
      return spawnSync(process.execPath, [script, '--no-counts', join(dir, 'README.md')], { encoding: 'utf8' });
    };
    const command = '\n```bash\nnpm test\n```\n';
    for (const tag of ['div', 'span']) {
      const none = run(`# Title\n\n<${tag}>\n## Quick Start\n</${tag}>\n${command}`);
      assert.equal(none.status, 1, tag);
      assert.match(none.stderr, /^README: README has no H2 heading; the first one must be "## Quick Start"\.$/m, tag);
      const other = run(`# Title\n\n<${tag}>\n## Quick Start\n</${tag}>\n\n## Install\n${command}`);
      assert.equal(other.status, 1, tag);
      assert.match(other.stderr, /^README: first H2 is "Install" at line 7; it must be "Quick Start"\.$/m, tag);
    }
    // The line that holds a comment's --> ends the block, and a blank line
    // ends a <div> or <span> block: the ## line after each is the first H2.
    for (const [readme, at] of [
      [`# Title\n\n<!--\n## Install\n-->\n## Quick Start\n${command}`, 6],
      [`# Title\n\n<div>\n## Install\n</div>\n\n## Quick Start\n${command}`, 7],
      [`# Title\n\n<span>\n## Install\n</span>\n\n## Quick Start\n${command}`, 7],
    ]) {
      const r = run(readme);
      assert.equal(r.status, 0, `${readme}\n${r.stderr}`);
      assert.match(r.stdout, new RegExp(`, Quick Start at line ${at}, `), readme);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a line at column 0 after an HTML block in a list item ends the list, also after an indented line of the block, so an HTML block that a line below opens holds the ## lines after it', () => {
  // A line of an HTML block is raw HTML, not paragraph text, so no line
  // goes on with it lazily: plain, at column 0, ends the list item and
  // starts a paragraph, which the indented <!-- below interrupts with a
  // comment that runs to the end of the file. commonmark.js 0.31.2 and
  // markdown-it 14.1.0 render no H2 for any of these: in a comment, after
  // an indented line of it or after the indented line that ends it, and
  // in a block that <div> opens, after an indented line of it.
  const dir = mkdtempSync(join(tmpdir(), 'check-readme-'));
  try {
    const run = (readme) => {
      writeFileSync(join(dir, 'README.md'), readme);
      return spawnSync(process.execPath, [script, '--no-counts', join(dir, 'README.md')], { encoding: 'utf8' });
    };
    const after = '## Quick Start\n\n```bash\nnpm test\n```\n\n## Guide\n\nText.\n';
    for (const item of ['- <!-- a note\n  more\n', '- <!--\n  a note -->\n', '- <div>\n  more\n', '- <!-- a note\n']) {
      const readme = `# Title\n\n${item}plain\n  <!--\n${after}`;
      const r = run(readme);
      assert.equal(r.status, 1, `${readme}\n${r.stdout}`);
      assert.match(r.stderr, /^README: README has no H2 heading; the first one must be "## Quick Start"\.$/m, readme);
    }
    // A line that goes on with the list item holds the <!-- in the item, so
    // plain, after it, goes on with no paragraph and ends the item, and the
    // ## line below it is the first H2.
    const held = run(`# Title\n\n- <!-- a note\n  more -->\n  <!-- x -->\nplain\n${after}`);
    assert.equal(held.status, 0, held.stderr);
    assert.match(held.stdout, /, Quick Start at line 7, /);
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
  // The line after a block tag such as <div> or <details open> goes on with
  // the HTML block that the tag opens, also in a block quote or a list item
  // that holds the block, and the lines after <pre> go on with its block up
  // to </pre>, past a blank line too. Their text is raw HTML, not indented
  // code, and an href on such a line is a link.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<div>\n    As of 2026-06-03.\n</div>\n\n${see}`,
    `<details open>\n    As of 2026-06-03.\n</details>\n\n${see}`,
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
  // such as <div> opens, or <span> alone on a line (kind 7), up to a blank
  // line, in one that <pre> opens past a blank line up to </pre>, and in a
  // comment up to -->. A line there that starts with 3 or more backticks or
  // tildes, also after the > of a block quote that holds the block or a list
  // marker, opens no fenced code block. A note inside the comment is not
  // shown, so the one in a comment follows its end, on the line that holds
  // it.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    '<div>\n```\n    As of 2026-06-03.\n```\n</div>\n\n' + see,
    '<details open>\n~~~\nAs of 2026-06-03.\n~~~\n</details>\n\n' + see,
    '<span>\n~~~\nAs of 2026-06-03.\n~~~\n</span>\n\n' + see,
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
  // that holds the block, also in a block that <span> alone on a line opens
  // (kind 7).
  for (const [body, line] of [
    ['<div>\nSee `<a href="nope.md">the page</a>`.\n</div>\n', 12],
    ['<span>\nSee `<a href="nope.md">the page</a>`.\n</span>\n', 12],
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

test('a line of a tag whose attributes hold no-break spaces is checked in under 2 seconds in a code block and at the start of a paragraph', () => {
  // A no-break space matched both the white space between attributes and an
  // unquoted value in the pattern that read a tag alone on a line, which
  // tried every way such a line splits into attributes: in a code block,
  // the line of 28 of them and >x took 15.5 seconds to check.
  const line = (end) => `<a${' e=c d'.repeat(28)}${end}`;
  for (const body of [`\`\`\`text\n${line('>x')}\n\`\`\`\n`, `\`\`\`text\n${line('!')}\n\`\`\`\n`, `${line('>x')}\n`]) {
    const started = process.hrtime.bigint();
    const r = check(body);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(r.status, 0, r.stderr);
    assert.ok(ms < 2000, `${ms.toFixed(0)} ms for ${JSON.stringify(body)}`);
  }
});

test('a 4 MB line of a tag of 1,000,000 attributes in a code block is checked in under 2 seconds', () => {
  // A pattern of the whole tag threw a RangeError (Maximum call stack size
  // exceeded) on such a line, with > or >x at its end, and the check exited
  // 1 with its stack.
  for (const end of ['>', '>x']) {
    const line = `<a${' b=c'.repeat(1000000)}${end}`;
    const started = process.hrtime.bigint();
    const r = check(`\`\`\`text\n${line}\n\`\`\`\n`);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(r.status, 0, r.stderr);
    assert.ok(ms < 2000, `${ms.toFixed(0)} ms for a line of ${line.length} characters ending in ${end}`);
  }
});

test('a 3.9 MB line of a tag of 987,000 attributes outside a code block is checked in under 2 seconds, also above a dated page\'s first H2', () => {
  // The inline reader read a tag with one pattern of the whole tag, which
  // threw a RangeError (Maximum call stack size exceeded) on such a line,
  // with or without a > at its end, and the check exited 1 with its stack;
  // so did the reader of a dated page's note, which reads a tag that runs
  // on to a later line of its paragraph.
  const see = 'See the [README](../README.md) for the current figures.';
  for (const end of ['', '>']) {
    const line = `<a ${'b=c '.repeat(987000)}${end}`;
    for (const [body, pages] of [
      [`${line}\n`, {}],
      [DATED_LINK, datedPage(`As of 2026-06-03.\n${line}\nx\n\n${see}\n`)],
    ]) {
      const started = process.hrtime.bigint();
      const r = check(body, pages);
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      assert.equal(r.status, 0, r.stderr);
      assert.ok(ms < 2000, `${ms.toFixed(0)} ms for a line of ${line.length} characters${body === DATED_LINK ? ' on a dated page' : ''}`);
    }
  }
});

test('a paragraph line of a tag whose attributes hold no-break spaces, and that no > ends, is checked in under 2 seconds', () => {
  // The inline reader's pattern of the whole tag tried every way such a line
  // splits into attributes before it failed: with <a, 24 attributes e=c, a
  // no-break space and d, and !, the check took 8.2 seconds, and with 28 of
  // them it had not finished after 60 seconds; so it is run here with a
  // time limit.
  const dir = mkdtempSync(join(tmpdir(), 'check-readme-'));
  try {
    writeFileSync(join(dir, 'README.md'), `${HEAD}<a${' e=c d'.repeat(28)}!\n`);
    const started = process.hrtime.bigint();
    const r = spawnSync(process.execPath, [script, '--no-counts', join(dir, 'README.md')], { encoding: 'utf8', timeout: 30_000 });
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(r.signal, null, 'the check did not finish in 30 seconds');
    assert.equal(r.status, 0, r.stderr);
    assert.ok(ms < 2000, `${ms.toFixed(0)} ms`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a note and link on the lines after the line that ends an HTML block are read with the code spans of their paragraph', () => {
  // The lines after the one that ends a comment start a paragraph of their
  // own, each line of which is read with its own code spans. Read with
  // those of another line, the note on a line after the comment is read on
  // the wrong part of it, and a run of backticks there at an index on
  // another line, which does not finish; so the check is run here with a
  // time limit.
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
  // the block or sits inside a block that <div> or <details open> opens, and
  // a line break inside one is not a space between the words around it.
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
    `<details open>\n<style>\nAs of 2026-06-03.\n</style>\n</details>\n\n${see}`,
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

test('a comment, <script> or <style> that a </textarea> end tag inside a comment, processing instruction or attribute value in a paragraph, a heading or a table cell leaves open hides the text after it, also on the lines below, up to its end inside later raw HTML', () => {
  // A browser reads on in the comment or element past the end of the piece
  // of raw HTML that opens it and past a line break of the paragraph. It
  // ends at the first match of its end in what a renderer writes: raw HTML
  // as written, the > of text and of a code span as &gt;, and an autolink as
  // a link, so a --> in text, in a code span or in an autolink ends nothing,
  // and nor does a tag that runs on to a later line without one. An end tag
  // with an attribute ends the <textarea> here too. What the raw HTML after
  // that end leaves open, such as a comment, hides the text after it again,
  // and a <details> start tag there hides the paragraphs after it.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `Hello <textarea><?x </textarea><!-- ?>\nAs of 2026-06-03. --> world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nAs of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea title="x"><script> -->\nAs of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><style> -->\nAs of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><b title="</textarea><!-- ">\nAs of 2026-06-03. world.\n\n${see}`,
    `> Hello <textarea><?x </textarea><!-- ?>\n> As of 2026-06-03. --> world.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\nx\nAs of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\n--> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\n\`-->\` As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\n<http://example.com/--> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nx <!-- y --> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nx <!-- y\nz --> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\nx <?y --> <!-- z\nw ?> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nx <b title="y\nz"> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nx <b title="</script><!--\n"> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nx </script> <!-- As of 2026-06-03. --> world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nx </script><details>\n\nAs of 2026-06-03.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
  // A --> or </script> inside a later tag or comment, on the line or on a
  // line below, also in a comment or a tag that runs on to a later line,
  // ends it, and so does </script >, and the text after that end is shown,
  // also in a heading, a table cell or a block quote, where a <br>, also
  // one that runs on to the line below, parts the words on either side of
  // it.
  for (const intro of [
    `Hello <textarea><!-- </textarea><script> -->\nx </script> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><style> -->\nx </style> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\nx <!-- y --> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\nx <b title="-->"> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nx <!-- </script> --> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> --> x </script> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\nx <!-- y\nz --> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nx <!-- </script>As of\n2026-06-03. --> world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nx <!-- </script>Report<br>As of 2026-06-03. --> world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nx <!-- </script>Report<br\nclass="x">As of 2026-06-03. --> world.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\nx <b title="-->\n"> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nx <b title="</script>As of\n2026-06-03."> world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nx </script > As of 2026-06-03. world.\n\n${see}`,
    `### Hello <textarea><!-- </textarea><script> --> x </script> As of 2026-06-03. world\n\n${see}`,
    `| a | b |\n| - | - |\n| <textarea><!-- </textarea><script> --> x </script> As of 2026-06-03. | y |\n\n${see}`,
    `> Hello <textarea><!-- </textarea><script> -->\n> x </script> As of 2026-06-03. world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test('a line of 10,000 comment starts, or 4,000 lines of one, that nothing below ends, in a paragraph that a <script> left open after a </textarea> hides, is checked in under 2 seconds', () => {
  // The end of a comment that runs on to a later line was looked for in the
  // rest of the paragraph from each start on the line, so the time grew
  // with the starts times the length of the lines below: the first page
  // took 17.6 seconds to check, the second 3.3 seconds.
  const see = 'See the [README](../README.md) for the current figures.';
  for (const intro of [
    `Hello <textarea><!-- </textarea><script> -->\nx ${'<!-- '.repeat(10000)}\n${'a-- '.repeat(125000)}\nAs of 2026-06-03.\n\n${see}\n`,
    `Hello <textarea><!-- </textarea><script> -->\n${'x <!--\n'.repeat(4000)}${'a-- '.repeat(50000)}\nAs of 2026-06-03.\n\n${see}\n`,
  ]) {
    const started = process.hrtime.bigint();
    const r = check(DATED_LINK, datedPage(intro));
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, DATED);
    assert.ok(ms < 2000, `${ms.toFixed(0)} ms for a page of ${intro.length} characters`);
  }
});

test('a < in the destination or title of a link or in an image, in a paragraph, a heading or a table cell, ends no comment, <script> or <style> that a </textarea> end tag inside raw HTML leaves open, and raw HTML after the link or image ends it', () => {
  // A renderer writes a < in the destination or title of an inline link,
  // or in the description of an image, as text, so a --> or </script>
  // there ends nothing, and a browser keeps hiding the text after it, also
  // where the title runs on to the next line.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `Hello <textarea><?x </textarea><!-- ?>\n[x](https://example.com "<!-- -->") As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\n[x](https://example.com/<!--y-->) As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\n![a <!-- --> b](https://example.com/i.png) As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\n[x](https://example.com "<b title='-->'>") As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\n[x](https://example.com "<!-- y\nz -->") As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\n[x](https://example.com "</script>") As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\n[x](https://example.com '</script>') As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\n[x](https://example.com (</script>)) As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\n[x](https://example.com/a</script>b) As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\n![</script>](https://example.com/i.png) As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\n[x](<https://example.com/a b> "</script>") As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\n[x](https://example.com\n"</script>") As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><style> -->\n[x](https://example.com "</style>") As of 2026-06-03. world.\n\n${see}`,
    `### Hello <textarea><!-- </textarea><script> --> [x](https://example.com "</script>") As of 2026-06-03. world\n\n${see}`,
    `| a | b |\n| - | - |\n| <textarea><!-- </textarea><script> --> [x](https://example.com "</script>") As of 2026-06-03. | y |\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
  }
  // Raw HTML in link text, before a link and after the ) that closes a
  // link or an image, which a renderer passes on as written, ends what is
  // open, also after a link whose title holds a < or runs on to the next
  // line, and the text after the end is shown. So does raw HTML after a ](
  // that no [ opens, and after a ]( that opens no link, as no ) follows the
  // destination or as a <target> destination holds a <.
  for (const intro of [
    `Hello <textarea><?x </textarea><!-- ?>\n[x <!-- --> y](https://example.com) As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nx </script> As of 2026-06-03. [world](https://example.com).\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nx </script> As of 2026-06-03. ![world](https://example.com/i.png).\n\n${see}`,
    `[x](https://example.com) Hello <textarea><!-- </textarea><script> -->\nx </script> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\n[x](https://example.com) </script> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\n![x](https://example.com/i.png) </script> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\n[x](https://example.com "<b>") </script> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\n[x](https://example.com "a\nb") </script> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\n[x](https://example.com) [y </script> z](https://example.com) As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\n[x](https://example.com "<!--") <!-- --> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><style> -->\n[x](https://example.com "</style>") </style> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nx](https://example.com) </script> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\n[x](https://example.com </script> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\n[x](<https://example.com/</script>) As of 2026-06-03. world.\n\n${see}`,
    `### Hello <textarea><!-- </textarea><script> --> [x](https://example.com) </script> As of 2026-06-03. world\n\n${see}`,
    `| a | b |\n| - | - |\n| <textarea><!-- </textarea><script> --> [x](https://example.com) </script> As of 2026-06-03. | y |\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test('a < in the description of an image that no destination follows, or in the label of its reference, ends no <script> that a </textarea> end tag inside raw HTML leaves open, as a renderer passes neither on as written where the page defines the reference', () => {
  // A renderer writes the description as text where the page defines the
  // reference, and leaves the label out. The check does not read the
  // page's definitions, so what is open hides the rest of the paragraph
  // from that <, and raw HTML after the image ends what is open.
  const see = 'See the [README](../README.md) for the current figures.\n';
  const open = 'Hello <textarea><!-- </textarea><script> -->';
  for (const intro of [
    `${open}\n![</script>][i] As of 2026-06-03. world.\n\n[i]: https://example.com/i.png\n\n${see}`,
    `${open}\n![x][</script>] As of 2026-06-03. world.\n\n[</script>]: https://example.com/i.png\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
  }
  const r = check(DATED_LINK, datedPage(`${open}\n![x][i] </script> As of 2026-06-03. world.\n\n[i]: https://example.com/i.png\n\n${see}`));
  assert.equal(r.status, 0, r.stderr);
});

test('a <script> that a </textarea> end tag inside raw HTML in a paragraph, a heading or a table cell leaves open ends at a </script> in later raw HTML only where a browser ends it: not after <!-- and then <script in its text with no --> between them', () => {
  // A browser's tokenizer reads <!-- in the text of a <script> element as
  // the start of the script data escaped state, where --> returns it to
  // the script data state and <script before white space, a /, a > or the
  // end of the line puts it in the double escaped state, where </script>
  // returns it to the escaped state and ends no element; in the other two
  // states </script> ends the element. Only raw HTML that a renderer passes
  // on as written holds these for the browser: a <!-- that no --> ends in
  // the paragraph is text. Where the first </script> in a tag or comment
  // that runs on to a later line is not the one that ends the element, the
  // rest of the paragraph is hidden, also where a later </script> there
  // ends it for a browser.
  const see = 'See the [README](../README.md) for the current figures.\n';
  const open = 'Hello <textarea><!-- </textarea><script> -->';
  for (const intro of [
    `${open}\nx <!-- <script></script> --> As of 2026-06-03. world.\n\n${see}`,
    `${open}\nx <b title="<!--<script>"></script> As of 2026-06-03. world.\n\n${see}`,
    `${open}\nx <!-- <SCRIPT/></script> --> As of 2026-06-03. world.\n\n${see}`,
    `${open}\nx <!-- y -->\n<b title="<!--"> <b title="<script>"></script> As of 2026-06-03. world.\n\n${see}`,
    `${open}\nx <b title="<!--<script></script>\n"> As of 2026-06-03. world.\n\n${see}`,
    `${open}\nx <b title="<!--<script></script>-->\n"></script> As of 2026-06-03. world.\n\n${see}`,
    `### ${open} x <!-- <script></script> --> As of 2026-06-03. world\n\n${see}`,
    `| a | b |\n| - | - |\n| <textarea><!-- </textarea><script> --> x <!-- <script></script> --> As of 2026-06-03. | y |\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
  }
  // A --> after the <script, also the > of <!-->, returns the tokenizer to
  // the script data state, where the next </script> ends the element, as
  // it does in the escaped state; a </script> in the double escaped state
  // is read past, to the </script> that ends the element on a later line;
  // and a <!-- before the <script> start tag, such as in an attribute of
  // the </textarea> end tag, or one that no --> ends in the paragraph, is
  // not in the element's text.
  for (const intro of [
    `${open}\nx <!-- <script> --> </script> As of 2026-06-03. world.\n\n${see}`,
    `${open}\nx <!--><script></script> As of 2026-06-03. world.\n\n${see}`,
    `${open}\nx <!-- <script></script> -->\n</script> As of 2026-06-03. world.\n\n${see}`,
    `${open}\nx </script><!--<script>--> As of 2026-06-03. world.\n\n${see}`,
    `${open}\nx <!-- </script><script><!--<script> --> </script> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea><script><!--<script> -->\nx </script> As of 2026-06-03. world.\n\n${see}`,
    `Hello <textarea><!-- </textarea title="<!--"><script> -->\nx </script> As of 2026-06-03. world.\n\n${see}`,
    `${open}\nx <!--<script>\n</script> As of 2026-06-03. world.\n\n${see}`,
    `${open}\nx <!-- y <b title="<script>"></script> As of 2026-06-03. world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

const NO_NOTE = /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./;

test('a <script> on a line of an HTML block ends at a </script> only where a browser ends it: not after <!-- and then <script in its text with no --> between them', () => {
  // A renderer passes the text of an HTML block on as written, and a
  // browser's tokenizer reads <!-- in the text of a <script> element as the
  // start of the script data escaped state, and <script after it as the
  // start of the double escaped state, where </script> returns it to the
  // escaped state and --> to the script data state; in the other two states
  // </script> ends the element. The state runs on to the later lines of the
  // block, and the element stays open past the end of the block.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<div>\n<script><!-- <script></script> --> As of 2026-06-03. world.\n</div>\n\n${see}`,
    `<div>\n<script><!--\n<script>\n</script>\n</div>\n\nAs of 2026-06-03.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, NO_NOTE, intro);
  }
  for (const intro of [
    `<div>\n<script><!-- <script></script></script> As of 2026-06-03.\n</div>\n\n${see}`,
    `<div>\n<script><!-- <script> --></script> As of 2026-06-03.\n</div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test('a comment, <script> or <style> that a paragraph or an HTML block leaves open hides the blocks after it up to its end inside later raw HTML, as a browser keeps it open past the end of the block', () => {
  // A browser reads on in the comment or element over the blank lines,
  // paragraphs, headings, table cells, code blocks and HTML blocks after
  // it, up to the first match of its end in raw HTML, which a renderer
  // passes on as written; it writes the > of a code block as &gt;, so a
  // code block ends nothing, and it writes a < in the destination or title
  // of a link as text, so a </script> there ends nothing either, while one
  // after the link ends the element. An HTML block of kind 1 ends at a
  // </script> or </textarea> that ends no element.
  const see = 'See the [README](../README.md) for the current figures.\n';
  const script = 'Hello <textarea><!-- </textarea><script> -->';
  for (const intro of [
    `${script}\n\nAs of 2026-06-03.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\n\nAs of 2026-06-03.\n\n${see}`,
    `Hello <textarea><!-- </textarea><style> -->\n\nAs of 2026-06-03.\n\n${see}`,
    `${script}\n\n<div>\nx\n</div>\n\nAs of 2026-06-03.\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\n\n    -->\n\nAs of 2026-06-03.\n\n${see}`,
    `${script}\n\n[x](https://example.com "</script>")\n\nAs of 2026-06-03.\n\n${see}`,
    `${script}\n\n| a | b |\n| - | - |\n| x | As of 2026-06-03. |\n\n${see}`,
    `<div>\n<!-- x\n\nAs of 2026-06-03.\n\n${see}`,
    `<script>\n<!-- <script>\n</script>\nAs of 2026-06-03.\n</script>\n\n${see}`,
    `<script>\nx </textarea>\n\nAs of 2026-06-03.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, NO_NOTE, intro);
  }
  for (const intro of [
    `${script}\n\nx </script> As of 2026-06-03.\n\n${see}`,
    `${script}\n\n[x](https://example.com) </script>\n\nAs of 2026-06-03.\n\n${see}`,
    `${script}\n\n<div>\n</script>\n</div>\n\nAs of 2026-06-03.\n\n${see}`,
    `${script}\n\n### x </script> y\n\nAs of 2026-06-03.\n\n${see}`,
    `${script}\n\n| a | b |\n| - | - |\n| </script> | x |\n\nAs of 2026-06-03.\n\n${see}`,
    `<div>\n<!-- x\n\ny <!-- --> As of 2026-06-03.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test('a processing instruction ends at the first > after its <?, as a browser ends what <? opens there, on a line of an HTML block and in a paragraph', () => {
  // A browser reads <? as the start of a bogus comment, which ends at the
  // first >, and shows the text after it, also where CommonMark reads the
  // processing instruction on to a later ?>, on its line or a later one: a
  // renderer passes it on as written, so the rest of it is read as raw
  // HTML, and what that leaves open, such as a comment, hides the text
  // after it.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<div>\n<?x> As of 2026-06-03.\n</div>\n\n${see}`,
    `Hello <textarea><b title="</textarea><?x">\nAs of 2026-06-03. world.\n\n${see}`,
    `<?x\n> As of 2026-06-03.\n?>\n\n${see}`,
    `Hello <?x> As of 2026-06-03. ?>\n\n${see}`,
    `Hello <?x>\nAs of 2026-06-03. ?>\n\n${see}`,
    `Hello <?x\ny > As of 2026-06-03.\nz ?>\n\n${see}`,
    `Hello <?x ><textarea ?> As of 2026-06-03. world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  for (const intro of [`Hello <?x > <!-- ?> As of 2026-06-03. world.\n\n${see}`, `Hello <?note As of 2026-06-03. ?> world.\n\n${see}`]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, NO_NOTE, intro);
  }
});

test('a CDATA section ends at the first > after its <![CDATA[, as a browser ends what <![CDATA[ opens there, on a line of an HTML block and in a paragraph, a heading or a table cell', () => {
  // Outside an <svg> or <math> element, a browser reads <![CDATA[, also
  // <![cdata[, as the start of a bogus comment, which ends at the first >,
  // and shows the text after it, also where CommonMark reads the CDATA
  // section, or the HTML block that it opens, on to a later ]]>, on its
  // line or a later one: a renderer passes it on as written, so the rest of
  // it is read as raw HTML, and what that leaves open, such as a comment or
  // a <script>, hides the text after it.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<div>\n<![CDATA[ x > As of 2026-06-03. ]]>\n</div>\n\n${see}`,
    `<div><![CDATA[ x > As of 2026-06-03. ]]></div>\n\n${see}`,
    `<div>\n<![cdata[ x > As of 2026-06-03. ]]>\n</div>\n\n${see}`,
    `<![CDATA[ x > As of 2026-06-03. ]]>\n\n${see}`,
    `<![CDATA[ x\n> As of 2026-06-03.\n]]>\n\n${see}`,
    `Hello <![CDATA[ x > As of 2026-06-03. ]]> world.\n\n${see}`,
    `### Audit <![CDATA[ x > As of 2026-06-03. ]]>\n\n${see}`,
    `| <![CDATA[ x > As of 2026-06-03. ]]> | x |\n| - | - |\n\n${see}`,
    `Hello <textarea><b title="</textarea><![CDATA[">\nAs of 2026-06-03. world.\n\n${see}`,
    `Hello <![CDATA[ x >\nAs of 2026-06-03. ]]>\n\n${see}`,
    `Hello <![CDATA[ x\ny > As of 2026-06-03.\nz ]]>\n\n${see}`,
    `Hello <![CDATA[ x ><textarea ]]> As of 2026-06-03. world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  for (const intro of [
    `Hello <![CDATA[ x > <!-- ]]> As of 2026-06-03. world.\n\n${see}`,
    `Hello <![CDATA[ x ><script ]]> As of 2026-06-03. world.\n\n${see}`,
    `<div>\n<![CDATA[ x > <!-- ]]> As of 2026-06-03.\n</div>\n\n${see}`,
    `Hello <![CDATA[ note As of 2026-06-03. ]]> world.\n\n${see}`,
    `<div>\n<![CDATA[ note As of 2026-06-03. ]]>\n</div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, NO_NOTE, intro);
  }
});

test('a comment ends at --!> as at -->, as a browser ends it, on a line of an HTML block and in a paragraph, but not at a --!> that takes its dashes from its <!--', () => {
  // The -- of a <!-- end the comment only before a >, as in <!-->: <!--!>
  // and <!---!> open a comment that runs on, and <!----!> is one. A --!>
  // does not end the script data escaped state of a <script>, which only
  // --> ends.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<div>\n<!-- y --!> As of 2026-06-03.\n</div>\n\n${see}`,
    `<div>\n<!----!> As of 2026-06-03.\n</div>\n\n${see}`,
    `<div>\n<!-- y\nz --!> As of 2026-06-03.\n</div>\n\n${see}`,
    `Hello <!-- y --!> As of 2026-06-03. -->\n\n${see}`,
    `Hello <!-- y\nz --!> As of 2026-06-03. -->\n\n${see}`,
    `Hello <textarea><?x </textarea><!-- ?>\nx <b title="--!>"> As of 2026-06-03. world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  for (const intro of [
    `<div>\n<!--!> As of 2026-06-03. -->\n</div>\n\n${see}`,
    `<div>\n<!---!> As of 2026-06-03. -->\n</div>\n\n${see}`,
    `Hello <!--!> As of 2026-06-03. -->\n\n${see}`,
    `Hello <textarea><!-- </textarea><script> -->\nx <b title="<!--<script>--!>"></script> As of 2026-06-03. world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, NO_NOTE, intro);
  }
});

test("a <script> or <style> start tag in a paragraph, a heading or a table cell hides the text after it up to its end tag inside later raw HTML, as a browser reads that text as the element's", () => {
  // Also <script/>, a start tag that runs on to a later line, one with an
  // attribute and one after a link, and past the end of the paragraph or
  // cell. A </script> or </style> that a renderer passes on as written ends
  // the element; a tag of another name, such as <scripts>, and an end tag
  // alone open none. A <!-- that no --> follows in its paragraph is text,
  // so it puts the tokenizer in no escaped state.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `Hello <script> As of 2026-06-03. world.\n\n${see}`,
    `Hello <style> As of 2026-06-03. world.\n\n${see}`,
    `Hello <script type="text/plain"> As of 2026-06-03. world.\n\n${see}`,
    `See [x](https://example.com) <script> As of 2026-06-03. world.\n\n${see}`,
    `Hello <script/> As of 2026-06-03. world.\n\n${see}`,
    `Hello <script\ntype="x"> As of 2026-06-03. world.\n\n${see}`,
    `Hello <script title="</script>"> As of 2026-06-03. world.\n\n${see}`,
    `Hello <script>\n\nAs of 2026-06-03.\n\n${see}`,
    `### Hello <script> As of 2026-06-03. world\n\n${see}`,
    `| a | b |\n| - | - |\n| <script> As of 2026-06-03. | x |\n\n${see}`,
    `| a | b |\n| - | - |\n| <script> x | As of 2026-06-03. |\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, NO_NOTE, intro);
  }
  for (const intro of [
    `Hello <script>x</script> As of 2026-06-03. world.\n\n${see}`,
    `Hello <style>p{}</style> As of 2026-06-03. world.\n\n${see}`,
    `Hello <script>\n\nx </script> As of 2026-06-03.\n\n${see}`,
    `Hello <scripts> As of 2026-06-03. world.\n\n${see}`,
    `Hello </script> As of 2026-06-03. world.\n\n${see}`,
    `Hello <script><!-- <script></script> As of 2026-06-03. world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test("the attributes of a <script> start tag are not the element's text, on a line of an HTML block or in raw HTML in a paragraph, so a </script> or <!-- in one ends or escapes nothing", () => {
  // A browser reads the start tag on to its >, also past a line break, and
  // the element's text from there, and <script/> opens the element too.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<div>\n<script title="</script>"> As of 2026-06-03.\n</div>\n\n${see}`,
    `<div>\n<script\ntitle="</script>"> As of 2026-06-03.\n</div>\n\n${see}`,
    `<div>\n<script/> As of 2026-06-03.\n</div>\n\n${see}`,
    `Hello <textarea><!-- </textarea><script title="</script>"> --> As of 2026-06-03. world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, NO_NOTE, intro);
  }
  const open = 'Hello <textarea><!-- </textarea><script> -->';
  for (const intro of [
    `${open}\nx <![CDATA[ </script><script title="<!--"> <script> ]]>\n</script> As of 2026-06-03. world.\n\n${see}`,
    `${open}\nx <b title="</script><script title='<!--'> <script>">\n</script> As of 2026-06-03. world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test('raw HTML after a CDATA section in a paragraph ends what is open, as its ![ opens no image, and so does raw HTML after a <![CDATA[ that no ]]> follows, but for raw HTML in an image that the ![ of that <![CDATA[ opens', () => {
  // The ![ of a <![CDATA[ that a ]]> follows in the paragraph starts no
  // image description. Without that ]]> the < is text, and the ![ opens an
  // image only where a ] closes it and a destination follows, and a
  // renderer writes the description of that image as text.
  const see = 'See the [README](../README.md) for the current figures.\n';
  const open = 'Hello <textarea><!-- </textarea><script> -->';
  for (const intro of [
    `${open}\nx <![CDATA[ y ]]> </script> As of 2026-06-03. world.\n\n${see}`,
    `${open}\nx <![CDATA[ y </script> As of 2026-06-03. world.\n\n${see}`,
    `${open}\nx <![CDATA[ y] z](https://example.com/i.png) </script> As of 2026-06-03. world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  const r = check(DATED_LINK, datedPage(`${open}\nx <![CDATA[ y] </script> z](https://example.com/i.png) As of 2026-06-03. world.\n\n${see}`));
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, DATED);
  assert.match(r.stderr, NO_NOTE);
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

test("a dated page's note inside a tag that runs on to a later line of a paragraph is not read, as CommonMark reads a line break inside a tag", () => {
  // CommonMark reads an open tag or a closing tag on past a line break in a
  // paragraph, also in a block quote or a list item, and a browser shows no
  // part of it: the rest of the line the tag starts on is left out, and the
  // line it ends on is read from after its >. The line break inside it is
  // no space, a tag of a block or a <br> parts the words around it, and the
  // text after a <textarea> start tag is the element's. What the raw HTML
  // after a </textarea> inside a comment leaves open, such as the quoted
  // value of that end tag, hides the rest of the paragraph, and no more. A <
  // that no tag follows on the lines below it is text.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `Hello <span\ntitle="As of 2026-06-03.">x</span> world.\n\n${see}`,
    `Hello <span title="As of\n2026-06-03.">x</span> world.\n\n${see}`,
    `Hello <img\nalt="As of 2026-06-03."> world.\n\n${see}`,
    `Hello <textarea><!-- </textarea title="x -->\nAs of 2026-06-03.\n\n${see}`,
    `Hello <span title="As\nof\n2026-06-03.">x</span> world.\n\n${see}`,
    `> Hello <span\n> title="As of 2026-06-03.">x</span> world.\n\n${see}`,
    `- Hello <span\n  title="As of 2026-06-03.">x</span> world.\n\n${see}`,
    `Hello <textarea><!-- </textarea title="x -->\nAs of\n2026-06-03.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
  for (const intro of [
    `Hello <span\ntitle="x">As of 2026-06-03.</span> world.\n\n${see}`,
    `A<span\nclass="x">s of 2026-06-03.</span>\n\n${see}`,
    `Report<br\n/>As of 2026-06-03.\n\n${see}`,
    `Hello <textarea\nrows="2"><!-- As of 2026-06-03. --></textarea> world.\n\n${see}`,
    `Hello <span\nAs of 2026-06-03.\n\n${see}`,
    `Hello <textarea><!-- </textarea title="x -->\n\nAs of 2026-06-03.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test('a <script> or <style> element ends at an end tag with white space, a / or an attribute before its >, as a browser ends it, and no part of that tag is read', () => {
  // A browser ends the element at </script or </style before white space,
  // a / or a >, as it ends a <textarea>, also where the end tag runs on to
  // a later line of the block, and shows the text after that tag's >, on a
  // line of an HTML block and in the raw HTML after a </textarea> inside a
  // comment in a paragraph. </scriptx> is no end tag, and the attribute of
  // an end tag is not shown.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<div><script>x</script >As of 2026-06-03.</div>\n\n${see}`,
    `<div><style>p{}</style >As of 2026-06-03.</div>\n\n${see}`,
    `<div><SCRIPT>x</SCRIPT\t>As of 2026-06-03.</div>\n\n${see}`,
    `<div><style>p{}</style/>As of 2026-06-03.</div>\n\n${see}`,
    `<div><script>x</script id="y">As of 2026-06-03.</div>\n\n${see}`,
    `<div>\n<script>\nx\n</script\n>As of 2026-06-03.\n</div>\n\n${see}`,
    `> <div><script>x</script >As of 2026-06-03.</div>\n\n${see}`,
    `Hello <textarea><!-- </textarea><script>x</script >As of 2026-06-03. --> world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  for (const intro of [
    `<div><script>x</scriptx>As of 2026-06-03.</script></div>\n\n${see}`,
    `<div><style>p{}</style title="As of 2026-06-03.">x</div>\n\n${see}`,
    `<div><script>x</script\n  title="As of 2026-06-03.">y</div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
});

test("a dated page's note inside a <details> without the open attribute, but in its first <summary>, or inside a <dialog> without it, is not read, as a browser hides it until the reader opens the element", () => {
  // A <details> without open shows only its first <summary>, also where it
  // holds a paragraph of the page between blank lines, as a browser reads
  // the HTML of the page as one document, and in a paragraph, a block
  // quote or a table cell; a <dialog> without open shows nothing. The open
  // attribute is read in any case, also after a line break, and not in the
  // value of another attribute. Text before the <summary>, a second
  // <summary> and an open <details> inside a closed one are hidden with
  // the rest. The text after the element's end tag is shown, and a cell of
  // a table row ends a <details> that opens in it.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<details><summary>Report</summary>As of 2026-06-03.</details>\n\n${see}`,
    `<details>\n<summary>Report</summary>\nAs of 2026-06-03.\n</details>\n\n${see}`,
    `<details>\n<summary>Report</summary>\n\nAs of 2026-06-03.\n\n</details>\n\n${see}`,
    `<details>As of 2026-06-03.</details>\n\n${see}`,
    `<details>As of 2026-06-03.<summary>Report</summary></details>\n\n${see}`,
    `<details><summary>Report</summary><summary>As of 2026-06-03.</summary></details>\n\n${see}`,
    `<details title="open"><summary>Report</summary>As of 2026-06-03.</details>\n\n${see}`,
    `<details><summary>Report</summary><details open>As of 2026-06-03.</details></details>\n\n${see}`,
    `Hello <details><summary>Report</summary>As of 2026-06-03.</details> world.\n\n${see}`,
    `> <details><summary>Report</summary>As of 2026-06-03.</details>\n\n${see}`,
    `| a | b |\n| - | - |\n| <details><summary>x</summary>As of 2026-06-03.</details> | y |\n\n${see}`,
    `<dialog>As of 2026-06-03.</dialog>\n\n${see}`,
    `<div>Report<dialog>As of 2026-06-03.</dialog></div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, DATED, intro);
    assert.match(r.stderr, /it must say "as of 2026-06-03"; its counts are those of 2026-06-03 and are not compared with the suite\./, intro);
  }
  for (const intro of [
    `<details open><summary>Report</summary>As of 2026-06-03.</details>\n\n${see}`,
    `<details OPEN=""><summary>Report</summary>As of 2026-06-03.</details>\n\n${see}`,
    `<details\nopen><summary>Report</summary>As of 2026-06-03.</details>\n\n${see}`,
    `<details><summary>As of 2026-06-03.</summary>Report</details>\n\n${see}`,
    `<details><summary>Report</summary>x</details>As of 2026-06-03.\n\n${see}`,
    `<details>\n<summary>Report</summary>\n\nx\n\n</details>\n\nAs of 2026-06-03.\n\n${see}`,
    `| a | b |\n| - | - |\n| <details> | As of 2026-06-03. |\n\n${see}`,
    `<dialog open>As of 2026-06-03.</dialog>\n\n${see}`,
    `<div>A<dialog>x</dialog>s of 2026-06-03.</div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test("a dated page's words on either side of a start tag of <dialog> with the open attribute, or of the end tag of such an element, are read apart, as a browser shows the element as a block", () => {
  // Without the open attribute a <dialog> shows nothing, so the words on
  // either side of it join, as do those on either side of a </dialog> that
  // ends no element.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `Report<dialog open>As of 2026-06-03.</dialog>\n\n${see}`,
    `<div>Report<dialog open>As of 2026-06-03.</dialog></div>\n\n${see}`,
    `<div><dialog open>Report</dialog>As of 2026-06-03.</div>\n\n${see}`,
    `<div>Report<DIALOG Open="">As of 2026-06-03.</DIALOG></div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  for (const intro of [
    `<div>Report<dialog>x</dialog>As of 2026-06-03.</div>\n\n${see}`,
    `<div>Report</dialog>As of 2026-06-03.</div>\n\n${see}`,
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
  // that <details open> or <pre> opens, in a list item, and after the --> that
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
    `<details open>\n\`As of 2026-06-03.\`\n</details>\n\n${see}`,
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
  // <div> or <details> opens, or <span> alone on a line (kind 7), up to a
  // blank line, also after a line of ``` there, in one that <pre> opens,
  // past a blank line up to </pre>, and in a comment, up to -->. No heading
  // starts on such a line, so the page's first H2 is the first ## line after
  // the block.
  const page = (block) => ({
    'docs/AUDIT-2026-06-03.md': `# Audit\n\n${block}\nAs of 2026-06-03. See the [README](../README.md).\n\n## Real\n\n| npm test total | 245 |\n`,
  });
  for (const block of [
    '<div>\n## Counts\n</div>\n',
    '<details>\n## Counts\n</details>\n',
    '<span>\n## Counts\n</span>\n',
    '<div>\n```\n## Counts\n</div>\n',
    '<!--\n## Counts\n-->\n',
    '<pre>\n## Counts\n\n## More\n</pre>\n',
  ]) {
    const r = check(DATED_LINK, page(block));
    assert.equal(r.status, 0, `${block}\n${r.stderr}`);
  }
  // A blank line ends a <div> or <span> block, a line without the ">" of the
  // block quote that holds one ends that block quote, and so the block, and a
  // comment that ends on its first line is that line alone: the ## line
  // after each is the page's first H2, and the note below it is not read.
  for (const block of ['<div>\n</div>\n\n## Counts\n', '<span>\n</span>\n\n## Counts\n', '> <div>\n## Counts\n', '<!-- x -->\n## Counts\n']) {
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
  // HTML in a block that <div> opens, or <span> alone on a line (kind 7), up
  // to a blank line, so the table below it is still in the section. The four
  // lines added after the heading move the "Pinned benchmark harness tests"
  // row from line 36 to line 40.
  const below = (block, text) => text.replace('## What Gets Tested\n', `## What Gets Tested\n\n${block}`);
  const wrong = (text) => text.replace('| Pinned benchmark harness tests | 3 |', '| Pinned benchmark harness tests | 4 |');
  const ROW = 'the "Pinned benchmark harness tests" row says 4; the test report has 3 tests in src/benchmark/pinned.';
  for (const block of ['<div>\n## Note\n</div>\n', '<span>\n## Note\n</span>\n', '```bash\n## Note\n```\n']) {
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
  for (const block of ['<div>\n## Note\n</div>\n', '<span>\n## Note\n</span>\n']) {
    const catalog = below(block, COUNTED.slice(at));
    const ok = page(catalog);
    assert.equal(ok.status, 0, `${block}\n${ok.stderr}`);
    const bad = page(wrong(catalog));
    assert.equal(bad.status, 1, block);
    assert.equal(bad.stderr.trim(), `README: docs/test-catalog.md line 17: ${ROW}`, block);
  }
  // An H2 ends the section, so the table below it is not read.
  for (const r of [checkCounts(below('## Note\n', COUNTED)), page(below('## Note\n', COUNTED.slice(at)))]) {
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^README: the "What Gets Tested" table was not found; /m);
  }
});

test('a | line of a fenced code block or of an HTML block in the What Gets Tested section is no row of the table', () => {
  // CommonMark reads the | line as code in a fenced code block, as raw HTML
  // in a block that <div> opens, or <span> alone on a line (kind 7), up to a
  // blank line, and in one that <!-- opens, up to the line that holds -->,
  // so the rows of the section are
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
  for (const block of [
    '```text\n| Fake row | 99 |\n```\n',
    '~~~\n| Fake row | 99 |\n~~~\n',
    '<div>\n| Fake row | 99 |\n</div>\n',
    '<span>\n| Fake row | 99 |\n</span>\n',
    '<!--\n| Fake row | 99 |\n-->\n',
  ]) {
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
  // that <div> opens, or <span> alone on a line (kind 7), up to a blank
  // line, so the section starts at the heading below the block, and the
  // table checked is the one below that heading. The block and the blank
  // line after it, added before the heading, move the "Pinned benchmark
  // harness tests" row from line 36 to line 44, or 43 with the <div> or
  // <span> block, which holds no blank line; on a page that took README
  // text, where the README's text from the heading on moved to
  // docs/test-catalog.md, from line 13 to line 21, or 20.
  const TABLE = '| Category | Tests | Source | What |\n|---|---|---|---|\n| Fake | 99 | `src/atomic` | x |\n';
  const before = (block, text) => text.replace('## What Gets Tested\n', `${block}\n## What Gets Tested\n`);
  const wrong = (text) => text.replace('| Pinned benchmark harness tests | 3 |', '| Pinned benchmark harness tests | 4 |');
  const ROW = 'the "Pinned benchmark harness tests" row says 4; the test report has 3 tests in src/benchmark/pinned.';
  const at = COUNTED.indexOf('## What Gets Tested');
  const page = (catalog) => checkCounts(COUNTED.slice(0, at), SUITE, report(SUITE), { ...SOURCES, 'docs/test-catalog.md': catalog });
  for (const [block, line, pageLine] of [
    [`<!--\n## What Gets Tested\n\n${TABLE}-->\n`, 44, 21],
    [`<div>\n## What Gets Tested\n${TABLE}</div>\n`, 43, 20],
    [`<span>\n## What Gets Tested\n${TABLE}</span>\n`, 43, 20],
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

test('a < or a backtick in the destination or title of an inline link, or in an image, opens nothing on a dated page', () => {
  // A renderer writes the destination as an href, the title as a title
  // attribute and the description of an image as alt text, so no <script>
  // element opens there. [x](<script>) links docs/script.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `Hello [x](<script>) As of 2026-06-03. world.\n\n${see}`,
    `Hello [x](https://example.com "<script>") As of 2026-06-03. world.\n\n${see}`,
    `Hello ![<script>](https://example.com/i.png) As of 2026-06-03. world.\n\n${see}`,
    `Hello [x](https://example.com "\`") As of 2026-06-03. \`y\`\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, { ...datedPage(intro), 'docs/script': 'x\n' });
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  const r = check(DATED_LINK, datedPage(`Hello <script> As of 2026-06-03. world.\n\n${see}`));
  assert.equal(r.status, 1);
  assert.match(r.stderr, NO_NOTE);
});

test('in an <svg> or <math> element a CDATA section ends at ]]>, and its text is shown only where a browser shows text there', () => {
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<div>\n<svg><![CDATA[ x > <!-- ]]></svg> As of 2026-06-03.\n</div>\n\n${see}`,
    `Hello <svg><![CDATA[ x > <!-- ]]></svg> As of 2026-06-03. world.\n\n${see}`,
    `<div>\n<svg><text><![CDATA[ x > As of 2026-06-03. ]]></text></svg>\n</div>\n\n${see}`,
    `<div>\n<math><mi><![CDATA[As of 2026-06-03.]]></mi></math>\n</div>\n\n${see}`,
    `<div>\n<svg/><![CDATA[ x > As of 2026-06-03. ]]>\n</div>\n\n${see}`,
    `<div>\n<svg><p><![CDATA[ x > As of 2026-06-03. ]]>\n</div>\n\n${see}`,
    `<div>\n<svg></svg><![CDATA[ x > As of 2026-06-03. ]]>\n</div>\n\n${see}`,
    `Hello <svg> x\n\n<div>\n<![CDATA[ y > As of 2026-06-03. ]]>\n</div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
  for (const intro of [
    `<div>\n<svg><![CDATA[ x > As of 2026-06-03. ]]></svg>\n</div>\n\n${see}`,
    `<div>\n<math><![CDATA[ x > As of 2026-06-03. ]]></math>\n</div>\n\n${see}`,
    `<div>\n<svg><g><rect/></g><![CDATA[ x > As of 2026-06-03. ]]></svg>\n</div>\n\n${see}`,
    `Hello <svg><![CDATA[ x > As of 2026-06-03. ]]></svg> world.\n\n${see}`,
    `### Audit <svg><![CDATA[ x > As of 2026-06-03. ]]></svg>\n\n${see}`,
    `| <svg><![CDATA[ x > As of 2026-06-03. ]]></svg> | x |\n| - | - |\n\n${see}`,
    `<div>\n<svg><![CDATA[ x\n</div>\n\nAs of 2026-06-03.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, NO_NOTE, intro);
  }
});

test('a line of 150,000 inline links is read without a RangeError, and a missing target on it is reported', () => {
  const r = check('[x](https://example.com) '.repeat(150000) + '[y](docs/nowhere.md)\n');
  assert.equal(r.status, 1, r.stderr.slice(0, 2000));
  assert.equal(r.stderr.trim(), 'README: line 11: link target "docs/nowhere.md" does not exist.');
});

test('an inline link with a title in "", in \'\' or in (), or a destination or title on the next line, has its target checked', () => {
  for (const line of [
    "[x](docs/nowhere.md 't')",
    '[x](docs/nowhere.md (t))',
    '[x](docs/nowhere.md\n"t")',
    '[x](\ndocs/nowhere.md)',
    '> [x](docs/nowhere.md\n> \'t\')',
    '| [x](docs/nowhere.md \'t\') | y |\n| - | - |',
  ]) {
    const r = check(`${line}\n`);
    assert.equal(r.status, 1, line);
    assert.match(r.stderr, /link target "docs\/nowhere\.md" does not exist\./, line);
  }
  // A title is not read as text, and the line goes on after the ).
  for (const line of ["[x](docs/guide.md '[y](docs/nowhere.md)')", '[x](docs/guide.md\n"`") `[y](docs/nowhere.md)`', '[x](docs/nowhere.md\n\n"t")']) {
    const r = check(`${line}\n`);
    assert.equal(r.status, 0, `${line}\n${r.stderr}`);
  }
  const after = check('[x](docs/guide.md\n"t") [y](docs/nowhere.md)\n');
  assert.equal(after.status, 1);
  assert.match(after.stderr, /^README: line 12: link target "docs\/nowhere\.md" does not exist\./m);
});

test('a dated page with 80,000 tags open in an <svg> element and as many end tags that end none, or CDATA sections, is checked in under 2 seconds', () => {
  // An end tag that ended no element read the names of all the elements
  // open in foreign content, and each CDATA section read those of the
  // <tspan> elements open above the <text> element, so the time grew with
  // the square of the number of tags.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const line of [`<svg>${'<g>'.repeat(80000)}${'</math>'.repeat(80000)}</svg>`, `<svg><text>${'<tspan>'.repeat(80000)}${'<![CDATA[]]>'.repeat(80000)}`]) {
    const started = process.hrtime.bigint();
    const r = check(DATED_LINK, datedPage(`<div>\n${line}\n</div>\n\nAs of 2026-06-03. ${see}`));
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(r.status, 0, r.stderr);
    assert.ok(ms < 2000, `${ms.toFixed(0)} ms for ${line.slice(0, 16)}`);
  }
});

test('in an <svg> or <math> element, text is the note only where a browser shows text there, as for the text of a CDATA section', () => {
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<div>\n<svg>As of 2026-06-03.</svg>\n</div>\n\n${see}`,
    `Hello <svg>As of 2026-06-03.</svg> world.\n\n${see}`,
    `### Audit <svg>As of 2026-06-03.</svg>\n\n${see}`,
    `| <svg>As of 2026-06-03.</svg> | x |\n| - | - |\n\n${see}`,
    `Hello <svg>\nAs of 2026-06-03.\n</svg> world.\n\n${see}`,
    `<div>\n<svg><g>As of 2026-06-03.</g></svg>\n</div>\n\n${see}`,
    `<div>\n<svg><tspan>As of 2026-06-03.</tspan></svg>\n</div>\n\n${see}`,
    `<div>\n<math>As of 2026-06-03.</math>\n</div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, NO_NOTE, intro);
  }
  for (const intro of [
    `<div>\n<svg><text>As of 2026-06-03.</text></svg>\n</div>\n\n${see}`,
    `<div>\n<svg><text><a><tspan>As of 2026-06-03.</tspan></a></text></svg>\n</div>\n\n${see}`,
    `<div>\n<svg><foreignObject>As of 2026-06-03.</foreignObject></svg>\n</div>\n\n${see}`,
    `<div>\n<math><mi>As of 2026-06-03.</mi></math>\n</div>\n\n${see}`,
    `Hello <svg>x</svg> As of 2026-06-03. world.\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});

test('on a dated page the text after a <title> start tag is hidden up to </title>, as a browser hides it, but for a <title> in an <svg> or <math> element', () => {
  // A browser reads the text after an HTML <title> start tag as the
  // element's text and does not show it, as for <style>; in an <svg> or
  // <math> element, outside <desc> and the other integration points, it
  // reads <title> as the start of an SVG or MathML element.
  const see = 'See the [README](../README.md) for the current figures.\n';
  for (const intro of [
    `<div>\n<title> x > As of 2026-06-03.\n</div>\n\n${see}`,
    `Hello <title> As of 2026-06-03. world.\n\n${see}`,
    `### Audit <title> As of 2026-06-03.\n\n${see}`,
    `| <title> As of 2026-06-03. | x |\n| - | - |\n\n${see}`,
    `<div>\n<TITLE/> As of 2026-06-03.\n</div>\n\n${see}`,
    `<div>\n<title>\n</div>\n\nAs of 2026-06-03.\n\n${see}`,
    `<div>\n<svg><desc><title> x > As of 2026-06-03.\n</div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 1, intro);
    assert.match(r.stderr, NO_NOTE, intro);
  }
  for (const intro of [
    `<div>\n<title>x</title> As of 2026-06-03.\n</div>\n\n${see}`,
    `Hello <title>x <!-- </title> As of 2026-06-03. --> world.\n\n${see}`,
    `<div>\n<title>\n</div>\n\nx <b title="</title>"> As of 2026-06-03.\n\n${see}`,
    `<div>\n<svg><title>x</title></svg> As of 2026-06-03.\n</div>\n\n${see}`,
    `<div>\n<math><title>x</title></math> As of 2026-06-03.\n</div>\n\n${see}`,
  ]) {
    const r = check(DATED_LINK, datedPage(intro));
    assert.equal(r.status, 0, `${intro}\n${r.stderr}`);
  }
});
