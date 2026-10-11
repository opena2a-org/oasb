// BL-003: Baseline Persistence Across Restarts
// OWASP Agentic: ASI10 (Rogue Agents)
//
// A product that learns behavioral baselines should keep them across a
// restart: until it has relearned them, it scores every event as normal.
// These tests save the baselines of one anomaly scorer to a data directory,
// load them into a new scorer from a new adapter (the restarted product), and
// check that the restarted scorer holds the same baselines, scores events the
// same way and keeps learning from where it stopped.
//
// Requires the 'baseline-persistence' capability. A product whose baselines
// live in memory only reports N/A for this suite, not FAIL.

import { it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createAdapter } from '../harness/create-adapter';
import { describeWithCapability } from '../harness/capabilities';
import type { SecurityEvent, AnomalyScorer } from '../harness/adapter';

/** Helper: create a minimal SecurityEvent for a given source */
function makeEvent(source: 'process' | 'network' | 'filesystem', index: number): SecurityEvent {
  return {
    id: `bl003-${source}-${index}`,
    timestamp: new Date().toISOString(),
    source,
    category: 'normal',
    severity: 'info',
    description: `Persistence test event ${index} from ${source}`,
    data: { index },
    classifiedBy: 'L0-rules',
  };
}

/** Save a scorer's baselines, as the product does before it stops. */
function save(scorer: AnomalyScorer, dataDir: string): void {
  expect(scorer.save, 'the adapter declares baseline-persistence but its scorer has no save()').toBeTypeOf('function');
  scorer.save!(dataDir);
}

/** Simulate a restart: a new scorer from a new adapter, loaded from dataDir. */
function restart(dataDir: string): AnomalyScorer {
  const restarted = createAdapter().createAnomalyScorer();
  expect(restarted.load, 'the adapter declares baseline-persistence but its scorer has no load()').toBeTypeOf('function');
  restarted.load!(dataDir);
  return restarted;
}

describeWithCapability('baseline-persistence', 'BL-003: Baseline Persistence Across Restarts', () => {
  let detector: AnomalyScorer;
  let dataDir: string;

  beforeEach(() => {
    detector = createAdapter().createAnomalyScorer();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasb-bl003-'));
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('should accumulate baseline data during a session', () => {
    // Feed 50 observations to build baseline
    for (let i = 0; i < 50; i++) {
      detector.record(makeEvent('process', i));
    }

    const baseline = detector.getBaseline('process');
    expect(baseline).not.toBeNull();
    expect(baseline!.count).toBeGreaterThan(0);
    expect(baseline!.mean).toBeGreaterThan(0);
  });

  it('should keep the baseline after a restart', () => {
    for (let i = 0; i < 50; i++) {
      detector.record(makeEvent('process', i));
    }

    const baselineBefore = detector.getBaseline('process');
    expect(baselineBefore).not.toBeNull();

    save(detector, dataDir);
    const restartedDetector = restart(dataDir);

    expect(restartedDetector.getBaseline('process')).toEqual(baselineBefore);

    // The restarted scorer scores an event as the original one does
    const testEvent = makeEvent('process', 999);
    expect(restartedDetector.score(testEvent)).toBe(detector.score(testEvent));
  });

  it('should keep the baselines of every source after a restart', () => {
    const sources = ['process', 'network', 'filesystem'] as const;

    for (const source of sources) {
      for (let i = 0; i < 20; i++) {
        detector.record(makeEvent(source, i));
      }
    }

    for (const source of sources) {
      expect(detector.getBaseline(source)).not.toBeNull();
    }

    save(detector, dataDir);
    const restartedDetector = restart(dataDir);

    for (const source of sources) {
      expect(restartedDetector.getBaseline(source)).toEqual(detector.getBaseline(source));
    }
  });

  it('should keep learning from the restored baseline, not from zero', () => {
    for (let i = 0; i < 50; i++) {
      detector.record(makeEvent('network', i));
    }

    save(detector, dataDir);
    const restartedDetector = restart(dataDir);

    // Feed the same events to the restarted scorer and to the original one,
    // which never restarted. Recording them side by side keeps both in the
    // same minute for products that bucket events by time.
    for (let i = 50; i < 100; i++) {
      const event = makeEvent('network', i);
      detector.record(event);
      restartedDetector.record(event);
    }

    // A restarted scorer that relearned from zero would hold the statistics
    // of the last 50 events only, not of all 100.
    expect(restartedDetector.getBaseline('network')).not.toBeNull();
    expect(restartedDetector.getBaseline('network')).toEqual(detector.getBaseline('network'));
  });
});
