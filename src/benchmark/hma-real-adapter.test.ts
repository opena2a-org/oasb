/**
 * The deprecated AST adapter calls the analyzers on the route the shipped
 * scanner takes: each of analyzeCredentials, analyzeGovernance, analyzeScope
 * and analyzePrompt is given the sample content, as HMAPipelineAdapter gives
 * it. Without the content those analyzers decide from the AST alone, which the
 * scanner never does.
 *
 * Both adapters scan one corpus sample on a stand-in package with the
 * nanomind-core API. MAL-EXFIL-006 is a skill, the artifact type both adapters
 * compile under the same file name, and its credential rows depend on the
 * content on the shipped analyzers: hackmyagent 0.33.2 reports AST-CRED-003
 * for it without the content and no credential row with it.
 *
 * Once configureHmaRoot() names another root, an adapter that has scanned
 * before compiles on the SemanticCompiler of that root, the build its
 * analyzers then come from, and the model-only adapter classifies on that
 * root's classifier. On one root an adapter builds its SemanticCompiler once.
 *
 * The AST adapter and the full adapter built on it report the version of the
 * hackmyagent build they load, read from that root's package.json, as the
 * pipeline adapter does, not a fixed version string. Each scan reads it from
 * the root configured then, so an adapter that scans after a root change
 * reports the version of the root that scan loaded.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ScannerAdapter } from './runner.js';
import type { BenchmarkDataset, BenchmarkSample } from './types.js';

const OASB_ROOT = resolve(__dirname, '..', '..');
const SAMPLE_ID = 'MAL-EXFIL-006';

/** One analyzer call as the stand-in records it. */
interface AnalyzerCall {
  analyzer: string;
  /** The arguments after the AST and the verifier. */
  extraArgs: unknown[];
  rows: Array<{ checkId: string; contentSha256?: string }>;
}

/** What a stand-in recorded during one scan. */
interface Recorded {
  compiledAs: string[];
  /** The build of the stand-in whose SemanticCompiler compiled each file. */
  compiledBy: string[];
  /** The build of each stand-in SemanticCompiler that was constructed. */
  constructed: string[];
  /** The build of the stand-in whose classifier classified each sample. */
  classifiedBy: string[];
  calls: AnalyzerCall[];
}

// Each analyzer's rows say which route it took: a row that names the sha256 of
// the content it was given, or a no-content row when it was given none. The
// content is read at its position in the published signature of that analyzer.
// `build` starts each check id, so a row names the stand-in that returned it.
const standInCore = (build: string): string => `'use strict';
const { createHash } = require('crypto');
const g = globalThis;
g.__oasbAstAdapterCompiles = [];
g.__oasbAstAdapterCompilers = [];
g.__oasbAstAdapterConstructed = [];
g.__oasbAstAdapterClassifiers = [];
g.__oasbAstAdapterCalls = [];
class SemanticCompiler {
  constructor() {
    g.__oasbAstAdapterConstructed.push('${build}');
  }
  async compile(content, filename) {
    g.__oasbAstAdapterCompiles.push(filename);
    g.__oasbAstAdapterCompilers.push('${build}');
    return { ast: { intentClassification: 'benign', intentConfidence: 0.5, inferredRiskSurface: [] } };
  }
  verifyAST() { return true; }
}
function analyzer(name, checkId, contentAt) {
  return function (...args) {
    const content = args[contentAt];
    const row = typeof content === 'string'
      ? { checkId, contentSha256: createHash('sha256').update(content).digest('hex') }
      : { checkId: checkId + '-NO-CONTENT' };
    const rows = [{ ...row, passed: false, severity: 'high', attackClass: 'CRED-HARDCODED' }];
    g.__oasbAstAdapterCalls.push({ analyzer: name, extraArgs: args.slice(2), rows });
    return rows;
  };
}
// One shared classifier per build, as getTMEClassifier() returns one.
const classifier = {
  async ensureModel() {},
  async ensureReady() {},
  classify() {
    g.__oasbAstAdapterClassifiers.push('${build}');
    return { intentClass: 'benign', attackClass: 'none', confidence: 0.5 };
  },
  async classifyAsync(content) {
    return this.classify(content);
  },
};
exports.SemanticCompiler = SemanticCompiler;
exports.getTMEClassifier = () => classifier;
exports.analyzeCapabilities = () => [];
exports.analyzeCredentials = analyzer('analyzeCredentials', '${build}-CRED', 3);
exports.analyzeGovernance = analyzer('analyzeGovernance', '${build}-GOV', 4);
exports.analyzeScope = analyzer('analyzeScope', '${build}-SCOPE', 3);
exports.analyzePrompt = analyzer('analyzePrompt', '${build}-PROMPT', 3);
exports.analyzeCode = () => [];
`;

