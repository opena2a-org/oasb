// AT-NET-005: Exfiltration Destination Detection
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

describeWithCapability('network-monitoring', 'AT-NET-005: Exfiltration Destination Detection', () => {
  let arp: SecurityProductAdapter;

  const exfilDestinations = [
    { host: 'transfer.sh', description: 'file transfer service' },
    { host: 'requestbin.com', description: 'HTTP request capture service' },
    { host: 'interact.sh', description: 'OOB interaction service' },
  ];

  beforeEach(async () => {
    arp = createAdapter({
      monitors: { network: true },
      networkIntervalMs: 3_600_000,
      // Even a host on the allowed list is an exfiltration destination
      networkAllowedHosts: exfilDestinations.map(({ host }) => host),
      rules: [{ name: 'exfil-threat', condition: { source: 'network', category: 'threat' }, action: 'alert' }],
    });
    await arp.start();
    expect(arp.observeConnections, 'the adapter declares network-monitoring but has no observeConnections()').toBeTypeOf('function');
  });

  afterEach(async () => {
    await arp.stop();
  });

  it.each(exfilDestinations)(
    'should flag connection to $host ($description) as critical exfiltration threat',
    async ({ host }) => {
      await arp.observeConnections!([{ remoteAddr: host, remotePort: 443 }]);

      const hostEvents = arp.getEvents().filter((e) => e.source === 'network' && e.data?.remoteAddr === host);
      expect(hostEvents).toHaveLength(1);
      expect(hostEvents[0].category).toBe('threat');
      expect(hostEvents[0].severity).toBe('critical');
    }
  );

  it('should capture all exfiltration destinations as critical threats', async () => {
    await arp.observeConnections!(exfilDestinations.map(({ host }) => ({ remoteAddr: host, remotePort: 443 })));

    const threats = arp.getEventsByCategory('threat');
    expect(threats.map((e) => e.data?.remoteAddr).sort()).toEqual(exfilDestinations.map(({ host }) => host).sort());
    for (const threat of threats) expect(threat.severity).toBe('critical');
  });

  it('should raise an alert through the rules for each exfiltration destination', async () => {
    await arp.observeConnections!(exfilDestinations.map(({ host }) => ({ remoteAddr: host, remotePort: 443 })));

    const alerts = arp.getEnforcementsByAction('alert');
    expect(alerts.map((a) => a.event.data?.remoteAddr).sort()).toEqual(exfilDestinations.map(({ host }) => host).sort());
    for (const alert of alerts) {
      expect(alert.reason).toContain('exfil-threat');
      expect(alert.event.category).toBe('threat');
    }
  });
});
