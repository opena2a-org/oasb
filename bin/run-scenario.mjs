// The oasb command (bin/oasb.mjs): runs one scenario file of the suite, such
// as AT-AI-001, against the adapter OASB_ADAPTER selects, and prints its
// verdict. Given `checklist` in place of an ID, bin/oasb.mjs runs
// bin/checklist.mjs instead.
//
//   npx @opena2a/oasb AT-AI-001
//
// A scenario file is a test file under one of SCENARIO_DIRS, named
// <ID>.<name>.test.ts; the command takes its ID, in any case. It runs that
// file of this package with vitest and its verbose reporter, as a checkout
// runs it with `npx vitest run <ID> --reporter=verbose`, then prints a line
// that names the product the adapter declares and the file's verdict:
//
//   OASB AT-AI-001 against arp-guard 0.3.0: PASS (11 of 11 tests passed)
//
//   PASS          a test passed, and nothing failed                  exit 0
//   FAIL          a test failed, or the run failed outside a test    exit 1
//   NOT MEASURED  no test passed or failed: each was skipped, as     exit 2
//                 the tests of a surface the adapter does not
//                 declare are
//
// A missing or unknown ID, a missing vitest and an adapter that cannot be
// loaded exit 1 before any test runs, with a line that says why.
//
// The package ships no vitest.config.ts, so the run reads none, not even in a
// checkout, and sets the test and hook timeouts that file sets. Its global
// setup modules are not shipped either: the verdict line takes the place of
// the line the scenario floor (scripts/scenario-floor.ts) prints, and a run
// that evaluated no test exits 2, as it does there.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The directory of this package: the one above bin/. */
export const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));

// The test directories whose tests are attack scenarios, as
// scripts/readme-counts.mjs lists them. scripts/ is not shipped, so the list
// is kept here too, and scripts/oasb-bin.test.mjs holds the two lists equal.
export const SCENARIO_DIRS = ['src/atomic', 'src/integration', 'src/baseline', 'src/e2e'];

// The test and hook timeouts vitest.config.ts sets for a checkout's runs.
const TIMEOUT_MS = 10_000;

export const USAGE = 'Usage: npx @opena2a/oasb <scenario ID>   (for example: npx @opena2a/oasb AT-AI-001)';

// vitest and arp-guard are optional dependencies: npm installs them unless
// told to omit optional dependencies, and the package entry point loads
// without either. The arp-guard wrapper names its own package when it is
// missing.
export const VITEST_MISSING =
  'The scenario files run with vitest, which is not installed; npm leaves it out of an install with ' +
  '--omit=optional. Install @opena2a/oasb without that flag, or run "npm install vitest@3".';

/**
 * The scenario files under `root`, each as { id, file }: `file` is its path
 * from `root` with "/" separators, `id` its name up to the first ".". Ordered
 * by ID.
 */
export function scenarioFiles(root = PACKAGE_ROOT) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
        found.push({ id: entry.name.slice(0, entry.name.indexOf('.')), file: path });
      }
    }
  };
  for (const dir of SCENARIO_DIRS) walk(dir);
  return found.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

/** The scenario file of `scenarios` whose ID is `id`, ignoring case, or undefined. */
export function findScenario(scenarios, id) {
  const wanted = id.toUpperCase();
  return scenarios.find((s) => s.id.toUpperCase() === wanted);
}

/** `ids` as lines indented by two spaces and at most `width` characters wide. */
function wrapIds(ids, width = 78) {
  const lines = [];
  let line = ' ';
  for (const id of ids) {
    if (line.length > 1 && line.length + 1 + id.length > width) {
      lines.push(line);
      line = ' ';
    }
    line += ` ${id}`;
  }
  if (line.length > 1) lines.push(line);
  return lines.join('\n');
}

/** The text --help prints, which lists the IDs of `scenarios`. */
export function helpText(scenarios) {
  return [
    USAGE,
    '',
    'Runs one scenario file of the Open Agent Security Benchmark with vitest, against',
    'the adapter OASB_ADAPTER selects: the reference adapter, ARP (arp-guard), when',
    'it is unset, or your own adapter module (OASB_ADAPTER=./my-adapter.js). Then it',
    "prints the file's verdict:",
    '',
    '  PASS          a test passed, and nothing failed                  exit 0',
    '  FAIL          a test failed, or the run failed outside a test    exit 1',
    '  NOT MEASURED  no test passed or failed: each was skipped, as     exit 2',
    '                the tests of a surface the adapter does not',
    '                declare are',
    '',
    'npx @opena2a/oasb checklist prints the OASB-1 checklist instead: the controls',
    'by level, each with a question to ask a vendor, the steps that verify it and,',
    'where HackMyAgent maps a check to it, the command that checks it.',
    'npx @opena2a/oasb checklist --help lists its options.',
    '',
    'Scenario IDs:',
    wrapIds(scenarios.map((s) => s.id)),
    '',
  ].join('\n');
}

