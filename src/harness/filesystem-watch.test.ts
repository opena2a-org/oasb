// waitForFilesystemWatch writes probe files into a watched directory until
// the adapter reports one; E2E-001 calls it before each case.

import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SecurityEvent } from './adapter';
import { EventCollector } from './event-collector';
import {
  WATCH_PROBE_PREFIX,
  awaitDetection,
  endWatchCase,
  isWatchProbeEvent,
  loadNote,
  openControlWatch,
  probeWaitMs,
  readinessMessage,
  readinessSkip,
  recursiveWatchSkip,
  waitForFilesystemWatch,
  type ControlObservation,
} from './filesystem-watch';

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

/** The load as a message states it: a figure, or that Windows has none. */
const LOAD = String.raw`loadavg (?:\d+\.\d\d|unavailable on Windows)`;

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

/**
 * A stand-in for fs.watch that hands the listener back so a test can deliver
 * events itself, and the 'error' handler so a test can make the watcher fail.
 */
function fakeWatch() {
  let listener: ((eventType: string, filename: string | null) => void) | undefined;
  let onError: ((err: unknown) => void) | undefined;
  const watcher = {
    closed: false,
    on(event: string, handler: (err: unknown) => void) {
      if (event === 'error') onError = handler;
      return watcher;
    },
    close() {
      watcher.closed = true;
    },
  };
  const watch = ((_dir: string, _opts: unknown, cb: typeof listener) => {
    listener = cb;
    return watcher;
  }) as unknown as typeof import('node:fs').watch;
  return {
    watch,
    watcher,
    deliver: (name: string | null) => listener?.('rename', name),
    fail: (err: unknown) => onError?.(err),
  };
}

/** A stand-in for fs.watch that throws `err` instead of opening a watcher. */
const failingWatch = (err: Error) =>
  (() => {
    throw err;
  }) as unknown as typeof import('node:fs').watch;

