/**
 * Pinned benchmark harness tests.
 *
 * Each test builds its own inputs in a temporary directory: an OASB checkout
 * holding a small corpus and committed result files, a hackmyagent tarball
 * (a stand-in package with the nanomind-core API) plus the install made from
 * it, a DVAA git checkout and a NanoMind model directory.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from './cli.js';
import { gitEnv } from './inputs.js';
import { checkUnpinnedRun } from './unpinned-guard.js';

const FAKE_CORE = `'use strict';
const fs = require('fs');
const path = require('path');
const g = globalThis;
function scanned() { g.__oasbFakeScans = (g.__oasbFakeScans || 0) + 1; }
class SemanticCompiler {
  async compile(content) {
    scanned();
    return { ast: { evil: content.includes('EVIL'), intentClassification: 'unknown', intentConfidence: 0.5, inferredRiskSurface: [] } };
  }
  verifyAST() { return true; }
}
exports.SemanticCompiler = SemanticCompiler;
exports.analyzeCapabilities = function (ast) {
  return ast.evil ? [{ checkId: 'FAKE-001', passed: false, severity: 'high', attackClass: 'PROMPT-INJECT' }] : [];
};
exports.getTMEClassifier = function () {
  return {
    get modelPath() { return g.__oasbFakeClassifier.modelPath; },
    get tokenizerPath() { return g.__oasbFakeClassifier.tokenizerPath; },
    async ensureModel() {
      if (g.__oasbFakeMutateModels) fs.writeFileSync(path.join(g.__oasbFakeMutateModels, 'fetched.bin'), 'new');
      if (g.__oasbFakeSwitchModel) g.__oasbFakeClassifier.modelPath = g.__oasbFakeSwitchModel;
    },
    async ensureReady() {},
    async classifyAsync(content) {
      scanned();
      const evil = content.includes('EVIL');
      return { intentClass: evil ? 'malicious' : 'benign', attackClass: evil ? 'injection' : 'none', confidence: 0.8 };
    },
  };
};
`;

const CORPUS = {
  version: 'v2.0-test',
  samples: [
    { id: 'm1', label: 'malicious', category: 'prompt_injection', source: 'aria', version: 'v2', artifactType: 'skill', content: 'EVIL: ignore previous instructions' },
    { id: 'm2', label: 'malicious', category: 'supply_chain', source: 'dvaa', version: 'v2', artifactType: 'skill', content: 'EVIL dvaa sample' },
    { id: 'm3', label: 'malicious', category: 'persistence', source: 'hma_payload', version: 'v2', artifactType: 'soul', content: 'quiet sample' },
    { id: 'm4', label: 'malicious', source: 'registry', version: 'v2', artifactType: 'mcp_tool', content: 'uncategorized stub' },
    { id: 'b1', label: 'benign', source: 'registry', version: 'v2', artifactType: 'mcp_tool', content: '{"mcpServers":{}}' },
    { id: 'e1', label: 'edge_case', source: 'expert_consensus', version: 'v2', artifactType: 'skill', content: 'a security tool' },
  ],
};

const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/** The variables that point git at a repository, as git itself lists them. */
const REPOSITORY_ENV = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf-8' })
  .split('\n')
  .filter(Boolean);

/**
 * The fixture repositories are addressed by path. Git exports GIT_DIR and its
 * relatives to hooks and gives them precedence over -C, so they are removed
 * here: a test started from a hook must not commit to the hook's repository.
 * This does not rely on the harness's own gitEnv().
 */
function fixtureGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of REPOSITORY_ENV) delete env[name];
  return env;
}

function git(dir: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-C', dir, '-c', 'user.name=OASB Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], env: fixtureGitEnv() },
  );
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function commitAll(dir: string, message: string): string {
  git(dir, 'add', '--all', '--', '.');
  git(dir, 'commit', '-q', '-m', message);
  return git(dir, 'rev-parse', 'HEAD').trim();
}

/** Every file under `dir` except .git/, as path -> sha256. */
function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string, rel: string) => {
    for (const entry of readdirSync(d)) {
      if (entry === '.git') continue;
      const abs = join(d, entry);
      const r = rel ? `${rel}/${entry}` : entry;
      if (statSync(abs).isDirectory()) walk(abs, r);
      else out.set(r, sha256(readFileSync(abs)));
    }
  };
  walk(dir, '');
  return out;
}

