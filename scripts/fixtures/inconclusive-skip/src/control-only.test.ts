// Fixture for scripts/check-test-counts.test.mjs, run with
// inconclusive-skip.test.ts: a file in which the test that passes got no
// event from the product, so it carries no markDetected, and the other test
// is skipped as inconclusive. E2E-001 ends so when the host delivers no file
// event for its detection cases: its case for a normal file expects no
// violation and still passes. Not part of the suite: vitest.config.ts
// includes src/ only.

import { it } from 'vitest';
import { skipInconclusive } from '../../../../src/harness/filesystem-watch';

it('passes without an event from the product', () => {});

it('is the detection case skipped as inconclusive', (ctx) => {
  skipInconclusive(ctx, 'inconclusive: host delivered no file event');
});
