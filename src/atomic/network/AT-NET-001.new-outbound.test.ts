// AT-NET-001: New Outbound Connection Detection
// ATLAS: AML.T0025 (Exfiltration via Cyber Means)
// OWASP: LLM02 (Sensitive Information Disclosure)
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

const ALLOWED = { remoteAddr: 'api.example.com', remotePort: 443 };
const UNKNOWN = { remoteAddr: '203.0.113.7', remotePort: 8080 };

describeWithCapability('network-monitoring', 'AT-NET-001: New Outbound Connection Detection', () => {
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
    });
    await arp.start();
    expect(arp.observeConnections, 'the adapter declares network-monitoring but has no observeConnections()').toBeTypeOf('function');
  });

  afterEach(async () => {
    await arp.stop();
  });

  it('should capture a new connection to an allowed host without flagging it', async () => {
    await arp.observeConnections!([ALLOWED]);

    const events = eventsFor(ALLOWED.remoteAddr);
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('normal');
    expect(events[0].severity).toBe('info');
    expect(events[0].data!.remotePort).toBe(443);
  });

  it('should classify a new connection to a host outside the allowed hosts as an anomaly', async () => {
    await arp.observeConnections!([UNKNOWN]);

    const events = eventsFor(UNKNOWN.remoteAddr);
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('anomaly');
    expect(events[0].severity).toBe('medium');
    expect(events[0].data!.remotePort).toBe(8080);
  });

  it('should distinguish allowed connections from anomalous ones, and report each new destination once', async () => {
    await arp.observeConnections!([ALLOWED, UNKNOWN]);
    // The same connections in the next poll are no longer new
    await arp.observeConnections!([ALLOWED, UNKNOWN]);

    expect(eventsFor(ALLOWED.remoteAddr).map((e) => e.category)).toEqual(['normal']);
    expect(eventsFor(UNKNOWN.remoteAddr).map((e) => e.category)).toEqual(['anomaly']);
  });
});
