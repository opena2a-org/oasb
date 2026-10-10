/**
 * Pinned benchmark harness.
 *
 * One run scans the OASB v2 corpus (categorized set) with the three HMA
 * adapters and the loaded DVAA scenarios with the full pipeline, after
 * checking these inputs against a pin file:
 *
 *   - hackmyagent by npm version and tarball integrity
 *   - the DVAA checkout by commit
 *   - the NanoMind model directory by manifest sha256
 *
 * The OASB checkout (scoring code and corpus) must be committed and clean,
 * and the scanner's other model sources (a second classifier's files and a
 * NanoMind daemon) must be absent. The scanner must load its classifier model,
 * and the daemon address must answer no request while the run scans. An
 * unpinned, mismatched or dirty input stops the run before anything is
 * scanned. The scanner's dependencies are not checked; docs/pinned-benchmark.md
 * lists what a run verifies and what it does not. The run writes a new
 * `results/<date>-<runid>/` directory holding per-sample predictions, a
 * summary and a run record, and never writes to an existing file or
 * directory. Each prediction says what scored the sample: the classifier
 * model, the word list, the neural classifier or the daemon.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { join } from 'node:path';
import { DVAALoadError, loadDVAAScenarios, scanDVAAScenario, type DVAAScenarioOutcome } from '../dvaa-suite.js';
import {
  configureHmaRoot,
  configureTmeModel,
  hmaCorePath,
  HMAPipelineAdapter,
  HMAPipelineStaticAdapter,
  HMATMEOnlyAdapter,
  loadHMACore,
} from '../hma-pipeline-adapter.js';
import type { ScannerAdapter } from '../runner.js';
import { ATTACK_CATEGORIES, type BenchmarkDataset, type BenchmarkSample, type ScannerResult } from '../types.js';
import {
  defaultOtherModelSources,
  SECOND_CLASSIFIER_FILES,
  verifyCorpus,
  verifyDvaa,
  verifyDvaaFiles,
  verifyHackmyagent,
  verifyLoadedModel,
  verifyNanomind,
  verifyNoOtherModelSources,
  type NanomindManifest,
  type OtherModelSources,
  type VerifiedHackmyagent,
} from './inputs.js';
import { addUse, NanomindTrace, noUse, type NanomindUse } from './nanomind-use.js';
import { loadPins, PinError, type BenchmarkPins } from './pins.js';

/** An input changed while the run was scanning. Nothing was written. */
export class InputDriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputDriftError';
  }
}

/** The run directory or one of its files already exists. Nothing was overwritten. */
export class ResultsExistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResultsExistError';
  }
}

