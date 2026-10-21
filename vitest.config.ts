import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

// E2E-001 waits for file events the host delivers to a live fs.watch. Its
// detection cases timed out in runs of the whole suite on a loaded host while
// the file run alone passed (CHANGELOG.md, 0.4.1), so a run starts it after
// every other test file has finished: see projects below.
const LIVE_FILESYSTEM_TESTS = ['src/e2e/E2E-001.live-filesystem-detection.test.ts'];

// The readiness wait of an E2E-001 case is cut to what is left of the 10 s
// hookTimeout (probeWaitMs in src/harness/filesystem-watch.ts).
const timeouts = { testTimeout: 10000, hookTimeout: 10000 };

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
    // again, and it has no global setup: vitest runs those of this file once
    // in every run, a run of E2E-001 alone included.
    // scripts/e2e-001-runs-alone.test.mjs checks the split.
    projects: [
      fileURLToPath(import.meta.url),
      {
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
