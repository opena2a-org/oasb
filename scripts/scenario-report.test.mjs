// Tests for the report npm run report writes (scripts/scenario-report.mjs).
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTIC, pageMapping } from './check-owasp-mapping.mjs';
import {
  REPORT_FILE,
  adapterRecordPath,
  generateReport,
  parseAtlas,
  readAdapterRecord,
  readResults,
  readScenarios,
  techniqueSummary,
  writeAdapterRecord,
  writeReport,
} from './scenario-report.mjs';
import { adapterRecorder, jsonReportPath } from './record-adapter.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const NO_CAPABILITY_ADAPTER = join(repo, 'scripts', 'fixtures', 'no-capability-adapter.cjs');
// A checkout with CRLF line endings is read with LF ones.
const mapping = readFileSync(join(repo, 'docs', 'mitre-atlas-mapping.md'), 'utf8').replace(/\r\n/g, '\n');
const scenarios = readScenarios(repo);

/** The rows of the markdown table under a heading of docs/mitre-atlas-mapping.md. */
function tableRows(heading) {
  const start = mapping.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `docs/mitre-atlas-mapping.md has no "${heading}" heading`);
  const section = mapping.slice(start + heading.length + 2).split(/\n## /)[0];
  return section
    .split('\n')
    .filter((line) => line.startsWith('|') && !/^\|[-| ]+\|$/.test(line))
    .slice(1)
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
}

// The mapping the scenario headers carried before the 2026-06-03 remap.
const WITHDRAWN = ['AML.T0024', 'AML.T0029', 'AML.T0018', 'AML.T0056', 'AML.TA0006'];

test('parseAtlas reads names, several techniques and the slash shorthand', () => {
  assert.deepEqual(parseAtlas(' AML.T0055 (Unsecured Credentials), AML.T0081 (Modify AI Agent Configuration)'), [
    { id: 'AML.T0055', name: 'Unsecured Credentials' },
    { id: 'AML.T0081', name: 'Modify AI Agent Configuration' },
  ]);
  assert.deepEqual(parseAtlas('AML.T0034.002 (Agentic Resource Consumption)'), [
    { id: 'AML.T0034.002', name: 'Agentic Resource Consumption' },
  ]);
  assert.deepEqual(parseAtlas('AML.T0051/T0054 (pattern coverage across AI-layer techniques)'), [
    { id: 'AML.T0051', name: '' },
    { id: 'AML.T0054', name: '' },
  ]);
  assert.throws(() => parseAtlas('LLM01 (Prompt Injection)'), /"LLM01" is not an ATLAS technique ID/);
  assert.throws(() => parseAtlas('Prompt injection'), /is not a technique ID with an optional \(name\)/);
});

test('every scenario file is read with its ID and title', () => {
  assert.ok(scenarios.length > 0, 'no scenario files were read');
  const ids = scenarios.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, `scenario IDs repeat: ${ids.join(', ')}`);
  for (const s of scenarios) {
    assert.match(s.id, /^(AT-[A-Z]+|INT|BL|E2E)-\d+$/, `${s.file} has no scenario ID in its name`);
    assert.ok(s.title, `${s.file} has no "// ${s.id}: <title>" first line`);
  }
});

