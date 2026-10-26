/**
 * External skill-scanner benchmark: scans every sample of a third-party skill
 * corpus with a pinned scanner release and scores it with the published OASB
 * verdict rule. See scripts/external-skill-benchmark.ts for what a run
 * controls and records.
 *
 * Usage:
 *   npx tsx scripts/run-external-skill-benchmark.ts --corpus <dir> --scanner hackmyagent@<version> --instrument check --network off
 *   npx tsx scripts/run-external-skill-benchmark.ts --help
 */

import { runCli } from './external-skill-benchmark.js';

runCli(process.argv.slice(2)).then(code => {
  process.exitCode = code;
});
