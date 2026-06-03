/**
 * OASB Benchmark Scoring Engine
 *
 * Computes precision, recall, F1, FPR per attack category and in aggregate.
 * Assigns tier based on published thresholds.
 * Computes Cohen's Kappa vs HMA baseline.
 */

import {
  type AttackCategory,
  type AggregateMetrics,
  type BenchmarkSample,
  type BenchmarkTier,
  type CategoryMetrics,
  type LeaderboardEntry,
  type ScannerResult,
  type ScannerSubmission,
  ATTACK_CATEGORIES,
} from './types.js';

// ============================================================================
// Tier Thresholds
// ============================================================================

export interface TierThresholds {
  minF1: number;
  maxFPR: number;
  minCategoryCoverage: number; // out of 9
  minKappa?: number;           // vs HMA baseline
}

export const TIER_THRESHOLDS: Record<BenchmarkTier, TierThresholds> = {
  platinum: { minF1: 0.90, maxFPR: 0.05, minCategoryCoverage: 9, minKappa: 0.85 },
  gold:     { minF1: 0.80, maxFPR: 0.10, minCategoryCoverage: 7 },
  silver:   { minF1: 0.65, maxFPR: 0.20, minCategoryCoverage: 5 },
  listed:   { minF1: 0,    maxFPR: 1.0,  minCategoryCoverage: 0 },
  disqualified: { minF1: 0, maxFPR: 1.0, minCategoryCoverage: 0 },
};

// ============================================================================
// Scoring Engine
// ============================================================================

/**
 * Score a scanner submission against a labeled benchmark dataset.
 *
 * @param isHMABaseline  Marks this submission as the HMA reference baseline.
 *   The baseline's Cohen's Kappa is computed against itself (1.0) and the
 *   kappa gate is treated as satisfied; pass the frozen baseline submission
 *   as `hmaBaseline` for every other scanner so all are compared to the same
 *   reference regardless of scoring order.
 */
export function scoreSubmission(
  submission: ScannerSubmission,
  dataset: BenchmarkSample[],
  hmaBaseline?: ScannerSubmission,
  isHMABaseline = false,
): LeaderboardEntry {
  // Build lookup maps
  const sampleMap = new Map<string, BenchmarkSample>();
  for (const sample of dataset) {
    sampleMap.set(sample.id, sample);
  }

  const resultMap = new Map<string, ScannerResult>();
  for (const result of submission.results) {
    resultMap.set(result.sampleId, result);
  }

  // Per-category breakdown (for the scorecard) and pooled aggregate (authoritative).
  const categoryMetrics = computeCategoryMetrics(sampleMap, resultMap);
  const aggregate = computeAggregateMetrics(sampleMap, resultMap, categoryMetrics);

  // Cohen's Kappa vs the HMA baseline. The baseline trivially agrees with
  // itself, so its self-kappa is 1.0; only cross-scanner kappa is meaningful.
  let kappa = isHMABaseline ? 1 : 0;
  if (hmaBaseline && !isHMABaseline) {
    const hmaResultMap = new Map<string, ScannerResult>();
    for (const result of hmaBaseline.results) {
      hmaResultMap.set(result.sampleId, result);
    }
    kappa = computeCohensKappa(resultMap, hmaResultMap, dataset);
  }

  aggregate.kappaVsHMA = kappa;

  // Determine tier
  const tier = determineTier(aggregate);

  return {
    scannerId: submission.scannerId,
    scannerName: submission.scannerName,
    scannerVersion: submission.scannerVersion,
    tier,
    metrics: aggregate,
    submittedAt: submission.submittedAt,
    datasetVersion: submission.datasetVersion,
    isHMABaseline,
  };
}

/**
 * Compute metrics per attack category.
 *
 * Detection (recall) is credited on the VERDICT alone: a scanner that calls a
 * malicious sample `malicious` gets recall credit even if it omits or mislabels
 * the category — category is a secondary attribution, not a detection gate.
 * False positives are attributed to a category only when the scanner names one;
 * the authoritative FPR is the pooled aggregate (see computeAggregateMetrics).
 */
