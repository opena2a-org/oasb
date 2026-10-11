// AT-NET-003: Connection Burst Detection
// ATLAS: AML.T0034.002 (Agentic Resource Consumption)
// OWASP: LLM10 (Unbounded Consumption)
// OWASP Agentic: ASI10 (Rogue Agents)

import { it, expect, beforeEach, afterEach } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { SecurityProductAdapter } from '../../harness/adapter';

describeWithCapability('network-monitoring', 'AT-NET-003: Connection Burst Detection', () => {
  let arp: SecurityProductAdapter;

  const BURST_COUNT = 15;

  beforeEach(async () => {
    arp = createAdapter({
      monitors: { network: false },
    });
    await arp.start();
  });

  afterEach(async () => {
    await arp.stop();
  });

  it('should capture all events from a rapid connection burst', async () => {
    for (let i = 0; i < BURST_COUNT; i++) {
      await arp.injectEvent({
        source: 'network-monitor',
        category: 'anomaly',
        severity: 'warning',
        description: `Rapid connection burst event ${i + 1}/${BURST_COUNT}`,
        data: {
          remoteAddr: `target-${i}.example.com`,
          remotePort: 443,
          protocol: 'tcp',
          direction: 'outbound',
          burstIndex: i,
        },
      });
    }

    const allEvents = arp.getEvents();
    expect(allEvents.length).toBe(BURST_COUNT);
  });

  it('should categorize all burst events as anomalies', async () => {
    for (let i = 0; i < BURST_COUNT; i++) {
      await arp.injectEvent({
        source: 'network-monitor',
        category: 'anomaly',
        severity: 'warning',
        description: `Rapid connection burst event ${i + 1}/${BURST_COUNT}`,
        data: {
          remoteAddr: `target-${i}.example.com`,
          remotePort: 443,
          protocol: 'tcp',
          direction: 'outbound',
          burstIndex: i,
        },
      });
    }

    const anomalies = arp.getEventsByCategory('anomaly');
    expect(anomalies.length).toBe(BURST_COUNT);

    const warnings = arp.getEvents().filter((e) => e.severity === 'warning');
    expect(warnings.length).toBe(BURST_COUNT);
  });

  it('should preserve event ordering within a burst', async () => {
    for (let i = 0; i < BURST_COUNT; i++) {
      await arp.injectEvent({
        source: 'network-monitor',
        category: 'anomaly',
        severity: 'warning',
        description: `Rapid connection burst event ${i + 1}/${BURST_COUNT}`,
        data: {
          remoteAddr: `target-${i}.example.com`,
          remotePort: 443,
          protocol: 'tcp',
          direction: 'outbound',
          burstIndex: i,
        },
      });
    }

    const events = arp.getEvents();
    for (let i = 0; i < BURST_COUNT; i++) {
      expect(events[i].data.burstIndex).toBe(i);
    }
  });
});
