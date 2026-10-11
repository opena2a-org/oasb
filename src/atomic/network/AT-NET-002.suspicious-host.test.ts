// AT-NET-002: Suspicious Host Detection
// ATLAS: AML.T0025 (Exfiltration via Cyber Means)
// OWASP: LLM02 (Sensitive Information Disclosure)
// OWASP Agentic: ASI02 (Tool Misuse & Exploitation)

import { it, expect, beforeEach, afterEach } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { SecurityProductAdapter } from '../../harness/adapter';

describeWithCapability('network-monitoring', 'AT-NET-002: Suspicious Host Detection', () => {
  let arp: SecurityProductAdapter;

  const suspiciousHosts = [
    { host: 'webhook.site', description: 'webhook exfiltration endpoint' },
    { host: 'pastebin.com', description: 'public paste service' },
    { host: 'ngrok.io', description: 'tunnel service' },
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

  it.each(suspiciousHosts)(
    'should flag connection to $host as critical threat',
    async ({ host, description }) => {
      await arp.injectEvent({
        source: 'network-monitor',
        category: 'threat',
        severity: 'critical',
        description: `Connection to suspicious host: ${description}`,
        data: {
          remoteAddr: host,
          remotePort: 443,
          protocol: 'tcp',
          direction: 'outbound',
        },
      });

      const threats = arp.getEventsByCategory('threat');
      expect(threats.length).toBeGreaterThanOrEqual(1);

      const hostThreat = threats.find((e) => e.data.remoteAddr === host);
      expect(hostThreat).toBeDefined();
      expect(hostThreat!.severity).toBe('critical');
      expect(hostThreat!.category).toBe('threat');
    }
  );

  it('should capture all suspicious host connections', async () => {
    for (const { host, description } of suspiciousHosts) {
      await arp.injectEvent({
        source: 'network-monitor',
        category: 'threat',
        severity: 'critical',
        description: `Connection to suspicious host: ${description}`,
        data: {
          remoteAddr: host,
          remotePort: 443,
          protocol: 'tcp',
          direction: 'outbound',
        },
      });
    }

    const threats = arp.getEventsByCategory('threat');
    expect(threats.length).toBe(suspiciousHosts.length);

    const criticalEvents = arp.getEvents().filter((e) => e.severity === 'critical');
    expect(criticalEvents.length).toBe(suspiciousHosts.length);

    for (const { host } of suspiciousHosts) {
      expect(
        arp.getEvents().some((e) => e.data.remoteAddr === host)
      ).toBe(true);
    }
  });
});
