// The report that `npm run report` (scripts/generate-report.ts) writes to
// REPORT.md. The MITRE ATLAS mapping is read from the `// ATLAS:` line in the
// header comment of each scenario file, so the report cannot drift from the
// tests; docs/mitre-atlas-mapping.md is the per-technique page those headers
// must agree with, and scripts/scenario-report.test.mjs checks that they do.
// The totals and the status of each file come from a vitest JSON report when
// one is given.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIO_DIRS, reportFiles, sourcePath } from './readme-counts.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// AT-PROC-001.spawn-child.test.ts, INT-002.mcp-tool-abuse.test.ts, BL-001..., E2E-001...
const SCENARIO_FILE = /^((?:AT-[A-Z]+|INT|BL|E2E)-\d+)\..*\.test\.ts$/;
// AML.T0050, AML.T0034.002, or T0054 after a slash in AML.T0051/T0054.
const TECHNIQUE = /^(?:AML\.)?(T\d{4}(?:\.\d{3})?)$/;

// OWASP Top 10 for Agentic Applications (2026) IDs the scenario headers name.
// docs/owasp-agentic-mapping.md lists the scenarios under each.
const OWASP_MAP = {
  'ASI01': 'Agent Goal Hijack',
  'ASI02': 'Tool Misuse & Exploitation',
  'ASI03': 'Identity & Privilege Abuse',
  'ASI05': 'Unexpected Code Execution (RCE)',
  'ASI07': 'Insecure Inter-Agent Communication',
  'ASI08': 'Cascading Failures',
  'ASI10': 'Rogue Agents',
};

/**
 * The techniques of an `ATLAS:` header value, each with the name the header
 * gives it. In `AML.T0051/T0054 (pattern coverage ...)` the parentheses
 * describe the group, so neither technique takes a name from them.
 */
export function parseAtlas(value) {
  const techniques = [];
  // Entries are separated by commas outside parentheses.
  for (const entry of value.split(/,(?![^(]*\))/)) {
    const m = entry.trim().match(/^(\S+)(?:\s*\((.+)\))?$/);
    if (!m) throw new Error(`"${entry.trim()}" is not a technique ID with an optional (name)`);
    const ids = m[1].split('/');
    for (const token of ids) {
      const id = token.match(TECHNIQUE);
      if (!id) throw new Error(`"${token}" is not an ATLAS technique ID`);
      techniques.push({ id: `AML.${id[1]}`, name: ids.length === 1 && m[2] ? m[2].trim() : '' });
    }
  }
  return techniques;
}

function testFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? testFiles(join(dir, e.name)) : e.name.endsWith('.test.ts') ? [join(dir, e.name)] : []))
    .sort();
}

/**
 * Every scenario file under src/atomic, src/integration, src/baseline and
 * src/e2e: its ID, the title its header gives, its path from the checkout
 * root and the ATLAS techniques its header names (none for a test of the
 * product's response or of its own detection machinery).
 */
export function readScenarios(root = ROOT) {
  return SCENARIO_DIRS.flatMap((dir) =>
    testFiles(join(root, dir)).map((path) => {
      const file = relative(root, path).replace(/\\/g, '/');
      const name = file.slice(file.lastIndexOf('/') + 1);
      const id = name.match(SCENARIO_FILE)?.[1] ?? name.replace(/\.test\.ts$/, '');
      const header = [];
      for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        if (!line.startsWith('//')) break;
        header.push(line.replace(/^\/\/ ?/, ''));
      }
      const title = header[0]?.startsWith(`${id}: `) ? header[0].slice(id.length + 2).trim() : '';
      const techniques = header
        .filter((line) => line.startsWith('ATLAS:'))
        .flatMap((line) => {
          try {
            return parseAtlas(line.slice('ATLAS:'.length));
          } catch (err) {
            throw new Error(`${file}: its ATLAS header is not readable: ${err.message}`);
          }
        });
      return { id, title, file, techniques };
    }),
  );
}

