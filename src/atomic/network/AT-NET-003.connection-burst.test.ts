// AT-NET-003: Connection Burst Detection
// ATLAS: AML.T0034.002 (Agentic Resource Consumption)
// OWASP: LLM10 (Unbounded Consumption)
// OWASP Agentic: ASI10 (Rogue Agents)
//
// A network monitor that tracks the rate of connections flags a minute with
// far more connections than the minutes before it. These tests report the
// connection count of one poll a minute to the product's check, with the
// clock set a minute ahead before each poll, instead of letting the monitor
// list the host's connections, which other processes change.
//
// Requires the 'connection-burst-detection' capability. A product without it
// reports N/A for this suite, not FAIL.

import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { AlertRule, ConnectionBurstDetector, SecurityEvent, SecurityProductAdapter } from '../../harness/adapter';

/** A network event that reports something to act on, not normal activity */
function isNetworkDetection(event: SecurityEvent): boolean {
  return event.source === 'network' && event.category !== 'normal' && event.category !== 'activity';
}

describeWithCapability(['network-monitoring', 'connection-burst-detection'], 'AT-NET-003: Connection Burst Detection', () => {
  let arp: SecurityProductAdapter;
  let detector: ConnectionBurstDetector;
  let start: number;
  let minute: number;

  const burstRules: AlertRule[] = [
    {
      name: 'network-detection',
      condition: { source: 'network', minSeverity: 'medium' },
      action: 'alert',
    },
  ];

  /** One poll a minute, each observing the given number of connections */
  async function pollEachMinute(...connectionCounts: number[]): Promise<void> {
    for (const count of connectionCounts) {
      // 61 s apart, so no poll's connections fall in the next one's minute
      vi.setSystemTime(start + minute * 61_000);
      await detector.record(count);
      minute++;
    }
  }

  beforeEach(async () => {
    arp = createAdapter({
      monitors: { network: false },
      rules: burstRules,
    });
    await arp.start();
    expect(
      arp.createConnectionBurstDetector,
      'the adapter declares connection-burst-detection but has no createConnectionBurstDetector()',
    ).toBeTypeOf('function');
    detector = arp.createConnectionBurstDetector!();
    start = Date.now();
    minute = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await arp.stop();
  });

  it('should not flag a steady connection rate', async () => {
    await pollEachMinute(4, 4, 4, 4, 4, 4);

    expect(arp.getEvents().filter(isNetworkDetection)).toEqual([]);
    expect(arp.getEnforcements()).toEqual([]);
  });

  it('should flag a minute with ten times the connections of the minutes before it', async () => {
    await pollEachMinute(4, 4, 4);
    expect(arp.getEvents().filter(isNetworkDetection)).toEqual([]);

    await pollEachMinute(40);

    const flagged = arp.getEvents().filter(isNetworkDetection);
    expect(flagged).toHaveLength(1);
    expect(['medium', 'high', 'critical']).toContain(flagged[0].severity);
  });

  it('should raise an alert for a connection burst through the rules', async () => {
    await pollEachMinute(4, 4, 4, 40);

    const alerts = arp.getEnforcementsByAction('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].reason).toContain('network-detection');
    expect(isNetworkDetection(alerts[0].event)).toBe(true);
  });
});
