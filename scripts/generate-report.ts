#!/usr/bin/env npx tsx
/**
 * OASB Report Generator
 *
 * Writes REPORT.generated.md in the current directory with:
 * - The name and version in the package.json of this checkout, on a
 *   Benchmark line
 * - The product under test and the attack-scenario pass/fail summary, read
 *   from a vitest JSON report
 * - MITRE ATLAS coverage, read from the `// ATLAS:` header of each scenario file
 * - OWASP Agentic Top 10 coverage, read from the `// OWASP Agentic:` header of
 *   each scenario file
 * - Known gaps of the reference adapter (ARP), as docs/known-gaps.md documents them
 *
 * Usage:
 *   npx vitest run --reporter=json --outputFile=test-results.json
 *   npm run report -- test-results.json
 *
 * The product under test is read from test-results.adapter.json, which the
 * vitest run writes beside its JSON report (scripts/record-adapter.mjs); the
 * report says "not recorded" when that file is absent or was written for
 * another results file.
 *
 * Without an argument it reads test-results.json in the current directory.
 * The results file must exist, named as the argument or not: when it does
 * not, no report is written and the command exits 1 naming the path and the
 * command above that writes it. The report itself is built by
 * scripts/scenario-report.mjs.
 * REPORT.md, which is tracked, is the 2026-03-23 run kept as recorded and is
 * not overwritten.
 */

import * as path from 'path';

async function main(): Promise<void> {
  const { generateReport, readAdapterRecord, readPackage, readResults, readScenarios, writeReport } = await import(
    './scenario-report.mjs'
  );

  const resultsPath = process.argv[2] || path.join(process.cwd(), 'test-results.json');
  const results = readResults(resultsPath);
  const adapter = readAdapterRecord(resultsPath);

  const scenarios = readScenarios();
  const benchmark = readPackage();
  let report: string;
  try {
    report = generateReport({ scenarios, results, adapter, benchmark, date: new Date().toISOString().split('T')[0] });
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
