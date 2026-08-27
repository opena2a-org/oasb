/**
 * OASB Benchmark Runner v2
 *
 * Runs real HMA pipeline adapters against the full v2 corpus.
 * Outputs: per-category metrics, flag rates, timing, and comparison data.
 *
 * Usage:
 *   npx tsx scripts/run-benchmark-v2.ts [--limit N] [--adapter ADAPTER]
 *
 * Adapters: tme-only, pipeline, static, all (default)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HMATMEOnlyAdapter, HMAPipelineAdapter, HMAPipelineStaticAdapter } from '../src/benchmark/hma-pipeline-adapter.js';
import { runBenchmark, formatComparisonTable, type ScannerAdapter } from '../src/benchmark/runner.js';
import type { BenchmarkDataset, BenchmarkSample, AttackCategory, ScannerResult, ATTACK_CATEGORIES } from '../src/benchmark/types.js';

const CATEGORIES: AttackCategory[] = [
  'supply_chain', 'prompt_injection', 'credential_exfiltration',
  'heartbeat_rce', 'unicode_stego', 'privilege_escalation',
  'persistence', 'social_engineering', 'data_exfiltration',
];

interface DetailedResult {
  adapterId: string;
  adapterName: string;
  adapterVersion: string;
  totalSamples: number;
  totalMalicious: number;
  totalBenign: number;
  flagged: number;
  flagRate: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  fpr: number;
  avgScanTimeMs: number;
  // Per-category metrics are detection-only: recall = detected / total. We do
  // NOT publish per-category precision/F1 — benign samples carry no attack
  // category, so per-category false positives (and thus precision) are
  // ill-defined. The prior schema's per-category tp/fp counted a detected-but-
  // miscategorized malicious sample as a category false negative, which is
  // wrong (it WAS detected) and corrupted per-category precision. Aggregate
  // precision/recall/F1/FPR below are sound (computed from the global confusion
  // matrix, where any flagged malicious is a true positive regardless of
  // predicted category).
  perCategory: Record<string, {
    total: number;
    detected: number;
    recall: number;
  }>;
}

async function runAdapter(
  adapter: ScannerAdapter,
  samples: BenchmarkSample[],
): Promise<{ results: ScannerResult[]; detailed: DetailedResult }> {
  const results: ScannerResult[] = [];
  let totalTimeMs = 0;
  let processed = 0;

  // Process in batches for progress reporting
  const batchSize = 100;
  for (let i = 0; i < samples.length; i += batchSize) {
    const batch = samples.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(s => adapter.scan(s.content, s.id, s.artifactType)),
    );
    results.push(...batchResults);
    totalTimeMs += batchResults.reduce((sum, r) => sum + (r.scanTimeMs ?? 0), 0);
    processed += batch.length;

    if (processed % 500 === 0 || processed === samples.length) {
      process.stderr.write(`  [${adapter.id}] ${processed}/${samples.length} samples\n`);
    }
  }

  // Compute detailed metrics
  const detailed = computeDetailedMetrics(adapter, samples, results, totalTimeMs);
  return { results, detailed };
}

function computeDetailedMetrics(
  adapter: ScannerAdapter,
  samples: BenchmarkSample[],
  results: ScannerResult[],
  totalTimeMs: number,
): DetailedResult {
  const resultMap = new Map<string, ScannerResult>();
  for (const r of results) resultMap.set(r.sampleId, r);

  let tp = 0, fp = 0, tn = 0, fn = 0;
  let flagged = 0;

  // Per-category tracking — detection only (total + detected). A malicious
  // sample is "detected" when the scanner returns a malicious verdict, whether
  // or not the predicted attack category matches; the verdict, not the category
  // label, is what the corpus measures.
  const catStats: Record<string, { total: number; detected: number }> = {};
  for (const cat of CATEGORIES) {
    catStats[cat] = { total: 0, detected: 0 };
  }

  for (const sample of samples) {
    const result = resultMap.get(sample.id);
    const scannerSaysMalicious = result?.verdict === 'malicious';

    if (scannerSaysMalicious) flagged++;

    if (sample.label === 'malicious') {
      if (sample.category) catStats[sample.category].total++;
      if (scannerSaysMalicious) {
        tp++;
        if (sample.category) catStats[sample.category].detected++;
      } else {
        fn++;
      }
    } else if (sample.label === 'benign') {
      if (scannerSaysMalicious) fp++;
      else tn++;
    }
    // edge_case samples are excluded from scoring
  }

  const totalMalicious = samples.filter(s => s.label === 'malicious').length;
  const totalBenign = samples.filter(s => s.label === 'benign').length;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
  const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;

  const perCategory: DetailedResult['perCategory'] = {};
  for (const cat of CATEGORIES) {
    const s = catStats[cat];
    perCategory[cat] = {
      total: s.total,
      detected: s.detected,
      recall: s.total > 0 ? round(s.detected / s.total) : 0,
    };
  }

  return {
    adapterId: adapter.id,
    adapterName: adapter.name,
    adapterVersion: adapter.version,
    totalSamples: samples.length,
    totalMalicious,
    totalBenign,
    flagged,
    flagRate: flagged / samples.length,
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    fpr: round(fpr),
    avgScanTimeMs: results.length > 0 ? totalTimeMs / results.length : 0,
    perCategory,
  };
}

function round(n: number, d = 4): number {
  return Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
}

/**
 * DVAA sub-benchmark: detection rate over the DVAA-sourced scenarios in the
 * run, using the full-pipeline adapter's verdicts. Computed from the same run
 * results — no separate scan — so the number always traces to this run.
 */
