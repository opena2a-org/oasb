// What the unpinned development runner (scripts/run-benchmark-v2.ts) prints
// for each adapter and in its comparison summary. Recall reads the malicious
// class. Most benign samples were labeled by the scanner's own verdict (see
// scripts/export-registry-corpus.mjs), so precision, F1, FPR, flag rate and
// tier are printed on the unlabelled benign set only: the benign samples no
// scanner labeled (src/benchmark/unlabelled-benign.ts). The values over the
// whole benign class are not printed; the results file the runner writes with
// --out keeps every value.

export const UNLABELLED_NOTE =
  'Precision, F1, FPR, flag rate and tier read only the benign samples no scanner labeled; ' +
  "benign samples the scanner's own verdict labeled are not scored.";

/** A fraction as a percentage with one decimal, right-aligned to `width` characters. */
export function percent(fraction, width = 6) {
  return `${(fraction * 100).toFixed(1)}%`.padStart(width);
}

/**
 * The lines printed after an adapter's run. `d` holds the run's counts:
 * totalSamples, totalMalicious, totalBenign, truePositives, falseNegatives,
 * recall, avgScanTimeMs and unlabelledBenign, the adapter's score on the
 * unlabelled benign set (benignTotal, falsePositives, precision, f1, fpr,
 * flagRate, tier).
 */
export function adapterLines(d) {
  const u = d.unlabelledBenign;
  const lines = [
    `Samples: ${d.totalSamples} (${d.totalMalicious} malicious, ${d.totalBenign} benign)`,
    `Malicious detected: ${d.truePositives} of ${d.truePositives + d.falseNegatives} (missed: ${d.falseNegatives})`,
    `Recall: ${percent(d.recall, 0)}`,
    `Unlabelled benign set: ${u.benignTotal} benign no scanner labeled, ${u.falsePositives} flagged`,
    `Precision: ${percent(u.precision, 0)}  F1: ${percent(u.f1, 0)}  FPR: ${percent(u.fpr, 0)}  ` +
      `Flag rate: ${percent(u.flagRate, 0)}  Tier: ${u.tier}`,
    UNLABELLED_NOTE,
  ];
  if (d.avgScanTimeMs > 0) lines.push(`Avg scan time: ${d.avgScanTimeMs.toFixed(1)}ms`);
  return lines;
}

/** The comparison summary rows of several adapter runs, highest recall first. */
export function comparisonLines(runs) {
  const header = `${'Scanner'.padEnd(42)} | Recall | Detected     | Precision |     F1 |    FPR | Flag rate | Tier`;
  const rows = [...runs]
    .sort((a, b) => b.recall - a.recall)
    .map((d) => {
      const u = d.unlabelledBenign;
      return (
        `${d.adapterName.padEnd(42)} | ${percent(d.recall)} | ${`${d.truePositives} of ${d.truePositives + d.falseNegatives}`.padEnd(12)} | ` +
        `${percent(u.precision, 9)} | ${percent(u.f1)} | ${percent(u.fpr)} | ${percent(u.flagRate, 9)} | ${u.tier}`
      );
    });
  const width = Math.max(header.length, ...rows.map((row) => row.length));
  return [header, '-'.repeat(width), ...rows, '', UNLABELLED_NOTE];
}
