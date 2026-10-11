// Tests for scripts/check-readme.mjs link resolution and test counts.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareCounts } from './check-test-counts.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'check-readme.mjs');
const repo = join(dirname(script), '..');
const USAGE = /^usage: node scripts\/check-readme\.mjs \[--tests <report\.json> \| --no-counts\] \[path\/to\/README\.md\]$/m;

const HEAD = '# Title\n\n## Quick Start\n\n```bash\nnpm test\n```\n\n## Guide\n\n';

// Write a README (layout checks pass) plus docs/guide.md, run the check on it
// without the test count check.
function check(body) {
  const dir = mkdtempSync(join(tmpdir(), 'check-readme-'));
  try {
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', 'guide.md'), '# Guide\n\n## Setup steps\n');
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

// The count statements of the real README, with the SUITE's numbers.
const COUNTED = [
  '# OASB',
  '',
  '[![Tests](https://img.shields.io/badge/tests-14%20passing-brightgreen)](https://example.com/oasb)',
  '',
  '10 standardized attack scenarios that evaluate a security product.',
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
  '| **`npm test` total** | **15** | (14 pass, 1 environment-skipped) | |',
  '',
  '## MITRE ATLAS Coverage',
  '',
  '4 unique techniques across 8 scenario files.',
  '',
  '## Usage via OpenA2A CLI',
  '',
  '```bash',
  'opena2a benchmark run       # all 10 scenarios',
  '```',
  '',
].join('\n');

// Numbers in COUNTED that are not test counts: technique counts and a test ID.
const NOT_COUNTS = /\d+ (?:unique )?techniques|E2E-\d+/g;

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

// Run the check with --tests on `readme` and `testReport`.
function checkCounts(readme, suite = SUITE, testReport = report(suite)) {
  const dir = mkdtempSync(join(tmpdir(), 'check-readme-counts-'));
  try {
    writeFileSync(join(dir, 'README.md'), readme);
    writeFileSync(join(dir, 'report.json'), JSON.stringify(testReport));
    const r = spawnSync(process.execPath, [script, '--tests', join(dir, 'report.json'), join(dir, 'README.md')], {
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
  assert.deepEqual(compareCounts(report(SUITE), COUNTED).drift, []);
});

test('every count the README states is compared by this check and by the drift guard', () => {
  const notCounts = [...COUNTED.matchAll(NOT_COUNTS)].map((m) => [m.index, m.index + m[0].length]);
  const counts = [...COUNTED.matchAll(/\b\d+\b/g)].filter(
    (m) => !notCounts.some(([start, end]) => m.index >= start && m.index < end),
  );
  assert.equal(counts.length, 33);
  for (const m of counts) {
    const line = lineOf(COUNTED, m.index);
    const stated = Number(m[0]) + 1;
    const changed = COUNTED.slice(0, m.index) + stated + COUNTED.slice(m.index + m[0].length);
    const why = `changing ${m[0]} to ${stated} on line ${line}`;
    const r = checkCounts(changed);
    assert.equal(r.status, 1, `${why} passes check-readme`);
    assert.match(r.stderr, new RegExp(`^README: line ${line}: .* says ${stated}; `, 'm'), `${why}: ${r.stderr}`);
    const { drift } = compareCounts(report(SUITE), changed);
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

test('a badge below the passing count, the Quick Start comment and the scoring-engine and pinned counts are each checked', () => {
  const r = checkCounts(
    COUNTED.replace('tests-14%20passing', 'tests-12%20passing')
      .replace('Full suite: 15 tests (14 pass', 'Full suite: 13 tests (12 pass')
      .replace('**2 scoring-engine unit tests**', '**1 scoring-engine unit tests**')
      .replace('| Pinned benchmark harness tests | 3 |', '| Pinned benchmark harness tests | 2 |'),
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr, /line 3: the tests badge says 12; the test report has 14 passing tests\./);
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

test('the scenario count in the benchmark run comment is checked', () => {
  const r = checkCounts(COUNTED.replace('# all 10 scenarios', '# all 11 scenarios'));
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    /line 46: the benchmark run comment says 11; the test report has 10 attack-scenario tests \(src\/atomic, src\/integration, src\/baseline and src\/e2e\)\./,
  );
});

test('a failing test is not counted as passing', () => {
  const r = checkCounts(COUNTED, { ...SUITE, 'src/baseline/BL-001.profile.test.ts': [0, 1, 0] });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /line 3: the tests badge says 14; the test report has 13 passing tests\./);
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
  assert.match(r.stderr, /the tests badge .* was not found/);
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
