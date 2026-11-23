// AT-PROC-005: Process Terminated Detection
// Defensive response test: validates the product's reaction (counters Impact / AML.TA0011). Not an adversary technique.
// OWASP Agentic: ASI10 (Rogue Agents)
//
// Verifies that the process monitor reports a child process that has ended,
// and the new child of a respawn after it (terminated followed by immediate
// new child), which may indicate restart loops or persistent exploitation
// attempts. Each test has polls of the running monitor list the processes
// the test gives, which carry no category or severity, instead of the
// host's; the monitor's own host poll is an hour apart. The pids are far
// above any the host gives, and the assertions read only the events for
// them: the first poll may report the agent's real descendants as
// terminated.

import { it, expect, beforeEach, afterEach } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { ObservedProcess, SecurityEvent, SecurityProductAdapter } from '../../harness/adapter';

describeWithCapability('process-monitoring', 'AT-PROC-005: Process Terminated Detection', () => {
  let arp: SecurityProductAdapter;

  function child(pid: number): ObservedProcess {
    return { pid, command: 'node worker.js', user: 'agent', cpu: 1 };
  }

  /** The process events for the test's processes, in the order raised */
  function processEvents(): SecurityEvent[] {
    return arp.getEvents().filter((e) => e.source === 'process' && (e.data?.pid as number) > 4_000_000);
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

  it('should report a child process that a poll no longer lists as terminated', async () => {
    await arp.observeProcesses!([child(4_000_401)]);
    await arp.observeProcesses!([]);

    const events = processEvents().filter((e) => e.data!.action === 'terminated');
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('normal');
    expect(events[0].severity).toBe('info');
    expect(events[0].data!.pid).toBe(4_000_401);
  });

  it('should report a terminated child and the child respawned in its place', async () => {
    await arp.observeProcesses!([child(4_000_402)]);
    arp.resetCollector();
    await arp.observeProcesses!([child(4_000_403)]);

    const events = processEvents();
    expect(events).toHaveLength(2);
    const terminated = events.find((e) => e.data!.action === 'terminated');
    expect(terminated?.data!.pid).toBe(4_000_402);
    const respawned = events.find((e) => e.data!.action !== 'terminated');
    expect(respawned?.data!.pid).toBe(4_000_403);
    expect(respawned?.data!.command).toBe('node worker.js');
  });

  it('should report each cycle of rapid respawns', async () => {
    await arp.observeProcesses!([child(4_000_410)]);
    arp.resetCollector();
    await arp.observeProcesses!([child(4_000_411)]);
    await arp.observeProcesses!([child(4_000_412)]);

    const events = processEvents();
    expect(events).toHaveLength(4);
    expect(events.filter((e) => e.data!.action === 'terminated').map((e) => e.data!.pid)).toEqual([4_000_410, 4_000_411]);
    expect(events.filter((e) => e.data!.action !== 'terminated').map((e) => e.data!.pid)).toEqual([4_000_411, 4_000_412]);
    for (const event of events) {
      expect(event.category).toBe('normal');
    }
  });

  it('should use waitForEvent to detect a termination event', async () => {
    await arp.observeProcesses!([child(4_000_420)]);
    const waiting = arp.waitForEvent(
      (e) => e.source === 'process' && e.data?.action === 'terminated' && e.data?.pid === 4_000_420,
      5000,
    );
    await arp.observeProcesses!([]);

    const event = await waiting;
    expect(event.category).toBe('normal');
    expect(event.data!.pid).toBe(4_000_420);
  });
});
