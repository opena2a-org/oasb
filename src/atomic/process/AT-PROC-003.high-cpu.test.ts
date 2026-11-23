// AT-PROC-003: High CPU Detection
// ATLAS: AML.T0034.002 (Agentic Resource Consumption)
// OWASP: LLM10 (Unbounded Consumption)
// OWASP Agentic: ASI10 (Rogue Agents)
//
// Verifies that the process monitor classifies a child process above its CPU
// threshold (90%) as an anomaly. Each test has a poll of the running monitor
// list the processes the test gives, which carry no category or severity,
// instead of the host's; the monitor's own host poll is an hour apart. The
// pids are far above any the host gives.

import { it, expect, beforeEach, afterEach } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { SecurityEvent, SecurityProductAdapter } from '../../harness/adapter';

describeWithCapability('process-monitoring', 'AT-PROC-003: High CPU Detection', () => {
  let arp: SecurityProductAdapter;

  /** The process events of `category` for the test's processes */
  function processEvents(category: 'anomaly' | 'normal'): SecurityEvent[] {
    return arp.getEventsByCategory(category).filter((e) => e.source === 'process' && (e.data?.pid as number) > 4_000_000);
  }

  beforeEach(async () => {
    arp = createAdapter({
      monitors: { process: true },
      processIntervalMs: 3_600_000,
    });
    await arp.start();
    expect(arp.observeProcesses, 'the adapter declares process-monitoring but has no observeProcesses()').toBeTypeOf('function');
  });

  afterEach(async () => {
    await arp.stop();
  });

  it('should classify a child process at 95% CPU as an anomaly (cpu > 90%)', async () => {
    await arp.observeProcesses!([{ pid: 4_000_201, command: 'node crypto-miner.js', user: 'agent', cpu: 95 }]);

    const anomalies = processEvents('anomaly');
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].severity).toBe('medium');
    expect(anomalies[0].data!.cpu).toBe(95);
    expect(anomalies[0].data!.pid).toBe(4_000_201);
  });

  it('should classify a child process at 100% CPU as an anomaly', async () => {
    await arp.observeProcesses!([{ pid: 4_000_202, command: 'node spin.js', user: 'agent', cpu: 100 }]);

    const anomalies = processEvents('anomaly');
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].data!.cpu).toBe(100);
  });

  it('should not classify a child process at 25% CPU as an anomaly', async () => {
    await arp.observeProcesses!([{ pid: 4_000_203, command: 'node server.js', user: 'agent', cpu: 25 }]);

    expect(processEvents('anomaly')).toEqual([]);
    const normals = processEvents('normal');
    expect(normals).toHaveLength(1);
    expect(normals[0].data!.cpu).toBe(25);
  });

  it('should classify only the high-CPU child among low-CPU ones as an anomaly', async () => {
    await arp.observeProcesses!([
      { pid: 4_000_204, command: 'node api.js', user: 'agent', cpu: 10 },
      { pid: 4_000_205, command: 'node worker.js', user: 'agent', cpu: 30 },
      { pid: 4_000_206, command: 'node runaway.js', user: 'agent', cpu: 98 },
    ]);

    const anomalies = processEvents('anomaly');
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].data!.pid).toBe(4_000_206);
  });
});
