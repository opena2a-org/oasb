#!/usr/bin/env npx tsx
/**
 * OASB Report Generator
 *
 * Writes REPORT.generated.md in the current directory with:
 * - Test pass/fail summary, when a vitest JSON report is given
 * - MITRE ATLAS coverage, read from the `// ATLAS:` header of each scenario file
 * - OWASP Agentic Top 10 coverage table
 * - Known gaps
 *
 * Usage:
 *   npx vitest run --reporter=json --outputFile=test-results.json
 *   npm run report -- test-results.json
 *
 * Without an argument it reads test-results.json in the current directory, and
 * reports the mapping alone (every status N/A) when that file does not exist.
 * A results file named as the argument must exist: when it does not, no report
 * is written and the command exits 1 naming the path. The report itself is built by scripts/scenario-report.mjs. REPORT.md, which
 * is tracked, is the 2026-03-23 run kept as recorded and is not overwritten.
 */

import * as path from 'path';

async function main(): Promise<void> {
  const { generateReport, readResults, readScenarios, writeReport } = await import('./scenario-report.mjs');

  const named = process.argv[2];
  const resultsPath = named || path.join(process.cwd(), 'test-results.json');
  const results = readResults(resultsPath, Boolean(named));

  const scenarios = readScenarios();
  let report: string;
  try {
    report = generateReport({ scenarios, results, date: new Date().toISOString().split('T')[0] });
  } catch (err) {
    // Only a results file that is not a vitest JSON report makes this throw.
    throw new Error(`${resultsPath}: ${(err as Error).message}`);
  }

  const outputPath = writeReport(report);
  console.log(`Report written to ${outputPath}`);
}

main().catch((err) => {
  console.error(`Report not written: ${(err as Error).message}`);
  process.exit(1);
});
