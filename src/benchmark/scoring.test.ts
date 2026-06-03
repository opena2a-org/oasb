import { describe, it, expect } from 'vitest';
import { scoreSubmission, determineTier } from './scoring';
import { assessComplianceLevel } from './controls';
import type {
  BenchmarkSample,
  ScannerSubmission,
  AggregateMetrics,
} from './types';

// Helper: create a malicious sample
function malicious(id: string, category: string): BenchmarkSample {
  return {
    id,
    label: 'malicious',
    category: category as any,
    source: 'dvaa',
    version: 'v1.0',
    artifactType: 'skill',
    content: `malicious skill ${id}`,
  };
}

// Helper: create a benign sample
function benign(id: string): BenchmarkSample {
  return {
    id,
    label: 'benign',
    source: 'registry',
    version: 'v1.0',
    artifactType: 'skill',
    content: `benign skill ${id}`,
  };
}

describe('Benchmark Scoring Engine', () => {
  const dataset: BenchmarkSample[] = [
    malicious('m1', 'supply_chain'),
    malicious('m2', 'supply_chain'),
    malicious('m3', 'prompt_injection'),
    malicious('m4', 'credential_exfiltration'),
    benign('b1'),
    benign('b2'),
    benign('b3'),
  ];

  it('scores a perfect scanner as platinum', () => {
    const submission: ScannerSubmission = {
      scannerId: 'perfect-scanner',
      scannerName: 'Perfect Scanner',
      scannerVersion: '1.0',
      submittedAt: new Date().toISOString(),
      datasetVersion: 'v1.0',
      results: [
        { sampleId: 'm1', verdict: 'malicious', category: 'supply_chain' },
        { sampleId: 'm2', verdict: 'malicious', category: 'supply_chain' },
        { sampleId: 'm3', verdict: 'malicious', category: 'prompt_injection' },
        { sampleId: 'm4', verdict: 'malicious', category: 'credential_exfiltration' },
        { sampleId: 'b1', verdict: 'benign' },
        { sampleId: 'b2', verdict: 'benign' },
        { sampleId: 'b3', verdict: 'benign' },
      ],
    };

    const entry = scoreSubmission(submission, dataset);
    expect(entry.metrics.precision).toBe(1);
    expect(entry.metrics.recall).toBe(1);
    expect(entry.metrics.f1).toBe(1);
    expect(entry.metrics.fpr).toBe(0);
  });

  it('scores a scanner that misses everything as listed', () => {
    const submission: ScannerSubmission = {
      scannerId: 'blind-scanner',
      scannerName: 'Blind Scanner',
      scannerVersion: '1.0',
      submittedAt: new Date().toISOString(),
      datasetVersion: 'v1.0',
      results: [
        { sampleId: 'm1', verdict: 'benign' },
        { sampleId: 'm2', verdict: 'benign' },
        { sampleId: 'm3', verdict: 'benign' },
        { sampleId: 'm4', verdict: 'benign' },
        { sampleId: 'b1', verdict: 'benign' },
        { sampleId: 'b2', verdict: 'benign' },
        { sampleId: 'b3', verdict: 'benign' },
      ],
    };

    const entry = scoreSubmission(submission, dataset);
    expect(entry.metrics.recall).toBe(0);
    expect(entry.tier).toBe('listed');
  });

  it('penalizes high false positive rate', () => {
    const submission: ScannerSubmission = {
      scannerId: 'noisy-scanner',
      scannerName: 'Noisy Scanner',
      scannerVersion: '1.0',
      submittedAt: new Date().toISOString(),
      datasetVersion: 'v1.0',
      results: [
        { sampleId: 'm1', verdict: 'malicious', category: 'supply_chain' },
        { sampleId: 'm2', verdict: 'malicious', category: 'supply_chain' },
        { sampleId: 'm3', verdict: 'malicious', category: 'prompt_injection' },
        { sampleId: 'm4', verdict: 'malicious', category: 'credential_exfiltration' },
        // All benign flagged as malicious (false positives)
        { sampleId: 'b1', verdict: 'malicious', category: 'supply_chain' },
        { sampleId: 'b2', verdict: 'malicious', category: 'prompt_injection' },
        { sampleId: 'b3', verdict: 'malicious', category: 'credential_exfiltration' },
      ],
    };

    const entry = scoreSubmission(submission, dataset);
    expect(entry.metrics.recall).toBe(1); // catches everything
    expect(entry.metrics.fpr).toBeGreaterThan(0); // but lots of false positives
  });

  it('reports pooled FPR, not a per-category macro-average (regression)', () => {
    // A scanner that flags ALL benign samples as malicious has a true FPR of
    // 1.0. The old macro-averaged FPR diluted this across 9 categories to ~0.06,
    // which would have let an all-flagging scanner qualify for gold (maxFPR 0.10).
    const submission: ScannerSubmission = {
      scannerId: 'all-flagging-scanner',
      scannerName: 'All-Flagging Scanner',
      scannerVersion: '1.0',
      submittedAt: new Date().toISOString(),
      datasetVersion: 'v1.0',
      results: [
        { sampleId: 'm1', verdict: 'malicious', category: 'supply_chain' },
        { sampleId: 'm2', verdict: 'malicious', category: 'supply_chain' },
        { sampleId: 'm3', verdict: 'malicious', category: 'prompt_injection' },
        { sampleId: 'm4', verdict: 'malicious', category: 'credential_exfiltration' },
        { sampleId: 'b1', verdict: 'malicious', category: 'supply_chain' },
        { sampleId: 'b2', verdict: 'malicious', category: 'prompt_injection' },
        { sampleId: 'b3', verdict: 'malicious', category: 'credential_exfiltration' },
      ],
    };

    const entry = scoreSubmission(submission, dataset);
    expect(entry.metrics.fpr).toBe(1); // 3 of 3 benign flagged
    expect(entry.tier).not.toBe('gold');
    expect(entry.tier).not.toBe('platinum');
  });

  it('credits recall to a category-agnostic detector (regression)', () => {
    // A scanner that correctly says "malicious" but omits the optional category
    // must still get full recall credit. The old code required verdict AND
    // category to match, scoring a correct verdict with no category as a miss.
    const submission: ScannerSubmission = {
      scannerId: 'verdict-only-scanner',
      scannerName: 'Verdict-Only Scanner',
      scannerVersion: '1.0',
      submittedAt: new Date().toISOString(),
      datasetVersion: 'v1.0',
      results: [
        { sampleId: 'm1', verdict: 'malicious' },
        { sampleId: 'm2', verdict: 'malicious' },
        { sampleId: 'm3', verdict: 'malicious' },
        { sampleId: 'm4', verdict: 'malicious' },
        { sampleId: 'b1', verdict: 'benign' },
        { sampleId: 'b2', verdict: 'benign' },
        { sampleId: 'b3', verdict: 'benign' },
      ],
    };

    const entry = scoreSubmission(submission, dataset);
    expect(entry.metrics.recall).toBe(1);
    expect(entry.metrics.precision).toBe(1);
    expect(entry.metrics.fpr).toBe(0);
  });

  it('marks the HMA baseline and gives it self-kappa 1.0', () => {
    const submission: ScannerSubmission = {
      scannerId: 'hma-baseline',
      scannerName: 'HMA Baseline',
      scannerVersion: '1.0',
      submittedAt: new Date().toISOString(),
      datasetVersion: 'v1.0',
      results: dataset.map(s => ({
        sampleId: s.id,
        verdict: s.label === 'malicious' ? ('malicious' as const) : ('benign' as const),
        category: s.category,
      })),
    };

    const entry = scoreSubmission(submission, dataset, submission, true);
    expect(entry.isHMABaseline).toBe(true);
    expect(entry.metrics.kappaVsHMA).toBe(1);
  });

  it('handles missing scanner results gracefully', () => {
    const submission: ScannerSubmission = {
      scannerId: 'partial-scanner',
      scannerName: 'Partial Scanner',
      scannerVersion: '1.0',
      submittedAt: new Date().toISOString(),
      datasetVersion: 'v1.0',
      results: [
        // Only scanned some samples
        { sampleId: 'm1', verdict: 'malicious', category: 'supply_chain' },
        { sampleId: 'b1', verdict: 'benign' },
      ],
    };

    const entry = scoreSubmission(submission, dataset);
    expect(entry).toBeTruthy();
    expect(entry.metrics.categoryCoverage).toBeGreaterThanOrEqual(0);
  });
});