function computeDvaa(samples: BenchmarkSample[], results: ScannerResult[]) {
  const map = new Map(results.map(r => [r.sampleId, r]));
  const scenarios = samples.filter(s => s.source === 'dvaa' && s.label === 'malicious' && s.category);
  const detected = scenarios.filter(s => map.get(s.id)?.verdict === 'malicious').length;
  return {
    note:
      'Detection over the DVAA-sourced scenarios in this run, gated on the same high/critical ' +
      'attack-finding rule as the corpus full-pipeline verdict. DVAA scenarios skew behavioral ' +
      '(prompt-injection, social engineering) whose signal is natural-language instruction rather ' +
      'than a structural finding, so detection here is lower than the structural-config categories.',
    totalScenarios: scenarios.length,
    detected,
    detectionRate: scenarios.length > 0 ? round(detected / scenarios.length) : 0,
    missed: scenarios.length - detected,
  };
}

/**
 * External reference data — third-party scanner flag rates from a published
 * paper. This is NOT measured by this harness; it is a fixed citation kept here
 * so the published comparison block is regenerable alongside our own numbers.
 * Do not edit the values without updating the citation.
 */
const EXTERNAL_PAPER_COMPARISON = {
  paper: 'Holzbauer et al., arXiv:2603.16572, March 2026',
  table2FlagRates: {
    'Socket': 0.0379,
    'Snyk': 0.0769,
    'agent-trust-hub': 0.1376,
    'Cisco Skill Scanner (Skills.sh)': 0.1404,
    'Cisco Skill Scanner (ClawHub)': 0.1674,
    'GPT 5.3-based (Skills.sh)': 0.2728,
    'VirusTotal': 0.362,
    'GPT 5.3-based (ClawHub)': 0.388,
    'OpenClaw Scanner': 0.4193,
  },
  keyFinding: 'Only 0.12% consensus across 5 scanners on 27K skills',
} as const;

const METHODOLOGY_NOTE =
  'Full-pipeline verdict is the artifact producing at least one high/critical ATTACK finding. The verdict ' +
  'excludes POSTURE / hardening findings, which fire on benign and malicious artifacts alike and so carry no ' +
  'malicious-intent signal: AST-PROMPT-001/003/004 (missing prompt defenses), AST-GOV-001..005 (missing ' +
  'governance/oversight/override resistance), and AST-SCOPE-001 (wildcard tool access — a least-privilege ' +
  'posture issue that >2,900 benign registry MCP servers also declare via allowedTools:["*"]). AST-SCOPE-003 ' +
  '(scope-purpose mismatch) is kept as a verdict driver — it catches real privilege-escalation and supply-chain ' +
  'trojans, and excluding it would collapse those categories. The scanner emits all of these to users with ' +
  'severity and a fix; the exclusion governs the ' +
  'BENCHMARK verdict only, not the product findings. Each sample is routed through the analyzer path for its ' +
  'artifact type (agent_config / mcp_config / skill / soul / system_prompt), mirroring the shipped scanner. ' +
  'The TME-only row is a model-only ablation, not a scanner verdict (the classifier under-performs on this ' +
  'corpus, whitespace-vocab OOV). Supersedes benchmark-results-v5.json. Report RECALL alongside F1 — the ' +
  'precision-favoring verdict trades recall for a low false-positive rate, and the recall number is the honest ' +
  'measure of coverage. Excluding the wildcard posture finding also drops the handful of malicious configs ' +
  'whose ONLY signal was wildcard access (genuinely indistinguishable from a benign over-permissioned server).';

