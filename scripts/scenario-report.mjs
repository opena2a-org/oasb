// The report that `npm run report` (scripts/generate-report.ts) writes to
// REPORT.generated.md. The MITRE ATLAS mapping is read from the `// ATLAS:` line
// and the OWASP Agentic mapping from the `// OWASP Agentic:` line in the
// header comment of each scenario file, so the report cannot drift from the
// tests; docs/mitre-atlas-mapping.md and docs/owasp-agentic-mapping.md are the
// pages those headers must agree with, and scripts/scenario-report.test.mjs
// and scripts/check-owasp-mapping.mjs check that they do. The counts and the
// status of each file come from a vitest JSON report when one is given, and
// the product under test from the adapter record that
// scripts/record-adapter.mjs writes beside that report.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTIC, parseHeader } from './check-owasp-mapping.mjs';
import { SCENARIO_DIRS, reportFiles, sourcePath } from './readme-counts.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// The title describeWithCapability (src/harness/capabilities.ts) gives a
// suite it skips because the product does not declare a capability.
const REQUIRES = /\[requires: [^\]]+\]$/;

// AT-PROC-001.spawn-child.test.ts, INT-002.mcp-tool-abuse.test.ts, BL-001..., E2E-001...
const SCENARIO_FILE = /^((?:AT-[A-Z]+|INT|BL|E2E)-\d+)\..*\.test\.ts$/;
// AML.T0050, AML.T0034.002, or T0054 after a slash in AML.T0051/T0054.
const TECHNIQUE = /^(?:AML\.)?(T\d{4}(?:\.\d{3})?)$/;

const OWASP_HEADER = 'OWASP Agentic:';

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
 * root, the ATLAS techniques its header names (none for a test of the
 * product's response or of its own detection machinery) and the OWASP
 * Agentic IDs it names (`owasp`).
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
      const owasp = header
        .filter((line) => line.startsWith(OWASP_HEADER))
        .flatMap((line) => {
          const { ids, problems } = parseHeader(line.slice(OWASP_HEADER.length));
          if (problems.length > 0) throw new Error(`${file}: its OWASP Agentic header is not readable: ${problems.join('; ')}`);
          return ids;
        });
      return { id, title, file, techniques, owasp };
    }),
  );
}

/**
 * The `name` and `version` of the package.json of the checkout at `root`:
 * the benchmark that writes the report.
 */
