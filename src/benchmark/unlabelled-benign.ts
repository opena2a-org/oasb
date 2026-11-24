/**
 * Scoring on the unlabelled benign set.
 *
 * Most benign samples in corpus/v2.json were labeled by the scanner under test:
 * scripts/export-registry-corpus.mjs kept a registry artifact as benign when
 * HackMyAgent's own scan gave it `verdict === 'warning'` and a score of 70 or
 * more, and recorded that verdict in `metadata.scanVerdict`. Any metric that
 * reads those samples is a labeling artifact. The remaining benign samples
 * (BEN-001 to BEN-177) are hand-authored fixtures with no scanner verdict.
 *
 * The unlabelled benign set is the categorized malicious class (270 fixtures)
 * and those benign samples no scanner labeled. Precision, F1, false-positive
 * rate, flag rate and tier are computed on it with the scoring engine
 * (scoreSubmission), for every scanner, from predictions a run already made:
 * nothing is rescanned. Edge cases are left out, as everywhere else.
 */

import { scoreSubmission } from './scoring.js';
import type { BenchmarkSample, BenchmarkTier, ScannerResult } from './types.js';

/** Whether a scanner's verdict labeled this sample (the registry export records it as `metadata.scanVerdict`). */
export function hasScannerVerdict(sample: BenchmarkSample): boolean {
  const verdict = sample.metadata?.scanVerdict;
  return verdict !== undefined && verdict !== null;
}

/** The categorized malicious samples and the benign samples no scanner labeled. */
export function unlabelledBenignSet(samples: BenchmarkSample[]): BenchmarkSample[] {
  return samples.filter(
    (s) => (s.label === 'malicious' && s.category !== undefined) || (s.label === 'benign' && !hasScannerVerdict(s)),
  );
}

/** One scanner's figures on the unlabelled benign set. Rates are fractions rounded to four places. */
export interface UnlabelledBenignScore {
  adapterId: string;
  maliciousTotal: number;
  detected: number;
  benignTotal: number;
  falsePositives: number;
  precision: number;
  recall: number;
  f1: number;
  fpr: number;
  /** Samples flagged malicious over every sample in the set, as the development runner defines it. */
  flagRate: number;
  categoryCoverage: number;
  kappaVsBaseline: number;
  tier: BenchmarkTier;
}

/** A prediction as a run records it (a line of corpus-predictions.jsonl). */
export interface RecordedPrediction {
  adapterId: string;
  sampleId: string;
  verdict: ScannerResult['verdict'];
  predictedCategory?: ScannerResult['category'] | null;
}

/**
 * Score each scanner on the unlabelled benign set. `baselineId` names the
 * HackMyAgent reference scanner, against which the others' Cohen's kappa is
 * computed (the platinum tier gate); its own kappa is 1. Scanners are
 * returned in the order they first appear in `predictions`.
 */
export function scoreUnlabelledBenign(
  samples: BenchmarkSample[],
  predictions: RecordedPrediction[],
  baselineId: string,
): UnlabelledBenignScore[] {
  const set = unlabelledBenignSet(samples);
  const ids = new Set(set.map((s) => s.id));
  const byAdapter = new Map<string, ScannerResult[]>();
  for (const p of predictions) {
    if (!byAdapter.has(p.adapterId)) byAdapter.set(p.adapterId, []);
    if (!ids.has(p.sampleId)) continue;
    byAdapter.get(p.adapterId)!.push({
      sampleId: p.sampleId,
      verdict: p.verdict,
      ...(p.predictedCategory ? { category: p.predictedCategory } : {}),
    });
  }
  const baselineResults = byAdapter.get(baselineId);
  if (!baselineResults) throw new Error(`no predictions for the baseline scanner ${baselineId}`);

  const submission = (adapterId: string, results: ScannerResult[]) => ({
    scannerId: adapterId,
    scannerName: adapterId,
    scannerVersion: '',
    submittedAt: '',
    datasetVersion: '',
    results,
  });
  const baseline = submission(baselineId, baselineResults);
  const maliciousTotal = set.filter((s) => s.label === 'malicious').length;
  const benignTotal = set.length - maliciousTotal;
  const label = new Map(set.map((s) => [s.id, s.label]));

  return [...byAdapter].map(([adapterId, results]) => {
    const entry = scoreSubmission(submission(adapterId, results), set, baseline, adapterId === baselineId);
    let detected = 0;
    let falsePositives = 0;
    for (const r of results) {
      if (r.verdict !== 'malicious') continue;
      if (label.get(r.sampleId) === 'malicious') detected++;
      else falsePositives++;
    }
    return {
      adapterId,
      maliciousTotal,
      detected,
      benignTotal,
      falsePositives,
      precision: entry.metrics.precision,
      recall: entry.metrics.recall,
      f1: entry.metrics.f1,
      fpr: entry.metrics.fpr,
      flagRate: Math.round(((detected + falsePositives) / set.length) * 1e4) / 1e4,
      categoryCoverage: entry.metrics.categoryCoverage,
      kappaVsBaseline: entry.metrics.kappaVsHMA,
      tier: entry.tier,
    };
  });
}