/** The version in the package.json of the package at `root`. */
export function packageVersion(root = PACKAGE_ROOT) {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
}

/**
 * The product and version the adapter OASB_ADAPTER selects declares, as
 * "arp-guard 0.3.0", read through the package's built harness. Throws the
 * error the adapter gives when it cannot be loaded, such as the one that
 * names the package to install, or one that says to build a checkout whose
 * dist/ does not hold the harness.
 */
export function describeAdapter(root = PACKAGE_ROOT) {
  const built = join(root, 'dist', 'harness', 'create-adapter.js');
  if (!existsSync(built)) {
    throw new Error(`${built} is missing; build the package with "npm run build" first.`);
  }
  const { createAdapter } = createRequire(built)(built);
  const { product, version } = createAdapter().getCapabilities();
  return `${product} ${version}`;
}

/** Adds the tests under the vitest task `task` to `counts`, by their result. */
function countTests(task, counts) {
  for (const child of task.tasks ?? []) {
    if (child.type !== 'test') {
      countTests(child, counts);
      continue;
    }
    counts.total++;
    const state = child.result?.state;
    if (state === 'pass') counts.passed++;
    else if (state === 'fail') counts.failed++;
    else counts.skipped++;
  }
}

/**
 * The verdict of a run of one scenario file: `file` is the vitest file task
 * of the run (undefined when the run has none), and `unhandledErrors` the
 * number of errors vitest caught outside a test. `outside` is true for a FAIL
 * in which no test failed.
 */
export function verdict(file, unhandledErrors = 0) {
  const counts = { total: 0, passed: 0, failed: 0, skipped: 0 };
  if (file) countTests(file, counts);
  const failed = counts.failed > 0 || !file || file.result?.state === 'fail' || unhandledErrors > 0;
  if (failed) return { result: 'FAIL', exitCode: 1, outside: counts.failed === 0, ...counts };
  if (counts.passed > 0) return { result: 'PASS', exitCode: 0, outside: false, ...counts };
  return { result: 'NOT MEASURED', exitCode: 2, outside: false, ...counts };
}

/** The line that states verdict `v` of the scenario file `id`, run against `product`. */
export function verdictLine(id, product, v) {
  const tests = `${v.total} test${v.total === 1 ? '' : 's'}`;
  const skipped = v.skipped > 0 ? `, ${v.skipped} skipped` : '';
  let detail;
  if (v.result === 'PASS') detail = `${v.passed} of ${tests} passed${skipped}`;
  else if (v.result === 'NOT MEASURED') detail = `0 of ${tests} evaluated`;
  else if (v.outside) detail = 'the run failed outside a test; its error is printed above';
  else detail = `${v.failed} of ${tests} failed${v.passed > 0 ? `, ${v.passed} passed` : ''}${skipped}`;
  return `OASB ${id} against ${product}: ${v.result} (${detail})`;
}

/**
 * Runs the command with the arguments `args` on the package at `root` and
 * returns its exit code. The vitest run and this command's own lines go to
 * the process's stdout and stderr.
 */
export async function main(args, root = PACKAGE_ROOT) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(helpText(scenarioFiles(root)));
    return 0;
  }
  if (args.includes('--version')) {
    process.stdout.write(`${packageVersion(root)}\n`);
    return 0;
  }
  if (args.length !== 1 || args[0].startsWith('-')) {
    process.stderr.write(`${USAGE}\nnpx @opena2a/oasb --help lists the scenario IDs.\n`);
    return 1;
  }
  const scenarios = scenarioFiles(root);
  const scenario = findScenario(scenarios, args[0]);
  if (!scenario) {
    process.stderr.write(`oasb: no scenario file has the ID "${args[0]}". The scenario IDs are:\n${wrapIds(scenarios.map((s) => s.id))}\n`);
    return 1;
  }
  let startVitest;
  try {
    ({ startVitest } = await import('vitest/node'));
  } catch (err) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND' || !String(err.message).includes("Cannot find package 'vitest'")) throw err;
    process.stderr.write(`oasb: ${VITEST_MISSING}\n`);
    return 1;
  }
  let product;
  try {
    product = describeAdapter(root);
  } catch (err) {
    process.stderr.write(`oasb: ${err?.message ?? err}\n`);
    return 1;
  }

  const vitest = await startVitest('test', [], {
    root,
    config: false,
    include: [scenario.file],
    watch: false,
    reporters: ['verbose'],
    testTimeout: TIMEOUT_MS,
    hookTimeout: TIMEOUT_MS,
    cache: false,
  });
  const file = vitest.state.getFiles().find((f) => f.filepath.replace(/\\/g, '/').endsWith(`/${scenario.file}`));
  const v = verdict(file, vitest.state.getUnhandledErrors().length);
  process.stdout.write(`${verdictLine(scenario.id, product, v)}\n`);
  return v.exitCode;
}