function computeCategoryMetrics(
  samples: Map<string, BenchmarkSample>,
  results: Map<string, ScannerResult>,
): CategoryMetrics[] {
  return ATTACK_CATEGORIES.map(category => {
    let tp = 0, fp = 0, tn = 0, fn = 0;

    for (const [sampleId, sample] of samples) {
      const result = results.get(sampleId);
      // Unscanned / 'unknown' / 'benign' all count as "not flagged malicious".
      const saysMalicious = result?.verdict === 'malicious';
      const trueInCategory = sample.label === 'malicious' && sample.category === category;

      if (trueInCategory) {
        if (saysMalicious) tp++;   // detected this category's attack (verdict-based)
        else fn++;
      } else if (sample.label === 'benign') {
        // A benign sample is an FP for THIS category only if the scanner
        // explicitly attributed its malicious verdict to this category.
        if (saysMalicious && result?.category === category) fp++;
        else tn++;
      }
      // edge_case and other-category malicious samples are excluded from this
      // category's confusion matrix (they belong to their own category's row).
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
    const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;

    return { category, truePositives: tp, falsePositives: fp, trueNegatives: tn, falseNegatives: fn, precision, recall, f1, fpr };
  });
}

/**
 * Compute aggregate metrics from a single POOLED confusion matrix over every
 * sample, keyed on the scanner's verdict. This is the standard binary-detection
 * computation (the same one scripts/run-benchmark-v2.ts uses for published
 * numbers). Macro-averaging per-category FPR is wrong here: a benign sample
 * wrongly flagged appears as an FP in one category and a TN in the other eight,
 * which dilutes FPR ~9x and lets a scanner that flags every benign artifact
 * report a single-digit FPR.
 *
 * `categoryCoverage` counts attack categories PRESENT in the dataset that the
 * scanner detected at least once. Tier thresholds (9/7/5) assume the canonical
 * full 9-category dataset; a partial dataset caps coverage to the categories it
 * contains.
 */
function computeAggregateMetrics(
  samples: Map<string, BenchmarkSample>,
  results: Map<string, ScannerResult>,
  categories: CategoryMetrics[],
): AggregateMetrics {
  const categoriesPresent = categories.filter(c => c.truePositives + c.falseNegatives > 0);
  const categoryCoverage = categoriesPresent.filter(c => c.recall > 0).length;

  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const [sampleId, sample] of samples) {
    const saysMalicious = results.get(sampleId)?.verdict === 'malicious';
    if (sample.label === 'malicious') {
      if (saysMalicious) tp++; else fn++;
    } else if (sample.label === 'benign') {
      if (saysMalicious) fp++; else tn++;
    }
    // edge_case samples are excluded from precision/recall/FPR.
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
  const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;

  return {
    precision: round(precision, 4),
    recall: round(recall, 4),
    f1: round(f1, 4),
    fpr: round(fpr, 4),
    categoryCoverage,
    kappaVsHMA: 0,
    categoryMetrics: categories,
  };
}

/**
 * Compute Cohen's Kappa agreement between two scanners.
 */
function computeCohensKappa(
  scanner1: Map<string, ScannerResult>,
  scanner2: Map<string, ScannerResult>,
  dataset: BenchmarkSample[],
): number {
  let agree = 0;
  let total = 0;
  let s1Mal = 0, s2Mal = 0;

  for (const sample of dataset) {
    const r1 = scanner1.get(sample.id);
    const r2 = scanner2.get(sample.id);
    if (!r1 || !r2) continue;

    total++;
    if (r1.verdict === r2.verdict) agree++;
    if (r1.verdict === 'malicious') s1Mal++;
    if (r2.verdict === 'malicious') s2Mal++;
  }

  if (total === 0) return 0;

  const po = agree / total; // observed agreement
  const p1 = s1Mal / total;
  const p2 = s2Mal / total;
  const pe = (p1 * p2) + ((1 - p1) * (1 - p2)); // expected agreement

  if (pe >= 1) return 1;
  return round((po - pe) / (1 - pe), 4);
}

/**
 * Determine benchmark tier from aggregate metrics.
 */
export function determineTier(metrics: AggregateMetrics): BenchmarkTier {
  const tiers: BenchmarkTier[] = ['platinum', 'gold', 'silver', 'listed'];

  for (const tier of tiers) {
    const thresholds = TIER_THRESHOLDS[tier];
    if (
      metrics.f1 >= thresholds.minF1 &&
      metrics.fpr <= thresholds.maxFPR &&
      metrics.categoryCoverage >= thresholds.minCategoryCoverage &&
      (!thresholds.minKappa || metrics.kappaVsHMA >= thresholds.minKappa)
    ) {
      return tier;
    }
  }

  return 'listed';
}

function round(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
