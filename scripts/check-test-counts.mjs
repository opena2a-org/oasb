#!/usr/bin/env node
// README test-count drift guard.
//
// Compares every test count the README states with a vitest JSON report of
// the full suite: the tests badge, the Quick Start comment, the Counts note,
// the per-group `npm run test:*` comments, the scenario counts in the prose,
// the scenario-file count in MITRE ATLAS Coverage, and every row of the
// What Gets Tested table. A table row that names a source directory is the
// number of tests in that directory, less the directories that have a row of
// their own (the `src/benchmark` row does not count `src/benchmark/pinned`);
// a `(live monitors)` or `(interceptors)` qualifier keeps the files whose
// name carries `live-` or `interceptor-`. The table rows must add up to the
// suite total, so a test in a directory the table does not name is drift. A
// statement the guard looks for and does not find is drift too: when the
// README wording changes, update STATEMENTS in the same change.
//
// Usage: node scripts/check-test-counts.mjs <vitest-results.json> [path/to/README.md]
// Exit code 0 when every stated count matches, 1 otherwise. Run by npm run smoke.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCENARIO_DIRS = ['src/atomic/', 'src/integration/', 'src/baseline/', 'src/e2e/'];

const LABELS = {
  total: 'tests in total',
  passed: 'passing tests',
  skipped: 'skipped tests',
  scenarios: 'attack scenarios (tests under src/atomic, src/integration, src/baseline and src/e2e)',
  scenarioFiles: 'scenario files',
  scoringEngine: 'scoring-engine tests (src/benchmark without src/benchmark/pinned)',
  pinned: 'pinned benchmark harness tests (src/benchmark/pinned)',
  atomic: 'tests under src/atomic',
  integration: 'tests under src/integration',
  integrationFiles: 'integration scenario files',
  baseline: 'tests under src/baseline',
  e2e: 'tests under src/e2e',
};

