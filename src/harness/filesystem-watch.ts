/**
 * Readiness check and verdict control for a product's live filesystem
 * monitor.
 *
 * Before a test writes a real file into a watched directory, it writes probe
 * files there until the product reports one, or until a time limit passes,
 * instead of pausing for a fixed time after start(). The limit is cut to
 * what is left of the test hook's time, so a product that is slow to start
 * gets the time the fixed pause left it and no more. A case whose product
 * reported no probe is not measured and ends as inconclusive, without its
 * write.
 *
 * A control watcher owned by the harness, an fs.watch of the same directory
 * opened before the product starts and closed after it stops, records every
 * file event the host delivers to the process. When the product reports
 * nothing for a write within the window, the control decides what that
 * means: the host delivered the event and the product missed it, which is a
 * failure, or the host delivered nothing, which is inconclusive. A case never
 * passes without the product's own event.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { SecurityEvent, SecurityProductAdapter } from './adapter';

/** Name prefix of the probe files; it contains no sensitive path. */
export const WATCH_PROBE_PREFIX = 'oasb-watch-probe-';

/** True for a filesystem event whose path names a probe file. */
export function isWatchProbeEvent(event: SecurityEvent): boolean {
  return event.source === 'filesystem' && String(event.data?.path ?? '').includes(WATCH_PROBE_PREFIX);
}

export interface ProbeWaitBudget {
  /** The vitest hookTimeout the wait runs inside. */
  hookTimeoutMs?: number;
  /** Time left unused at the end of the hook, for the adapter's own timers. */
  reserveMs?: number;
  /** The longest wait, when the hook has time to spare. */
  maxMs?: number;
  /** The shortest wait: the fixed pause the probe wait replaces. */
  minMs?: number;
}

/**
 * The time a probe wait may take when `elapsedMs` of the hook have passed:
 * at most `maxMs`, at least `minMs`, and no more than what is left of
 * `hookTimeoutMs` after `reserveMs`.
 */
export function probeWaitMs(
  elapsedMs: number,
  { hookTimeoutMs = 10000, reserveMs = 1000, maxMs = 5000, minMs = 200 }: ProbeWaitBudget = {},
): number {
  return Math.max(minMs, Math.min(maxMs, hookTimeoutMs - reserveMs - elapsedMs));
}

export interface WatchReadyOptions {
  /** Total time to wait for a probe to be reported. */
  timeoutMs?: number;
  /** Time to wait for each probe before writing the next one. */
  intervalMs?: number;
}

/**
 * Write a new probe file into `dir` every `intervalMs` until the product
 * reports a probe, and return true; return false when none is reported
 * within `timeoutMs`.
 *
 * The probe events stay in the adapter's collector, as do the events the
 * product emitted before; a test that reads the collected events excludes
 * the probes with isWatchProbeEvent.
 */
export async function waitForFilesystemWatch(
  adapter: Pick<SecurityProductAdapter, 'waitForEvent'>,
  dir: string,
  { timeoutMs = 5000, intervalMs = 250 }: WatchReadyOptions = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (let n = 1; Date.now() < deadline; n++) {
    const attemptEnd = Math.min(Date.now() + intervalMs, deadline);
    // waitForEvent also matches an event already collected, so a report of
    // any earlier probe ends the wait as well.
    fs.writeFileSync(path.join(dir, `${WATCH_PROBE_PREFIX}${n}`), '');
    const waitMs = Math.max(1, attemptEnd - Date.now());
    // A waitForEvent that throws, or that does not settle when its timeout
    // passes, counts as no report: the attempt ends on this timer.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reported = await Promise.race([
      Promise.resolve()
        .then(() => adapter.waitForEvent(isWatchProbeEvent, waitMs))
        .then(() => true, () => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), waitMs);
      }),
    ]).finally(() => clearTimeout(timer));
    if (reported) return true;
    // An adapter whose waitForEvent rejects at once still gets one probe
    // per interval, not one per microtask.
    const rest = attemptEnd - Date.now();
    if (rest > 0) await new Promise((r) => setTimeout(r, rest));
  }
  return false;
}

/** A file event the control watcher saw: the path fs.watch reported, relative to the watched directory, and when. */
export interface ControlObservation {
  path: string;
  at: number;
}