/** Independent computation of the documented manifest format. */
function manifestSha(modelsDir: string, files: string[]): string {
  const lines = [...files].sort().map(f => `${sha256(readFileSync(join(modelsDir, f)))}  ${f}\n`);
  return sha256(lines.join(''));
}

interface Fixture {
  root: string;
  oasb: string;
  hma: string;
  installed: string;
  tarball: string;
  dvaa: string;
  models: string;
  /** The model and tokenizer files the stand-in classifier reports for this fixture. */
  classifier: { modelPath?: string; tokenizerPath?: string };
  pinsPath: string;
  pins: { hackmyagent: { version: string; integrity: string }; dvaa: { commit: string }; nanomind: { manifestSha256: string } };
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'oasb-pinned-'));

  const oasb = join(root, 'oasb');
  mkdirSync(oasb);
  git(oasb, 'init', '-q', '-b', 'main');
  write(join(oasb, 'corpus', 'v2.json'), JSON.stringify(CORPUS, null, 2));
  write(join(oasb, 'benchmark-results-v6.json'), '{"legacy":"corpus"}\n');
  write(join(oasb, 'dvaa-benchmark-results.json'), '{"legacy":"dvaa"}\n');
  write(join(oasb, 'results', '2026-01-01-00000000', 'record.json'), '{"prior":true}\n');
  commitAll(oasb, 'fixture');

  const stage = join(root, 'stage');
  write(join(stage, 'package', 'package.json'), JSON.stringify({ name: 'hackmyagent', version: '9.9.9' }));
  write(join(stage, 'package', 'dist', 'nanomind-core', 'index.js'), FAKE_CORE);
  const hma = join(root, 'hma');
  mkdirSync(hma);
  const tarball = join(hma, 'hackmyagent-9.9.9.tgz');
  execFileSync('tar', ['-czf', tarball, '-C', stage, 'package'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const installed = join(hma, 'node_modules', 'hackmyagent');
  cpSync(join(stage, 'package'), installed, { recursive: true });
  write(join(hma, 'package-lock.json'), '{"lockfileVersion":3}\n');

  const dvaa = join(root, 'dvaa');
  mkdirSync(dvaa);
  git(dvaa, 'init', '-q', '-b', 'main');
  write(join(dvaa, '.gitignore'), '*.secret\n');
  write(join(dvaa, 'scenarios', 'prompt-hijack', 'expected-checks.json'), '["FAKE-001"]\n');
  write(join(dvaa, 'scenarios', 'prompt-hijack', 'vulnerable', 'SKILL.md'), 'EVIL payload\n');
  write(join(dvaa, 'scenarios', 'quiet-config', 'expected-checks.json'), '[]\n');
  write(join(dvaa, 'scenarios', 'quiet-config', 'vulnerable', 'nested', 'config.json'), '{"a":1}\n');
  const commit = commitAll(dvaa, 'fixture');

  const models = join(root, 'models');
  write(join(models, 'nanomind-version.json'), '{"version":"0.0.1-test"}\n');
  write(join(models, 'tme', 'model.onnx'), 'weights-v1');
  write(join(models, 'tokenizer.json'), '{"evil":1}\n');
  const classifier = { modelPath: join(models, 'tme', 'model.onnx'), tokenizerPath: join(models, 'tokenizer.json') };

  const pins = {
    hackmyagent: {
      version: '9.9.9',
      integrity: `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`,
    },
    dvaa: { commit },
    nanomind: { manifestSha256: manifestSha(models, ['nanomind-version.json', 'tme/model.onnx', 'tokenizer.json']) },
  };
  const pinsPath = join(root, 'pins.json');
  writeFileSync(pinsPath, JSON.stringify(pins, null, 2));

  return { root, oasb, hma, installed, tarball, dvaa, models, classifier, pinsPath, pins };
}

interface Run {
  code: number;
  out: string[];
  err: string[];
}

async function run(fx: Fixture, extraOverrides: Record<string, unknown> = {}, argv?: string[]): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  g.__oasbFakeClassifier = fx.classifier;
  const code = await runCli(
    argv ?? ['--pins', fx.pinsPath, '--hma', fx.hma, '--dvaa', fx.dvaa],
    { out: l => out.push(l), err: l => err.push(l) },
    { oasbRoot: fx.oasb, nanomindModelsDir: fx.models, ...extraOverrides },
  );
  return { code, out, err };
}