/** The error fs.watch throws for a recursive watch where Node.js has none, as on Linux before 19.1.0. */
const noRecursiveWatch = () =>
  Object.assign(
    new Error('The feature watch recursively is unavailable on the current platform, which is being used to run Node.js'),
    { code: 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM' },
  );

describe('openControlWatch', () => {
  it('records the path and time of each event the watcher delivers, and nothing for an event without a path', () => {
    const { watch, deliver } = fakeWatch();
    const control = openControlWatch('/watched', { watch });
    const before = Date.now();

    deliver('.bashrc');
    deliver(null);
    deliver('.ssh/id_rsa');

    const seen = control.observations();
    expect(seen.map((o) => o.path)).toEqual(['.bashrc', '.ssh/id_rsa']);
    expect(seen[0].at).toBeGreaterThanOrEqual(before);
    expect(seen[0].at).toBeLessThanOrEqual(Date.now());
  });

  it('finds the first event whose path contains the name, inside the window only', () => {
    const { watch, deliver } = fakeWatch();
    const control = openControlWatch('/watched', { watch });

    deliver(`${WATCH_PROBE_PREFIX}1`);
    deliver('.ssh');
    deliver('.ssh/id_rsa');
    const [, sshDir, keyFile] = control.observations();

    expect(control.seen('.ssh')).toBe(sshDir);
    expect(control.seen('id_rsa')).toBe(keyFile);
    expect(control.seen('.ssh', { sinceMs: sshDir.at, untilMs: keyFile.at })).toBe(sshDir);
    expect(control.seen('.ssh', { untilMs: sshDir.at - 1 })).toBeUndefined();
    expect(control.seen('.ssh', { sinceMs: keyFile.at + 1 })).toBeUndefined();
    expect(control.seen('.env')).toBeUndefined();
  });

  it('closes the watcher it opened', () => {
    const { watch, watcher } = fakeWatch();
    const control = openControlWatch('/watched', { watch });

    expect(watcher.closed).toBe(false);
    control.close();
    expect(watcher.closed).toBe(true);
  });

  it('keeps the first error its watcher reports, and what it saw before', () => {
    const { watch, deliver, fail } = fakeWatch();
    const control = openControlWatch('/watched', { watch });

    deliver('.bashrc');
    expect(control.error()).toBeUndefined();
    fail(new Error('EMFILE: too many open files, watch'));
    fail('closed');

    expect(control.error()?.message).toBe('EMFILE: too many open files, watch');
    expect(control.observations().map((o) => o.path)).toEqual(['.bashrc']);
  });
});

describe('recursiveWatchSkip', () => {
  it('gives the inconclusive message, naming the runtime and the error, for what openControlWatch throws where Node.js has no recursive fs.watch', () => {
    const unavailable = noRecursiveWatch();
    let thrown: unknown;
    try {
      openControlWatch('/watched', { watch: failingWatch(unavailable) });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBe(unavailable);
    expect(recursiveWatchSkip(thrown, { version: 'v18.20.4', platform: 'linux' })).toBe(
      'inconclusive: Node.js v18.20.4 on linux has no recursive fs.watch, which the control needs ' +
        '(Linux has it from Node.js 19.1.0), so the case is not measured: ' +
        'The feature watch recursively is unavailable on the current platform, which is being used to run Node.js',
    );
    expect(recursiveWatchSkip(thrown)).toMatch(
      /^inconclusive: Node\.js v\d+\.\d+\.\d+\S* on \w+ has no recursive fs\.watch, which the control needs \(Linux has it from Node\.js 19\.1\.0\), so the case is not measured: The feature watch recursively is unavailable on the current platform, which is being used to run Node\.js$/,
    );
  });

  it('gives no message for any other error on opening the control, which fails the case', () => {
    const missing = Object.assign(new Error("ENOENT: no such file or directory, watch '/watched'"), { code: 'ENOENT' });

    expect(() => openControlWatch('/watched', { watch: failingWatch(missing) })).toThrow(missing);
    expect(recursiveWatchSkip(missing)).toBeUndefined();
    expect(recursiveWatchSkip(new Error('watch failed'))).toBeUndefined();
    expect(recursiveWatchSkip('ERR_FEATURE_UNAVAILABLE_ON_PLATFORM')).toBeUndefined();
    expect(recursiveWatchSkip(null)).toBeUndefined();
    expect(recursiveWatchSkip(undefined)).toBeUndefined();
  });
});

describe('loadNote', () => {
  it('gives the 1-minute load to two decimals, and no figure on Windows, where os.loadavg() is all zeros', () => {
    expect(loadNote('darwin', [14.826, 9.1, 8.4])).toBe('loadavg 14.83');
    expect(loadNote('linux', [0, 0, 0])).toBe('loadavg 0.00');
    expect(loadNote('win32', [0, 0, 0])).toBe('loadavg unavailable on Windows');
    expect(loadNote()).toMatch(new RegExp(`^${LOAD}$`));
  });
});

describe('awaitDetection', () => {
  const timedOut = { waitForEvent: () => Promise.reject(new Error('Timed out after 300ms waiting for event')) };
  const controlThatSaw = (observation: ControlObservation | undefined) => ({ seen: () => observation });

  it('returns the product event when the product reports it', async () => {
    const event = fileEvent('.bashrc');
    const reporting = { waitForEvent: () => Promise.resolve(event) };
    const control = { seen: () => undefined };

    expect(await awaitDetection(reporting, control, '.bashrc', reports('.bashrc'), 300)).toEqual({
      kind: 'reported',
      event,
    });
  });

  it('is a miss, with the same message and the control time, when the product reports nothing and the control saw the path', async () => {
    const writtenAt = 1_000_000;
    const observation = { path: '.bashrc', at: writtenAt + 120 };
    const windows: unknown[] = [];
    const control = { seen: (name: string, window?: unknown) => (windows.push([name, window]), observation) };

    const outcome = await awaitDetection(timedOut, control, '.bashrc', reports('.bashrc'), 300, writtenAt);

    expect(outcome).toEqual({
      kind: 'missed',
      control: observation,
      message: 'Timed out after 300ms waiting for event; the control fs.watch saw .bashrc 120 ms after the write',
    });
    expect(windows).toEqual([['.bashrc', { sinceMs: writtenAt, untilMs: writtenAt + 300 }]]);
  });

  it('is inconclusive, with the window, the load and the reason from the product, when the product reports nothing and the control saw nothing', async () => {
    const outcome = await awaitDetection(timedOut, controlThatSaw(undefined), '.npmrc', reports('.npmrc'), 300);

    expect(outcome.kind).toBe('inconclusive');
    expect(outcome.kind === 'inconclusive' && outcome.message).toMatch(
      new RegExp(
        String.raw`^inconclusive: host delivered no file event for \.npmrc within 300 ms \(control fs\.watch\); ${LOAD}; the product's wait: Timed out after 300ms waiting for event$`,
      ),
    );
  });

  it('is inconclusive for a file the control saw no event for, whatever other file events it recorded in the window', async () => {
    const { watch, deliver } = fakeWatch();
    const control = openControlWatch('/watched', { watch });
    const writtenAt = Date.now();
    deliver(`${WATCH_PROBE_PREFIX}3`);

    const outcome = await awaitDetection(timedOut, control, '.env', reports('.env'), 300, writtenAt);

    expect(control.observations()).toHaveLength(1);
    expect(outcome.kind === 'inconclusive' && outcome.message).toMatch(
      /^inconclusive: host delivered no file event for \.env within 300 ms \(control fs\.watch\); /,
    );
  });

  it('names the error of a control that reported one and saw nothing, instead of saying the host delivered nothing', async () => {
    const control = { seen: () => undefined, error: () => new Error('EMFILE: too many open files, watch') };

    const outcome = await awaitDetection(timedOut, control, '.npmrc', reports('.npmrc'), 300, 0);

    expect(outcome.kind === 'inconclusive' && outcome.message).toMatch(
      new RegExp(
        String.raw`^inconclusive: the control fs\.watch reported an error \(EMFILE: too many open files, watch\) and recorded no file event for \.npmrc within 300 ms; ${LOAD}; the product's wait: Timed out after 300ms waiting for event$`,
      ),
    );
  });

  it('is a miss when the control saw the path before it reported an error', async () => {
    const control = { seen: () => ({ path: '.env', at: 5 }), error: () => new Error('EMFILE: too many open files, watch') };

    const outcome = await awaitDetection(timedOut, control, '.env', reports('.env'), 300, 0);

    expect(outcome.kind === 'missed' && outcome.message).toBe(
      'Timed out after 300ms waiting for event; the control fs.watch saw .env 5 ms after the write',
    );
  });

  it('returns at once, without a second wait, when the window ended before the wait for the product failed', async () => {
    const windows: unknown[] = [];
    const control = { seen: (name: string, window?: unknown) => (windows.push([name, window]), undefined) };
    const writtenAt = Date.now() - 5000;
    const started = Date.now();

    const outcome = await awaitDetection(timedOut, control, '.env', reports('.env'), 2000, writtenAt);

    expect(Date.now() - started).toBeLessThan(1000);
    expect(outcome.kind).toBe('inconclusive');
    expect(windows).toEqual([['.env', { sinceMs: writtenAt, untilMs: writtenAt + 2000 }]]);
  });

  it('reads the control when the window ends, so a wait that fails at once is a miss when the control sees the path later in the window', async () => {
    const { watch, deliver } = fakeWatch();
    const control = openControlWatch('/watched', { watch });
    const crashed = { waitForEvent: () => Promise.reject(new Error('monitor crashed')) };
    const writtenAt = Date.now();
    const later = setTimeout(() => deliver('.env'), 100);

    const outcome = await awaitDetection(crashed, control, '.env', reports('.env'), 1000, writtenAt);
    clearTimeout(later);

    expect(Date.now() - writtenAt).toBeGreaterThanOrEqual(990);
    expect(outcome.kind).toBe('missed');
    expect(outcome.kind === 'missed' && outcome.message).toMatch(
      /^monitor crashed; the control fs\.watch saw \.env \d+ ms after the write$/,
    );
  });

  it('keeps the reason of a product that fails the wait another way', async () => {
    const throwing = { waitForEvent: () => Promise.reject(new Error('not supported')) };

    const outcome = await awaitDetection(throwing, controlThatSaw({ path: '.env', at: 5 }), '.env', reports('.env'), 300, 0);

    expect(outcome.kind === 'missed' && outcome.message).toBe(
      'not supported; the control fs.watch saw .env 5 ms after the write',
    );
  });
});

describe('readinessMessage', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'oasb-watch-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('counts the probe files written and the distinct ones the control saw, and states the budget and the load', () => {
    for (const n of [1, 2, 3]) writeFileSync(join(dir, `${WATCH_PROBE_PREFIX}${n}`), '');
    writeFileSync(join(dir, 'other'), '');
    const observations = [
      { path: `${WATCH_PROBE_PREFIX}1`, at: 1 },
      { path: `${WATCH_PROBE_PREFIX}1`, at: 2 },
      { path: 'other', at: 3 },
    ];

    expect(readinessMessage({ observations: () => observations }, dir, 4200)).toMatch(
      new RegExp(
        String.raw`^inconclusive: product reported no probe file within 4200 ms of start\(\); the control fs\.watch saw 1 of the 3 probe files written; ${LOAD}$`,
      ),
    );
  });

  it('names the error of a control that reported one', () => {
    writeFileSync(join(dir, `${WATCH_PROBE_PREFIX}1`), '');
    const control = { observations: () => [], error: () => new Error('EMFILE: too many open files, watch') };

    expect(readinessMessage(control, dir, 4200)).toMatch(
      new RegExp(
        String.raw`^inconclusive: product reported no probe file within 4200 ms of start\(\); the control fs\.watch saw 0 of the 1 probe files written and reported an error \(EMFILE: too many open files, watch\); ${LOAD}$`,
      ),
    );
  });
});

