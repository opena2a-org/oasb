// AT-PROC-001: Spawn Child Process Detection
// ATLAS: AML.T0050 (Command and Scripting Interpreter)
// OWASP: LLM06 (Excessive Agency)
// OWASP Agentic: ASI05 (Unexpected Code Execution (RCE))
//
// The process monitor runs, and each test has its polls list the agent's
// descendant processes the test gives instead of the host's, which the test
// runner's own workers change. A process carries no category or severity:
// the assertions read the classification the monitor gives it. The
// monitor's own host poll is an hour apart, so it does not run during a test.
// The pids are far above any the host gives, and the assertions read only
// the events for them: the first poll may report the agent's real
// descendants as terminated.

import { it, expect, beforeEach, afterEach } from 'vitest';
import { ArpWrapper } from '../../harness/arp-wrapper';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { SecurityEvent, SecurityProductAdapter } from '../../harness/adapter';

describeWithCapability('process-monitoring', 'AT-PROC-001: Spawn Child Process Detection', () => {
  let arp: SecurityProductAdapter;

  const worker = { pid: 4_000_001, command: 'node worker.js --queue jobs', user: 'agent', cpu: 1 };

  /** The process events for `pid` */
  function eventsFor(pid: number): SecurityEvent[] {
    return arp.getEvents().filter((e) => e.source === 'process' && e.data?.pid === pid);
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

  it('should classify a new child process as normal activity', async () => {
    await arp.observeProcesses!([worker]);

    const events = eventsFor(worker.pid);
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('normal');
    expect(events[0].severity).toBe('info');
  });

  it('should include command info in the detected process event', async () => {
    await arp.observeProcesses!([worker]);

    const [event] = eventsFor(worker.pid);
    expect(event).toBeDefined();
    expect(event.data!.command).toBe(worker.command);
    expect(event.data!.user).toBe(worker.user);
  });

  // Monitor status is not part of SecurityProductAdapter. Only the reference
  // adapter reports it, through its arp-guard instance, so for any other
  // adapter this check is N/A.
  it.skipIf(!(createAdapter() instanceof ArpWrapper))('should verify the process monitor is actively running', async () => {
    // The process monitor should be running after start()
    const status = (arp as ArpWrapper).getInstance().getStatus();
    const processMonitor = status.monitors.find((m: { type: string }) => m.type === 'process');

    expect(processMonitor).toBeDefined();
    expect(processMonitor!.running).toBe(true);
  });

  it('should report a child process once, not again on each poll that lists it', async () => {
    await arp.observeProcesses!([worker]);
    await arp.observeProcesses!([worker]);
    await arp.observeProcesses!([worker]);

    const events = eventsFor(worker.pid);
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('normal');
  });
});
