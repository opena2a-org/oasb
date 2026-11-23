// AT-PROC-004: Privilege Escalation Detection
// ATLAS: AML.T0105 (Escape to Host)
// OWASP: LLM06 (Excessive Agency)
// OWASP Agentic: ASI03 (Identity & Privilege Abuse)
//
// Verifies that the process monitor classifies a child process running as
// root, when the agent itself runs as another user, as a violation.
// Privilege escalation in agent child processes indicates potential
// exploitation. Each test has a poll of the running monitor list the
// processes the test gives, which carry no category or severity, instead of
// the host's; the monitor's own host poll is an hour apart. The pids are far
// above any the host gives. When the agent runs as root, a root child is no
// escalation, so the tests that need one are inconclusive.

import { it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import { skipInconclusive } from '../../harness/filesystem-watch';
import type { SecurityEvent, SecurityProductAdapter } from '../../harness/adapter';

const AGENT_IS_ROOT = 'inconclusive: the agent runs as root, so a root child process is no privilege escalation';

describeWithCapability('process-monitoring', 'AT-PROC-004: Privilege Escalation Detection', () => {
  let arp: SecurityProductAdapter;
  const currentUser = os.userInfo().username;

  /** The process events of `category` for the test's processes */
  function processEvents(category: 'violation' | 'normal'): SecurityEvent[] {
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

  it('should classify a child process running as root as a violation', async (ctx) => {
    if (currentUser === 'root') skipInconclusive(ctx, AGENT_IS_ROOT);
    await arp.observeProcesses!([{ pid: 4_000_301, command: '/bin/bash -c whoami', user: 'root', cpu: 0 }]);

    const violations = processEvents('violation');
    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('high');
    expect(violations[0].data!.user).toBe('root');
    expect(violations[0].data!.pid).toBe(4_000_301);
  });

  it('should classify a child process running as the current user as normal', async () => {
    await arp.observeProcesses!([{ pid: 4_000_302, command: 'node worker.js', user: currentUser, cpu: 0 }]);

    const normals = processEvents('normal');
    expect(normals).toHaveLength(1);
    expect(normals[0].data!.user).toBe(currentUser);
    expect(normals[0].severity).toBe('info');
    expect(processEvents('violation')).toEqual([]);
  });

  it('should classify only the root child among current-user ones as a violation', async (ctx) => {
    if (currentUser === 'root') skipInconclusive(ctx, AGENT_IS_ROOT);
    await arp.observeProcesses!([
      { pid: 4_000_303, command: 'node server.js', user: currentUser, cpu: 0 },
      { pid: 4_000_304, command: '/usr/bin/sudo cat /etc/shadow', user: 'root', cpu: 0 },
      { pid: 4_000_305, command: 'node api.js', user: currentUser, cpu: 0 },
    ]);

    const violations = processEvents('violation');
    expect(violations).toHaveLength(1);
    expect(violations[0].data!.user).toBe('root');
    expect(violations[0].data!.pid).toBe(4_000_304);
  });
});