describe('readinessSkip', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'oasb-watch-'));
    for (const n of [1, 2, 3]) writeFileSync(join(dir, `${WATCH_PROBE_PREFIX}${n}`), '');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('lets the case make its write when the product reported no probe but the control saw one', () => {
    const observations = [
      { path: 'other', at: 1 },
      { path: `${WATCH_PROBE_PREFIX}2`, at: 2 },
    ];

    expect(readinessSkip({ observations: () => observations }, dir, 4200)).toBeUndefined();
  });

  it('skips the case as inconclusive, before its write, when the control saw no probe file either', () => {
    const observations = [{ path: 'other', at: 1 }];

    expect(readinessSkip({ observations: () => observations }, dir, 4200)).toMatch(
      new RegExp(
        String.raw`^inconclusive: product reported no probe file within 4200 ms of start\(\); the control fs\.watch saw 0 of the 3 probe files written; ${LOAD}$`,
      ),
    );
  });
});

describe('endWatchCase', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'oasb-watch-'));
    writeFileSync(join(dir, '.env'), 'x\n');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('stops the product, then closes the control and removes the directory', async () => {
    const calls: string[] = [];
    const adapter = { stop: async () => void calls.push('stop') };
    const control = { close: () => void calls.push(`close, directory ${existsSync(dir) ? 'present' : 'removed'}`) };

    await endWatchCase({ adapter, control, dir });

    expect(calls).toEqual(['stop', 'close, directory present']);
    expect(existsSync(dir)).toBe(false);
  });

  it('closes the control and removes the directory when stop() rejects, and passes the rejection on', async () => {
    const { watch, watcher } = fakeWatch();
    const control = openControlWatch(dir, { watch });
    const adapter = { stop: () => Promise.reject(new Error('stop failed')) };

    await expect(endWatchCase({ adapter, control, dir })).rejects.toThrow('stop failed');

    expect(watcher.closed).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });

  it('ends a case that was skipped before its control or its product existed', async () => {
    await endWatchCase({ dir });
    await endWatchCase({});

    expect(existsSync(dir)).toBe(false);
  });
});
