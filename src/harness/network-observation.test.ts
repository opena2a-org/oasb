import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArpWrapper } from './arp-wrapper';
import { validateNetworkObservation } from './adapter';
import type { NetworkObservation } from './adapter';

const raw: NetworkObservation = {
  remoteAddr: 'webhook.site', remotePort: 443, protocol: 'tcp', direction: 'outbound',
};

// Compiled by typecheck:tests, never executed. Labels are output-only.
function typeContract(adapter: ArpWrapper): void {
  // @ts-expect-error category is forbidden even when supplied by a typed variable
  const labelled: NetworkObservation = { ...raw, category: 'threat' };
  // @ts-expect-error severity is forbidden
  void adapter.observeNetwork({ ...raw, severity: 'critical' });
  void labelled;
}
void typeContract;

describe('raw network observation boundary', () => {
  let adapter: ArpWrapper | undefined;
  afterEach(async () => {
    vi.restoreAllMocks();
    await adapter?.stop();
    adapter = undefined;
  });

  it.each(['category', 'severity', 'expectedCategory', 'expectedSeverity', 'expectedDetectionLabel', 'description', 'data'])(
    'rejects benchmark answer/context field %s before any event is produced', async (field) => {
      adapter = new ArpWrapper();
      await expect(adapter.observeNetwork({ ...raw, [field]: 'threat' })).rejects.toThrow(TypeError);
      expect(adapter.getEvents()).toEqual([]);
    },
  );

  it('rejects an unsupported direction instead of silently treating it as outbound', () => {
    expect(() => validateNetworkObservation({ ...raw, direction: 'inbound' } as unknown as NetworkObservation))
      .toThrow(TypeError);
  });

  it('uses the installed product poll and waits for its event without injectEvent', async () => {
    const product = require('arp-guard');
    const poll = vi.spyOn(product.NetworkMonitor.prototype, 'poll');
    adapter = new ArpWrapper({ monitors: { network: false }, rules: [] });
    await adapter.start();
    const injection = vi.spyOn(adapter, 'injectEvent');
    expect(adapter.getCapabilities().capabilities.has('raw-network-observation')).toBe(true);
    await adapter.observeNetwork(raw);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(injection).not.toHaveBeenCalled();
    expect(adapter.getEvents()).toMatchObject([{
      source: 'network', category: 'threat', severity: 'critical', data: { remoteAddr: raw.remoteAddr },
    }]);
  });

  it('does not manufacture detections when the product classifier emits nothing', async () => {
    vi.spyOn(require('arp-guard').NetworkMonitor.prototype, 'poll').mockImplementation(() => {});
    adapter = new ArpWrapper({ rules: [] });
    await adapter.start();
    await adapter.observeNetwork(raw);
    expect(adapter.getEvents()).toEqual([]);
  });

  it('lets the product classify an allowed benign host', async () => {
    adapter = new ArpWrapper({ networkAllowedHosts: ['example.com'], rules: [] });
    await adapter.start();
    await adapter.observeNetwork({ ...raw, remoteAddr: 'example.com' });
    expect(adapter.getEvents()).toMatchObject([{
      category: 'normal', severity: 'info', data: { remoteAddr: 'example.com' },
    }]);
  });
});

/** Run the actual migrated scenario, not a second copy of its assertions. */
function runFamily(mode: 'echo' | 'always-threat' | 'legacy' | 'missing-method' | 'prompt-only') {
  const dir = mkdtempSync(join(tmpdir(), 'oasb-raw-network-'));
  try {
    const filename = join(dir, 'adapter.cjs');
    const capabilities = mode === 'prompt-only' ? ['prompt-input-scanning']
      : mode === 'legacy' ? ['network-monitoring'] : ['network-monitoring', 'raw-network-observation'];
    writeFileSync(filename, `module.exports = class FakeAdapter {
      constructor() { this.events = []; }
      getCapabilities() { return {product:'measurement-falsifier',version:'0',capabilities:new Set(${JSON.stringify(capabilities)})}; }
      async start() { ${['legacy', 'prompt-only'].includes(mode) ? "throw new Error('unsupported hook ran');" : ''} } async stop() {}
      async injectEvent(event) { this.events.push(event); return event; }
      ${mode === 'missing-method' ? '' : `async observeNetwork(observation) {
        if ('category' in observation || 'severity' in observation || 'description' in observation || 'data' in observation)
          throw new Error('scenario leaked a label or context');
        return this.injectEvent({source:'network', category:${mode === 'always-threat' ? "'threat'" : "observation.category ?? 'normal'"},
          severity:${mode === 'always-threat' ? "'critical'" : "observation.severity ?? 'info'"}, data:observation});
      }`}
      getEvents() { return this.events; }
      getEventsByCategory(category) { return this.events.filter(event => event.category === category); }
    };`);
    const report = join(dir, 'report.json');
    const child = spawnSync(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'run',
      'src/atomic/network/AT-NET-002.suspicious-host.test.ts', '--maxWorkers=1',
      '--reporter=json', `--outputFile=${report}`], {
      cwd: process.cwd(), env: { ...process.env, OASB_ADAPTER: filename },
      encoding: 'utf8', timeout: 20000,
    });
    if (child.error) throw child.error;
    const result = JSON.parse(readFileSync(report, 'utf8'));
    expect(result.testResults[0].assertionResults.length).toBeGreaterThan(0);
    return { exit: child.status, tests: result.testResults[0].assertionResults as Array<{ status: string }> };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('actual suspicious-host family falsifiers', () => {
  it('fails malicious cases for an adapter that only echoes supplied labels', () => {
    const result = runFamily('echo');
    expect(result.exit).toBe(1);
    expect(result.tests.filter(t => t.status === 'failed')).toHaveLength(4);
  });

  it('fails the benign control for a constant-alarm adapter', () => {
    const result = runFamily('always-threat');
    expect(result.exit).toBe(1);
    expect(result.tests.filter(t => t.status === 'failed')).toHaveLength(1);
  });

  it.each(['legacy', 'prompt-only'] as const)('reports %s adapters as N/A without running hooks', (mode) => {
    const result = runFamily(mode);
    expect(result.exit).toBe(0);
    expect(result.tests.every(t => ['pending', 'skipped'].includes(t.status))).toBe(true);
  });

  it('fails rather than skips when a declared raw capability has no method', () => {
    const result = runFamily('missing-method');
    expect(result.exit).toBe(1);
    expect(result.tests.every(t => t.status === 'failed')).toBe(true);
  });
});
