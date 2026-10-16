// What the unpinned development runner (scripts/run-benchmark-v2.ts) prints
// for each adapter and in its comparison summary. It prints measures of the
// malicious class only. Most benign samples were labeled by the scanner's own
// verdict (see scripts/export-registry-corpus.mjs), so precision, F1, FPR and
// flag rate, which read the benign class, are circular: they are named as
// withdrawn and their values are not printed. The results file the runner
// writes with --out keeps every value.

export const WITHDRAWN_NOTE =
  'Withdrawn: precision, F1, FPR and flag rate. Each reads the benign class, most of which ' +
  "the scanner's own verdict labeled, so it is circular and its value is not printed.";

/** A fraction as a percentage with one decimal, right-aligned to `width` characters. */
export function percent(fraction, width = 6) {
  return `${(fraction * 100).toFixed(1)}%`.padStart(width);
}

/**
 * The lines printed after an adapter's run. `d` holds the run's counts:
 * totalSamples, totalMalicious, totalBenign, truePositives, falseNegatives,
 * recall and avgScanTimeMs.
 */
export function adapterLines(d) {
  const lines = [
    `Samples: ${d.totalSamples} (${d.totalMalicious} malicious, ${d.totalBenign} benign)`,
    `Malicious detected: ${d.truePositives} of ${d.truePositives + d.falseNegatives} (missed: ${d.falseNegatives})`,
    `Recall: ${percent(d.recall, 0)}`,
    WITHDRAWN_NOTE,
  ];
  if (d.avgScanTimeMs > 0) lines.push(`Avg scan time: ${d.avgScanTimeMs.toFixed(1)}ms`);
  return lines;
}

/** The comparison summary rows of several adapter runs, highest recall first. */
export function comparisonLines(runs) {
  const header = `${'Scanner'.padEnd(42)} | Recall | Detected`;
  const rows = [...runs]
    .sort((a, b) => b.recall - a.recall)
    .map(
      (d) =>
        `${d.adapterName.padEnd(42)} | ${percent(d.recall)} | ${d.truePositives} of ${d.truePositives + d.falseNegatives}`,
    );
  const width = Math.max(header.length, ...rows.map((row) => row.length));
  return [header, '-'.repeat(width), ...rows, '', WITHDRAWN_NOTE];
}
