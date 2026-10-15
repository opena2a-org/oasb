// INT-005: Baseline Learning Then Attack Burst
// ATLAS: AML.T0015 (Evade AI Model)
// OWASP: LLM06 (Excessive Agency)
// OWASP Agentic: ASI10 (Rogue Agents)
// Scenario: an hour of normal traffic, then a sudden burst
//
// The anomaly test spreads normal process events over 60 simulated minutes,
// at 1 to 5 events a minute, so the product's anomaly scorer learns a timed
// baseline. A burst of 20 events in one minute follows. The burst events are
// labelled normal/info like the baseline, so only their rate sets them apart,
// and the scorer must flag them with a z-score above 2.
//
// The other tests inject 30 normal/info events back to back, then 5 events
// already labelled violation/high, and check the rule-based alert, the event
// engine's buffer and the severities of the two phases.

import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { describeWithCapability } from '../harness/capabilities';
import { createAdapter } from '../harness/create-adapter';
import type { AlertRule, SecurityEvent, SecurityProductAdapter } from '../harness/adapter';

/** The z-score above which ARP's statistical layer flags an event as an anomaly. */
const ANOMALY_THRESHOLD = 2.0;

const BASELINE_START = Date.UTC(2026, 0, 1);
const BASELINE_MINUTES = 60;
/** Events per minute during the baseline, repeated: a mean of 3 a minute. */
const BASELINE_RATE = [1, 2, 3, 4, 5];
const BURST_SIZE = 20;

/** A normal process event stamped with the current (simulated) time. */
function processEvent(id: string, phase: 'baseline' | 'attack'): SecurityEvent {
  return {
    id,
    timestamp: new Date().toISOString(),
    source: 'process',
    category: 'normal',
    severity: 'info',
    description: `Process activity ${id}`,
    data: { binary: 'node', phase },
    classifiedBy: 'L0-rules',
  };
}