export function readPackage(root = ROOT) {
  const { name, version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return { name, version };
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

/**
 * PASS, FAIL or SKIP for one file of a vitest JSON report. A file vitest
 * marks failed with no failed test, such as one that threw while it was
 * collected, is FAIL.
 */
function fileStatus(file) {
  const tests = file.assertionResults;
  if (file.status === 'failed' || tests.some((t) => t.status === 'failed')) return 'FAIL';
  if (tests.some((t) => t.status === 'passed')) return 'PASS';
  return 'SKIP';
}

/** True for a file of a vitest JSON report that holds attack scenarios. */
function isScenarioFile(file) {
  const path = sourcePath(file.name);
  return SCENARIO_DIRS.some((dir) => path.startsWith(`${dir}/`));
}

/**
 * The counts of the Summary. Only the tests of the scenario files are
 * counted as scenarios; the others (the scoring-engine, pinned benchmark
 * harness and adapter tests) do not exercise the product and are counted
 * apart as harness self-tests. A scenario that neither passed nor failed is
 * not applicable when describeWithCapability skipped its suite, and skipped
 * for another reason otherwise (an it.skip, a case skipped as inconclusive).
 */
function summaryCounts(files) {
  const counts = { scenarios: 0, passed: 0, failed: 0, notApplicable: 0, otherSkipped: 0, brokenFiles: 0 };
  const harness = { passed: 0, failed: 0, other: 0 };
  for (const file of files) {
    const scenario = isScenarioFile(file);
    if (scenario && file.status === 'failed' && !file.assertionResults.some((t) => t.status === 'failed')) {
      counts.brokenFiles++;
    }
    for (const test of file.assertionResults) {
      const outcome = test.status === 'passed' ? 'passed' : test.status === 'failed' ? 'failed' : null;
      if (!scenario) {
        harness[outcome ?? 'other']++;
        continue;
      }
      counts.scenarios++;
      if (outcome) counts[outcome]++;
      else if ((test.ancestorTitles ?? []).some((title) => REQUIRES.test(title))) counts.notApplicable++;
      else counts.otherSkipped++;
    }
  }
  return { ...counts, harness };
}

/** The Summary section of a report with results. */
function summaryLines(files) {
  const c = summaryCounts(files);
  const evaluated = c.passed + c.failed;
  const rate =
    evaluated > 0
      ? `${((c.passed / evaluated) * 100).toFixed(1)}% (${c.passed} of ${evaluated} evaluated)`
      : 'not measured (0 scenarios evaluated)';
  const dirs = `${SCENARIO_DIRS.slice(0, -1).join(', ')} and ${SCENARIO_DIRS.at(-1)}`;
  const lines = [
    '## Summary',
    '',
    `Counts of the attack scenarios, the tests under ${dirs}.`,
    'A scenario whose suite requires a capability the product does not declare is not applicable,',
    'and the pass rate is over the scenarios that passed or failed.',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Scenarios | ${c.scenarios} |`,
    `| Passed | ${c.passed} |`,
    `| Failed | ${c.failed} |`,
    `| Not applicable (skipped by the product's capability declaration) | ${c.notApplicable} |`,
    `| Skipped for another reason | ${c.otherSkipped} |`,
  ];
  if (c.brokenFiles > 0) lines.push(`| Scenario files that failed outside a test | ${c.brokenFiles} |`);
  lines.push(`| Pass rate | ${rate} |`, '');
  const { passed, failed, other } = c.harness;
  if (passed + failed + other > 0) {
    lines.push(
      `Harness self-tests: ${passed} passed, ${failed} failed${other > 0 ? `, ${other} skipped` : ''}.`,
      'These are the scoring-engine, pinned benchmark harness and adapter tests: they do not exercise',
      'the product and are not in the pass rate.',
      '',
    );
  }
  return lines;
}

/**
 * The line that names the product under test. `adapter` is what
 * readAdapterRecord returns, or null when there is none.
 */
function productLines(adapter, results) {
  if (results === null) return ['Product under test: not recorded (no test results were read)'];
  if (adapter === null || adapter === undefined) return ['Product under test: not recorded'];
  if (adapter.unrecorded) return [`Product under test: not recorded (${adapter.unrecorded})`];
  const lines = [
    adapter.product
      ? `Product under test: ${adapter.product}${adapter.version ? ` ${adapter.version}` : ''} (adapter: ${adapter.adapter})`
      : `Product under test: adapter ${adapter.adapter}; its product and version were not recorded${adapter.error ? ` (${adapter.error})` : ''}`,
  ];
  if (Array.isArray(adapter.capabilities)) {
    lines.push('', `Declared capabilities: ${adapter.capabilities.length > 0 ? adapter.capabilities.join(', ') : 'none'}`);
  }
  return lines;
}

/**
 * The markdown report. `results` is a parsed vitest JSON report
 * (`npx vitest run --reporter=json --outputFile=test-results.json`), or null
 * to report the mapping alone with every status N/A. `adapter` is the
 * adapter record of that report (readAdapterRecord), or null. `benchmark` is
 * the package that writes the report (readPackage), named on a Benchmark
 * line after the date; the line is left out when it is null.
 *
 * @param {{ scenarios: ReturnType<typeof readScenarios>, results?: any, adapter?: any, benchmark?: ReturnType<typeof readPackage> | null, date: string }} options
 */
export function generateReport({ scenarios, results = null, adapter = null, benchmark = null, date }) {
  const status = new Map();
  if (results !== null) {
    for (const file of reportFiles(results)) status.set(sourcePath(file.name), fileStatus(file));
    for (const field of ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests']) {
      if (typeof results[field] !== 'number') throw new Error(`it has no "${field}" count, so it is not a vitest JSON report`);
    }
  }

  const lines = ['# OASB Test Report', '', `Generated: ${date}`, ''];
  if (benchmark !== null) lines.push(`Benchmark: ${benchmark.name} ${benchmark.version}`, '');
  lines.push(...productLines(adapter, results), '');

  if (results !== null) lines.push(...summaryLines(results.testResults));

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
  lines.push(`**Unique ATLAS techniques mapped:** ${summary.length}`, '');
  if (results !== null) {
    const passing = new Set(scenarios.filter((s) => status.get(s.file) === 'PASS').map((s) => s.id));
    const covered = summary.filter((t) => t.tests.some((id) => passing.has(id)));
    lines.push(`**Unique ATLAS techniques covered by a passing scenario:** ${covered.length}`, '');
  }
  lines.push(
    '| ATLAS Technique | ID | Tests |',
    '|-----------------|----|-------|',
    ...summary.map((t) => `| ${t.name} | ${t.id} | ${t.tests.join(', ')} |`),
    '',
  );

  // Each Agentic ID with the scenarios whose header names it and their status;
  // the IDs no scenario names are listed after the table.
  lines.push('## OWASP Agentic Top 10 Coverage', '', '| OWASP ID | Category | Tests |', '|----------|----------|-------|');
  const uncovered = [];
  for (const [id, name] of Object.entries(AGENTIC)) {
    const named = scenarios.filter((s) => s.owasp.includes(id));
    if (named.length === 0) uncovered.push(`${id} (${name})`);
    else lines.push(`| ${id} | ${name} | ${named.map((s) => `${s.id} (${status.get(s.file) ?? 'N/A'})`).join(', ')} |`);
  }
  lines.push('');
  if (uncovered.length > 0) {
    lines.push(`No scenario covers ${uncovered.join(', ')}. See docs/owasp-agentic-mapping.md.`, '');
  }

  // The gaps of the Known Detection Gaps table in docs/known-gaps.md, worded as
  // it words them. They are ARP's, whichever adapter the results are from.
  lines.push(
    '## Known Gaps of the Reference Adapter (ARP)',
    '',
    'These are gaps of ARP, the reference adapter, as docs/known-gaps.md documents them. They are',
    'not read from the test results: in a report on another product they describe ARP, not that product.',
    '',
    '| # | Gap | Severity | Test Coverage |',
    '|---|-----|----------|--------------|',
    '| 6 | Anomaly baselines not reloaded when the runtime restarts | Medium | BL-003 |',
    '',
  );

  return lines.join('\n');
}

/**
 * The parsed vitest JSON report at `path`, the file named on the command line
 * or else the default test-results.json. One that does not exist, or cannot
 * be read or parsed, throws an error that names `path`. For one that does not
 * exist it also gives the command that writes it.
 */
export function readResults(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(
      err.code === 'ENOENT'
        ? `${path} does not exist; write it with npx vitest run --reporter=json --outputFile=${path}`
        : `${path} cannot be read: ${err.message}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${path} is not JSON: ${err.message}`);
  }
}

/**
 * The adapter record of the vitest JSON report at `resultsPath`: the file
 * beside it that scripts/record-adapter.mjs writes, test-results.adapter.json
 * for test-results.json.
 */
export function adapterRecordPath(resultsPath) {
  return `${resultsPath.replace(/\.json$/, '')}.adapter.json`;
}

/** The SHA-256 of the file at `path` in hex, or null when there is no file. */
export function fileDigest(path) {
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Write the adapter record of the report at `resultsPath`: `adapter` (the
 * OASB_ADAPTER value, or arp when it is unset) and either the product,
 * version and capabilities its getCapabilities() declares or the error that
 * kept them from being read. The record holds the SHA-256 of the report, so
 * a record is read only beside the report it was written for.
 */
export function writeAdapterRecord(resultsPath, { adapter, product, version, capabilities, error }) {
  const record = { adapter, product, version, capabilities, error, results: { sha256: fileDigest(resultsPath) } };
  writeFileSync(adapterRecordPath(resultsPath), `${JSON.stringify(record, null, 2)}\n`);
}

/**
 * The adapter record beside the report at `resultsPath`, or `{ unrecorded }`
 * with the reason the product under test is not known: there is no record,
 * it cannot be read, it names no adapter or it was written for another
 * report.
 */
export function readAdapterRecord(resultsPath) {
  const path = adapterRecordPath(resultsPath);
  const name = basename(path);
  const rerun = `npx vitest run --reporter=json --outputFile=${resultsPath} writes both`;
  if (!existsSync(path)) return { unrecorded: `there is no ${name} beside ${basename(resultsPath)}; ${rerun}` };
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    return { unrecorded: `${name} cannot be read: ${err.message}` };
  }
  let record;
  try {
    record = JSON.parse(text);
  } catch (err) {
    return { unrecorded: `${name} is not JSON: ${err.message}` };
  }
  if (typeof record?.adapter !== 'string' || record.adapter === '') return { unrecorded: `${name} names no adapter; ${rerun}` };
  if (record.results?.sha256 !== fileDigest(resultsPath)) {
    return { unrecorded: `${name} was written for another results file than ${basename(resultsPath)}; ${rerun}` };
  }
  const read = { adapter: record.adapter };
  for (const key of ['product', 'version', 'error']) {
    if (typeof record[key] === 'string' && record[key] !== '') read[key] = record[key];
  }
  if (Array.isArray(record.capabilities)) read.capabilities = record.capabilities.filter((c) => typeof c === 'string');
  read.results = record.results;
  return read;
}

// The tracked REPORT.md is a dated run kept as recorded, so a generated
// report takes another name, which .gitignore lists.
export const REPORT_FILE = 'REPORT.generated.md';

/** Write a report to REPORT_FILE in `dir` and return the path written. */
export function writeReport(report, dir = process.cwd()) {
  const path = join(dir, REPORT_FILE);
  writeFileSync(path, report);
  return path;
}