function printDetailedResults(detailed: DetailedResult): void {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Scanner: ${detailed.adapterName} (${detailed.adapterId})`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Samples: ${detailed.totalSamples} (${detailed.totalMalicious} malicious, ${detailed.totalBenign} benign)`);
  console.log(`Flagged: ${detailed.flagged} (${(detailed.flagRate * 100).toFixed(1)}% flag rate)`);
  console.log(`TP: ${detailed.truePositives}  FP: ${detailed.falsePositives}  FN: ${detailed.falseNegatives}  TN: ${detailed.trueNegatives}`);
  console.log(`Precision: ${(detailed.precision * 100).toFixed(1)}%  Recall: ${(detailed.recall * 100).toFixed(1)}%  F1: ${(detailed.f1 * 100).toFixed(1)}%  FPR: ${(detailed.fpr * 100).toFixed(2)}%`);
  if (detailed.avgScanTimeMs > 0) {
    console.log(`Avg scan time: ${detailed.avgScanTimeMs.toFixed(1)}ms`);
  }

  console.log(`\nPer-Category Detection (recall = detected / total):`);
  console.log(`${'Category'.padEnd(28)} | Total | Detected | Recall`);
  console.log('-'.repeat(60));

  for (const cat of CATEGORIES) {
    const c = detailed.perCategory[cat];
    if (c.total === 0) continue;
    console.log(
      `${cat.padEnd(28)} | ${String(c.total).padEnd(5)} | ${String(c.detected).padEnd(8)} | ${(c.recall * 100).toFixed(1).padStart(5)}%`
    );
  }
}

