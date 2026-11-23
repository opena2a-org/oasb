// AT-NET-004: Allowed Host Bypass (subdomain attack)
// ATLAS: AML.T0025 (Exfiltration via Cyber Means)
// OWASP: LLM06 (Excessive Agency)
// OWASP Agentic: ASI02 (Tool Misuse & Exploitation)
//
// The network monitor runs with api.example.com as its one allowed host, and
// each test has one of its polls list the connections the test gives instead
// of the host's, which other processes change. A connection carries no
// category or severity: the assertions read the classification the monitor
// gives it. The monitor's own host poll is an hour apart, so it does not run
// during a test.

import { it, expect, beforeEach, afterEach } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { SecurityEvent, SecurityProductAdapter } from '../../harness/adapter';

describeWithCapability('network-monitoring', 'AT-NET-004: Allowed Host Bypass (subdomain attack)', () => {
  let arp: SecurityProductAdapter;

  /** The network events the monitor raised for a connection to `remoteAddr` */
  function eventsFor(remoteAddr: string): SecurityEvent[] {
    return arp.getEvents().filter((e) => e.source === 'network' && e.data?.remoteAddr === remoteAddr);
  }

  beforeEach(async () => {
    arp = createAdapter({
      monitors: { network: true },
      networkIntervalMs: 3_600_000,
      networkAllowedHosts: ['api.example.com'],
      rules: [{ name: 'outside-allowed-hosts', condition: { source: 'network', category: 'anomaly' }, action: 'alert' }],
    });
    await arp.start();
    expect(arp.observeConnections, 'the adapter declares network-monitoring but has no observeConnections()').toBeTypeOf('function');
  });

  afterEach(async () => {
    await arp.stop();
  });

  it('should flag evil-api.example.com as anomaly (not a subdomain of api.example.com)', async () => {
    // evil-api.example.com ends with "api.example.com" as a string suffix,
    // but it is NOT a proper subdomain. A naive suffix check would miss this.
    await arp.observeConnections!([{ remoteAddr: 'evil-api.example.com', remotePort: 443 }]);

    const events = eventsFor('evil-api.example.com');
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('anomaly');
    expect(events[0].severity).toBe('medium');
    expect(events[0].data!.allowed).toBe(false);

    const alerts = arp.getEnforcementsByAction('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].event.data!.remoteAddr).toBe('evil-api.example.com');
  });

  it('should allow sub.api.example.com as a proper subdomain of api.example.com', async () => {
    // sub.api.example.com IS a proper subdomain of api.example.com
    // (preceded by a dot separator)
    await arp.observeConnections!([{ remoteAddr: 'sub.api.example.com', remotePort: 443 }]);

    const events = eventsFor('sub.api.example.com');
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('normal');
    expect(events[0].severity).toBe('info');
    expect(events[0].data!.allowed).toBe(true);
    expect(arp.getEnforcementsByAction('alert')).toEqual([]);
  });

  it('should correctly differentiate bypass attempts from legitimate subdomains', async () => {
    await arp.observeConnections!([
      { remoteAddr: 'evil-api.example.com', remotePort: 443 },
      { remoteAddr: 'sub.api.example.com', remotePort: 443 },
    ]);

    expect(eventsFor('evil-api.example.com').map((e) => e.category)).toEqual(['anomaly']);
    expect(eventsFor('sub.api.example.com').map((e) => e.category)).toEqual(['normal']);
    expect(arp.getEnforcementsByAction('alert').map((a) => a.event.data!.remoteAddr)).toEqual(['evil-api.example.com']);
  });
});
