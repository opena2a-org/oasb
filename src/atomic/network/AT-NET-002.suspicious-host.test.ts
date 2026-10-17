// AT-NET-002: Suspicious Host Detection
// ATLAS: AML.T0025 (Exfiltration via Cyber Means)
// OWASP: LLM02 (Sensitive Information Disclosure)
// OWASP Agentic: ASI02 (Tool Misuse & Exploitation)

import { it, expect, beforeEach, afterEach } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { SecurityProductAdapter } from '../../harness/adapter';

describeWithCapability(['network-monitoring', 'raw-network-observation'], 'AT-NET-002: Suspicious Host Detection', () => {
  let arp: SecurityProductAdapter;

  const suspiciousHosts = [
    { host: 'webhook.site' },
    { host: 'pastebin.com' },
    { host: 'ngrok.io' },
  ];

  const benignHosts = ['example.com', 'localhost', '127.0.0.1'];

  beforeEach(async () => {
    arp = createAdapter({
      // Disable live acquisition: observeNetwork exercises the product classifier
      // deterministically without contacting any of these hosts.
      monitors: { network: false },
      networkAllowedHosts: benignHosts,
      rules: [],
    });
    await arp.start();
  });

  afterEach(async () => {
    await arp.stop();
  });

  it.each(suspiciousHosts)(
    'should flag connection to $host as critical threat',
    async ({ host }) => {
      await arp.observeNetwork!({
        remoteAddr: host,
        remotePort: 443,
        protocol: 'tcp',
        direction: 'outbound',
      });

      const threats = arp.getEventsByCategory('threat');
      expect(threats.length).toBeGreaterThanOrEqual(1);

      const hostThreat = threats.find((e) => e.data!.remoteAddr === host);
      expect(hostThreat).toBeDefined();
      expect(hostThreat!.severity).toBe('critical');
      expect(hostThreat!.category).toBe('threat');
    }
  );

  it('should capture all suspicious host connections', async () => {
    for (const { host } of suspiciousHosts) {
      await arp.observeNetwork!({
        remoteAddr: host,
        remotePort: 443,
        protocol: 'tcp',
        direction: 'outbound',
      });
    }

    const threats = arp.getEventsByCategory('threat');
    expect(threats.length).toBe(suspiciousHosts.length);

    const criticalEvents = arp.getEvents().filter((e) => e.severity === 'critical');
    expect(criticalEvents.length).toBe(suspiciousHosts.length);

    for (const { host } of suspiciousHosts) {
      expect(
        arp.getEvents().some((e) => e.data!.remoteAddr === host)
      ).toBe(true);
    }
  });

  it('should classify paired benign hosts as normal, not threats', async () => {
    for (const host of benignHosts) {
      await arp.observeNetwork!({
        remoteAddr: host, remotePort: 443, protocol: 'tcp', direction: 'outbound',
      });
      const event = arp.getEvents().find((e) => e.data?.remoteAddr === host);
      // A silent detector cannot pass the benign control by producing nothing.
      expect(event).toBeDefined();
      expect(event!.category).toBe('normal');
      expect(event!.severity).toBe('info');
    }
    expect(arp.getEventsByCategory('threat')).toHaveLength(0);
    expect(arp.getEventsByCategory('normal')).toHaveLength(benignHosts.length);
  });
});