export interface PinnedRunOptions {
  pinsPath: string;
  /** Directory holding hackmyagent-<version>.tgz and node_modules/hackmyagent. */
  hmaDir: string;
  /** damn-vulnerable-ai-agent checkout. */
  dvaaDir: string;
  /**
   * The NanoMind model directory that is checked against the pin. The run is
   * refused when the scanner's classifier reports a file outside it.
   */
  nanomindModelsDir: string;
  /**
   * The scanner's other model sources; the run is refused while one is
   * present. Default: ~/.opena2a/nanomind/models and 127.0.0.1:47200. The
   * second classifier's directories beside the installed hackmyagent are
   * checked as well.
   */
  otherModelSources?: OtherModelSources;
  /** OASB checkout holding corpus/v2.json; results go to <oasbRoot>/results. */
  oasbRoot: string;
  /** Fixed run id, for tests. Default: 8 random hex characters. */
  runId?: string;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface PinnedRunOutcome {
  /** Run directory relative to the OASB checkout, e.g. results/2026-10-10-1a2b3c4d. */
  runDirectory: string;
  record: PinnedRunRecord;
  summary: PinnedRunSummary;
}

/**
 * v2 adds what scored each sample: `nanomind` on every prediction line,
 * `nanomindUse` in the summary and run totals in the record. A v1 run does
 * not say whether its classifier ran the model or the word list.
 */
export const RECORD_SCHEMA = 'oasb-pinned-run/v2';
export const RECORD_SCHEMA_V1 = 'oasb-pinned-run/v1';

export interface PinnedRunRecord {
  schema: typeof RECORD_SCHEMA | typeof RECORD_SCHEMA_V1;
  runId: string;
  startedAt: string;
  finishedAt: string;
  oasb: { commit: string; corpus: { path: string; sha256: string; datasetVersion: string; samplesScanned: number } };
  hackmyagent: Omit<VerifiedHackmyagent, 'packageDir'>;
  dvaa: { commit: string; scenarios: number; filesVerified: number };
  nanomind: NanomindManifest;
  /** How the scanner's unpinned model sources were kept out of the run. */
  otherModelSources: {
    handling: 'refused-when-present';
    checked: 'before-and-after-scan';
    secondClassifierFiles: string[];
    daemon: string;
  };
  /**
   * What scored samples over the whole run (v2). `daemonAnswers` is 0 in
   * every written run: a run in which the daemon address answered is not written.
   */
  nanomindUse?: NanomindUse;
  runtime: { node: string; platform: string; arch: string };
  outputs: { corpusPredictions: string; dvaaPredictions: string; summary: string };
}

interface DetectionCount {
  total: number;
  detected: number;
  recall: number;
}

export interface PinnedRunSummary {
  runId: string;
  note: string;
  corpus: {
    datasetVersion: string;
    samplesScanned: number;
    maliciousSamples: number;
    adapters: Record<string, {
      name: string;
      version: string;
      malicious: DetectionCount;
      unknownVerdicts: number;
      perCategory: Record<string, DetectionCount>;
    }>;
    /** Full-pipeline detection over the DVAA-sourced corpus samples. */
    dvaaSourcedSamples: DetectionCount | null;
  };
  dvaaRepository: DetectionCount & { perCategory: Record<string, DetectionCount> };
  /** What scored the samples (v2), summed from the predictions files. */
  nanomindUse?: {
    corpus: Record<string, NanomindUse & { samplesWithWordListScoring: number }>;
    dvaaRepository: NanomindUse & { scenariosWithWordListScoring: number };
  };
}

export const SUMMARY_NOTE =
  'Detection over the malicious class only. F1, precision, false-positive rate and flag rate are not ' +
  'computed: most benign corpus samples were labeled by the scanner under test, so any metric that reads ' +
  'the benign class is circular. The corpus set is the categorized set (malicious samples without an ' +
  'attack category are left out); predictions for every scanned sample, benign included, are in ' +
  'corpus-predictions.jsonl. A malicious sample is detected when the adapter returns a malicious verdict; ' +
  'an unknown verdict counts as not detected. This is a pinned measurement: earlier figures came from ' +
  'unpinned runs on unrecorded inputs, so they are not a baseline for it and a difference from them is not ' +
  'a regression.';

const BATCH_SIZE = 100;

function round(n: number, d = 4): number {
  return Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
}

function count(total: number, detected: number): DetectionCount {
  return { total, detected, recall: total > 0 ? round(detected / total) : 0 };
}

interface AllInputs {
  pins: BenchmarkPins;
  corpus: ReturnType<typeof verifyCorpus>;
  hma: VerifiedHackmyagent;
  nanomind: NanomindManifest;
  dvaaCommit: string;
  dvaaObjectFormat: 'sha1' | 'sha256';
}

function verifyAll(opts: PinnedRunOptions): AllInputs {
  const pins = loadPins(opts.pinsPath);
  const corpus = verifyCorpus(opts.oasbRoot, undefined, [opts.pinsPath, opts.hmaDir]);
  const hma = verifyHackmyagent(opts.hmaDir, pins.hackmyagent);
  const nanomind = verifyNanomind(opts.nanomindModelsDir, pins.nanomind);
  const dvaa = verifyDvaa(opts.dvaaDir, pins.dvaa);
  return { pins, corpus, hma, nanomind, dvaaCommit: dvaa.commit, dvaaObjectFormat: dvaa.objectFormat };
}

function categorized(dataset: BenchmarkDataset): BenchmarkSample[] {
  return dataset.samples.filter(s => s.label !== 'malicious' || s.category);
}

async function scanCorpus(
  adapter: ScannerAdapter,
  samples: BenchmarkSample[],
  trace: NanomindTrace,
): Promise<Array<{ result: ScannerResult; use: NanomindUse }>> {
  const results: Array<{ result: ScannerResult; use: NanomindUse }> = [];
  for (let i = 0; i < samples.length; i += BATCH_SIZE) {
    const batch = samples.slice(i, i + BATCH_SIZE);
    results.push(...(await Promise.all(batch.map(s => trace.track(() => adapter.scan(s.content, s.id, s.artifactType))))));
  }
  return results;
}

function withWordListCount<K extends string>(
  uses: NanomindUse[],
  key: K,
): NanomindUse & Record<K, number> {
  const total = uses.reduce((sum, u) => addUse(sum, u), noUse());
  return { ...total, [key]: uses.filter(u => u.wordListScorings > 0).length } as NanomindUse & Record<K, number>;
}

/** Create `path` holding `text`; throws ResultsExistError when it exists. */
export function writeNew(path: string, text: string): void {
  try {
    writeFileSync(path, text, { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new ResultsExistError(`${path} already exists; results are never overwritten`);
    }
    throw err;
  }
}

export async function runPinnedBenchmark(opts: PinnedRunOptions): Promise<PinnedRunOutcome> {
  const log = opts.log ?? (() => {});
  const now = opts.now ?? (() => new Date());
  const started = now();

  // 1. Every input is pinned, matches its pin and is clean. Nothing is scanned
  //    and nothing is written until all of these pass.
  const inputs = verifyAll(opts);
  const otherModelSources = opts.otherModelSources ?? defaultOtherModelSources();
  await verifyNoOtherModelSources(otherModelSources, inputs.hma.packageDir);
  let loaded: ReturnType<typeof loadDVAAScenarios>;
  try {
    loaded = loadDVAAScenarios(opts.dvaaDir, inputs.dvaaObjectFormat);
  } catch (err) {
    if (err instanceof DVAALoadError) {
      throw new PinError(`unusable input: ${err.message} at the pinned commit ${inputs.dvaaCommit}`);
    }
    throw err;
  }
  const { scenarios, readFiles } = loaded;
  verifyDvaaFiles(opts.dvaaDir, inputs.dvaaCommit, readFiles);

  const runId = opts.runId ?? randomBytes(4).toString('hex');
  if (!/^[0-9a-z]+(-[0-9a-z]+)*$/.test(runId)) {
    throw new PinError(`run id "${runId}" may hold only lowercase letters, digits and single hyphens`);
  }
  const dirName = `${started.toISOString().slice(0, 10)}-${runId}`;
  const resultsRoot = join(opts.oasbRoot, 'results');
  const runDir = join(resultsRoot, dirName);
  if (existsSync(runDir)) {
    throw new ResultsExistError(`results/${dirName} already exists; results are never overwritten`);
  }

  let dataset: BenchmarkDataset;
  try {
    dataset = JSON.parse(inputs.corpus.corpusText);
  } catch {
    throw new PinError(`${inputs.corpus.corpusPath} is not valid JSON`);
  }
  const samples = categorized(dataset);

  configureHmaRoot(inputs.hma.packageDir);
  // The adapters name the model of the verified directory, not of ~/.nanomind/models.
  configureTmeModel(inputs.nanomind);
  if (!(await loadHMACore())) {
    throw new Error(`hackmyagent ${inputs.hma.version} is installed but its nanomind-core entry point did not load`);
  }
  // The scanner chooses where it loads its classifier model from, and it
  // looks in other places before the verified directory. getTMEClassifier()
  // returns one shared instance, the one the model-only adapter scans with.
  const core = await import(hmaCorePath());
  const tme = core.getTMEClassifier();
  verifyLoadedModel(tme, opts.nanomindModelsDir, inputs.nanomind);
  // The classifier model must load, or every sample would be scored by the
  // word list. From here the trace counts what scores each sample, including
  // the requests the scanner sends to the daemon address checked above.
  const { host: daemonHost, port: daemonPort } = otherModelSources.daemon;
  const trace = await NanomindTrace.start(core, {
    version: inputs.hma.version,
    packageDir: inputs.hma.packageDir,
    daemonUrl: `http://${daemonHost.includes(':') ? `[${daemonHost}]` : daemonHost}:${daemonPort}`,
  });

  const corpusLines: string[] = [];
  const adapterSummaries: PinnedRunSummary['corpus']['adapters'] = {};
  const corpusUse: NonNullable<PinnedRunSummary['nanomindUse']>['corpus'] = {};
  let dvaaSourcedSamples: DetectionCount | null = null;
  const outcomes: Array<DVAAScenarioOutcome & { use: NanomindUse }> = [];
  let nanomindUse: NanomindUse;
  try {
    // 2. Corpus: the three adapters, in the order the v2 runner uses.
    log(`corpus: ${samples.length} samples, hackmyagent ${inputs.hma.version}`);
    const adapters: ScannerAdapter[] = [new HMAPipelineStaticAdapter(), new HMATMEOnlyAdapter(), new HMAPipelineAdapter()];
    for (const adapter of adapters) {
      const results = await scanCorpus(adapter, samples, trace);
      const byId = new Map(results.map(r => [r.result.sampleId, r]));
      const perCategory: Record<string, { total: number; detected: number }> = {};
      for (const cat of ATTACK_CATEGORIES) perCategory[cat] = { total: 0, detected: 0 };
      let maliciousTotal = 0;
      let maliciousDetected = 0;
      let unknown = 0;
      const uses: NanomindUse[] = [];
      for (const sample of samples) {
        const scan = byId.get(sample.id);
        const r = scan?.result;
        const verdict = r?.verdict ?? 'unknown';
        if (verdict === 'unknown') unknown++;
        const use = scan?.use ?? noUse();
        uses.push(use);
        corpusLines.push(JSON.stringify({
          adapterId: adapter.id,
          sampleId: sample.id,
          label: sample.label,
          category: sample.category ?? null,
          source: sample.source,
          artifactType: sample.artifactType,
          verdict,
          predictedCategory: r?.category ?? null,
          confidence: r?.confidence ?? null,
          nanomind: use,
        }));
        if (sample.label === 'malicious' && sample.category) {
          maliciousTotal++;
          perCategory[sample.category].total++;
          if (verdict === 'malicious') {
            maliciousDetected++;
            perCategory[sample.category].detected++;
          }
        }
      }
      adapterSummaries[adapter.id] = {
        name: adapter.name,
        version: adapter.version,
        malicious: count(maliciousTotal, maliciousDetected),
        unknownVerdicts: unknown,
        perCategory: Object.fromEntries(
          Object.entries(perCategory).filter(([, c]) => c.total > 0).map(([cat, c]) => [cat, count(c.total, c.detected)]),
        ),
      };
      corpusUse[adapter.id] = withWordListCount(uses, 'samplesWithWordListScoring');
      if (adapter.id === 'hma-pipeline') {
        const dvaaSamples = samples.filter(s => s.source === 'dvaa' && s.label === 'malicious' && s.category);
        dvaaSourcedSamples = count(
          dvaaSamples.length,
          dvaaSamples.filter(s => byId.get(s.id)?.result.verdict === 'malicious').length,
        );
      }
      log(`  ${adapter.id}: ${maliciousDetected}/${maliciousTotal} malicious detected`);
    }

    // 3. DVAA repository: every scenario, full pipeline.
    log(`dvaa: ${scenarios.length} scenarios at ${inputs.dvaaCommit}`);
    const compiler = new core.SemanticCompiler({ useNanoMind: true });
    await tme.ensureModel();
    await tme.ensureReady();
    for (const scenario of scenarios) {
      const { result, use } = await trace.track(() => scanDVAAScenario(core, compiler, tme, scenario));
      outcomes.push({ ...result, use });
    }
    log(`  dvaa: ${outcomes.filter(o => o.result.detected).length}/${outcomes.length} scenarios detected`);

    // 4. The inputs are still the pinned ones. A scanner that fetched a model,
    //    switched to another model file or changed its own install during the
    //    run invalidates the run, and so does another model source that
    //    appeared during it or a daemon that answered while the run scanned.
    try {
      verifyHackmyagent(opts.hmaDir, inputs.pins.hackmyagent);
      verifyLoadedModel(tme, opts.nanomindModelsDir, verifyNanomind(opts.nanomindModelsDir, inputs.pins.nanomind));
      verifyDvaa(opts.dvaaDir, inputs.pins.dvaa);
      await verifyNoOtherModelSources(otherModelSources, inputs.hma.packageDir);
      trace.check();
    } catch (err) {
      if (err instanceof PinError) {
        throw new InputDriftError(`an input changed during the run, so no results were written: ${err.message}`);
      }
      throw err;
    }
    nanomindUse = trace.totals();
  } finally {
    trace.stop();
  }

  const dvaaPerCategory: Record<string, { total: number; detected: number }> = {};
  for (const { result } of outcomes) {
    const c = (dvaaPerCategory[result.category] ??= { total: 0, detected: 0 });
    c.total++;
    if (result.detected) c.detected++;
  }
  const dvaaDetected = outcomes.filter(o => o.result.detected).length;

  const summary: PinnedRunSummary = {
    runId,
    note: SUMMARY_NOTE,
    corpus: {
      datasetVersion: dataset.version,
      samplesScanned: samples.length,
      maliciousSamples: samples.filter(s => s.label === 'malicious').length,
      adapters: adapterSummaries,
      dvaaSourcedSamples,
    },
    dvaaRepository: {
      ...count(outcomes.length, dvaaDetected),
      perCategory: Object.fromEntries(
        Object.entries(dvaaPerCategory)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([cat, c]) => [cat, count(c.total, c.detected)]),
      ),
    },
    nanomindUse: {
      corpus: corpusUse,
      dvaaRepository: withWordListCount(outcomes.map(o => o.use), 'scenariosWithWordListScoring'),
    },
  };

  const outputs = {
    corpusPredictions: 'corpus-predictions.jsonl',
    dvaaPredictions: 'dvaa-predictions.jsonl',
    summary: 'summary.json',
  };
  const { packageDir: _packageDir, ...hackmyagent } = inputs.hma;
  const record: PinnedRunRecord = {
    schema: RECORD_SCHEMA,
    runId,
    startedAt: started.toISOString(),
    finishedAt: now().toISOString(),
    oasb: {
      commit: inputs.corpus.oasbCommit,
      corpus: {
        path: inputs.corpus.corpusPath,
        sha256: inputs.corpus.corpusSha256,
        datasetVersion: dataset.version,
        samplesScanned: samples.length,
      },
    },
    hackmyagent,
    dvaa: { commit: inputs.dvaaCommit, scenarios: scenarios.length, filesVerified: readFiles.length },
    nanomind: inputs.nanomind,
    otherModelSources: {
      handling: 'refused-when-present',
      checked: 'before-and-after-scan',
      secondClassifierFiles: [...SECOND_CLASSIFIER_FILES],
      daemon: `${otherModelSources.daemon.host}:${otherModelSources.daemon.port}`,
    },
    nanomindUse,
    runtime: { node: process.version, platform: platform(), arch: arch() },
    outputs,
  };

  // 5. Write a new directory. mkdir without `recursive` fails when the
  //    directory exists, and every file is opened with the exclusive flag.
  mkdirSync(resultsRoot, { recursive: true });
  try {
    mkdirSync(runDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new ResultsExistError(`results/${dirName} already exists; results are never overwritten`);
    }
    throw err;
  }
  const dvaaLines = outcomes.map(({ result, files, use }) => JSON.stringify({
    scenario: result.scenario,
    category: result.category,
    expectedChecks: result.expectedChecks,
    detected: result.detected,
    attackFindings: result.attackFindings,
    files,
    nanomind: use,
  }));
  writeNew(join(runDir, outputs.corpusPredictions), corpusLines.join('\n') + '\n');
  writeNew(join(runDir, outputs.dvaaPredictions), dvaaLines.join('\n') + (dvaaLines.length ? '\n' : ''));
  writeNew(join(runDir, outputs.summary), JSON.stringify(summary, null, 2) + '\n');
  // The record goes last: a directory with record.json is a complete run.
  writeNew(join(runDir, 'record.json'), JSON.stringify(record, null, 2) + '\n');

  return { runDirectory: `results/${dirName}`, record, summary };
}
