import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    // Records the adapter beside a JSON report for npm run report, then
    // prints how many attack scenarios the run evaluated, and exits 2 when it
    // evaluated none (scripts/scenario-floor.ts). Absolute paths resolved
    // from this file, not from --root, which a run can point at another
    // directory.
    globalSetup: [
      fileURLToPath(new URL('./scripts/record-adapter.mjs', import.meta.url)),
      fileURLToPath(new URL('./scripts/scenario-floor.ts', import.meta.url)),
    ],
    // Test groups via CLI: npm run test:atomic, test:integration, test:baseline
  },
});
