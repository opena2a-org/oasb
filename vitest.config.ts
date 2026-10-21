import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import type { VitestPluginContext } from 'vitest/node';

// E2E-001 waits for file events the host delivers to a live fs.watch. Its
// detection cases timed out in runs of the whole suite on a loaded host while
// the file run alone passed (CHANGELOG.md, 0.4.1), so a run starts it after
// every other test file has finished: see projects below.
const LIVE_FILESYSTEM_TESTS = ['src/e2e/E2E-001.live-filesystem-detection.test.ts'];

// The readiness wait of an E2E-001 case is cut to what is left of the 10 s
// hookTimeout (probeWaitMs in src/harness/filesystem-watch.ts).
const timeouts = { testTimeout: 10000, hookTimeout: 10000 };

// vitest adds the globs of a command-line --exclude to the exclude of the
// project of this file, and not to a project defined inline below. A project
// that lists this plugin adds them to its own exclude when vitest starts. A
// glob that matches a directory, such as src/e2e/ or src/e2e*, matches no
// file in it: the files of src/e2e/ stay out of the project of this file
// because the glob library does not walk into a directory an exclude glob
// matches, and its walk for E2E-001 starts inside src/e2e/. So the plugin
// adds each glob also with /** after it, a glob that ends in a wildcard
// too, and a run with --exclude src/e2e/ or --exclude 'src/e2e*' leaves out
// E2E-001 as well.
const cliExclude = {
  name: 'oasb:cli-exclude',
  configureVitest({ vitest, project }: VitestPluginContext) {
    const globs = (vitest.config.cliExclude ?? []).flatMap((glob) => [glob, `${glob.replace(/\/+$/, '')}/**`]);
    project.config.exclude = [...project.config.exclude, ...globs];
  },
};

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, ...LIVE_FILESYSTEM_TESTS],
    ...timeouts,
    // Records the adapter beside a JSON report for npm run report, then
    // prints how many attack scenarios the run evaluated, and exits 2 when it
    // evaluated none (scripts/scenario-floor.ts). Absolute paths resolved
    // from this file, not from --root, which a run can point at another
    // directory.
    globalSetup: [
      fileURLToPath(new URL('./scripts/record-adapter.mjs', import.meta.url)),
      fileURLToPath(new URL('./scripts/scenario-floor.ts', import.meta.url)),
    ],
    // One run and one report, in two projects. The first is this file, by
    // its absolute path, which holds also when --root names another
    // directory: every test file but E2E-001, printed without a project
    // label. The second holds E2E-001
    // alone, in sequence group 1: vitest starts the files of a group when
    // every file of the group before it has finished, so E2E-001 runs after
    // the other test files, and none of them runs beside it. The second
    // project takes no option from this file, so it states the timeouts
    // again, it lists the plugin that gives it the globs of --exclude, and
    // it has no global setup: vitest runs those of this file once in every
    // run, a run of E2E-001 alone included.
    // scripts/e2e-001-runs-alone.test.mjs checks the split.
    projects: [
      fileURLToPath(import.meta.url),
      {
        plugins: [cliExclude],
        test: {
          name: 'live-filesystem',
          include: LIVE_FILESYSTEM_TESTS,
          ...timeouts,
          sequence: { groupOrder: 1 },
        },
      },
    ],
    // Test groups via CLI: npm run test:atomic, test:integration, test:baseline
  },
});
