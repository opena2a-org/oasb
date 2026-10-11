// Tests for the report npm run report writes (scripts/scenario-report.mjs).
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateReport, parseAtlas, readScenarios, techniqueSummary } from './scenario-report.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
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
  assert.match(report, /^\*\*Unique ATLAS techniques covered:\*\* 15$/m);
  assert.match(report, /^\| Evade AI Model \| AML\.T0015 \| AT-INT-002, INT-005 \|$/m);
  for (const id of WITHDRAWN) assert.ok(!report.includes(id), `the report still names ${id}`);
  assert.ok(!report.includes('## Summary'), 'a report without results has a Summary');
  assert.equal(report.match(/^\| (?:AT-[A-Z]+|INT|BL|E2E)-\d+ \|/gm).length, scenarios.length);
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
  assert.match(report, /^\| Total Tests \| 7 \|$/m);
  assert.match(report, /^\| Passed \| 4 \|$/m);
  assert.match(report, /^\| Failed \| 1 \|$/m);
  assert.match(report, /^\| Skipped \| 2 \|$/m);
  assert.match(report, /^\| AT-PROC-001 \| [^|]+ \| [^|]+ \| PASS \|$/m);
  assert.match(report, /^\| INT-002 \| [^|]+ \| [^|]+ \| FAIL \|$/m);
  assert.match(report, /^\| E2E-003 \| [^|]+ \| [^|]+ \| SKIP \|$/m);
  assert.match(report, /^\| AT-AI-002 \| [^|]+ \| [^|]+ \| PASS \|$/m);
  assert.match(report, /^\| BL-001 \| [^|]+ \| [^|]+ \| N\/A \|$/m);
});

test('a results file that is not a vitest JSON report is refused', () => {
  assert.throws(() => generateReport({ scenarios, results: {}, date: '2026-10-11' }), /not a vitest JSON report/);
  assert.throws(
    () => generateReport({ scenarios, results: { testResults: [] }, date: '2026-10-11' }),
    /no "numTotalTests" count/,
  );
});