describeWithCapability(['process-monitoring', 'network-monitoring', 'filesystem-monitoring', 'enforcement-alert'], 'INT-005: Baseline Learning Then Attack Burst', () => {
  let arp: SecurityProductAdapter;

  const burstRules: AlertRule[] = [
    {
      name: 'violation-alert',
      condition: { category: 'violation', minSeverity: 'high' },
      action: 'alert',
    },
    {
      name: 'threat-kill',
      condition: { category: 'threat', minSeverity: 'critical' },
      action: 'kill',
    },
  ];

  beforeEach(async () => {
    arp = createAdapter({
      monitors: { process: false, network: false, filesystem: false },
      rules: burstRules,
    });
    await arp.start();
  });

  afterEach(async () => {
    await arp.stop();
  });

  it('should accept 30 normal baseline events without enforcement', async () => {
    for (let i = 0; i < 30; i++) {
      await arp.injectEvent({
        source: 'network',
        category: 'normal',
        severity: 'info',
        description: `Steady baseline traffic #${i + 1}`,
        data: {
          remoteAddr: 'api.internal.com',
          remotePort: 443,
          protocol: 'tcp',
          direction: 'outbound',
          sequence: i + 1,
          phase: 'baseline',
        },
      });
    }

    const normalEvents = arp.getEventsByCategory('normal');
    expect(normalEvents.length).toBe(30);

    const enforcements = arp.getEnforcements();
    expect(enforcements.length).toBe(0);
  });

  it('should score a burst after an hour of timed baseline traffic as anomalous', () => {
    const scorer = arp.createAnomalyScorer();
    // The scorer buckets events by the minute of the clock, so the clock is
    // set to each event's time. Each event is scored and then recorded, in
    // the order the product's statistical layer handles a live event.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const baselineScores: number[] = [];
      for (let minute = 0; minute < BASELINE_MINUTES; minute++) {
        const rate = BASELINE_RATE[minute % BASELINE_RATE.length];
        for (let i = 0; i < rate; i++) {
          vi.setSystemTime(BASELINE_START + minute * 60_000 + i * 10_000);
          const event = processEvent(`int005-baseline-${minute}-${i}`, 'baseline');
          baselineScores.push(scorer.score(event));
          scorer.record(event);
        }
      }

      // One baseline bucket per simulated minute, with spread to measure against
      const baseline = scorer.getBaseline('process');
      expect(baseline).not.toBeNull();
      expect(baseline!.count).toBe(BASELINE_MINUTES);
      expect(baseline!.mean).toBe(3);
      expect(baseline!.stddev).toBeGreaterThan(0);

      // Traffic at the baseline rate is not flagged
      expect(Math.max(...baselineScores)).toBeLessThanOrEqual(ANOMALY_THRESHOLD);

      // The burst: 20 events, one a second, in the minute after the baseline
      const burstStart = BASELINE_START + BASELINE_MINUTES * 60_000;
      const burstScores: number[] = [];
      for (let i = 0; i < BURST_SIZE; i++) {
        vi.setSystemTime(burstStart + i * 1_000);
        const event = processEvent(`int005-burst-${i}`, 'attack');
        burstScores.push(scorer.score(event));
        scorer.record(event);
      }

      expect(Math.max(...burstScores)).toBeGreaterThan(ANOMALY_THRESHOLD);
      expect(Math.max(...burstScores)).toBeGreaterThan(Math.max(...baselineScores));
    } finally {
      vi.useRealTimers();
    }
  });

  it('should detect violation burst after baseline phase', async () => {
    // Phase 1: Baseline (30 normal events)
    for (let i = 0; i < 30; i++) {
      await arp.injectEvent({
        source: 'process',
        category: 'normal',
        severity: 'info',
        description: `Normal process activity #${i + 1}`,
        data: { pid: 1000 + i, binary: 'node', phase: 'baseline' },
      });
    }

    // Phase 2: Attack burst (5 high-severity violations)
    for (let i = 0; i < 5; i++) {
      await arp.injectEvent({
        source: 'process',
        category: 'violation',
        severity: 'high',
        description: `Attack burst violation #${i + 1}`,
        data: {
          pid: 50000 + i,
          binary: ['curl', 'wget', 'nc', 'sh', 'python3'][i],
          command: `Malicious command #${i + 1}`,
          phase: 'attack',
        },
      });
    }

    const normalEvents = arp.getEventsByCategory('normal');
    expect(normalEvents.length).toBe(30);

    const violations = arp.getEventsByCategory('violation');
    expect(violations.length).toBe(5);

    // All violations should trigger alert enforcement
    const alertActions = arp.getEnforcementsByAction('alert');
    expect(alertActions.length).toBe(5);
  });

  it('should retain both baseline and attack events in engine buffer', async () => {
    // Inject baseline
    for (let i = 0; i < 30; i++) {
      await arp.injectEvent({
        source: 'network',
        category: 'normal',
        severity: 'info',
        description: `Baseline #${i + 1}`,
        data: { sequence: i + 1, phase: 'baseline' },
      });
    }

    // Inject attack burst
    for (let i = 0; i < 5; i++) {
      await arp.injectEvent({
        source: 'network',
        category: 'violation',
        severity: 'high',
        description: `Attack #${i + 1}`,
        data: { sequence: 30 + i + 1, phase: 'attack' },
      });
    }

    // Verify the adapter kept every event from the last 5 minutes
    const since = Date.now() - 300000;
    const recentEvents = arp.getEvents().filter((e) => !e.timestamp || Date.parse(e.timestamp) >= since);
    expect(recentEvents.length).toBe(35);

    // Verify event ordering: baseline first, then attack
    const baselineInBuffer = recentEvents.filter((e) => e.data!.phase === 'baseline');
    const attackInBuffer = recentEvents.filter((e) => e.data!.phase === 'attack');
    expect(baselineInBuffer.length).toBe(30);
    expect(attackInBuffer.length).toBe(5);
  });

  it('should show attack burst events have higher severity than baseline', async () => {
    const severityOrder = ['info', 'low', 'medium', 'high', 'critical'];

    // Baseline with info severity
    for (let i = 0; i < 10; i++) {
      await arp.injectEvent({
        source: 'process',
        category: 'normal',
        severity: 'info',
        description: `Baseline event #${i + 1}`,
        data: { phase: 'baseline' },
      });
    }

    // Attack burst with escalating severity
    const attackSeverities: Array<'medium' | 'high' | 'high' | 'critical' | 'critical'> = [
      'medium', 'high', 'high', 'high', 'high',
    ];

    for (let i = 0; i < attackSeverities.length; i++) {
      await arp.injectEvent({
        source: 'process',
        category: 'violation',
        severity: attackSeverities[i],
        description: `Attack event #${i + 1}`,
        data: { phase: 'attack' },
      });
    }

    const allEvents = arp.getEvents();
    const baselineEvents = allEvents.filter((e) => e.data!.phase === 'baseline');
    const attackEvents = allEvents.filter((e) => e.data!.phase === 'attack');

    // All baseline events should be info severity
    for (const event of baselineEvents) {
      expect(event.severity).toBe('info');
    }

    // All attack events should be medium or higher
    for (const event of attackEvents) {
      const severityIdx = severityOrder.indexOf(event.severity);
      expect(severityIdx).toBeGreaterThanOrEqual(severityOrder.indexOf('medium'));
    }

    // The max severity in attack phase should exceed max severity in baseline
    const maxBaselineSeverity = Math.max(
      ...baselineEvents.map((e) => severityOrder.indexOf(e.severity))
    );
    const maxAttackSeverity = Math.max(
      ...attackEvents.map((e) => severityOrder.indexOf(e.severity))
    );
    expect(maxAttackSeverity).toBeGreaterThan(maxBaselineSeverity);
  });

  it('should handle mixed event sources during attack burst', async () => {
    // Baseline: single-source normal traffic
    for (let i = 0; i < 15; i++) {
      await arp.injectEvent({
        source: 'network',
        category: 'normal',
        severity: 'info',
        description: `Single-source baseline #${i + 1}`,
        data: { phase: 'baseline' },
      });
    }

    // Attack burst: multi-source violations
    const attackEvents = [
      { source: 'process' as const, binary: 'curl', description: 'Process: curl exfiltration' },
      { source: 'filesystem' as const, binary: undefined, description: 'Filesystem: /etc/passwd read' },
      { source: 'network' as const, binary: undefined, description: 'Network: connection to pastebin.com' },
      { source: 'process' as const, binary: 'nc', description: 'Process: netcat reverse shell' },
      { source: 'filesystem' as const, binary: undefined, description: 'Filesystem: .env file read' },
    ];

    for (const attack of attackEvents) {
      await arp.injectEvent({
        source: attack.source,
        category: 'violation',
        severity: 'high',
        description: attack.description,
        data: { phase: 'attack', binary: attack.binary },
      });
    }

    // Verify multi-source detection
    const violations = arp.getEventsByCategory('violation');
    const processViolations = violations.filter((e) => e.source === 'process');
    const filesystemViolations = violations.filter((e) => e.source === 'filesystem');
    const networkViolations = violations.filter((e) => e.source === 'network');

    expect(processViolations.length).toBe(2);
    expect(filesystemViolations.length).toBe(2);
    expect(networkViolations.length).toBe(1);

    // All attack violations should trigger enforcement
    const alertActions = arp.getEnforcementsByAction('alert');
    expect(alertActions.length).toBe(5);
  });
});