function runDirs(fx: Fixture): string[] {
  return readdirSync(join(fx.oasb, 'results')).sort();
}

function readJsonl(path: string): any[] {
  return readFileSync(path, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

const g = globalThis as {
  __oasbFakeScans?: number;
  __oasbFakeMutateModels?: string;
  __oasbFakeClassifier?: Fixture['classifier'];
  __oasbFakeSwitchModel?: string;
};

let fx: Fixture;

beforeEach(() => {
  fx = makeFixture();
  g.__oasbFakeScans = 0;
  delete g.__oasbFakeMutateModels;
  delete g.__oasbFakeSwitchModel;
});

afterEach(() => {
  delete g.__oasbFakeMutateModels;
  delete g.__oasbFakeSwitchModel;
  rmSync(fx.root, { recursive: true, force: true });
});

describe('pinned run', () => {
  it('writes a new results/<date>-<runid>/ with per-sample predictions and leaves every existing file byte-identical', async () => {
    const before = snapshot(fx.oasb);
    const r = await run(fx);
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    // The stand-in scanner counts its calls; the refusal tests rely on it.
    expect(g.__oasbFakeScans).toBeGreaterThan(0);

    const after = snapshot(fx.oasb);
    for (const [path, hash] of before) expect(after.get(path), path).toBe(hash);

    const dirs = runDirs(fx);
    expect(dirs).toHaveLength(2);
    const created = dirs.find(d => d !== '2026-01-01-00000000')!;
    expect(created).toMatch(/^\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/);
    const runDir = join(fx.oasb, 'results', created);
    expect(readdirSync(runDir).sort()).toEqual(
      ['corpus-predictions.jsonl', 'dvaa-predictions.jsonl', 'record.json', 'summary.json'],
    );

    // Five categorized samples (m4 has no category) times three adapters.
    const corpus = readJsonl(join(runDir, 'corpus-predictions.jsonl'));
    expect(corpus).toHaveLength(15);
    const pipeline = Object.fromEntries(corpus.filter(p => p.adapterId === 'hma-pipeline').map(p => [p.sampleId, p.verdict]));
    expect(pipeline).toEqual({ m1: 'malicious', m2: 'malicious', m3: 'benign', b1: 'benign', e1: 'benign' });

    const dvaa = readJsonl(join(runDir, 'dvaa-predictions.jsonl'));
    expect(dvaa.map(d => [d.scenario, d.detected])).toEqual([['prompt-hijack', true], ['quiet-config', false]]);
    expect(dvaa[1].files).toEqual([{ file: 'nested/config.json', detected: false, attackFindings: [] }]);

    const summary = JSON.parse(readFileSync(join(runDir, 'summary.json'), 'utf-8'));
    expect(summary.corpus.adapters['hma-pipeline'].malicious).toEqual({ total: 3, detected: 2, recall: 0.6667 });
    expect(summary.corpus.dvaaSourcedSamples).toEqual({ total: 1, detected: 1, recall: 1 });
    expect(summary.dvaaRepository).toMatchObject({ total: 2, detected: 1, recall: 0.5 });
    expect(JSON.stringify(summary)).not.toMatch(/"(f1|precision|fpr|flagRate)"/);

    const record = JSON.parse(readFileSync(join(runDir, 'record.json'), 'utf-8'));
    expect(record.hackmyagent).toEqual({
      version: '9.9.9',
      integrity: fx.pins.hackmyagent.integrity,
      tarballSha256: sha256(readFileSync(fx.tarball)),
      dependencyLockSha256: sha256(readFileSync(join(fx.hma, 'package-lock.json'))),
    });
    expect(record.dvaa).toEqual({ commit: fx.pins.dvaa.commit, scenarios: 2, filesVerified: 4 });
    expect(record.nanomind.manifestSha256).toBe(fx.pins.nanomind.manifestSha256);
    expect(record.nanomind.modelVersion).toBe('0.0.1-test');
    expect(record.oasb.commit).toBe(git(fx.oasb, 'rev-parse', 'HEAD').trim());
    expect(record.oasb.corpus.sha256).toBe(sha256(readFileSync(join(fx.oasb, 'corpus', 'v2.json'))));
    expect(JSON.stringify(record)).not.toContain(fx.root);
  });

  it('a second run writes its own directory and leaves the first one unchanged', async () => {
    expect((await run(fx)).code).toBe(0);
    const firstDirs = runDirs(fx);
    const afterFirst = snapshot(fx.oasb);

    expect((await run(fx)).code).toBe(0);
    expect(runDirs(fx)).toHaveLength(firstDirs.length + 1);
    const afterSecond = snapshot(fx.oasb);
    for (const [path, hash] of afterFirst) expect(afterSecond.get(path), path).toBe(hash);
  });

  it('refuses a run directory that already exists, before scanning, and leaves it unchanged', async () => {
    const before = snapshot(fx.oasb);
    const r = await run(fx, { runId: '00000000', now: () => new Date('2026-01-01T12:00:00Z') });
    expect(r.code).toBe(2);
    expect(r.err.join('\n')).toMatch(/already exists; results are never overwritten/);
    expect(g.__oasbFakeScans).toBe(0);
    expect(snapshot(fx.oasb)).toEqual(before);
  });

  it('writes nothing and exits 3 when the model directory changes during the run', async () => {
    g.__oasbFakeMutateModels = fx.models;
    const r = await run(fx);
    expect(r.code).toBe(3);
    expect(r.err.join('\n')).toMatch(/an input changed during the run.*NanoMind/);
    expect(runDirs(fx)).toEqual(['2026-01-01-00000000']);
  });

  it('writes nothing and exits 3 when the scanner switches to a model file outside the model directory during the run', async () => {
    g.__oasbFakeSwitchModel = join(fx.root, 'elsewhere', 'model.onnx');
    const r = await run(fx);
    expect(r.code).toBe(3);
    expect(r.err.join('\n')).toMatch(/an input changed during the run.*classifier reports its model at .*elsewhere/);
    expect(g.__oasbFakeScans).toBeGreaterThan(0);
    expect(runDirs(fx)).toEqual(['2026-01-01-00000000']);
  });
});

describe('refusals before scanning', () => {
  const setPins = (mutate: (p: any) => void) => {
    const p = JSON.parse(JSON.stringify(fx.pins));
    mutate(p);
    writeFileSync(fx.pinsPath, JSON.stringify(p));
  };

  const cases: Array<[string, () => Record<string, unknown> | void, RegExp]> = [
    ['the pin file is missing', () => rmSync(fx.pinsPath), /cannot read the pin file/],
    ['hackmyagent has no tarball integrity', () => setPins(p => delete p.hackmyagent.integrity), /hackmyagent\.integrity is missing/],
    ['hackmyagent is pinned by a range', () => setPins(p => (p.hackmyagent.version = '^9.9.9')), /not an exact version/],
    ['DVAA is pinned by a branch name', () => setPins(p => (p.dvaa.commit = 'main')), /not a full commit id/],
    ['the NanoMind pin is a placeholder', () => setPins(p => (p.nanomind.manifestSha256 = 'PLACEHOLDER')), /not a sha256/],
    [
      'the tarball does not match the pinned integrity',
      () => setPins(p => (p.hackmyagent.integrity = `sha512-${createHash('sha512').update('other').digest('base64')}`)),
      /has integrity .* the pin is/,
    ],
    [
      'an installed hackmyagent file was edited',
      () => appendFileSync(join(fx.installed, 'dist', 'nanomind-core', 'index.js'), '\n// local edit\n'),
      /differ from the pinned tarball \(dist\/nanomind-core\/index\.js\)/,
    ],
    [
      'a file was added to the installed hackmyagent',
      () => write(join(fx.installed, 'dist', 'extra.js'), 'module.exports = 1;\n'),
      /not in the pinned tarball \(dist\/extra\.js\)/,
    ],
    [
      'a tracked DVAA file was edited',
      () => appendFileSync(join(fx.dvaa, 'scenarios', 'prompt-hijack', 'vulnerable', 'SKILL.md'), 'more\n'),
      /DVAA checkout has uncommitted changes/,
    ],
    [
      'the DVAA checkout has an untracked scenario',
      () => write(join(fx.dvaa, 'scenarios', 'added', 'expected-checks.json'), '[]\n'),
      /DVAA checkout has uncommitted changes/,
    ],
    [
      'the DVAA loader would read a git-ignored file',
      () => write(join(fx.dvaa, 'scenarios', 'prompt-hijack', 'vulnerable', 'token.secret'), 'EVIL\n'),
      /not the files committed at .*token\.secret/,
    ],
    [
      'the DVAA checkout is at another commit',
      () => {
        write(join(fx.dvaa, 'scenarios', 'later', 'expected-checks.json'), '[]\n');
        commitAll(fx.dvaa, 'later');
      },
      /DVAA checkout is at [0-9a-f]{40}, the pin is/,
    ],
    [
      'a NanoMind model file changed',
      () => writeFileSync(join(fx.models, 'tme', 'model.onnx'), 'weights-v2'),
      /NanoMind model directory has manifest sha256/,
    ],
    [
      'the NanoMind model directory is missing',
      () => ({ nanomindModelsDir: join(fx.root, 'no-models') }),
      /NanoMind model directory does not exist/,
    ],
    [
      'the scanner would load its model from outside the NanoMind model directory',
      () => {
        // The scanner looks in models/ under the working directory first.
        write(join(fx.root, 'cwd', 'models', 'model.onnx'), 'other weights');
        fx.classifier.modelPath = join(fx.root, 'cwd', 'models', 'model.onnx');
      },
      /classifier reports its model at .*cwd.models.model\.onnx, which is not a file of the verified NanoMind model directory/,
    ],
    [
      'the scanner would load its tokenizer from outside the NanoMind model directory',
      () => {
        write(join(fx.root, 'cwd', 'models', 'tokenizer.json'), '{"evil":2}\n');
        fx.classifier.tokenizerPath = join(fx.root, 'cwd', 'models', 'tokenizer.json');
      },
      /classifier reports its tokenizer at .*cwd.models.tokenizer\.json, which is not a file of the verified NanoMind model directory/,
    ],
    [
      'the scanner does not report the model file it loads',
      () => {
        delete fx.classifier.modelPath;
      },
      /classifier reports no model file/,
    ],
    [
      'the OASB corpus was edited',
      () => appendFileSync(join(fx.oasb, 'corpus', 'v2.json'), '\n'),
      /OASB checkout has uncommitted changes \(corpus\/v2\.json\)/,
    ],
  ];

  it.each(cases)('exits 2 when %s', async (_name, arrange, message) => {
    const overrides = arrange() ?? {};
    const before = snapshot(fx.oasb);
    const r = await run(fx, overrides);
    expect(r.code).toBe(2);
    expect(r.err.join('\n')).toMatch(message);
    expect(r.err.join('\n')).toMatch(/Nothing was scanned and nothing was written/);
    expect(g.__oasbFakeScans).toBe(0);
    expect(runDirs(fx)).toEqual(['2026-01-01-00000000']);
    expect(snapshot(fx.oasb)).toEqual(before);
  });

  it('exits 2 when a required option is missing', async () => {
    const r = await run(fx, {}, ['--hma', fx.hma, '--dvaa', fx.dvaa]);
    expect(r.code).toBe(2);
    expect(g.__oasbFakeScans).toBe(0);
  });
});

describe('--observe', () => {
  it('prints the pin values of the inputs, which a run then accepts', async () => {
    const r = await run(fx, {}, ['--observe', '--hma', fx.hma, '--dvaa', fx.dvaa]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out.join('\n'))).toEqual(fx.pins);
    expect(r.err.join('\n')).toMatch(/npm view hackmyagent@9\.9\.9 dist\.integrity/);
    expect(g.__oasbFakeScans).toBe(0);
  });

  it('reports a dirty input and exits 2', async () => {
    appendFileSync(join(fx.installed, 'dist', 'nanomind-core', 'index.js'), '\n');
    const r = await run(fx, {}, ['--observe', '--hma', fx.hma, '--dvaa', fx.dvaa]);
    expect(r.code).toBe(2);
    expect(r.err.join('\n')).toMatch(/problem: dirty input tree: installed hackmyagent files differ/);
  });
});

describe('git variables in the environment', () => {
  // Git exports GIT_DIR to a hook started in a linked worktree, and
  // GIT_INDEX_FILE or GIT_WORK_TREE to some hooks. They name the hook's
  // repository, which stands in here as `outer`.
  const saved = new Map<string, string | undefined>();
  let outer: string;

  const setEnv = (name: string, value: string) => {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    process.env[name] = value;
  };

  beforeEach(() => {
    outer = mkdtempSync(join(tmpdir(), 'oasb-outer-'));
    git(outer, 'init', '-q', '-b', 'main');
    write(join(outer, 'kept.txt'), 'kept\n');
    commitAll(outer, 'outer');
  });

  afterEach(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    saved.clear();
    rmSync(outer, { recursive: true, force: true });
  });

  it.each([
    ['GIT_DIR', ['GIT_DIR']],
    ['GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE', ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']],
  ])('with %s naming another repository, a run reads its own inputs and leaves that repository unchanged', async (_label, names) => {
    const head = git(outer, 'rev-parse', 'HEAD').trim();
    const gitDirBefore = snapshot(join(outer, '.git'));
    const treeBefore = snapshot(outer);
    const values: Record<string, string> = {
      GIT_DIR: join(outer, '.git'),
      GIT_WORK_TREE: outer,
      GIT_INDEX_FILE: join(outer, '.git', 'index'),
    };
    for (const name of names) setEnv(name, values[name]);

    // Build the inputs and run with the variables set, as a hook would.
    const inner = makeFixture();
    let r: Run;
    let oasbHead: string;
    let record: any = null;
    try {
      oasbHead = git(inner.oasb, 'rev-parse', 'HEAD').trim();
      r = await run(inner);
      const created = runDirs(inner).find(d => d !== '2026-01-01-00000000');
      if (created) record = JSON.parse(readFileSync(join(inner.oasb, 'results', created, 'record.json'), 'utf-8'));
    } finally {
      rmSync(inner.root, { recursive: true, force: true });
    }

    expect(snapshot(join(outer, '.git'))).toEqual(gitDirBefore);
    expect(snapshot(outer)).toEqual(treeBefore);
    expect(git(outer, 'rev-parse', 'HEAD').trim()).toBe(head);
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(record?.oasb.commit).toBe(oasbHead);
    expect(record?.dvaa.commit).toBe(inner.pins.dvaa.commit);
  });

  it('gitEnv drops each variable git lists as naming a repository and keeps the others', () => {
    expect(REPOSITORY_ENV).toContain('GIT_DIR');
    for (const name of REPOSITORY_ENV) setEnv(name, 'set-by-test');
    setEnv('OASB_TEST_UNRELATED', 'kept');
    const env = gitEnv();
    for (const name of REPOSITORY_ENV) expect(env[name], name).toBeUndefined();
    expect(env.OASB_TEST_UNRELATED).toBe('kept');
    expect(env.PATH).toBe(process.env.PATH);
  });
});

describe('unpinned development runners', () => {
  it('refuse to run without --unpinned', () => {
    expect(() => checkUnpinnedRun(['--categorized-only'], fx.root)).toThrow(/unpinned hackmyagent build/);
  });

  it('write no file unless --out names a new one', () => {
    expect(checkUnpinnedRun(['--unpinned'], fx.root)).toEqual({ outPath: null });
    expect(checkUnpinnedRun(['--unpinned', '--out=new.json'], fx.root)).toEqual({ outPath: join(fx.root, 'new.json') });
    expect(existsSync(join(fx.root, 'new.json'))).toBe(false);
  });

  it('refuse an --out file that already exists', () => {
    expect(() => checkUnpinnedRun(['--unpinned', '--out=pins.json'], fx.root)).toThrow(/never overwrites/);
  });
});
