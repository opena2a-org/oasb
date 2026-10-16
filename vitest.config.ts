import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    // Records the adapter beside a JSON report for npm run report. An
    // absolute path, so that a run with another --root still finds it.
    globalSetup: [fileURLToPath(new URL('./scripts/record-adapter.mjs', import.meta.url))],
    // Test groups via CLI: npm run test:atomic, test:integration, test:baseline
  },
});
