#!/usr/bin/env node
// README test-count drift guard.
//
// Compares every test count the README states with a vitest JSON report of
// the full suite: the Quick Start comment, the Counts note, the per-group
// `npm run test:*` comments, the scenario counts in the prose,
// the MITRE ATLAS counts in the introduction and in MITRE ATLAS Coverage, and
// every row of the What Gets Tested table. The ATLAS counts are read from the
// scenario files under the README's directory: a file maps to ATLAS when it
// cites a technique ID. A table row that names a source directory is the
// number of tests in that directory, less the directories that have a row of
// their own (the `src/benchmark` row does not count `src/benchmark/pinned`);
// a `(live monitors)` or `(interceptors)` qualifier keeps the files whose
// name carries `live-` or `interceptor-`. The table rows must add up to the
// suite total, so a test in a directory the table does not name is drift. A
// statement the guard looks for and does not find is drift too: when the
// README wording changes, update STATEMENTS in scripts/readme-counts.mjs, the
// list npm run check:readme reads too, in the same change. An E2E-001 case
// skipped as inconclusive at run time, because the host delivered no file
// event, is counted with the passing tests, not the skipped ones, and listed.
// A file in which a test was skipped so and no test passed with the product's
// own event, which an E2E-001 detection case records as `detected` in its
// meta, fails the guard as not measured, whatever the counts say: the E2E-001
// case that expects no violation for a normal file passes without any event.
// The counts and the What Gets Tested table that moved out of the README
// into the pages of README_PAGES (scripts/readme-counts.mjs) are read on
// those pages, beside the README, and a drift there names the page.
//
// Usage: node scripts/check-test-counts.mjs <vitest-results.json> [path/to/README.md]
// Exit code 0 when every stated count matches and no file went unmeasured (and for --help), 1 otherwise. Run by npm run smoke.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUALIFIERS, README_PAGES, SCENARIO_DIRS, STATEMENTS, atlasCounts, isInconclusiveSkip, readFailure, reportFiles, sourcePath } from './readme-counts.mjs';

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
  mappedScenarios: 'scenario tests in files that cite a MITRE ATLAS technique',
  mappedScenarioFiles: 'scenario files that cite a MITRE ATLAS technique',
  unmappedScenarios: 'scenario tests in files that cite no MITRE ATLAS technique',
  unmappedScenarioFiles: 'scenario files that cite no MITRE ATLAS technique',
  techniques: 'MITRE ATLAS techniques cited by the scenario files',
};

