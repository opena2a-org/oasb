// A vitest global setup (vitest.config.ts) that records the adapter a run
// selected beside the run's JSON report, so that npm run report
// (scripts/generate-report.ts) names the product the results were produced
// with: test-results.adapter.json beside test-results.json holds the
// OASB_ADAPTER value (arp when it is unset) and the product, version and
// capabilities its getCapabilities() declares.
//
// The record is written at teardown, after vitest has written the report,
// and only when this run wrote the report: a report an earlier run left, or
// a run that printed its report to stdout, gets no record from this one.

import { resolve } from 'node:path';
import { fileDigest, writeAdapterRecord } from './scenario-report.mjs';

/**
 * The file the json reporter of a resolved vitest config writes, or null
 * when the json reporter is not in use or prints to stdout.
 */
export function jsonReportPath(config) {
  for (const entry of config.reporters ?? []) {
    const [name, options] = Array.isArray(entry) ? entry : [entry, {}];
    if (name !== 'json') continue;
    const outputFile = options?.outputFile ?? (typeof config.outputFile === 'string' ? config.outputFile : config.outputFile?.json);
    return outputFile ? resolve(config.root, outputFile) : null;
  }
  return null;
}

/** The adapter OASB_ADAPTER selects, as the record holds it. */
async function describeAdapter() {
  const adapter = process.env.OASB_ADAPTER || 'arp';
  try {
    const { createAdapter } = await import('../src/harness/create-adapter.ts');
    const { product, version, capabilities } = createAdapter().getCapabilities();
    return { adapter, product, version, capabilities: [...capabilities].sort() };
  } catch (err) {
    return { adapter, error: err?.message ?? String(err) };
  }
}

/**
 * A teardown that writes the adapter record of the report at `resultsPath`
 * when the report differs from the one there when the teardown was made.
 * `describe` gives the record's adapter fields.
 */
export function adapterRecorder(resultsPath, describe = describeAdapter) {
  const before = fileDigest(resultsPath);
  return async () => {
    const after = fileDigest(resultsPath);
    if (after === null || after === before) return;
    try {
      writeAdapterRecord(resultsPath, await describe());
    } catch (err) {
      // The record names the product in the report; a run does not fail without it.
      console.warn(`The adapter record of ${resultsPath} was not written: ${err?.message ?? err}`);
    }
  };
}

export default function setup(project) {
  const resultsPath = jsonReportPath(project.vitest.config);
  return resultsPath === null ? undefined : adapterRecorder(resultsPath);
}
