/**
 * Adapter names on the development runner's path: no verified model directory
 * is configured, so the classifier is named from ~/.nanomind/models. A change
 * to these names changes what scripts/run-benchmark-v2.ts prints and writes,
 * and needs a CHANGELOG line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('NanoMind adapter names without a verified model directory', () => {
  const savedHome = process.env.HOME;
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'oasb-adapter-home-'));
    process.env.HOME = home;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.HOME = savedHome;
    rmSync(home, { recursive: true, force: true });
  });

  it('leaves the model out of the name when ~/.nanomind/models has no version file', async () => {
    const { HMATMEOnlyAdapter, HMAPipelineAdapter } = await import('./hma-pipeline-adapter.js');
    const tme = new HMATMEOnlyAdapter();
    const pipeline = new HMAPipelineAdapter();
    expect(tme.name).toBe('NanoMind TME (model only)');
    expect(tme.version).toBe('unknown');
    expect(pipeline.name).toBe('HMA Full Pipeline (AST + NanoMind)');
    expect(`${tme.name} ${pipeline.name}`).not.toMatch(/vunknown/);
  });

  it('names the model by the version in ~/.nanomind/models/nanomind-version.json', async () => {
    const models = join(home, '.nanomind', 'models');
    mkdirSync(models, { recursive: true });
    writeFileSync(join(models, 'nanomind-version.json'), '{"version":"0.0.1-test"}\n');
    const { HMATMEOnlyAdapter, HMAPipelineAdapter } = await import('./hma-pipeline-adapter.js');
    const tme = new HMATMEOnlyAdapter();
    expect(tme.name).toBe('NanoMind TME v0.0.1-test (model only)');
    expect(tme.version).toBe('0.0.1-test');
    expect(new HMAPipelineAdapter().name).toBe('HMA Full Pipeline (AST + NanoMind v0.0.1-test)');
  });
});
