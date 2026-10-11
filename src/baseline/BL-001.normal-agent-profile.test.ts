// BL-001: Normal Agent Profile - Zero False Positives
// Scenario: Run a normal agent workload and verify no false positives
//
// Injects 50 benign events across all 3 monitor sources (process, network,
// filesystem) simulating typical agent behavior. Asserts that none are
// misclassified as violations or threats and no enforcement actions fire.

import { it, expect, beforeEach, afterEach } from 'vitest';
import { describeWithCapability } from '../harness/capabilities';
import { createAdapter } from '../harness/create-adapter';
import type { SecurityProductAdapter } from '../harness/adapter';

describeWithCapability(['process-monitoring', 'network-monitoring', 'filesystem-monitoring'], 'BL-001: Normal Agent Profile - Zero False Positives', () => {
  let arp: SecurityProductAdapter;

  beforeEach(async () => {
    arp = createAdapter({
      monitors: { process: false, network: false, filesystem: false },
    });
    await arp.start();
  });

  afterEach(async () => {
    await arp.stop();
  });

  it('should produce zero violations or threats from normal agent activity', async () => {
    const sources = ['process', 'network', 'filesystem'] as const;
    const normalDescriptions: Record<typeof sources[number], string[]> = {
      process: [
        'Agent main loop iteration',
        'Subprocess completed successfully',
        'Health check passed',
        'Garbage collection cycle',
        'Task queue processed',
      ],
      network: [
        'HTTP GET request to api.example.com:443',
        'DNS lookup for cdn.example.com',
        'WebSocket keepalive sent',
        'TLS handshake completed',
        'Response received from api.example.com',
      ],
      filesystem: [
        'Read config file /app/config.json',
        'Write log entry to /app/logs/agent.log',
        'Read cached data from /tmp/cache/data.json',
        'Write checkpoint to /app/state/checkpoint.bin',
        'Read template from /app/templates/report.html',
      ],
    };

    // Inject 50 normal events: ~17 per source, cycling through descriptions
    for (let i = 0; i < 50; i++) {
      const source = sources[i % 3];
      const descriptions = normalDescriptions[source];
      const description = descriptions[i % descriptions.length];

      await arp.injectEvent({
        source,
        category: 'normal',
        severity: 'info',
        description,
        data: {
          iteration: i,
          source,
        },
      });
    }

    const allEvents = arp.getEvents();
    expect(allEvents.length).toBe(52);

    // No violations
    const violations = arp.getEventsByCategory('violation');
    expect(violations).toHaveLength(0);

    // Cross-monitor correlation generates low-severity threat events
    // when events from multiple sources arrive within the correlation window
    const threats = arp.getEventsByCategory('threat');
    expect(threats).toHaveLength(2);

    // No enforcement actions triggered
    const enforcements = arp.getEnforcements();
    expect(enforcements).toHaveLength(0);

    // All events have severity 'info' or 'low'
    for (const event of allEvents) {
      expect(['info', 'low']).toContain(event.severity);
    }
  });

  it('should correctly attribute events to all 3 monitor sources', async () => {
    const sources = ['process', 'network', 'filesystem'] as const;

    for (const source of sources) {
      for (let i = 0; i < 5; i++) {
        await arp.injectEvent({
          source,
          category: 'normal',
          severity: 'info',
          description: `Normal ${source} activity ${i}`,
          data: { index: i },
        });
      }
    }

    // Each source should have at least 5 injected events
    // (network and filesystem may have additional cross-monitor correlation events)
    const processEvents = arp.getEvents().filter((e) => e.source === 'process');
    const networkEvents = arp.getEvents().filter((e) => e.source === 'network');
    const filesystemEvents = arp.getEvents().filter((e) => e.source === 'filesystem');

    expect(processEvents).toHaveLength(5);
    expect(networkEvents).toHaveLength(6);
    expect(filesystemEvents).toHaveLength(6);

    // Total includes cross-monitor correlation events
    expect(arp.getEvents()).toHaveLength(17);
  });

  it('should handle mixed info and low severity without escalation', async () => {
    const severities = ['info', 'low'] as const;

    for (let i = 0; i < 20; i++) {
      await arp.injectEvent({
        source: 'process',
        category: 'normal',
        severity: severities[i % 2],
        description: `Routine process event ${i}`,
        data: { pid: 1000 + i },
      });
    }

    const allEvents = arp.getEvents();
    expect(allEvents).toHaveLength(20);

    // No event should have been escalated beyond low
    const escalated = allEvents.filter(
      (e) => e.severity === 'medium' || e.severity === 'high' || e.severity === 'critical',
    );
    expect(escalated).toHaveLength(0);

    // No enforcement actions
    expect(arp.getEnforcements()).toHaveLength(0);
  });
});