test('the ATLAS headers agree with the Coverage Summary in docs/mitre-atlas-mapping.md', () => {
  const rows = tableRows('## Coverage Summary');
  const total = rows.find((row) => row[0] === '**Total**');
  const documented = rows
    .filter((row) => row !== total)
    .map(([name, id, tests]) => ({ id, name, tests: Number(tests) }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const fromHeaders = techniqueSummary(scenarios).map(({ id, name, tests }) => ({ id, name, tests: tests.length }));
  assert.deepEqual(fromHeaders, documented);
  assert.equal(total?.[2], `**${fromHeaders.length} techniques**`);
});

test('the scenarios without an ATLAS header are the ones the mapping lists as not adversary techniques', () => {
  const documented = tableRows('## Defensive-response and capability tests (not adversary techniques)').map(([id]) => id);
  const unmapped = scenarios.filter((s) => s.techniques.length === 0).map((s) => s.id);
  assert.deepEqual([...unmapped].sort(), [...documented].sort());
});

test('the report without results shows the current mapping and no withdrawn technique', () => {
  const report = generateReport({ scenarios, date: '2026-10-11' });
  assert.match(report, /^\| AT-PROC-001 \| AML\.T0050 \| Spawn Child Process Detection \| N\/A \|$/m);
  assert.match(report, /^\| INT-002 \| AML\.T0053 \| MCP Tool Abuse Detection \| N\/A \|$/m);
  assert.match(report, /^\| AT-ENF-001 \| Not mapped \| Log Enforcement Action \| N\/A \|$/m);
  assert.match(report, /^\| E2E-001 \| AML\.T0055, AML\.T0081 \| Live Filesystem Detection \| N\/A \|$/m);
  assert.match(report, /^\*\*Unique ATLAS techniques mapped:\*\* 15$/m);
  assert.ok(!report.includes('covered by a passing scenario'), 'a report without results counts passing scenarios');
  assert.match(report, /^\| Evade AI Model \| AML\.T0015 \| AT-INT-002, INT-005 \|$/m);
  for (const id of WITHDRAWN) assert.ok(!report.includes(id), `the report still names ${id}`);
  assert.ok(!report.includes('## Summary'), 'a report without results has a Summary');
  assert.match(report, /^Product under test: not recorded \(no test results were read\)$/m);
  assert.equal(report.match(/^\| (?:AT-[A-Z]+|INT|BL|E2E)-\d+ \|/gm).length, scenarios.length);
});

test('the Known Gaps of the report are the gaps docs/known-gaps.md documents', () => {
  const page = readFileSync(join(repo, 'docs', 'known-gaps.md'), 'utf8').replace(/\r\n/g, '\n');
  const rows = (text, heading) => {
    const start = text.indexOf(`\n${heading}\n`);
    assert.ok(start >= 0, `no "${heading}" heading`);
    return text
      .slice(start + heading.length + 2)
      .split(/\n## /)[0]
      .split('\n')
      .filter((line) => line.startsWith('|') && !/^\|[-| ]+\|$/.test(line))
      .slice(1)
      .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  };
  const documented = rows(page, '## Known Detection Gaps').map(([gap, severity, test]) => [gap, severity, test]);
  const reported = rows(generateReport({ scenarios, date: '2026-10-11' }), '## Known Gaps of the Reference Adapter (ARP)').map(
    ([, gap, severity, test]) => [gap, severity, test],
  );
  assert.ok(documented.length > 0, 'docs/known-gaps.md documents no gap');
  assert.deepEqual(reported, documented);
});

test('the Known Gaps of the report are labelled as the reference adapter\'s, not the product\'s under test', () => {
  const report = generateReport({ scenarios, date: '2026-10-11' });
  assert.ok(!report.includes('## Known Gaps (Documented)'), 'the gaps keep the heading that reads as the product\'s own');
  const section = report.slice(report.indexOf('## Known Gaps of the Reference Adapter (ARP)')).split('\n| #')[0];
  assert.match(section.replace(/\n/g, ' '), /These are gaps of ARP, the reference adapter, .* in a report on another product they describe ARP, not that product\./);
});

/** The OWASP Agentic rows of a report: ID -> the "<scenario> (<status>)" entries of its Tests cell. */
function owaspRows(report) {
  const section = report.slice(report.indexOf('## OWASP Agentic Top 10 Coverage')).split(/\n## /)[0];
  return new Map(
    section
      .split('\n')
      .filter((line) => /^\| ASI\d\d \|/.test(line))
      .map((line) => {
        const [id, , tests] = line.split('|').slice(1, -1).map((cell) => cell.trim());
        return [id, tests.split(', ')];
      }),
  );
}

test('each OWASP Agentic row lists the scenarios docs/owasp-agentic-mapping.md lists under its ID', () => {
  const page = pageMapping(readFileSync(join(repo, 'docs', 'owasp-agentic-mapping.md'), 'utf8').replace(/\r\n/g, '\n'));
  assert.deepEqual(page.fail, []);
  const report = generateReport({ scenarios, date: '2026-10-11' });
  assert.ok(!report.includes('See mapping docs'), 'a row still points to the mapping docs instead of naming its scenarios');
  const reported = owaspRows(report);
  assert.deepEqual([...reported.keys()].sort(), [...page.listed.keys()].sort());
  for (const [id, entries] of reported) {
    assert.deepEqual(
      entries.map((entry) => entry.replace(/ \(N\/A\)$/, '')).sort(),
      [...page.listed.get(id)].sort(),
      `${id} lists other scenarios than docs/owasp-agentic-mapping.md`,
    );
    for (const entry of entries) assert.match(entry, / \(N\/A\)$/, `${entry} has a status without a results file`);
  }
  const uncovered = [...page.gaps].sort().map((id) => `${id} (${AGENTIC[id]})`);
  const line = `No scenario covers ${uncovered.join(', ')}. See docs/owasp-agentic-mapping.md.`;
  assert.ok(report.split('\n').includes(line), `the report has no line "${line}"`);
});

test('each OWASP Agentic row gives the status of each of its scenarios in a vitest JSON report', () => {
  const file = (path, ...statuses) => ({
    name: join(repo, path),
    status: statuses.includes('failed') ? 'failed' : 'passed',
    assertionResults: statuses.map((status) => ({ fullName: path, status, duration: 1 })),
  });
  const results = {
    numTotalTests: 3,
    numPassedTests: 2,
    numFailedTests: 1,
    numPendingTests: 0,
    testResults: [
      file('src/atomic/process/AT-PROC-001.spawn-child.test.ts', 'passed'),
      file('src/integration/INT-002.mcp-tool-abuse.test.ts', 'passed', 'failed'),
    ],
  };
  const reported = owaspRows(generateReport({ scenarios, results, date: '2026-10-11' }));
  const byScenario = (id) => scenarios.find((s) => s.id === id).owasp;
  assert.ok(byScenario('AT-PROC-001').length > 0 && byScenario('INT-002').length > 0);
  for (const id of byScenario('AT-PROC-001')) assert.ok(reported.get(id).includes('AT-PROC-001 (PASS)'), `${id} does not show AT-PROC-001 (PASS)`);
  for (const id of byScenario('INT-002')) assert.ok(reported.get(id).includes('INT-002 (FAIL)'), `${id} does not show INT-002 (FAIL)`);
  assert.ok([...reported.values()].flat().some((entry) => entry.endsWith(' (N/A)')), 'a scenario the results do not hold has a status');
});

test('the report with a vitest JSON report shows its totals and the status of each file', () => {
  const file = (path, ...statuses) => ({
    name: join(repo, path),
    status: statuses.includes('failed') ? 'failed' : 'passed',
    assertionResults: statuses.map((status) => ({ fullName: path, status, duration: 1 })),
  });
  const results = {
    numTotalTests: 7,
    numPassedTests: 4,
    numFailedTests: 1,
    numPendingTests: 2,
    testResults: [
      file('src/atomic/process/AT-PROC-001.spawn-child.test.ts', 'passed', 'passed'),
      file('src/integration/INT-002.mcp-tool-abuse.test.ts', 'passed', 'failed'),
      file('src/e2e/E2E-003.live-network-detection.test.ts', 'skipped'),
      file('src/atomic/ai-layer/AT-AI-002.prompt-output-scan.test.ts', 'passed', 'skipped'),
    ],
  };
  const report = generateReport({ scenarios, results, date: '2026-10-11' });
  // The two skipped tests are not under a suite describeWithCapability
  // skipped, so they are not counted as not applicable.
  assert.match(report, /^\| Scenarios \| 7 \|$/m);
  assert.match(report, /^\| Passed \| 4 \|$/m);
  assert.match(report, /^\| Failed \| 1 \|$/m);
  assert.match(report, /^\| Not applicable \(skipped by the product's capability declaration\) \| 0 \|$/m);
  assert.match(report, /^\| Skipped for another reason \| 2 \|$/m);
  assert.match(report, /^\| Pass rate \| 80\.0% \(4 of 5 evaluated\) \|$/m);
  assert.match(report, /^\| AT-PROC-001 \| [^|]+ \| [^|]+ \| PASS \|$/m);
  assert.match(report, /^\| INT-002 \| [^|]+ \| [^|]+ \| FAIL \|$/m);
  assert.match(report, /^\| E2E-003 \| [^|]+ \| [^|]+ \| SKIP \|$/m);
  assert.match(report, /^\| AT-AI-002 \| [^|]+ \| [^|]+ \| PASS \|$/m);
  assert.match(report, /^\| BL-001 \| [^|]+ \| [^|]+ \| N\/A \|$/m);
});

/**
 * A test file of a vitest JSON report, as vitest writes it: `path` from the
 * checkout root, one test per status, each under the suite `suite`.
 */
function resultFile(path, statuses, suite = path) {
  return {
    name: join(repo, path),
    status: statuses.includes('failed') ? 'failed' : 'passed',
    assertionResults: statuses.map((status, i) => ({
      ancestorTitles: [suite],
      title: `test ${i + 1}`,
      fullName: `${suite} test ${i + 1}`,
      status,
      duration: 1,
      meta: {},
    })),
  };
}

/** A vitest JSON report of `files`, with the totals vitest gives it. */
function vitestReport(...files) {
  const tests = files.flatMap((file) => file.assertionResults);
  const count = (status) => tests.filter((t) => t.status === status).length;
  return {
    numTotalTests: tests.length,
    numPassedTests: count('passed'),
    numFailedTests: count('failed'),
    numPendingTests: count('skipped'),
    testResults: files,
  };
}

/** The section of a report under `## heading`, up to the next heading of that level. */
function reportSection(report, heading) {
  const start = report.indexOf(`\n## ${heading}\n`);
  assert.ok(start >= 0, `the report has no "## ${heading}" section`);
  return report.slice(start + 1).split(/\n(?=## )/)[0];
}

test('the Summary counts the attack scenarios only, and the ATLAS coverage the passing ones', () => {
  const results = vitestReport(
    resultFile('src/atomic/process/AT-PROC-001.spawn-child.test.ts', ['passed']),
    resultFile(
      'src/integration/INT-002.mcp-tool-abuse.test.ts',
      ['skipped', 'skipped'],
      'INT-002: MCP Tool Abuse Detection [requires: mcp-scanning]',
    ),
    resultFile('src/benchmark/scoring.test.ts', ['passed', 'passed', 'passed', 'passed', 'passed']),
  );
  const report = generateReport({ scenarios, results, date: '2026-10-16' });
  const summary = reportSection(report, 'Summary');
  assert.match(summary, /^\| Scenarios \| 3 \|$/m);
  assert.match(summary, /^\| Passed \| 1 \|$/m);
  assert.match(summary, /^\| Failed \| 0 \|$/m);
  assert.match(summary, /^\| Not applicable \(skipped by the product's capability declaration\) \| 2 \|$/m);
  assert.match(summary, /^\| Skipped for another reason \| 0 \|$/m);
  assert.match(summary, /^\| Pass rate \| 100\.0% \(1 of 1 evaluated\) \|$/m);
  // The five scoring-engine tests are reported on their own line.
  assert.match(summary, /^Harness self-tests: 5 passed, 0 failed\./m);
  assert.match(report, /^\| AT-PROC-001 \| AML\.T0050 \| [^|]+ \| PASS \|$/m);
  assert.match(report, /^\| INT-002 \| AML\.T0053 \| [^|]+ \| SKIP \|$/m);
  // AML.T0050 is covered; INT-002's AML.T0053 is mapped, but its file was skipped.
  assert.match(report, /^\*\*Unique ATLAS techniques mapped:\*\* 15$/m);
  assert.match(report, /^\*\*Unique ATLAS techniques covered by a passing scenario:\*\* 1$/m);
});

test('a run in which the product evaluated no scenario reports no pass rate', () => {
  const results = vitestReport(
    resultFile(
      'src/atomic/ai-layer/AT-AI-001.prompt-input-scan.test.ts',
      ['skipped', 'skipped', 'skipped'],
      'AT-AI-001: Prompt Input Scanning [requires: prompt-input-scanning]',
    ),
    resultFile('src/benchmark/scoring.test.ts', ['passed', 'passed']),
  );
  const report = generateReport({ scenarios, results, date: '2026-10-16' });
  const summary = reportSection(report, 'Summary');
  assert.match(summary, /^\| Scenarios \| 3 \|$/m);
  assert.match(summary, /^\| Passed \| 0 \|$/m);
  assert.match(summary, /^\| Not applicable \(skipped by the product's capability declaration\) \| 3 \|$/m);
  assert.match(summary, /^\| Pass rate \| not measured \(0 scenarios evaluated\) \|$/m);
  assert.ok(!summary.includes('%'), `the Summary of a run with no scenario evaluated has a percentage:\n${summary}`);
  assert.match(report, /^\*\*Unique ATLAS techniques covered by a passing scenario:\*\* 0$/m);
});

test('a scenario file that failed outside its tests is FAIL and is counted in the Summary', () => {
  // A file whose adapter throws while the file is collected has no test results.
  const broken = {
    name: join(repo, 'src/integration/INT-002.mcp-tool-abuse.test.ts'),
    status: 'failed',
    message: 'Failed to load the adapter',
    assertionResults: [],
  };
  const results = vitestReport(broken, resultFile('src/benchmark/scoring.test.ts', ['passed']));
  const report = generateReport({ scenarios, results, date: '2026-10-16' });
  const summary = reportSection(report, 'Summary');
  assert.match(report, /^\| INT-002 \| [^|]+ \| [^|]+ \| FAIL \|$/m);
  assert.match(summary, /^\| Scenario files that failed outside a test \| 1 \|$/m);
  assert.match(summary, /^\| Pass rate \| not measured \(0 scenarios evaluated\) \|$/m);
  assert.match(report, /^\*\*Unique ATLAS techniques covered by a passing scenario:\*\* 0$/m);
});

test('a results file that is not a vitest JSON report is refused', () => {
  assert.throws(() => generateReport({ scenarios, results: {}, date: '2026-10-11' }), /not a vitest JSON report/);
  assert.throws(
    () => generateReport({ scenarios, results: { testResults: [] }, date: '2026-10-11' }),
    /no "numTotalTests" count/,
  );
});

test('the report is written beside the recorded REPORT.md, to a name git ignores', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scenario-report-'));
  try {
    writeFileSync(join(dir, 'REPORT.md'), 'the run kept as recorded\n');
    const report = generateReport({ scenarios, date: '2026-10-11' });
    const written = writeReport(report, dir);
    assert.equal(written, join(dir, REPORT_FILE));
    assert.equal(readFileSync(written, 'utf8'), report);
    assert.equal(readFileSync(join(dir, 'REPORT.md'), 'utf8'), 'the run kept as recorded\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // .gitignore is read rather than asking git, which cannot answer in a source
  // archive without git metadata or on a machine without git.
  const gitignore = readFileSync(join(repo, '.gitignore'), 'utf8');
  assert.ok(gitignoreIgnores(gitignore, REPORT_FILE), `.gitignore does not ignore ${REPORT_FILE}`);
});

/**
 * Whether a root .gitignore holding `text` ignores the file `name` at the
 * repository root, decided as git decides it (gitignore(5)): the last pattern
 * that matches wins, a leading "!" re-includes, a trailing "/" matches only
 * directories, "\" escapes a character, and "*", "?", "[...]" and "**" are
 * globs that do not match "/". POSIX class names such as [[:alpha:]] are not
 * read.
 */
function gitignoreIgnores(text, name) {
  assert.ok(!name.includes('/'), `${name} is not at the repository root`);
  let ignored = false;
  for (const line of text.split(/\r?\n/)) {
    let pattern = line.replace(/(?<!\\) +$/, '');
    if (pattern === '' || pattern.startsWith('#')) continue;
    const negated = pattern.startsWith('!');
    if (negated) pattern = pattern.slice(1);
    if (pattern.endsWith('/')) continue;
    if (globRegExp(pattern.replace(/^\//, '')).test(name)) ignored = !negated;
  }
  return ignored;
}

/** A gitignore glob as an anchored regular expression over a path. */
function globRegExp(glob) {
  const literal = (c) => c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '\\' && i + 1 < glob.length) {
      re += literal(glob[++i]);
    } else if (c === '*' && glob[i + 1] === '*' && (i === 0 || glob[i - 1] === '/') && [undefined, '/'].includes(glob[i + 2])) {
      // "**" as a whole segment: "**/" matches any leading directories, "/**" all inside.
      re += glob[i + 2] === undefined ? '.*' : '(?:.*/)?';
      i += 2;
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '[') {
      // A "]" right after "[" or "[!" is one of the class's characters.
      const negated = glob[i + 1] === '!' || glob[i + 1] === '^';
      const start = i + (negated ? 2 : 1);
      const end = glob.indexOf(']', start + 1);
      if (end < 0) {
        re += '\\[';
        continue;
      }
      re += `[${negated ? '^' : ''}${glob.slice(start, end).replace(/[\]\\^]/g, '\\$&')}]`;
      i = end;
    } else {
      re += literal(c);
    }
  }
  return new RegExp(`^${re}$`);
}

test('the .gitignore reading decides as git does for a file at the root', () => {
  const cases = [
    ['REPORT.generated.md', true],
    ['/REPORT.generated.md', true],
    ['**/REPORT.generated.md', true],
    ['REPORT.generated.md   ', true],
    ['REPORT.*.md', true],
    ['REPORT.?enerated.md', true],
    ['REPORT.[gG]enerated.md', true],
    ['REPORT.[!g]enerated.md', false],
    ['*.md', true],
    ['**', true],
    ['REPORT.generated.md\n!*.md', false],
    ['*.md\n!REPORT.generated.md', false],
    ['!*.md\nREPORT.generated.md', true],
    ['REPORT.generated.md/', false],
    ['docs/REPORT.generated.md', false],
    ['# REPORT.generated.md', false],
    ['\\#REPORT.generated.md', false],
    ['REPORT', false],
    ['REPORT.generated.m', false],
    ['REPORT.generated.md.bak', false],
    ['REPORTxgenerated.md', false],
  ];
  for (const [text, ignored] of cases) {
    assert.equal(gitignoreIgnores(text, REPORT_FILE), ignored, JSON.stringify(text));
  }
});

test('a results file named on the command line must exist; the default one may be absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scenario-report-'));
  try {
    const missing = join(dir, 'nonexistent-results.json');
    assert.equal(readResults(missing, false), null);
    assert.throws(
      () => readResults(missing, true),
      (err) => err.message === `${missing} does not exist; write it with npx vitest run --reporter=json --outputFile=${missing}`,
    );

    const results = join(dir, 'test-results.json');
    writeFileSync(results, '{"numTotalTests": 0, "testResults": []}');
    assert.deepEqual(readResults(results, true), { numTotalTests: 0, testResults: [] });
    assert.deepEqual(readResults(results, false), { numTotalTests: 0, testResults: [] });

    writeFileSync(results, 'not json');
    assert.throws(() => readResults(results, false), (err) => err.message.startsWith(`${results} is not JSON: `));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('npm run report exits 1 and writes nothing when the named results file does not exist', () => {
  // Runs scripts/generate-report.ts as npm run report does, through the pinned tsx.
  const tsx = join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const script = join(repo, 'scripts', 'generate-report.ts');
  const dir = mkdtempSync(join(tmpdir(), 'scenario-report-'));
  try {
    const missing = join(dir, 'nonexistent-results.json');
    const named = spawnSync(process.execPath, [tsx, script, missing], { cwd: dir, encoding: 'utf8' });
    assert.equal(named.status, 1, named.stderr);
    assert.equal(
      named.stderr.trim(),
      `Report not written: ${missing} does not exist; write it with npx vitest run --reporter=json --outputFile=${missing}`,
    );
    assert.equal(existsSync(join(dir, REPORT_FILE)), false);

    // Without an argument the absent default test-results.json is not an error,
    // so the same run in the same directory writes the mapping alone.
    const unnamed = spawnSync(process.execPath, [tsx, script], { cwd: dir, encoding: 'utf8' });
    assert.equal(unnamed.status, 0, unnamed.stderr);
    assert.match(readFileSync(join(dir, REPORT_FILE), 'utf8'), /\| N\/A \|/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the adapter record of a results file sits beside it', () => {
  assert.equal(adapterRecordPath('/runs/test-results.json'), '/runs/test-results.adapter.json');
  assert.equal(adapterRecordPath('/runs/results'), '/runs/results.adapter.json');
});

test('npm run report names the product the adapter record beside the results file gives', () => {
  const tsx = join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const script = join(repo, 'scripts', 'generate-report.ts');
  const dir = mkdtempSync(join(tmpdir(), 'scenario-report-'));
  const report = (resultsPath) => {
    const r = spawnSync(process.execPath, [tsx, script, resultsPath], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return readFileSync(join(dir, REPORT_FILE), 'utf8');
  };
  try {
    const resultsPath = join(dir, 'res.json');
    const results = vitestReport(resultFile('src/atomic/process/AT-PROC-001.spawn-child.test.ts', ['passed']));
    writeFileSync(resultsPath, JSON.stringify(results));

    // No record beside the results file.
    assert.match(
      report(resultsPath),
      /^Product under test: not recorded \(there is no res\.adapter\.json beside res\.json; npx vitest run --reporter=json --outputFile=\S+res\.json writes both\)$/m,
    );

    writeAdapterRecord(resultsPath, {
      adapter: '/adapters/no-caps.cjs',
      product: 'no-capability-fixture',
      version: '0.0.0',
      capabilities: [],
    });
    const named = report(resultsPath);
    assert.match(named, /^Product under test: no-capability-fixture 0\.0\.0 \(adapter: \/adapters\/no-caps\.cjs\)$/m);
    assert.match(named, /^Declared capabilities: none$/m);

    writeAdapterRecord(resultsPath, {
      adapter: 'arp',
      product: 'arp-guard',
      version: '0.3.0',
      capabilities: ['process-monitoring', 'prompt-input-scanning'],
    });
    const arp = report(resultsPath);
    assert.match(arp, /^Product under test: arp-guard 0\.3\.0 \(adapter: arp\)$/m);
    assert.match(arp, /^Declared capabilities: process-monitoring, prompt-input-scanning$/m);

    // A results file written again after the record is not the one it names.
    writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    assert.match(
      report(resultsPath),
      /^Product under test: not recorded \(res\.adapter\.json was written for another results file than res\.json; npx vitest run --reporter=json --outputFile=\S+res\.json writes both\)$/m,
    );

    // An adapter whose capabilities could not be read is named without them.
    writeAdapterRecord(resultsPath, { adapter: './mine.js', error: 'Cannot find module ./mine.js' });
    assert.match(
      report(resultsPath),
      /^Product under test: adapter \.\/mine\.js; its product and version were not recorded \(Cannot find module \.\/mine\.js\)$/m,
    );

    writeFileSync(adapterRecordPath(resultsPath), 'not json');
    assert.match(readAdapterRecord(resultsPath).unrecorded, /^res\.adapter\.json is not JSON: /);
    writeFileSync(adapterRecordPath(resultsPath), '{"results": {}}');
    assert.match(readAdapterRecord(resultsPath).unrecorded, /^res\.adapter\.json names no adapter; npx vitest run /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the JSON report path of a vitest config is the file the json reporter writes', () => {
  const root = '/checkout';
  assert.equal(jsonReportPath({ root, reporters: [['json', {}]], outputFile: 'res.json' }), '/checkout/res.json');
  assert.equal(jsonReportPath({ root, reporters: [['json', {}]], outputFile: { json: '/runs/res.json' } }), '/runs/res.json');
  assert.equal(jsonReportPath({ root, reporters: [['default', {}], ['json', { outputFile: 'a.json' }]] }), '/checkout/a.json');
  // The json reporter prints to stdout without an output file.
  assert.equal(jsonReportPath({ root, reporters: [['json', {}]] }), null);
  assert.equal(jsonReportPath({ root, reporters: [['json', {}]], outputFile: { junit: 'j.xml' } }), null);
  assert.equal(jsonReportPath({ root, reporters: [['default', {}]], outputFile: 'res.json' }), null);
});

test('the adapter is recorded only when the run wrote its JSON report', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scenario-report-'));
  try {
    const resultsPath = join(dir, 'res.json');
    const describe = async () => ({ adapter: 'llm-guard', product: 'llm-guard', version: '0.1.8', capabilities: [] });

    // A run that wrote no report leaves no record.
    await adapterRecorder(resultsPath, describe)();
    assert.equal(existsSync(adapterRecordPath(resultsPath)), false);

    // A report an earlier run left, which this run did not write again, keeps
    // the record of the run that wrote it.
    writeFileSync(resultsPath, '{"run": 1}');
    writeAdapterRecord(resultsPath, { adapter: 'arp', product: 'arp-guard', version: '0.3.0', capabilities: [] });
    await adapterRecorder(resultsPath, describe)();
    assert.equal(readAdapterRecord(resultsPath).product, 'arp-guard');

    const teardown = adapterRecorder(resultsPath, describe);
    writeFileSync(resultsPath, '{"run": 2}');
    await teardown();
    assert.deepEqual(
      { ...readAdapterRecord(resultsPath), results: undefined },
      { adapter: 'llm-guard', product: 'llm-guard', version: '0.1.8', capabilities: [], results: undefined },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a vitest run with a JSON report records the adapter it ran with beside the report', () => {
  const vitest = join(repo, 'node_modules', 'vitest', 'vitest.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'scenario-report-'));
  try {
    const out = join(dir, 'res.json');
    const r = spawnSync(
      process.execPath,
      [vitest, 'run', 'src/atomic/ai-layer/AT-AI-001.prompt-input-scan.test.ts', '--reporter=json', `--outputFile=${out}`],
      { cwd: repo, encoding: 'utf8', env: { ...process.env, OASB_ADAPTER: NO_CAPABILITY_ADAPTER } },
    );
    // Every scenario is skipped under this adapter, so the run exits 2
    // (scripts/scenario-floor.ts); the report and the record are still written.
    assert.equal(r.status, 2, r.stderr.slice(-2000));
    const record = readAdapterRecord(out);
    assert.equal(record.unrecorded, undefined, record.unrecorded);
    assert.equal(record.adapter, NO_CAPABILITY_ADAPTER);
    assert.equal(record.product, 'no-capability-fixture');
    assert.equal(record.version, '0.0.0');
    assert.deepEqual(record.capabilities, []);

    const report = generateReport({ scenarios, results: readResults(out, true), adapter: record, date: '2026-10-16' });
    assert.ok(report.includes(`Product under test: no-capability-fixture 0.0.0 (adapter: ${NO_CAPABILITY_ADAPTER})`), report);
    assert.match(reportSection(report, 'Summary'), /^\| Pass rate \| not measured \(0 scenarios evaluated\) \|$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
