// Fixture for scripts/check-test-counts.test.mjs, run with
// inconclusive-skip.test.ts: a file in which no test passes, because
// beforeEach skips each one as inconclusive, as E2E-001 does with every case
// when the host delivers no file event. Not part of the suite:
// vitest.config.ts includes src/ only.

import { beforeEach, it } from 'vitest';
import { skipInconclusive } from '../../../../src/harness/filesystem-watch';

beforeEach((ctx) => {
  skipInconclusive(ctx, 'inconclusive: product reported no probe file');
});

it('is the first case skipped before it runs', () => {
  throw new Error('a case skipped in beforeEach does not run');
});

it('is the second case skipped before it runs', () => {
  throw new Error('a case skipped in beforeEach does not run');
});