/** The time span, in Date.now() milliseconds, an observation must fall in. */
export interface ObservationWindow {
  sinceMs?: number;
  untilMs?: number;
}

export interface ControlWatch {
  /** Every observation so far, oldest first. */
  observations(): ControlObservation[];
  /** The first observation whose path contains `name`, inside the window. */
  seen(name: string, window?: ObservationWindow): ControlObservation | undefined;
  /** Stop observing. */
  close(): void;
}

export interface ControlWatchOptions {
  /** The watch function; fs.watch unless a test replaces it. */
  watch?: typeof fs.watch;
}

/**
 * Open the harness's own recursive fs.watch of `dir`. It records the path
 * and time of every event the host delivers, and nothing else: it is the
 * control a product miss is read against, not a detector.
 */
export function openControlWatch(dir: string, { watch = fs.watch }: ControlWatchOptions = {}): ControlWatch {
  const observations: ControlObservation[] = [];
  const watcher = watch(dir, { recursive: true }, (_eventType, filename) => {
    if (filename) observations.push({ path: String(filename), at: Date.now() });
  });
  // An error ends what the control will see; what it saw stays recorded.
  watcher.on('error', () => undefined);
  return {
    observations: () => [...observations],
    seen: (name, { sinceMs = 0, untilMs = Infinity }: ObservationWindow = {}) =>
      observations.find((o) => o.at >= sinceMs && o.at <= untilMs && o.path.includes(name)),
    close: () => watcher.close(),
  };
}

const loadavg = () => os.loadavg()[0].toFixed(2);

/**
 * The outcome of one detection case: the product's event, a miss the host
 * delivered the event for (a failure, with the control's time), or an
 * inconclusive result because the host delivered no event for the path to
 * anyone in the window.
 */
export type DetectionOutcome =
  | { kind: 'reported'; event: SecurityEvent }
  | { kind: 'missed'; message: string; control: ControlObservation }
  | { kind: 'inconclusive'; message: string };

/**
 * Await the product's event for the write of `name`, made just before this
 * call, for `timeoutMs`, and read a miss against the control. The write is
 * made once by the caller and the product is awaited exactly as before; the
 * control only decides what a miss means. `writtenAt` is the time of the
 * write, this call's time unless given.
 */
export async function awaitDetection(
  adapter: Pick<SecurityProductAdapter, 'waitForEvent'>,
  control: Pick<ControlWatch, 'seen'>,
  name: string,
  predicate: (event: SecurityEvent) => boolean,
  timeoutMs: number,
  writtenAt: number = Date.now(),
): Promise<DetectionOutcome> {
  let failure: unknown;
  try {
    return { kind: 'reported', event: await adapter.waitForEvent(predicate, timeoutMs) };
  } catch (err) {
    failure = err;
  }
  const delivered = control.seen(name, { sinceMs: writtenAt, untilMs: writtenAt + timeoutMs });
  if (delivered) {
    const reason = failure instanceof Error ? failure.message : String(failure);
    return {
      kind: 'missed',
      control: delivered,
      message: `${reason}; the control fs.watch saw ${delivered.path} ${delivered.at - writtenAt} ms after the write`,
    };
  }
  return {
    kind: 'inconclusive',
    message: `inconclusive: host delivered no file event for ${name} within ${timeoutMs} ms (control fs.watch); loadavg ${loadavg()}`,
  };
}

/**
 * The inconclusive message of a case whose product reported no probe file
 * within `budgetMs`: how many of the probe files written into `dir` the
 * control saw, and the load.
 */
export function readinessMessage(control: Pick<ControlWatch, 'observations'>, dir: string, budgetMs: number): string {
  const written = fs.readdirSync(dir).filter((name) => name.startsWith(WATCH_PROBE_PREFIX)).length;
  const seen = new Set(control.observations().map((o) => o.path).filter((p) => p.includes(WATCH_PROBE_PREFIX))).size;
  return (
    `inconclusive: product reported no probe file within ${budgetMs} ms of start(); ` +
    `the control fs.watch saw ${seen} of the ${written} probe files written; loadavg ${loadavg()}`
  );
}