// A What Gets Tested row that names its source: | Category | 19 | `src/atomic/process` | or with a qualifier.
const TABLE_ROW = /^\| ([^|*]+?) \| (\d+) \| `(src\/[^`]+)`(?: \(([^)]+)\))? \|/gm;

const inDir = (path, dir) => path.startsWith(dir.endsWith('/') ? dir : dir + '/');
const fileName = path => path.slice(path.lastIndexOf('/') + 1);

/**
 * True for a test that passed with the product's own event: an E2E-001
 * detection case records `detected` in the test's meta when the product
 * reported its write (markDetected in src/harness/filesystem-watch.ts). The
 * case that expects no violation for a normal file passes without one.
 */
function passedWithDetection(test) {
  return test.status === 'passed' && test.meta?.detected === true;
}

/**
 * The counts the README states, from a vitest JSON report and `source`, which
 * returns the text of a scenario file by its path from src/ on. A test
 * skipped as inconclusive is counted with the passing tests and not with the
 * skipped ones: the README's skipped count is of the tests skipped on every
 * run, and such a case is skipped only when the host delivered no file event,
 * so it is not a change to the suite. `inconclusive` lists those tests.
 * `unmeasured` lists the files in which a test was skipped so and no test
 * passed with the product's own event: the counts still match, but the run
 * says nothing about the file, whether or not a test that needs no event
 * from the product passed.
 */
export function liveCounts(results, source) {
  const reported = reportFiles(results);
  const files = reported.map(t => ({ path: sourcePath(t.name), tests: t.assertionResults.length }));
  for (const field of ['numTotalTests', 'numPassedTests', 'numPendingTests']) {
    if (typeof results[field] !== 'number') throw new Error(`it has no "${field}" count, so it is not a vitest JSON report`);
  }
  const inconclusive = reported.flatMap(t =>
    t.assertionResults.filter(isInconclusiveSkip).map(a => `${sourcePath(t.name)} > ${a.fullName ?? a.title ?? '(untitled)'}`),
  );
  const unmeasured = reported
    .filter(t => t.assertionResults.some(isInconclusiveSkip) && !t.assertionResults.some(passedWithDetection))
    .map(t => sourcePath(t.name));
  const tests = keep => files.filter(f => keep(f.path)).reduce((sum, f) => sum + f.tests, 0);
  const fileCount = keep => files.filter(f => keep(f.path)).length;
  const scenario = path => SCENARIO_DIRS.some(dir => inDir(path, dir));
  return {
    files,
    inconclusive,
    unmeasured,
    total: results.numTotalTests,
    passed: results.numPassedTests + inconclusive.length,
    skipped: results.numPendingTests - inconclusive.length,
    scenarios: tests(scenario),
    scenarioFiles: fileCount(scenario),
    scoringEngine: tests(p => inDir(p, 'src/benchmark') && !inDir(p, 'src/benchmark/pinned')),
    pinned: tests(p => inDir(p, 'src/benchmark/pinned')),
    atomic: tests(p => inDir(p, 'src/atomic')),
    integration: tests(p => inDir(p, 'src/integration')),
    integrationFiles: fileCount(p => inDir(p, 'src/integration')),
    baseline: tests(p => inDir(p, 'src/baseline')),
    e2e: tests(p => inDir(p, 'src/e2e')),
    ...atlasCounts(files.filter(f => scenario(f.path)), source),
  };
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/**
 * The documents the counts are read from: `readme` is the README's text, or
 * a list of { name, text } that holds the README (named "README") and the
 * pages that took its text (each named by its path).
 */
const documentsOf = readme => (typeof readme === 'string' ? [{ name: 'README', text: readme }] : readme);

/**
 * Every count the README and its pages state, with the document and the line
 * it is on; `missing` names statements not found in any of them.
 */
export function readmeStatements(readme) {
  const documents = documentsOf(readme);
  const statements = [];
  const missing = [];
  for (const { where, re, keys } of STATEMENTS) {
    let found = 0;
    for (const { name, text } of documents) {
      for (const m of text.matchAll(re)) {
        found++;
        keys.forEach((key, i) => statements.push({ doc: name, line: lineOf(text, m.index), where, key, stated: Number(m[i + 1]) }));
      }
    }
    if (found === 0) missing.push(`${where} (${re.source})`);
  }
  const rows = documents.flatMap(({ name, text }) =>
    [...text.matchAll(TABLE_ROW)].map(m => ({
      doc: name,
      line: lineOf(text, m.index),
      category: m[1].trim(),
      stated: Number(m[2]),
      dir: m[3].replace(/\/$/, ''),
      qualifier: m[4] ?? null,
    })),
  );
  if (rows.length === 0) missing.push('test table rows (| Category | N | `src/...` |)');
  return { statements, rows, missing };
}

/**
 * Every difference between the stated counts and the suite; `readme` as for
 * readmeStatements, `source` as for liveCounts. A drift names the document
 * that states the count: "README line N" or "<page> line N".
 */
export function compareCounts(results, readme, source) {
  const live = liveCounts(results, source);
  const { statements, rows, missing } = readmeStatements(readme);
  const drift = missing.map(m => `could not find the README's ${m}; update STATEMENTS in scripts/readme-counts.mjs if the wording changed`);

  for (const s of statements) {
    if (s.stated !== live[s.key]) {
      drift.push(`${s.doc} line ${s.line} (${s.where}) states ${s.stated} ${LABELS[s.key]}; the suite has ${live[s.key]}`);
    }
  }

  let tableTotal = 0;
  for (const row of rows) {
    if (row.qualifier !== null && !QUALIFIERS[row.qualifier]) {
      drift.push(`${row.doc} line ${row.line} (test table, ${row.category}): unknown qualifier "(${row.qualifier})"`);
      continue;
    }
    // Directories with a row of their own are counted there, not in their parent's row.
    const nested = rows.filter(r => r.dir !== row.dir && inDir(r.dir, row.dir)).map(r => r.dir);
    const counted = live.files.filter(
      f => inDir(f.path, row.dir) && !nested.some(d => inDir(f.path, d)) && (!row.qualifier || QUALIFIERS[row.qualifier].test(fileName(f.path))),
    );
    const actual = counted.reduce((sum, f) => sum + f.tests, 0);
    tableTotal += actual;
    if (row.stated !== actual) {
      drift.push(`${row.doc} line ${row.line} (test table, ${row.category}) states ${row.stated} tests in ${row.dir}${row.qualifier ? ` (${row.qualifier})` : ''}; the suite has ${actual}`);
    }
  }
  if (rows.length > 0 && tableTotal !== live.total) {
    drift.push(`the test table's source rows cover ${tableTotal} of the suite's ${live.total} tests; add a row for the directory they are in`);
  }

  return { live, compared: statements.length + rows.length, drift };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const usage = 'usage: node scripts/check-test-counts.mjs <vitest-results.json> [path/to/README.md]';
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    process.exit(0);
  }
  const [resultsPath, readmeArg] = args;
  if (!resultsPath || args.length > 2 || args.some(a => a.startsWith('-'))) {
    console.error(usage);
    process.exit(1);
  }
  const readmePath = resolve(readmeArg || join(root, 'README.md'));
  let readme;
  try {
    readme = readFileSync(readmePath, 'utf8');
  } catch (err) {
    console.error(`cannot read the README ${readmePath}: ${readFailure(err)}`);
    process.exit(1);
  }
  // The README and the pages beside it that took its text. A page that does
  // not exist is not read: a count it held is then reported as not found.
  const documents = [{ name: 'README', text: readme }];
  for (const page of README_PAGES) {
    const file = join(dirname(readmePath), page);
    if (!existsSync(file)) continue;
    try {
      documents.push({ name: page, text: readFileSync(file, 'utf8') });
    } catch (err) {
      console.error(`cannot read ${file}, a page that took text from the README: ${readFailure(err)}`);
      process.exit(1);
    }
  }
  // The scenario files the report names, read under the README's directory.
  class SourceError extends Error {}
  const source = path => {
    const file = join(dirname(readmePath), path);
    try {
      return readFileSync(file, 'utf8');
    } catch (err) {
      throw new SourceError(`cannot read ${file}, a scenario file the test report names: ${readFailure(err)}`);
    }
  };
  let counted;
  try {
    counted = compareCounts(JSON.parse(readFileSync(resultsPath, 'utf8')), documents, source);
  } catch (err) {
    console.error(err instanceof SourceError ? err.message : `cannot read the test report ${resultsPath}: ${readFailure(err)}`);
    process.exit(1);
  }
  const { live, compared, drift } = counted;
  console.log(`   total=${live.total} passed=${live.passed} skipped=${live.skipped} scenarios=${live.scenarios}` +
    ` scoring-engine=${live.scoringEngine} pinned=${live.pinned}`);
  if (live.inconclusive.length > 0) {
    console.log(`   ${live.inconclusive.length} skipped as inconclusive, counted with the passing tests:`);
    for (const name of live.inconclusive) console.log(`     ${name}`);
  }
  for (const d of drift) console.error('DRIFT: ' + d);
  for (const file of live.unmeasured) {
    console.error(`NOT MEASURED: ${file}: none of its tests passed with the product's own event and at least one was skipped as inconclusive, so the run says nothing about the file; run the suite again`);
  }
  if (drift.length > 0 || live.unmeasured.length > 0) process.exit(1);
  console.log(`   ${compared} README counts match the live suite.`);
}
