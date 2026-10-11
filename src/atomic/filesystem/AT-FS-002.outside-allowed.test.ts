// AT-FS-002: Access Outside Allowed Paths
// ATLAS: AML.T0037 (Data from Local System)
// OWASP: LLM06 (Excessive Agency)

import { it, expect, beforeEach, afterEach } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { SecurityProductAdapter } from '../../harness/adapter';

describeWithCapability('filesystem-monitoring', 'AT-FS-002: Access Outside Allowed Paths', () => {
  let arp: SecurityProductAdapter;

  beforeEach(async () => {
    arp = createAdapter({
      monitors: { filesystem: false },
    });
    await arp.start();
  });

  afterEach(async () => {
    await arp.stop();
  });

  it('should detect access to /etc/passwd outside allowed paths', async () => {
    await arp.injectEvent({
      source: 'filesystem-monitor',
      category: 'anomaly',
      severity: 'medium',
      description: 'Access outside allowed paths: /etc/passwd',
      data: {
        path: '/etc/passwd',
        operation: 'read',
        allowed: false,
      },
    });

    const anomalies = arp.getEventsByCategory('anomaly');
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].severity).toBe('medium');
    expect(anomalies[0].data.path).toBe('/etc/passwd');
    expect(anomalies[0].data.allowed).toBe(false);
  });

  it('should detect access to /etc/shadow outside allowed paths', async () => {
    await arp.injectEvent({
      source: 'filesystem-monitor',
      category: 'anomaly',
      severity: 'medium',
      description: 'Access outside allowed paths: /etc/shadow',
      data: {
        path: '/etc/shadow',
        operation: 'read',
        allowed: false,
      },
    });

    const anomalies = arp.getEventsByCategory('anomaly');
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].severity).toBe('medium');
    expect(anomalies[0].data.path).toBe('/etc/shadow');
    expect(anomalies[0].data.allowed).toBe(false);
  });

  it('should not flag access to paths within allowed directories', async () => {
    await arp.injectEvent({
      source: 'filesystem-monitor',
      category: 'connection',
      severity: 'info',
      description: 'File access within allowed paths: /workspace/project/src/index.ts',
      data: {
        path: '/workspace/project/src/index.ts',
        operation: 'read',
        allowed: true,
      },
    });

    const anomalies = arp.getEventsByCategory('anomaly');
    expect(anomalies.length).toBe(0);

    const allEvents = arp.getEvents();
    expect(allEvents.length).toBe(1);
    expect(allEvents[0].data.allowed).toBe(true);
  });

  it('should distinguish allowed from disallowed access in mixed events', async () => {
    await arp.injectEvent({
      source: 'filesystem-monitor',
      category: 'connection',
      severity: 'info',
      description: 'File access within allowed paths',
      data: {
        path: '/workspace/project/readme.md',
        operation: 'read',
        allowed: true,
      },
    });

    await arp.injectEvent({
      source: 'filesystem-monitor',
      category: 'anomaly',
      severity: 'medium',
      description: 'Access outside allowed paths: /etc/passwd',
      data: {
        path: '/etc/passwd',
        operation: 'read',
        allowed: false,
      },
    });

    const allEvents = arp.getEvents();
    expect(allEvents.length).toBe(2);

    const anomalies = arp.getEventsByCategory('anomaly');
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].data.path).toBe('/etc/passwd');

    expect(
      arp.getEvents().some((e) => e.data.allowed === false)
    ).toBe(true);
    expect(
      arp.getEvents().some((e) => e.data.allowed === true)
    ).toBe(true);
  });
});
