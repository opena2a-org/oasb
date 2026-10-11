// AT-FS-004: Mass File Creation Detection
// ATLAS: AML.T0034.002 (Agentic Resource Consumption)
// OWASP: LLM10 (Unbounded Consumption)

import { it, expect, beforeEach, afterEach } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { SecurityProductAdapter } from '../../harness/adapter';

describeWithCapability('filesystem-monitoring', 'AT-FS-004: Mass File Creation Detection', () => {
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

  it('should capture all 20 rapidly injected file creation events', async () => {
    const fileCount = 20;

    for (let i = 0; i < fileCount; i++) {
      await arp.injectEvent({
        source: 'filesystem-monitor',
        category: 'normal',
        severity: 'info',
        description: `File created: /tmp/output/file-${i}.txt`,
        data: {
          path: `/tmp/output/file-${i}.txt`,
          operation: 'create',
          index: i,
        },
      });
    }

    const allEvents = arp.getEvents();
    expect(allEvents.length).toBe(fileCount);
  });

  it('should preserve event order during rapid injection', async () => {
    const fileCount = 20;

    for (let i = 0; i < fileCount; i++) {
      await arp.injectEvent({
        source: 'filesystem-monitor',
        category: 'normal',
        severity: 'info',
        description: `File created: /tmp/output/file-${i}.txt`,
        data: {
          path: `/tmp/output/file-${i}.txt`,
          operation: 'create',
          index: i,
        },
      });
    }

    const allEvents = arp.getEvents();
    expect(allEvents.length).toBe(fileCount);

    for (let i = 0; i < fileCount; i++) {
      expect(allEvents[i].data.index).toBe(i);
      expect(allEvents[i].data.path).toBe(`/tmp/output/file-${i}.txt`);
    }
  });

  it('should correctly categorize all mass-created events as normal', async () => {
    const fileCount = 20;

    for (let i = 0; i < fileCount; i++) {
      await arp.injectEvent({
        source: 'filesystem-monitor',
        category: 'normal',
        severity: 'info',
        description: `File created: /tmp/output/file-${i}.txt`,
        data: {
          path: `/tmp/output/file-${i}.txt`,
          operation: 'create',
          index: i,
        },
      });
    }

    const normalEvents = arp.getEventsByCategory('normal');
    expect(normalEvents.length).toBe(fileCount);

    const infoEvents = arp.getEvents().filter((e) => e.severity === 'info');
    expect(infoEvents.length).toBe(fileCount);

    const violations = arp.getEventsByCategory('violation');
    expect(violations.length).toBe(0);

    const anomalies = arp.getEventsByCategory('anomaly');
    expect(anomalies.length).toBe(0);
  });

  it('should handle mass creation mixed with a violation event', async () => {
    const fileCount = 20;

    for (let i = 0; i < fileCount; i++) {
      await arp.injectEvent({
        source: 'filesystem-monitor',
        category: 'normal',
        severity: 'info',
        description: `File created: /tmp/output/file-${i}.txt`,
        data: {
          path: `/tmp/output/file-${i}.txt`,
          operation: 'create',
          index: i,
        },
      });
    }

    await arp.injectEvent({
      source: 'filesystem-monitor',
      category: 'violation',
      severity: 'high',
      description: 'Sensitive path access during mass creation',
      data: {
        path: '/home/user/.ssh/id_rsa',
        operation: 'read',
        sensitive: true,
      },
    });

    const allEvents = arp.getEvents();
    expect(allEvents.length).toBe(fileCount + 1);

    const normalEvents = arp.getEventsByCategory('normal');
    expect(normalEvents.length).toBe(fileCount);

    const violations = arp.getEventsByCategory('violation');
    expect(violations.length).toBe(1);
  });
});