describe('Tier Determination', () => {
  it('assigns platinum for perfect metrics', () => {
    const metrics: AggregateMetrics = {
      precision: 0.95,
      recall: 0.95,
      f1: 0.95,
      fpr: 0.02,
      categoryCoverage: 9,
      kappaVsHMA: 0.90,
      categoryMetrics: [],
    };
    expect(determineTier(metrics)).toBe('platinum');
  });

  it('assigns gold for good metrics', () => {
    const metrics: AggregateMetrics = {
      precision: 0.85,
      recall: 0.85,
      f1: 0.85,
      fpr: 0.08,
      categoryCoverage: 8,
      kappaVsHMA: 0.75,
      categoryMetrics: [],
    };
    expect(determineTier(metrics)).toBe('gold');
  });

  it('assigns silver for moderate metrics', () => {
    const metrics: AggregateMetrics = {
      precision: 0.70,
      recall: 0.70,
      f1: 0.70,
      fpr: 0.15,
      categoryCoverage: 6,
      kappaVsHMA: 0.5,
      categoryMetrics: [],
    };
    expect(determineTier(metrics)).toBe('silver');
  });

  it('assigns listed for poor metrics', () => {
    const metrics: AggregateMetrics = {
      precision: 0.30,
      recall: 0.30,
      f1: 0.30,
      fpr: 0.30,
      categoryCoverage: 3,
      kappaVsHMA: 0.2,
      categoryMetrics: [],
    };
    expect(determineTier(metrics)).toBe('listed');
  });
});

describe('Compliance Level Assessment', () => {
  it('returns none when no controls pass', () => {
    expect(assessComplianceLevel([])).toBe('none');
  });

  it('returns L1 when basic controls pass', () => {
    expect(assessComplianceLevel(['SS-01', 'SS-03', 'SS-04', 'SS-06', 'SEC-021'])).toBe('L1');
  });

  it('returns L2 when standard controls pass', () => {
    expect(assessComplianceLevel([
      'SS-01', 'SS-02', 'SS-03', 'SS-04', 'SS-05', 'SS-06', 'SS-07', 'SS-08', 'SEC-021',
    ])).toBe('L2');
  });

  it('returns L3 when all controls pass', () => {
    expect(assessComplianceLevel([
      'SS-01', 'SS-02', 'SS-03', 'SS-04', 'SS-05', 'SS-06', 'SS-07', 'SS-08', 'SS-09', 'SS-10', 'SEC-021',
    ])).toBe('L3');
  });

  it('returns L1 when only some L2 controls pass', () => {
    expect(assessComplianceLevel(['SS-01', 'SS-02', 'SS-03', 'SS-04', 'SS-06', 'SEC-021'])).toBe('L1');
  });

  it('returns none when SEC-021 is missing even if all SS controls pass', () => {
    expect(assessComplianceLevel([
      'SS-01', 'SS-03', 'SS-04', 'SS-06',
    ])).toBe('none');
  });
});