/** Each technique the scenarios name, by ID, with its name and the IDs of the scenarios that name it. */
export function techniqueSummary(scenarios) {
  const byId = new Map();
  for (const scenario of scenarios) {
    for (const { id, name } of scenario.techniques) {
      const entry = byId.get(id) ?? { id, name: '', tests: [] };
      entry.name ||= name;
      if (!entry.tests.includes(scenario.id)) entry.tests.push(scenario.id);
      byId.set(id, entry);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

/** PASS, FAIL or SKIP for the tests of one file in a vitest JSON report. */
function fileStatus(tests) {
  if (tests.some((t) => t.status === 'failed')) return 'FAIL';
  if (tests.some((t) => t.status === 'passed')) return 'PASS';
  return 'SKIP';
}

/**
 * The markdown report. `results` is a parsed vitest JSON report
 * (`npx vitest run --reporter=json --outputFile=test-results.json`), or null
 * to report the mapping alone with every status N/A.
 *
 * @param {{ scenarios: ReturnType<typeof readScenarios>, results?: any, date: string }} options
 */
export function generateReport({ scenarios, results = null, date }) {
  const status = new Map();
  if (results !== null) {
    for (const file of reportFiles(results)) status.set(sourcePath(file.name), fileStatus(file.assertionResults));
    for (const field of ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests']) {
      if (typeof results[field] !== 'number') throw new Error(`it has no "${field}" count, so it is not a vitest JSON report`);
    }
  }

  const lines = ['# OASB Test Report', '', `Generated: ${date}`, ''];

  if (results !== null) {
    const rate = results.numTotalTests > 0 ? ((results.numPassedTests / results.numTotalTests) * 100).toFixed(1) : '0.0';
    lines.push(
      '## Summary',
      '',
      '| Metric | Value |',
      '|--------|-------|',
      `| Total Tests | ${results.numTotalTests} |`,
      `| Passed | ${results.numPassedTests} |`,
      `| Failed | ${results.numFailedTests} |`,
      `| Skipped | ${results.numPendingTests} |`,
      `| Pass Rate | ${rate}% |`,
      '',
    );
  }

  lines.push(
    '## MITRE ATLAS Coverage',
    '',
    '| Test ID | ATLAS Technique | Description | Status |',
    '|---------|----------------|-------------|--------|',
  );
  for (const s of scenarios) {
    const techniques = s.techniques.length > 0 ? s.techniques.map((t) => t.id).join(', ') : 'Not mapped';
    lines.push(`| ${s.id} | ${techniques} | ${s.title} | ${status.get(s.file) ?? 'N/A'} |`);
  }
  lines.push(
    '',
    'A test marked "Not mapped" validates the product\'s response or its own detection',
    'machinery, not an adversary technique. See docs/mitre-atlas-mapping.md.',
    '',
  );

  const summary = techniqueSummary(scenarios);
  lines.push(
    `**Unique ATLAS techniques covered:** ${summary.length}`,
    '',
    '| ATLAS Technique | ID | Tests |',
    '|-----------------|----|-------|',
    ...summary.map((t) => `| ${t.name} | ${t.id} | ${t.tests.join(', ')} |`),
    '',
  );

  lines.push('## OWASP Agentic Top 10 Coverage', '', '| OWASP ID | Category | Tests |', '|----------|----------|-------|');
  for (const [id, name] of Object.entries(OWASP_MAP)) lines.push(`| ${id} | ${name} | See mapping docs |`);
  lines.push('');

  // The gaps of the README's Known Detection Gaps table, worded as it words them.
  lines.push(
    '## Known Gaps (Documented)',
    '',
    '| # | Gap | Severity | Test Coverage |',
    '|---|-----|----------|--------------|',
    '| 6 | Anomaly baselines not reloaded when the runtime restarts | Medium | BL-003 |',
    '| 7 | No connection rate anomaly detection | Medium | AT-NET-003 |',
    '| 8 | No HTTP response body monitoring | Low | INT-003 |',
    '| 9 | No cross-monitor event correlation | Architectural | INT-006 |',
    '',
  );

  return lines.join('\n');
}
