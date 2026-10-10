/**
 * DVAA Controlled Benchmark
 *
 * Runs HMA pipeline against all DVAA scenarios (ground-truth labeled).
 * Each scenario has:
 *   - vulnerable/ directory with intentionally vulnerable files
 *   - expected-checks.json with HMA check IDs that should fire
 *   - README.md with attack category description
 *
 * This gives us ground-truth precision/recall since we know exactly
 * what each scenario contains and what should be detected.
 *
 * This is the unpinned development runner: it loads the sibling hackmyagent
 * and damn-vulnerable-ai-agent checkouts, so its numbers are not figures of
 * record. Figures of record come from scripts/run-pinned-benchmark.ts.
 *
 * Usage: npx tsx scripts/run-dvaa-benchmark.ts --unpinned [--out=FILE]
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDVAAScenarios, scanDVAAScenario, type DVAAResult } from '../src/benchmark/dvaa-suite.js';
import { checkUnpinnedRun } from '../src/benchmark/pinned/unpinned-guard.js';

async function main() {
  let outPath: string | null;
  try {
    ({ outPath } = checkUnpinnedRun(process.argv.slice(2), process.cwd()));
  } catch (err) {
    console.error(`refused: ${(err as Error).message}`);
    process.exitCode = 2;
    return;
  }

  console.log('OASB DVAA Controlled Benchmark');
  console.log('==============================\n');

  // Load HMA
  const path = require('path');
  const hmaCorePath = path.resolve(__dirname, '..', '..', 'hackmyagent', 'dist', 'nanomind-core', 'index.js');
  const core = await import(hmaCorePath);

  const compiler = new core.SemanticCompiler({ useNanoMind: true });
  const tme = core.getTMEClassifier();
  await tme.ensureModel();
  await tme.ensureReady();

  const { scenarios } = loadDVAAScenarios(resolve(__dirname, '..', '..', 'damn-vulnerable-ai-agent'));
  console.log(`Loaded ${scenarios.length} DVAA scenarios\n`);

  const results: DVAAResult[] = [];
  let detected = 0;
  let total = 0;
  const categoryStats: Record<string, { total: number; detected: number }> = {};

  for (const scenario of scenarios) {
    total++;
    if (!categoryStats[scenario.category]) {
      categoryStats[scenario.category] = { total: 0, detected: 0 };
    }
    categoryStats[scenario.category].total++;

    const { result } = await scanDVAAScenario(core, compiler, tme, scenario);
    const scenarioDetected = result.detected;

    if (scenarioDetected) {
      detected++;
      categoryStats[scenario.category].detected++;
    }
    results.push(result);

    // Progress
    const status = scenarioDetected ? 'DETECTED' : 'MISSED';
    const icon = scenarioDetected ? '+' : '-';
    process.stderr.write(`  [${icon}] ${scenario.name} (${scenario.category}): ${status}\n`);
  }

  // Print results
  console.log(`\n${'='.repeat(80)}`);
  console.log('DVAA DETECTION RESULTS');
  console.log('='.repeat(80));
  console.log(`Total scenarios: ${total}`);
  console.log(`Detected: ${detected} (${((detected / total) * 100).toFixed(1)}%)`);
  console.log(`Missed: ${total - detected}`);

  console.log(`\nPer-Category:`);
  console.log(`${'Category'.padEnd(28)} | Total | Detected | Rate`);
  console.log('-'.repeat(60));
  for (const [cat, stats] of Object.entries(categoryStats).sort((a, b) => a[0].localeCompare(b[0]))) {
    const rate = stats.total > 0 ? ((stats.detected / stats.total) * 100).toFixed(1) : '0.0';
    console.log(`${cat.padEnd(28)} | ${String(stats.total).padEnd(5)} | ${String(stats.detected).padEnd(8)} | ${rate}%`);
  }

  console.log(`\nMissed Scenarios:`);
  const missed = results.filter(r => !r.detected);
  for (const r of missed) {
    console.log(`  ${r.scenario} (${r.category}) - expected: ${r.expectedChecks.join(', ')}`);
    console.log(`    intent: ${r.intentClass} (${r.intentConfidence.toFixed(2)}), findings: ${r.findings}`);
  }

  console.log(`\nDetected Scenarios (${detected}):`);
  const detectedResults = results.filter(r => r.detected);
  for (const r of detectedResults) {
    const topFindings = r.attackFindings.slice(0, 3).join(', ');
    console.log(`  ${r.scenario}: ${r.intentClass} (${r.intentConfidence.toFixed(2)}) [${topFindings}]`);
  }

  // Write JSON results only to a new file named with --out; never over an existing one.
  if (outPath) {
    writeFileSync(outPath, JSON.stringify({
      date: new Date().toISOString(),
      totalScenarios: total,
      detected,
      detectionRate: detected / total,
      perCategory: categoryStats,
      results,
    }, null, 2), { flag: 'wx' });
    console.log(`\nResults saved to ${outPath}`);
  } else {
    console.log('\nNo results file written (pass --out=<new file> to write one).');
  }
}

main().catch(err => {
  console.error('DVAA benchmark failed:', err);
  process.exit(1);
});
