// Fixture for scripts/check-test-counts.test.mjs, which runs it with vitest
// and reads the JSON report: one test passes, one is declared skipped, one is
// skipped at run time without the inconclusive marker, and two are skipped as
// inconclusive by the harness's skipInconclusive, from the test and from
// beforeEach as E2E-001 does. Not part of the suite: vitest.config.ts
// includes src/ only.

import { beforeEach, describe, it } from 'vitest';
import { skipInconclusive } from '../../../../src/harness/filesystem-watch';

describe('skips in a test', () => {
  it('passes', () => {});

  it.skip('is skipped on every run', () => {});

  it('is skipped at run time without the marker', (ctx) => {
    ctx.skip('not measured');
  });

  it('is skipped as inconclusive from the test', (ctx) => {
    skipInconclusive(ctx, 'inconclusive: host delivered no file event');
  });
});

describe('skips in beforeEach', () => {
  beforeEach((ctx) => {
    skipInconclusive(ctx, 'inconclusive: product reported no probe file');
  });

  it('is skipped as inconclusive before it runs', () => {
    throw new Error('a case skipped in beforeEach does not run');
  });
});
