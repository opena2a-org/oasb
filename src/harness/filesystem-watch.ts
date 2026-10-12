/**
 * Readiness check for a product's live filesystem monitor.
 *
 * Before a test writes a real file into a watched directory, it writes probe
 * files there until the product reports one, or until a time limit passes,
 * instead of pausing for a fixed time after start(). The limit is cut to
 * what is left of the test hook's time, so a product that is slow to start
 * gets the time the fixed pause left it and no more.
 */
import * as fs from 'fs';
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
