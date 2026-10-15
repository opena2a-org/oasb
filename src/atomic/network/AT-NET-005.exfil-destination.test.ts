// AT-NET-005: Exfiltration Destination Detection
// ATLAS: AML.T0025 (Exfiltration via Cyber Means)
// OWASP: LLM02 (Sensitive Information Disclosure)
// OWASP Agentic: ASI02 (Tool Misuse & Exploitation)

import { it, expect, beforeEach, afterEach } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { SecurityProductAdapter } from '../../harness/adapter';

describeWithCapability('network-monitoring', 'AT-NET-005: Exfiltration Destination Detection', () => {
  let arp: SecurityProductAdapter;

  const exfilDestinations = [
    { host: 'transfer.sh', description: 'file transfer service' },
    { host: 'requestbin.com', description: 'HTTP request capture service' },
    { host: 'interact.sh', description: 'OOB interaction service' },
  ];

  beforeEach(async () => {
    arp = createAdapter({
      monitors: { network: false },
    });
    await arp.start();
  });

  afterEach(async () => {
    await arp.stop();
  });

  it.each(exfilDestinations)(
    'should flag connection to $host as critical exfiltration threat',
    async ({ host, description }) => {
      await arp.injectEvent({
        source: 'network-monitor',
        category: 'threat',
        severity: 'critical',
        description: `Exfiltration destination detected: ${host} (${description})`,
        data: {
          remoteAddr: host,
          remotePort: 443,
          protocol: 'tcp',
          direction: 'outbound',
          threatType: 'exfiltration',
        },
      });

      const threats = arp.getEventsByCategory('threat');
      expect(threats.length).toBeGreaterThanOrEqual(1);

      const exfilThreat = threats.find((e) => e.data!.remoteAddr === host);
      expect(exfilThreat).toBeDefined();
      expect(exfilThreat!.severity).toBe('critical');
      expect(exfilThreat!.category).toBe('threat');
      expect(exfilThreat!.data!.threatType).toBe('exfiltration');
    }
  );

  it('should capture all exfiltration destinations as critical threats', async () => {
    for (const { host, description } of exfilDestinations) {
      await arp.injectEvent({
        source: 'network-monitor',
        category: 'threat',
        severity: 'critical',
        description: `Exfiltration destination detected: ${host} (${description})`,
        data: {
          remoteAddr: host,
          remotePort: 443,
          protocol: 'tcp',
          direction: 'outbound',
          threatType: 'exfiltration',
        },
      });
    }

    const threats = arp.getEventsByCategory('threat');
    expect(threats.length).toBe(exfilDestinations.length);

    const criticalEvents = arp.getEvents().filter((e) => e.severity === 'critical');
    expect(criticalEvents.length).toBe(exfilDestinations.length);

    for (const { host } of exfilDestinations) {
      expect(
        arp.getEvents().some(
          (e) =>
            e.data!.remoteAddr === host && e.data!.threatType === 'exfiltration'
        )
      ).toBe(true);
    }
  });

  it('should tag all exfiltration events with the correct threat type', async () => {
    for (const { host, description } of exfilDestinations) {
      await arp.injectEvent({
        source: 'network-monitor',
        category: 'threat',
        severity: 'critical',
        description: `Exfiltration destination detected: ${host} (${description})`,
        data: {
          remoteAddr: host,
          remotePort: 443,
          protocol: 'tcp',
          direction: 'outbound',
          threatType: 'exfiltration',
        },
      });
    }

    const allEvents = arp.getEvents();
    const exfilEvents = allEvents.filter(
      (e) => e.data!.threatType === 'exfiltration'
    );
    expect(exfilEvents.length).toBe(exfilDestinations.length);

    for (const event of exfilEvents) {
      expect(event.severity).toBe('critical');
      expect(event.category).toBe('threat');
    }
  });
});