const CONTENT_ANALYZERS = ['analyzeCredentials', 'analyzeGovernance', 'analyzeScope', 'analyzePrompt'];

const recorded = globalThis as unknown as {
  __oasbAstAdapterCompiles: string[];
  __oasbAstAdapterCompilers: string[];
  __oasbAstAdapterConstructed: string[];
  __oasbAstAdapterClassifiers: string[];
  __oasbAstAdapterCalls: AnalyzerCall[];
};

/**
 * What the stand-ins recorded since the last call. A stand-in empties the
 * record when it is first loaded, so take it before naming a new root.
 */
function takeRecorded(): Recorded {
  return {
    compiledAs: recorded.__oasbAstAdapterCompiles.splice(0),
    compiledBy: recorded.__oasbAstAdapterCompilers.splice(0),
    constructed: recorded.__oasbAstAdapterConstructed.splice(0),
    classifiedBy: recorded.__oasbAstAdapterClassifiers.splice(0),
    calls: recorded.__oasbAstAdapterCalls.splice(0),
  };
}

const callOf = (run: Recorded, analyzer: string): AnalyzerCall | undefined =>
  run.calls.find(call => call.analyzer === analyzer);

describe('the AST adapter and the pipeline adapter call the analyzers alike', () => {
  const roots: string[] = [];
  let sample: BenchmarkSample;
  let configureHmaRoot: (root: string) => void;
  let newAstAdapter: () => ScannerAdapter;
  let newFullAdapter: () => ScannerAdapter;
  let newPipelineAdapter: () => ScannerAdapter;
  let newStaticPipelineAdapter: () => ScannerAdapter;
  let newModelOnlyAdapter: () => ScannerAdapter;
  let ast: Recorded;
  let pipeline: Recorded;

  /**
   * A package directory holding a stand-in whose check ids start with `build`
   * and whose package.json names `version`.
   */
  function standInRoot(build: string, version = '0.0.0-stand-in'): string {
    const root = mkdtempSync(join(tmpdir(), 'oasb-ast-adapter-'));
    roots.push(root);
    mkdirSync(join(root, 'dist', 'nanomind-core'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'hackmyagent', version }) + '\n');
    writeFileSync(join(root, 'dist', 'nanomind-core', 'index.js'), standInCore(build));
    return root;
  }

  beforeEach(async () => {
    const corpus = JSON.parse(readFileSync(join(OASB_ROOT, 'corpus', 'v2.json'), 'utf-8')) as BenchmarkDataset;
    const found = corpus.samples.find(s => s.id === SAMPLE_ID);
    if (!found) throw new Error(`corpus/v2.json has no sample ${SAMPLE_ID}`);
    sample = found;

    // Both adapters load the scanner from the configured root, on fresh
    // modules so neither keeps a scanner an earlier test loaded.
    vi.resetModules();
    const pipelineModule = await import('./hma-pipeline-adapter.js');
    const { HMARealASTAdapter, HMARealFullAdapter } = await import('./hma-real-adapter.js');
    configureHmaRoot = pipelineModule.configureHmaRoot;
    newAstAdapter = () => new HMARealASTAdapter();
    newFullAdapter = () => new HMARealFullAdapter();
    newPipelineAdapter = () => new pipelineModule.HMAPipelineAdapter();
    newStaticPipelineAdapter = () => new pipelineModule.HMAPipelineStaticAdapter();
    newModelOnlyAdapter = () => new pipelineModule.HMATMEOnlyAdapter();
    configureHmaRoot(standInRoot('STAND-IN'));

    await newAstAdapter().scan(sample.content, sample.id);
    ast = takeRecorded();
    await newPipelineAdapter().scan(sample.content, sample.id, sample.artifactType);
    pipeline = takeRecorded();
  });

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('gives each content-reading analyzer the sample content, where the pipeline adapter gives it', () => {
    expect(sample.artifactType).toBe('skill');
    expect(ast.compiledAs).toEqual([`${SAMPLE_ID}.skill.md`]);
    expect(pipeline.compiledAs).toEqual(ast.compiledAs);

    for (const analyzer of CONTENT_ANALYZERS) {
      const fromPipeline = callOf(pipeline, analyzer);
      expect(fromPipeline?.extraArgs, `${analyzer} called by the pipeline adapter`).toContain(sample.content);
      expect(callOf(ast, analyzer)?.extraArgs, `${analyzer} called by the AST adapter`).toEqual(fromPipeline?.extraArgs);
    }
  });

  it('gets the credential rows the pipeline adapter gets for a corpus sample', () => {
    const fromPipeline = callOf(pipeline, 'analyzeCredentials')?.rows;
    expect(fromPipeline?.map(row => row.checkId)).toEqual(['STAND-IN-CRED']);
    expect(fromPipeline?.[0].contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(callOf(ast, 'analyzeCredentials')?.rows).toEqual(fromPipeline);
  });

  it('loads the scanner of another root once configureHmaRoot() names it', async () => {
    configureHmaRoot(standInRoot('OTHER'));
    await newAstAdapter().scan(sample.content, sample.id);
    expect(callOf(takeRecorded(), 'analyzeCredentials')?.rows.map(row => row.checkId)).toEqual(['OTHER-CRED']);
  });

  it('compiles on the scanner of another root once configureHmaRoot() names it, on the same adapter', async () => {
    const adapter = newAstAdapter();
    await adapter.scan(sample.content, sample.id);
    expect(takeRecorded().compiledBy).toEqual(['STAND-IN']);

    configureHmaRoot(standInRoot('OTHER'));
    await adapter.scan(sample.content, sample.id);
    const run = takeRecorded();
    expect(run.compiledBy).toEqual(['OTHER']);
    expect(callOf(run, 'analyzeCredentials')?.rows.map(row => row.checkId)).toEqual(['OTHER-CRED']);
  });

  it('the pipeline adapter compiles on the scanner of another root once configureHmaRoot() names it, on the same adapter', async () => {
    const adapter = newPipelineAdapter();
    await adapter.scan(sample.content, sample.id, sample.artifactType);
    expect(takeRecorded().compiledBy).toEqual(['STAND-IN']);

    configureHmaRoot(standInRoot('OTHER'));
    await adapter.scan(sample.content, sample.id, sample.artifactType);
    const run = takeRecorded();
    expect(run.compiledBy).toEqual(['OTHER']);
    expect(callOf(run, 'analyzeCredentials')?.rows.map(row => row.checkId)).toEqual(['OTHER-CRED']);
  });

  it('the model-only adapter classifies on the classifier of another root once configureHmaRoot() names it, on the same adapter', async () => {
    const adapter = newModelOnlyAdapter();
    await adapter.scan(sample.content, sample.id);
    expect(takeRecorded().classifiedBy).toEqual(['STAND-IN']);

    configureHmaRoot(standInRoot('OTHER'));
    await adapter.scan(sample.content, sample.id);
    expect(takeRecorded().classifiedBy).toEqual(['OTHER']);
  });

  it('builds one SemanticCompiler for the scans an adapter makes on one root', async () => {
    for (const newAdapter of [newAstAdapter, newPipelineAdapter]) {
      const adapter = newAdapter();
      await adapter.scan(sample.content, sample.id, sample.artifactType);
      await adapter.scan(sample.content, sample.id, sample.artifactType);
      const run = takeRecorded();
      expect(run.compiledBy, adapter.id).toEqual(['STAND-IN', 'STAND-IN']);
      expect(run.constructed, adapter.id).toEqual(['STAND-IN']);
    }
  });

  it('reports the version in the package.json of the root it loads, as the pipeline adapter does', () => {
    for (const newAdapter of [newAstAdapter, newFullAdapter]) {
      expect(newAdapter().version).toBe('0.0.0-stand-in');
      expect(newAdapter().version).toBe(newPipelineAdapter().version);
    }

    configureHmaRoot(standInRoot('OTHER', '0.0.1-other'));
    for (const newAdapter of [newAstAdapter, newFullAdapter]) {
      expect(newAdapter().version).toBe('0.0.1-other');
    }
  });

  it('reports the version of the root configured at its last scan, not of the root configured when it was created', async () => {
    configureHmaRoot(standInRoot('A', '1.0.0-a'));
    const adapters = [newAstAdapter(), newFullAdapter(), newPipelineAdapter(), newStaticPipelineAdapter()];
    for (const adapter of adapters) {
      await adapter.scan(sample.content, sample.id, sample.artifactType);
      expect(adapter.version, adapter.id).toBe('1.0.0-a');
    }
    // The static adapter compiles nothing.
    expect(takeRecorded().compiledBy).toEqual(['A', 'A', 'A']);

    configureHmaRoot(standInRoot('B', '2.0.0-b'));
    for (const adapter of adapters) {
      // Until it scans again, the version of the root its last scan read.
      expect(adapter.version, adapter.id).toBe('1.0.0-a');
      await adapter.scan(sample.content, sample.id, sample.artifactType);
      expect(adapter.version, adapter.id).toBe('2.0.0-b');
    }
    expect(takeRecorded().compiledBy).toEqual(['B', 'B', 'B']);
  });
});
