// AT-NET-002: Suspicious Host Detection
// ATLAS: AML.T0025 (Exfiltration via Cyber Means)
// OWASP: LLM02 (Sensitive Information Disclosure)
// OWASP Agentic: ASI02 (Tool Misuse & Exploitation)
//
// The network monitor runs, and each test has one of its polls list the
// connections the test gives instead of the host's, which other processes
// change. A connection carries no category or severity: the assertions read
// the classification the monitor gives it. The monitor's own host poll is an
// hour apart, so it does not run during a test.

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
      monitors: { network: true },
      networkIntervalMs: 3_600_000,
    });
    await arp.start();
    expect(arp.observeConnections, 'the adapter declares network-monitoring but has no observeConnections()').toBeTypeOf('function');
  });

  afterEach(async () => {
    await arp.stop();
  });

  it.each(suspiciousHosts)(
    'should classify a connection to $host ($description) as a critical threat',
    async ({ host }) => {
      await arp.observeConnections!([{ remoteAddr: host, remotePort: 443 }]);

      const hostEvents = arp.getEvents().filter((e) => e.source === 'network' && e.data?.remoteAddr === host);
      expect(hostEvents).toHaveLength(1);
      expect(hostEvents[0].category).toBe('threat');
      expect(hostEvents[0].severity).toBe('critical');
    }
  );

  it('should classify each suspicious host among the connections of one poll as a threat', async () => {
    await arp.observeConnections!(suspiciousHosts.map(({ host }) => ({ remoteAddr: host, remotePort: 443 })));

    const threats = arp.getEventsByCategory('threat');
    expect(threats.map((e) => e.data?.remoteAddr).sort()).toEqual(suspiciousHosts.map(({ host }) => host).sort());
    for (const threat of threats) expect(threat.severity).toBe('critical');
  });
});
