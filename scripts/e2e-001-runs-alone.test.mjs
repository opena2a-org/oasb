// Tests that a vitest run of the suite runs E2E-001, the live filesystem
// detection tests, after every other test file of the run has finished, with
// no other test file beside it. Its detection cases wait for file events the
// host delivers, and they timed out in runs of the whole suite on a loaded
// host while the file run alone passed (CHANGELOG.md, 0.4.1).
// vitest.config.ts gives the file a project of its own in a later
// sequence.groupOrder than every other test file, and vitest starts the files
// of a group only when every file of the group before it has finished. The
// tests read the suite as vitest resolves the config, without running a test.
// They also test, by the files `vitest list --filesOnly` lists, that the globs
// of a command-line --exclude leave files out of E2E-001's project as they do
// out of the root project, the only one vitest adds those globs to.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const vitestCli = join(repo, 'node_modules', 'vitest', 'vitest.mjs');
const vitestInstalled = existsSync(vitestCli);
const skip = !vitestInstalled && 'vitest is not installed; run npm ci';

const E2E_001 = 'src/e2e/E2E-001.live-filesystem-detection.test.ts';

const repoPath = (file) => relative(repo, file).split(sep).join('/');

/** The test files under `dir`, as paths from the repository root. */
function testFilesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return testFilesUnder(path);
    return entry.name.endsWith('.test.ts') ? [repoPath(path)] : [];
  });
}

/**
 * The test files of the suite as vitest resolves vitest.config.ts, one entry
 * per file and project: its path, the name of its project ('' for none),
 * whether that is the root project, the group it runs in, its timeouts and
 * its project's global setup files.
 */
async function resolveSuite() {
  const { createVitest } = await import('vitest/node');
  const vitest = await createVitest('test', { root: repo, watch: false, reporters: [] });
  try {
    const specs = await vitest.globTestSpecifications();
    return specs.map(({ moduleId, project }) => ({
      file: repoPath(moduleId),
      project: project.name,
      root: project.isRootProject(),
      group: project.config.sequence.groupOrder ?? 0,
      testTimeout: project.config.testTimeout,
      hookTimeout: project.config.hookTimeout,
      globalSetup: project.config.globalSetup.map(repoPath),
    }));
  } finally {
    await vitest.close();
  }
}

let resolved;
const suite = () => (resolved ??= resolveSuite());

/**
 * The test files `vitest list --filesOnly` lists for a run with the
 * command-line options `args`, as paths from the repository root, each with
 * the name of its project after it when it has one.
 */
function listedFiles(args) {
  const r = spawnSync(process.execPath, [vitestCli, 'list', '--filesOnly', '--json', ...args], {
    cwd: repo,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `vitest list ${args.join(' ')} exited ${r.status}:\n${r.stderr.slice(-2000)}`);
  return JSON.parse(r.stdout).map(({ file, projectName }) =>
    projectName ? `${repoPath(file)} [${projectName}]` : repoPath(file),
  );
}

test('the suite runs every test file under src/ once', { skip }, async () => {
  const files = (await suite()).map((s) => s.file).sort();
  assert.ok(files.includes(E2E_001), `vitest resolves no ${E2E_001}`);
  assert.deepEqual(files, testFilesUnder(join(repo, 'src')).sort());
});

test('E2E-001 runs after every other test file, in a group of its own', { skip }, async () => {
  const specs = await suite();
  const live = specs.filter((s) => s.file === E2E_001);
  assert.equal(live.length, 1, `vitest resolves ${E2E_001} ${live.length} times`);
  const others = specs.filter((s) => s.file !== E2E_001);
  assert.ok(others.length > 0, 'vitest resolves no other test file');
  const notBefore = others.filter((s) => s.group >= live[0].group).map((s) => `${s.file} (group ${s.group})`);
  assert.deepEqual(
    notBefore,
    [],
    `${E2E_001} runs in group ${live[0].group}, and these files do not run in an earlier group, so they can run beside it`,
  );
  // vitest prints the name of a test's project before its file; the root
  // project, unnamed, gets none, so the other files print as they did
  // before the split. scripts/check-readme.test.mjs reads `vitest list`
  // lines that start with the file, and check-readme reads the capture of
  // a `vitest run` from lines of a file and a test name.
  const labelled = others.filter((s) => !s.root || s.project !== '').map((s) => `${s.file} (project "${s.project}")`);
  assert.deepEqual(labelled, [], 'these files are not in the unnamed root project');
});

test("E2E-001 has the suite's timeouts, and each global setup is listed by one project", { skip }, async () => {
  const specs = await suite();
  const live = specs.find((s) => s.file === E2E_001);
  assert.ok(live, `vitest resolves no ${E2E_001}`);
  // The readiness wait of each E2E-001 case is cut to what is left of a
  // 10 s hookTimeout (probeWaitMs in src/harness/filesystem-watch.ts), and
  // each detection case waits 5 s for the product's event inside its test.
  assert.equal(live.hookTimeout, 10000, `${E2E_001} has a hookTimeout of ${live.hookTimeout} ms`);
  const others = new Set(specs.filter((s) => s !== live).map((s) => `${s.testTimeout}/${s.hookTimeout}`));
  assert.deepEqual([...others], [`${live.testTimeout}/${live.hookTimeout}`], 'E2E-001 and the other test files have different timeouts (test/hook, ms)');
  // vitest runs the global setup files of every project in the run, and of
  // the root project in every run: a file two projects list would run twice,
  // and print the attack-scenario line of scripts/scenario-floor.ts twice.
  const byProject = new Map(specs.map((s) => [s.project || '(root)', s.globalSetup]));
  const listed = [...byProject.values()].flat();
  assert.ok(listed.includes('scripts/scenario-floor.ts'), `no project lists scripts/scenario-floor.ts: ${JSON.stringify([...byProject])}`);
  assert.deepEqual(listed, [...new Set(listed)], `a global setup file is listed by more than one project: ${JSON.stringify([...byProject])}`);
});

// CI and the release workflow run the atomic, integration and baseline tests
// with `npm test -- --exclude src/e2e/`, and CI runs the E2E files in steps of
// their own. src/e2e* ends in a wildcard and matches the directory src/e2e,
// and no file in it. The last glob matches no E2E file, so E2E-001 stays in
// the run.
const EXCLUDES = [
  ['src/e2e/', 'leaves every file of src/e2e/ out of a run, E2E-001 included', (file) => file.startsWith('src/e2e/')],
  ['src/e2e*', 'leaves every file of src/e2e/ out of a run, E2E-001 included', (file) => file.startsWith('src/e2e')],
  ['**/E2E-001*', 'leaves E2E-001 out of a run', (file) => file === E2E_001],
  ['src/atomic/', 'leaves the files of src/atomic/ out of a run and E2E-001 in it', (file) => file.startsWith('src/atomic/')],
];

for (const [glob, does, matches] of EXCLUDES) {
  test(`--exclude ${glob} ${does}`, { skip }, () => {
    const expected = testFilesUnder(join(repo, 'src'))
      .filter((file) => !matches(file))
      .map((file) => (file === E2E_001 ? `${file} [live-filesystem]` : file));
    assert.deepEqual(listedFiles(['--exclude', glob]).sort(), expected.sort());
  });
}