// Each statement must appear at least once; every capture group is a count.
export const STATEMENTS = [
  { where: 'tests badge', re: /tests-(\d+)%20passing/g, keys: ['passed'] },
  { where: 'introduction', re: /^(\d+) standardized attack scenarios/gm, keys: ['scenarios'] },
  { where: 'Quick Start comment', re: /Full suite: (\d+) tests \((\d+) pass, (\d+) skip\)/g, keys: ['total', 'passed', 'skipped'] },
  { where: 'Quick Start', re: /run the same (\d+) attack scenarios/g, keys: ['scenarios'] },
  { where: 'Counts note', re: /runs \*\*(\d+) tests\*\* \((\d+) passing, (\d+) skipped/g, keys: ['total', 'passed', 'skipped'] },
  { where: 'Counts note', re: /\*\*(\d+) attack scenarios\*\*/g, keys: ['scenarios'] },
  { where: 'Counts note', re: /\*\*(\d+) scoring-engine unit tests\*\*/g, keys: ['scoringEngine'] },
  { where: 'Counts note', re: /\*\*(\d+) pinned benchmark harness tests\*\*/g, keys: ['pinned'] },
  { where: 'Counts note', re: /"(\d+)" is the scenario count; "(\d+) passing" is the full/g, keys: ['scenarios', 'passed'] },
  { where: 'test:atomic comment', re: /# (\d+) atomic detection tests/g, keys: ['atomic'] },
  { where: 'test:integration comment', re: /# (\d+) tests across (\d+) integration scenarios/g, keys: ['integration', 'integrationFiles'] },
  { where: 'test:baseline comment', re: /# (\d+) false-positive \/ baseline tests/g, keys: ['baseline'] },
  { where: 'test:e2e comment', re: /# (\d+) E2E tests/g, keys: ['e2e'] },
  { where: 'benchmark run comment', re: /# all (\d+) scenarios/g, keys: ['scenarios'] },
  { where: 'test table', re: /^\| \*\*Attack scenarios\*\* \| \*\*(\d+)\*\* \|/gm, keys: ['scenarios'] },
  { where: 'test table', re: /^\| \*\*`npm test` total\*\* \| \*\*(\d+)\*\* \| \((\d+) pass, (\d+) environment-skipped\)/gm, keys: ['total', 'passed', 'skipped'] },
  { where: 'MITRE ATLAS Coverage', re: /across (\d+) scenario files/g, keys: ['scenarioFiles'] },
];

// A What Gets Tested row that names its source: | Category | 19 | `src/atomic/process` | or with a qualifier.
const TABLE_ROW = /^\| ([^|*]+?) \| (\d+) \| `(src\/[^`]+)`(?: \(([^)]+)\))? \|/gm;
const QUALIFIERS = { 'live monitors': /\/[^/]*\.live-[^/]*$/, interceptors: /\/[^/]*\.interceptor-[^/]*$/ };

/** A test file's path from its src/ directory on, e.g. src/atomic/process/AT-PROC-001.test.ts. */
function sourcePath(name) {
  const path = name.replace(/\\/g, '/');
  const i = path.lastIndexOf('/src/');
  return i >= 0 ? path.slice(i + 1) : path;
}

const inDir = (path, dir) => path.startsWith(dir.endsWith('/') ? dir : dir + '/');

/** The counts the README states, from a vitest JSON report. */
export function liveCounts(results) {
  const files = results.testResults.map(t => ({ path: sourcePath(t.name), tests: t.assertionResults.length }));
  const tests = keep => files.filter(f => keep(f.path)).reduce((sum, f) => sum + f.tests, 0);
  const fileCount = keep => files.filter(f => keep(f.path)).length;
  const scenario = path => SCENARIO_DIRS.some(dir => inDir(path, dir));
  return {
    files,
    total: results.numTotalTests,
    passed: results.numPassedTests,
    skipped: results.numPendingTests,
    scenarios: tests(scenario),
    scenarioFiles: fileCount(scenario),
    scoringEngine: tests(p => inDir(p, 'src/benchmark') && !inDir(p, 'src/benchmark/pinned')),
    pinned: tests(p => inDir(p, 'src/benchmark/pinned')),
    atomic: tests(p => inDir(p, 'src/atomic')),
    integration: tests(p => inDir(p, 'src/integration')),
    integrationFiles: fileCount(p => inDir(p, 'src/integration')),
    baseline: tests(p => inDir(p, 'src/baseline')),
    e2e: tests(p => inDir(p, 'src/e2e')),
  };
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** Every count the README states, with the line it is on; `missing` names statements not found. */
export function readmeStatements(readme) {
  const statements = [];
  const missing = [];
  for (const { where, re, keys } of STATEMENTS) {
    const matches = [...readme.matchAll(re)];
    if (matches.length === 0) missing.push(`${where} (${re.source})`);
    for (const m of matches) {
      keys.forEach((key, i) => statements.push({ line: lineOf(readme, m.index), where, key, stated: Number(m[i + 1]) }));
    }
  }
  const rows = [...readme.matchAll(TABLE_ROW)].map(m => ({
    line: lineOf(readme, m.index),
    category: m[1].trim(),
    stated: Number(m[2]),
    dir: m[3].replace(/\/$/, ''),
    qualifier: m[4] ?? null,
  }));
  if (rows.length === 0) missing.push('test table rows (| Category | N | `src/...` |)');
  return { statements, rows, missing };
}

/** Every difference between the README's stated counts and the suite. */
export function compareCounts(results, readme) {
  const live = liveCounts(results);
  const { statements, rows, missing } = readmeStatements(readme);
  const drift = missing.map(m => `could not find the README's ${m}; update STATEMENTS in scripts/check-test-counts.mjs if the wording changed`);

  for (const s of statements) {
    if (s.stated !== live[s.key]) {
      drift.push(`README line ${s.line} (${s.where}) states ${s.stated} ${LABELS[s.key]}; the suite has ${live[s.key]}`);
    }
  }

  let tableTotal = 0;
  for (const row of rows) {
    if (row.qualifier !== null && !QUALIFIERS[row.qualifier]) {
      drift.push(`README line ${row.line} (test table, ${row.category}): unknown qualifier "(${row.qualifier})"`);
      continue;
    }
    // Directories with a row of their own are counted there, not in their parent's row.
    const nested = rows.filter(r => r.dir !== row.dir && inDir(r.dir, row.dir)).map(r => r.dir);
    const counted = live.files.filter(
      f => inDir(f.path, row.dir) && !nested.some(d => inDir(f.path, d)) && (!row.qualifier || QUALIFIERS[row.qualifier].test(f.path)),
    );
    const actual = counted.reduce((sum, f) => sum + f.tests, 0);
    tableTotal += actual;
    if (row.stated !== actual) {
      drift.push(`README line ${row.line} (test table, ${row.category}) states ${row.stated} tests in ${row.dir}${row.qualifier ? ` (${row.qualifier})` : ''}; the suite has ${actual}`);
    }
  }
  if (rows.length > 0 && tableTotal !== live.total) {
    drift.push(`the test table's source rows cover ${tableTotal} of the suite's ${live.total} tests; add a row for the directory they are in`);
  }

  return { live, compared: statements.length + rows.length, drift };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const [resultsPath, readmeArg] = process.argv.slice(2);
  if (!resultsPath) {
    console.error('usage: node scripts/check-test-counts.mjs <vitest-results.json> [path/to/README.md]');
    process.exit(1);
  }
  const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
  const readme = readFileSync(resolve(readmeArg || join(root, 'README.md')), 'utf8');
  const { live, compared, drift } = compareCounts(results, readme);
  console.log(`   total=${live.total} passed=${live.passed} skipped=${live.skipped} scenarios=${live.scenarios}` +
    ` scoring-engine=${live.scoringEngine} pinned=${live.pinned}`);
  for (const d of drift) console.error('DRIFT: ' + d);
  if (drift.length > 0) process.exit(1);
  console.log(`   ${compared} README counts match the live suite.`);
}
