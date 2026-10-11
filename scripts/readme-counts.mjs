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
// The rows of the "What Gets Tested" table that name a source directory are
// not listed here; each check counts them per directory.
export const STATEMENTS = [
  { where: 'tests badge', re: /tests-(\d+)%20passing/g, keys: ['passed'] },
  { where: 'introduction', re: /^(\d+) standardized attack scenarios/gm, keys: ['scenarios'] },
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
  { where: 'MITRE ATLAS Coverage line', re: /across (\d+) scenario files/g, keys: ['scenarioFiles'] },
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
