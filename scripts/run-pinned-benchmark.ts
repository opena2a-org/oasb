/**
 * OASB pinned benchmark harness.
 *
 * Scans the v2 corpus and every DVAA scenario with a pinned hackmyagent
 * release, DVAA commit and NanoMind model set, and writes a new
 * results/<date>-<runid>/ directory. Refuses unpinned or dirty inputs before
 * scanning anything. See docs/pinned-benchmark.md.
 *
 * Usage:
 *   npx tsx scripts/run-pinned-benchmark.ts --pins <file> --hma <dir> --dvaa <dir>
 *   npx tsx scripts/run-pinned-benchmark.ts --observe --hma <dir> --dvaa <dir>
 */

import { runCli } from '../src/benchmark/pinned/cli.js';

runCli(process.argv.slice(2)).then(code => {
  process.exitCode = code;
});
