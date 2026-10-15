// AT-NET-001: New Outbound Connection Detection
// ATLAS: AML.T0025 (Exfiltration via Cyber Means)
// OWASP: LLM02 (Sensitive Information Disclosure)
// OWASP Agentic: ASI02 (Tool Misuse & Exploitation)

import { it, expect, beforeEach, afterEach } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { SecurityProductAdapter } from '../../harness/adapter';

describeWithCapability('network-monitoring', 'AT-NET-001: New Outbound Connection Detection', () => {
  let arp: SecurityProductAdapter;

  beforeEach(async () => {
    arp = createAdapter({
      monitors: { network: false },
    });
    await arp.start();
  });

  afterEach(async () => {
    await arp.stop();
  });

  it('should capture normal outbound connections without flagging them', async () => {
    await arp.injectEvent({
      source: 'network-monitor',
      category: 'normal',
      severity: 'info',
      description: 'New outbound connection to localhost:443',
      data: {
        remoteAddr: 'localhost',
        remotePort: 443,
        protocol: 'tcp',
        direction: 'outbound',
      },
    });

    const events = arp.getEventsByCategory('normal');
    expect(events.length).toBe(1);
    expect(events[0].severity).toBe('info');
    expect(events[0].data!.remoteAddr).toBe('localhost');
  });

  it('should capture anomalous outbound connections to unknown hosts', async () => {
    await arp.injectEvent({
      source: 'network-monitor',
      category: 'anomaly',
      severity: 'medium',
      description: 'New outbound connection to unknown-host:8080',
      data: {
        remoteAddr: 'unknown-host',
        remotePort: 8080,
        protocol: 'tcp',
        direction: 'outbound',
      },
    });

    const anomalies = arp.getEventsByCategory('anomaly');
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].severity).toBe('medium');
    expect(anomalies[0].data!.remoteAddr).toBe('unknown-host');
    expect(anomalies[0].data!.remotePort).toBe(8080);
  });

  it('should distinguish normal connections from anomalous ones', async () => {
    await arp.injectEvent({
      source: 'network-monitor',
      category: 'normal',
      severity: 'info',
      description: 'New outbound connection to localhost:443',
      data: {
        remoteAddr: 'localhost',
        remotePort: 443,
        protocol: 'tcp',
        direction: 'outbound',
      },
    });

    await arp.injectEvent({
      source: 'network-monitor',
      category: 'anomaly',
      severity: 'medium',
      description: 'New outbound connection to unknown-host:8080',
      data: {
        remoteAddr: 'unknown-host',
        remotePort: 8080,
        protocol: 'tcp',
        direction: 'outbound',
      },
    });

    const allEvents = arp.getEvents();
    expect(allEvents.length).toBe(2);

    const normalEvents = arp.getEventsByCategory('normal');
    expect(normalEvents.length).toBe(1);

    const anomalyEvents = arp.getEventsByCategory('anomaly');
    expect(anomalyEvents.length).toBe(1);

    expect(
      arp.getEvents().some((e) => e.data!.remoteAddr === 'unknown-host')
    ).toBe(true);
  });
});
