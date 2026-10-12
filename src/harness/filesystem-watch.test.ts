// waitForFilesystemWatch writes probe files into a watched directory until
// the adapter reports one; E2E-001 calls it before each case.

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SecurityEvent } from './adapter';
import { EventCollector } from './event-collector';
import { WATCH_PROBE_PREFIX, isWatchProbeEvent, probeWaitMs, waitForFilesystemWatch } from './filesystem-watch';

/**
 * A fake watcher that, `liveAfterMs` after start() (never when null), starts
 * polling `dir` and reports each file created after that as a normal
 * filesystem event.
 */
class LateWatcher {
  readonly collector = new EventCollector();
  private known = new Set<string>();
  private startTimer?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly dir: string,
    private readonly liveAfterMs: number | null,
  ) {}

  start(): void {
    if (this.liveAfterMs === null) return;
    this.startTimer = setTimeout(() => {
      this.known = new Set(readdirSync(this.dir));
      this.pollTimer = setInterval(() => this.poll(), 10);
    }, this.liveAfterMs);
  }

  stop(): void {
    clearTimeout(this.startTimer);
    clearInterval(this.pollTimer);
  }

  waitForEvent(predicate: (event: SecurityEvent) => boolean, timeoutMs?: number): Promise<SecurityEvent> {
    return this.collector.waitForEvent(predicate, timeoutMs);
  }

  private poll(): void {
    for (const name of readdirSync(this.dir)) {
      if (this.known.has(name)) continue;
      this.known.add(name);
      this.collector.eventHandler(fileEvent(name));
    }
  }
}

const fileEvent = (name: string, source: SecurityEvent['source'] = 'filesystem'): SecurityEvent => ({
  source,
  category: 'normal',
  severity: 'info',
  description: `File created: ${name}`,
  data: { path: name, eventType: 'rename' },
});

const reports = (name: string) => (event: SecurityEvent) => String(event.data?.path).includes(name);

const probeCount = (dir: string) => readdirSync(dir).filter((name) => name.startsWith(WATCH_PROBE_PREFIX)).length;

describe('waitForFilesystemWatch', () => {
  let dir: string;
  let watcher: LateWatcher | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'oasb-watch-'));
  });

  afterEach(() => {
    watcher?.stop();
    watcher = undefined;
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns true once the watcher reports a probe, and the next write is reported', async () => {
    watcher = new LateWatcher(dir, 400);
    watcher.start();

    expect(await waitForFilesystemWatch(watcher, dir, { timeoutMs: 5000, intervalMs: 50 })).toBe(true);
    writeFileSync(join(dir, '.bashrc'), 'x\n');

    const event = await watcher.waitForEvent(reports('.bashrc'), 1000);
    expect(event.data?.path).toBe('.bashrc');
  });

  it('leaves the events collected before and during the wait in the collector', async () => {
    watcher = new LateWatcher(dir, 100);
    watcher.collector.eventHandler(fileEvent('startup-scan'));
    watcher.start();

    expect(await waitForFilesystemWatch(watcher, dir, { timeoutMs: 5000, intervalMs: 50 })).toBe(true);
    const events = watcher.collector.getEvents();
    expect(events[0].data?.path).toBe('startup-scan');
    expect(events.some(isWatchProbeEvent)).toBe(true);
  });

  it('returns false once timeoutMs passes when no probe is reported, even with a longer intervalMs', async () => {
    watcher = new LateWatcher(dir, null);
    watcher.start();
    const started = Date.now();

    expect(await waitForFilesystemWatch(watcher, dir, { timeoutMs: 300, intervalMs: 5000 })).toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(290);
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it('writes one probe per interval when waitForEvent rejects at once', async () => {
    const rejecting = { waitForEvent: () => Promise.reject(new Error('not supported')) };

    expect(await waitForFilesystemWatch(rejecting, dir, { timeoutMs: 300, intervalMs: 50 })).toBe(false);
    expect(probeCount(dir)).toBeGreaterThanOrEqual(1);
    expect(probeCount(dir)).toBeLessThanOrEqual(7);
  });

  it('returns false once timeoutMs passes when waitForEvent never settles', async () => {
    const hanging = { waitForEvent: () => new Promise<SecurityEvent>(() => undefined) };
    const started = Date.now();

    expect(await waitForFilesystemWatch(hanging, dir, { timeoutMs: 300, intervalMs: 100 })).toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(290);
    expect(Date.now() - started).toBeLessThan(2500);
    expect(probeCount(dir)).toBeGreaterThanOrEqual(2);
  });

  it('counts a waitForEvent that throws synchronously as no report', async () => {
    const throwing = {
      waitForEvent: (): Promise<SecurityEvent> => {
        throw new Error('not supported');
      },
    };

    expect(await waitForFilesystemWatch(throwing, dir, { timeoutMs: 300, intervalMs: 50 })).toBe(false);
    expect(probeCount(dir)).toBeGreaterThanOrEqual(1);
    expect(probeCount(dir)).toBeLessThanOrEqual(7);
  });

  it('counts only filesystem events as probe reports', () => {
    expect(isWatchProbeEvent(fileEvent(`${WATCH_PROBE_PREFIX}1`))).toBe(true);
    expect(isWatchProbeEvent(fileEvent(`${WATCH_PROBE_PREFIX}1`, 'process'))).toBe(false);
    expect(isWatchProbeEvent(fileEvent('output.json'))).toBe(false);
  });
});

describe('probeWaitMs', () => {
  it('is 5000 ms while the hook has 6000 ms or more left, then what is left before the last 1000 ms, and never under 200 ms', () => {
    expect(probeWaitMs(0)).toBe(5000);
    expect(probeWaitMs(4000)).toBe(5000);
    expect(probeWaitMs(4001)).toBe(4999);
    expect(probeWaitMs(6000)).toBe(3000);
    expect(probeWaitMs(8800)).toBe(200);
    expect(probeWaitMs(9700)).toBe(200);
    expect(probeWaitMs(3000, { hookTimeoutMs: 6000, reserveMs: 500, maxMs: 4000, minMs: 100 })).toBe(2500);
  });
});
