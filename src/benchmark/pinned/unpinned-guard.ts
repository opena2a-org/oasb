/**
 * Guard for the unpinned development runners (scripts/run-benchmark-v2.ts and
 * scripts/run-dvaa-benchmark.ts). They load whatever hackmyagent build sits in
 * the sibling checkout, so their numbers are not figures of record. They run
 * only with --unpinned, print their results, and write a file only to a new
 * path named with --out=<file>.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PinError } from './pins.js';

export const PINNED_COMMAND =
  'npx tsx scripts/run-pinned-benchmark.ts --pins <file> --hma <dir> --dvaa <dir> (see docs/pinned-benchmark.md)';

/** A development run of the v2 runner that this guard accepts. */
export const UNPINNED_V2_COMMAND = 'npx tsx scripts/run-benchmark-v2.ts --unpinned --categorized-only';

/**
 * Throws PinError unless the runner was started with --unpinned, or when
 * --out names a file that already exists. Returns the --out path, or null.
 */
export function checkUnpinnedRun(args: string[], cwd: string): { outPath: string | null } {
  if (!args.includes('--unpinned')) {
    throw new PinError(
      'this runner loads an unpinned hackmyagent build from the sibling checkout, so its numbers are not ' +
        `figures of record. Run the pinned harness instead: ${PINNED_COMMAND}. ` +
        'For a local development run, pass --unpinned; results are printed, and written to a file only ' +
        'with --out=<new file>.',
    );
  }
  const out = args.find(a => a.startsWith('--out='));
  if (!out) return { outPath: null };
  const value = out.slice('--out='.length);
  if (!value) throw new PinError('--out= needs a file path');
  const outPath = resolve(cwd, value);
  if (existsSync(outPath)) {
    throw new PinError(`${value} already exists; this runner never overwrites a results file`);
  }
  return { outPath };
}
