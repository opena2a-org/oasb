// The test counts the README states, in one list that both README checks
// read: scripts/check-readme.mjs (npm run check:readme) and
// scripts/check-test-counts.mjs (the release smoke's drift guard). When the
// README wording of a count changes, update STATEMENTS here.

// Each statement must appear at least once, and every match is compared.
// Each capture group is a count; its key names the measure it must equal:
//   total, passed, skipped  the whole suite (passed: the tests that passed)
//   scenarios               tests under src/atomic, src/integration,
//                           src/baseline and src/e2e
//   scenarioFiles           test files under those four directories
//   scoringEngine           tests in src/benchmark outside src/benchmark/pinned
//   pinned                  tests in src/benchmark/pinned
//   atomic, integration, baseline, e2e   tests under src/<name>
//   integrationFiles        test files under src/integration
//   mappedScenarios         scenario tests in files that cite a MITRE ATLAS
//                           technique ID (see atlasCounts)
//   mappedScenarioFiles     scenario files that cite one
//   unmappedScenarios       scenario tests in files that cite none
//   unmappedScenarioFiles   scenario files that cite none
//   techniques              distinct technique IDs the scenario files cite
// The rows of the "What Gets Tested" table that name a source directory are
// not listed here; each check counts them per directory.
export const STATEMENTS = [
  { where: 'tests badge', re: /tests-(\d+)%20passing/g, keys: ['passed'] },
  { where: 'introduction', re: /^(\d+) standardized attack scenarios/gm, keys: ['scenarios'] },
  {
    where: 'introduction',
    re: /(\d+) of them, in (\d+) files, map to MITRE ATLAS \((\d+) techniques/g,
    keys: ['mappedScenarios', 'mappedScenarioFiles', 'techniques'],
  },
  { where: 'introduction', re: /the other (\d+) test the product's defensive response/g, keys: ['unmappedScenarios'] },
  {
    where: 'Quick Start comment',
    re: /Full suite: (\d+) tests \((\d+) pass, (\d+) skip\)/g,
    keys: ['total', 'passed', 'skipped'],
  },
  { where: 'adapter sentence', re: /run the same (\d+) attack scenarios/g, keys: ['scenarios'] },
  {
    where: 'Counts note',
    re: /runs \*\*(\d+) tests\*\* \((\d+) passing, (\d+) skipped/g,
    keys: ['total', 'passed', 'skipped'],
  },
  { where: 'Counts note', re: /\*\*(\d+) attack scenarios\*\*/g, keys: ['scenarios'] },
  { where: 'Counts note', re: /\*\*(\d+) scoring-engine unit tests\*\*/g, keys: ['scoringEngine'] },
  { where: 'Counts note', re: /\*\*(\d+) pinned benchmark harness tests\*\*/g, keys: ['pinned'] },
  { where: 'Counts note', re: /"(\d+)" is the scenario count/g, keys: ['scenarios'] },
  { where: 'Counts note', re: /"(\d+) passing" is the full `npm test` total/g, keys: ['passed'] },
  { where: 'test:atomic comment', re: /test:atomic +# (\d+) atomic detection tests/g, keys: ['atomic'] },
  {
    where: 'test:integration comment',
    re: /test:integration +# (\d+) tests across (\d+) integration scenarios/g,
    keys: ['integration', 'integrationFiles'],
  },
  { where: 'test:baseline comment', re: /test:baseline +# (\d+) false-positive \/ baseline tests/g, keys: ['baseline'] },
  { where: 'test:e2e comment', re: /test:e2e +# (\d+) E2E tests/g, keys: ['e2e'] },
  { where: 'benchmark run comment', re: /# all (\d+) scenarios/g, keys: ['scenarios'] },
  {
    where: 'MITRE ATLAS Coverage line',
    re: /Of the (\d+) tests across (\d+) scenario files, (\d+) tests in (\d+) files map to (\d+) unique techniques/g,
    keys: ['scenarios', 'scenarioFiles', 'mappedScenarios', 'mappedScenarioFiles', 'techniques'],
  },
  {
    where: 'MITRE ATLAS Coverage line',
    re: /The other (\d+) tests, in (\d+) files, are defensive and capability tests/g,
    keys: ['unmappedScenarios', 'unmappedScenarioFiles'],
  },
  {
    where: '"Attack scenarios" row',
    re: /^\| \*\*Attack scenarios\*\* \| \*\*(\d+)\*\* \|/gm,
    keys: ['scenarios'],
  },
  {
    where: '"npm test total" row',
    re: /^\| \*\*`npm test` total\*\* \| \*\*(\d+)\*\* \| \((\d+) pass, (\d+) skipped on every platform\)/gm,
    keys: ['total', 'passed', 'skipped'],
  },
];

// The test directories whose tests are attack scenarios.
export const SCENARIO_DIRS = ['src/atomic', 'src/integration', 'src/baseline', 'src/e2e'];

// A MITRE ATLAS technique ID as a scenario file cites it in its header, such
// as AML.T0050 or AML.T0034.002. A tactic ID such as AML.TA0011 is not one.
const TECHNIQUE_ID = /\bAML\.T\d{4}(?:\.\d{3})?\b/g;

/**
 * The MITRE ATLAS counts of the scenario files: `files` lists each scenario
 * file as { path, tests } and `source(path)` returns its text. A file maps to
 * ATLAS when its text cites a technique ID; the defensive and capability tests
 * cite none, so they are counted apart.
 */
export function atlasCounts(files, source) {
  const techniques = new Set();
  let mappedScenarios = 0;
  let mappedScenarioFiles = 0;
  let unmappedScenarios = 0;
  for (const { path, tests } of files) {
    const cited = source(path).match(TECHNIQUE_ID) ?? [];
    for (const id of cited) techniques.add(id);
    if (cited.length > 0) {
      mappedScenarios += tests;
      mappedScenarioFiles++;
    } else {
      unmappedScenarios += tests;
    }
  }
  return {
    mappedScenarios,
    mappedScenarioFiles,
    unmappedScenarios,
    unmappedScenarioFiles: files.length - mappedScenarioFiles,
    techniques: techniques.size,
  };
}

// A "What Gets Tested" row whose Source is `src/e2e` (qualifier) counts the
// files of that directory whose name matches the qualifier's pattern.
export const QUALIFIERS = {
  'live monitors': /^E2E-\d+\.live-/,
  interceptors: /^E2E-\d+\.interceptor-/,
};

/** A test file's path from its src/ directory on, e.g. src/atomic/process/AT-PROC-001.test.ts. */
export function sourcePath(name) {
  const path = name.replace(/\\/g, '/');
  const i = path.lastIndexOf('/src/');
  return i >= 0 ? path.slice(i + 1) : path;
}

/**
 * The per-file results of a vitest JSON report (`vitest run --reporter=json`),
 * or an error that names the field or the entry the report lacks.
 */
export function reportFiles(report) {
  const write = 'write the report with: npx vitest run --reporter=json --outputFile=<report.json>';
  if (!Array.isArray(report?.testResults)) {
    throw new Error(`it has no "testResults" list, so it is not a vitest JSON report; ${write}`);
  }
  report.testResults.forEach((file, i) => {
    if (typeof file?.name !== 'string' || !Array.isArray(file.assertionResults)) {
      throw new Error(`testResults[${i}] has no "name" or no "assertionResults" list; ${write}`);
    }
    file.assertionResults.forEach((test, j) => {
      if (typeof test?.status !== 'string') {
        throw new Error(`testResults[${i}].assertionResults[${j}] is not a test result with a string "status"; ${write}`);
      }
    });
  });
  return report.testResults;
}

/**
 * Why a file could not be read, without the path the caller already names:
 * Node's "ENOENT: no such file or directory, open '<path>'" becomes
 * "ENOENT: no such file or directory". Any other error keeps its message.
 */
export function readFailure(err) {
  if (typeof err?.code !== 'string' || typeof err.path !== 'string') return String(err?.message ?? err);
  const suffix = `, ${err.syscall} '${err.path}'`;
  return err.message.endsWith(suffix) ? err.message.slice(0, -suffix.length) : err.message;
}