function printUsage(): void {
  console.log(`OASB Benchmark Runner v2

Usage: npx tsx scripts/run-benchmark-v2.ts [options]

Options:
  --categorized-only   Exclude 225 registry stubs with no malicious content (recommended)
  --limit=N            Run on N samples (proportionally sampled)
  --adapter=ADAPTER    Run specific adapter: static, tme-only, pipeline, all (default: all)
  --help               Show this help

Examples:
  npx tsx scripts/run-benchmark-v2.ts --categorized-only              # Full benchmark (recommended)
  npx tsx scripts/run-benchmark-v2.ts --categorized-only --limit=100  # Quick test
  npx tsx scripts/run-benchmark-v2.ts --categorized-only --adapter=tme-only  # TME only

Note: Without --categorized-only, the corpus includes 225 registry metadata-flagged
stubs that contain no malicious content (just package names). These inflate false
negative counts. Use --categorized-only for results matching BENCHMARK-RESULTS.md.
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  const limitArg = args.find(a => a.startsWith('--limit='));
  const adapterArg = args.find(a => a.startsWith('--adapter='));
  const categorizedOnly = args.includes('--categorized-only');
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;
  const adapterFilter = adapterArg ? adapterArg.split('=')[1] : 'all';

  if (!categorizedOnly) {
    console.log('NOTE: Running without --categorized-only. Results will include 225 registry');
    console.log('stubs with no malicious content. Add --categorized-only for standard results.');
    console.log('');
  }

  // Load dataset
  const v2Path = join(__dirname, '..', 'corpus', 'v2.json');
  const dataset: BenchmarkDataset = JSON.parse(readFileSync(v2Path, 'utf-8'));

  let samples = dataset.samples;

  // Filter to categorized-only: excludes registry stubs labeled "malicious" with no
  // attack category and no actual malicious content. These are metadata-flagged,
  // not content-flagged, so a content scanner cannot meaningfully detect them.
  if (categorizedOnly) {
    samples = samples.filter(s =>
      s.label !== 'malicious' || (s.label === 'malicious' && s.category)
    );
    const benignCount = samples.filter(s => s.label === 'benign').length;
    console.log(`[--categorized-only] Dropped malicious samples with no attack category. ${samples.length} remain.`);
    console.log(
      `[--categorized-only] This filter applies to the MALICIOUS class ONLY. The ${benignCount} benign ` +
      `samples are NOT content-derived: most were labeled by the scanner's own verdict ` +
      `(verdict='warning' AND overall_score >= 70, see scripts/export-registry-corpus.mjs). Any metric that reads ` +
      `the benign class -- FPR, precision, F1, flag rate -- is circular and must not be published.`
    );
  }

  if (limit) {
    // Keep proportional representation when limiting
    const malicious = samples.filter(s => s.label === 'malicious');
    const benign = samples.filter(s => s.label === 'benign');
    const edgeCase = samples.filter(s => s.label === 'edge_case');

    const malRatio = malicious.length / samples.length;
    const malLimit = Math.ceil(limit * malRatio);
    const benLimit = limit - malLimit;

    // Shuffle for randomness
    const shuffle = <T>(arr: T[]) => arr.sort(() => Math.random() - 0.5);
    samples = [
      ...shuffle(malicious).slice(0, malLimit),
      ...shuffle(benign).slice(0, benLimit),
      ...shuffle(edgeCase).slice(0, Math.min(edgeCase.length, Math.floor(limit * 0.02))),
    ];
  }

  console.log('OASB Skills Security Benchmark v2.0');
  console.log(`Dataset: ${samples.length} samples (${samples.filter(s => s.label === 'malicious').length} malicious, ${samples.filter(s => s.label === 'benign').length} benign, ${samples.filter(s => s.label === 'edge_case').length} edge)`);
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log('');

  // Select adapters
  const adapters: ScannerAdapter[] = [];
  if (adapterFilter === 'all' || adapterFilter === 'static') {
    adapters.push(new HMAPipelineStaticAdapter());
  }
  if (adapterFilter === 'all' || adapterFilter === 'tme-only') {
    adapters.push(new HMATMEOnlyAdapter());
  }
  if (adapterFilter === 'all' || adapterFilter === 'pipeline') {
    adapters.push(new HMAPipelineAdapter());
  }

  console.log(`Running ${adapters.length} adapter(s)...\n`);

  const allDetailed: DetailedResult[] = [];
  const resultsByAdapter: Record<string, ScannerResult[]> = {};

  for (const adapter of adapters) {
    const startTime = Date.now();
    const { results, detailed } = await runAdapter(adapter, samples);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  [${adapter.id}] completed in ${elapsed}s`);
    allDetailed.push(detailed);
    resultsByAdapter[adapter.id] = results;
    printDetailedResults(detailed);
  }

  // Build provenance: the loaded HMA build + classifier versions the adapters
  // honestly report (not hardcoded). Falls back gracefully if a tier was filtered.
  const pipeline = adapters.find(a => a.id === 'hma-pipeline');
  const tme = adapters.find(a => a.id === 'hma-tme-only');
  const buildUnderTest = {
    hackmyagent: pipeline?.version ?? 'unknown',
    nanomindClassifier: tme?.version ?? 'unknown',
  };

  // DVAA sub-benchmark is meaningful only when the full pipeline ran.
  const dvaa = resultsByAdapter['hma-pipeline']
    ? computeDvaa(samples, resultsByAdapter['hma-pipeline'])
    : undefined;

  // Save results (use different filename for partial runs)
  const suffix = limit ? `-partial-${samples.length}` : '';
  const outputPath = join(__dirname, '..', `benchmark-results-v6${suffix}.json`);
  const output = {
    version: '2.0',
    date: new Date().toISOString(),
    buildUnderTest,
    datasetVersion: dataset.version,
    sampleCount: samples.length,
    maliciousSamples: samples.filter(s => s.label === 'malicious').length,
    benignSamples: samples.filter(s => s.label === 'benign').length,
    edgeCaseSamples: samples.filter(s => s.label === 'edge_case').length,
    note: METHODOLOGY_NOTE,
    adapters: Object.fromEntries(allDetailed.map(d => [d.adapterId, d])),
    ...(dvaa ? { dvaa } : {}),
    paperComparison: EXTERNAL_PAPER_COMPARISON,
  };
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to ${outputPath}`);

  // Print comparison summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('COMPARISON SUMMARY');
  console.log('='.repeat(80));
  console.log(`${'Scanner'.padEnd(42)} | F1     | Prec   | Recall | FPR    | Flag Rate`);
  console.log('-'.repeat(95));
  for (const d of allDetailed.sort((a, b) => b.f1 - a.f1)) {
    console.log(
      `${d.adapterName.padEnd(42)} | ${(d.f1 * 100).toFixed(1).padEnd(6)}% | ${(d.precision * 100).toFixed(1).padEnd(6)}% | ${(d.recall * 100).toFixed(1).padEnd(6)}% | ${(d.fpr * 100).toFixed(2).padEnd(6)}% | ${(d.flagRate * 100).toFixed(1)}%`
    );
  }
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
