/**
 * External skill-scanner benchmark runner (library). The CLI is
 * scripts/run-external-skill-benchmark.ts; `--help` lists its options.
 *
 * Scans every sample directory of a third-party skill corpus, one directory per
 * class (malicious and benign), with a pinned scanner release, and scores each
 * sample with the verdict rule OASB publishes for its own benchmark
 * (src/benchmark/hma-pipeline-adapter.ts): a sample is malicious when at least
 * one finding with passed=false and severity high or critical fires whose
 * checkId is not in HARDENING_CHECK_IDS. The exclusions are imported from that
 * file, never retyped here.
 *
 * Each sample is scanned by its own child process. Its working directory is
 * the sample; HOME and TMPDIR are fresh empty directories made for that sample
 * alone; its environment holds PATH, HOME, TMPDIR, LANG and
 * OPENA2A_TELEMETRY=off and nothing else, so no credential of the operator
 * reaches the scanner (macOS adds __CF_USER_TEXT_ENCODING inside every
 * process). The offline arm denies outbound network to that process
 * (sandbox-exec on macOS, an unshared network namespace on Linux) and refuses
 * to scan unless a connect attempt made the same way is refused first. The
 * model-present arm allows network and can place a model directory in each
 * fresh HOME.
 *
 * A scanner is an adapter: its argv per instrument and its output parser. An
 * output that does not parse, a scan that times out and a scan that cannot
 * start go to an excluded column; no sample is dropped.
 *
 * Leak control: the neutralised arm copies each sample under a neutral id
 * (n- and 16 hex digits of sha256 of the sample key) without any _meta.json
 * file, the label channel a corpus may carry, and scans the copies. Compared
 * with an as-published run of the same samples, a per-sample verdict gap above
 * NEUTRAL_GAP_LIMIT fails the run.
 *
 * Determinism: a re-run of up to 1,000 samples of an earlier run with the same
 * scanner, instrument and arm must give the same verdict and the same set of
 * failed checks on every sample.
 *
 * A run writes one directory: record.json (every pinned input), predictions.jsonl
 * (one row per sample) and summary.json (the table). It is written as
 * <out>.incomplete/ and renamed to <out> when complete, so a run directory is
 * complete or absent, and an incomplete one is re-run whole. verifyRun()
 * recomputes a run directory's verdicts and summary from its own rows.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  copyFileSync,
  constants as fsConstants,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { cpus, devNull, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { HARDENING_CHECK_IDS } from '../src/benchmark/hma-pipeline-adapter.js';

export const RUN_SCHEMA = 'oasb-external-skill-run/v1';
export const RUN_FILES = ['predictions.jsonl', 'record.json', 'summary.json'];
export const INCOMPLETE_MARKER = '.oasb-external-run-incomplete';
export const HARNESS_FILES = ['scripts/external-skill-benchmark.ts', 'scripts/run-external-skill-benchmark.ts'];

/** The checks the verdict rule leaves out: posture gaps, not present attacks. */
export const RULE_EXCLUSIONS: ReadonlySet<string> = HARDENING_CHECK_IDS;
export const RULE_SOURCE = 'src/benchmark/hma-pipeline-adapter.ts HARDENING_CHECK_IDS';
export const RULE_TEXT =
  'malicious when at least one finding with passed=false and severity high or critical fires whose checkId is not in the exclusions; otherwise benign';
const VERDICT_SEVERITIES = new Set(['high', 'critical']);

/** The environment variables a scanner process receives, and no other. */
export const SCANNER_ENV_NAMES = ['HOME', 'LANG', 'OPENA2A_TELEMETRY', 'PATH', 'TMPDIR'];
export const SANDBOX_PROFILE = '(version 1)(allow default)(deny network-outbound (remote ip))';
export const DEFAULT_PROBE_HOST = '1.1.1.1';
export const NEUTRAL_GAP_LIMIT = 0.005;
export const NEUTRAL_DROPPED = ['_meta.json'];
export const DETERMINISM_N = 1000;
const OUTPUT_CAP_BYTES = 64 * 1024 * 1024;
const REPO_ROOT = resolve(__dirname, '..');

export type Label = 'malicious' | 'benign';
export type Verdict = Label;
export type Split = 'dev' | 'held-out';
export type Network = 'off' | 'on';
export type Excluded = 'timeout' | 'unparsed' | 'spawn-error' | 'output-too-large';
const EXCLUDED_REASONS: Excluded[] = ['timeout', 'unparsed', 'spawn-error', 'output-too-large'];
const LABELS: Label[] = ['malicious', 'benign'];

export interface Finding {
  checkId: string;
  severity: string;
  passed: boolean;
}

export interface ParsedReport {
  findings: Finding[];
  scannerVersion: string | null;
  measured: boolean | null;
}

/** One scanner: how it is invoked per instrument and how its report is read. */
export interface ScannerAdapter {
  /** The npm package name; --scanner <name>@<version>. */
  name: string;
  /** Each instrument's arguments after the entry script. The scan runs with cwd = the sample. */
  instruments: Record<string, string[]>;
  /** The CLI entry script, relative to the package root. */
  entry: string;
  /** Reads one sample's stdout. Throws when it is not the scanner's report. */
  parse(stdout: string): ParsedReport;
  /** Places a model directory where the scanner looks for one under HOME. */
  seedHome?(home: string, modelDir: string): void;
  /** True when a model is present under HOME. */
  modelPresent?(home: string): boolean;
}

export class UsageError extends Error {}

class ParseError extends Error {}

/** hackmyagent: the first adapter. `check --json` reports details[]; `secure --json` reports findings[]. */
export const hackmyagent: ScannerAdapter = {
  name: 'hackmyagent',
  instruments: {
    check: ['check', '.', '--json', '--no-registry'],
    secure: ['secure', '.', '--json', '--ci', '--no-registry', '--no-contribute'],
  },
  entry: 'dist/cli.js',
  parse(stdout: string): ParsedReport {
    let report: any;
    try {
      report = JSON.parse(stdout);
    } catch {
      throw new ParseError('not-json');
    }
    if (!report || typeof report !== 'object' || Array.isArray(report)) throw new ParseError('not-a-report');
    const list = Array.isArray(report.findings) ? report.findings : Array.isArray(report.details) ? report.details : null;
    if (!list) throw new ParseError('no-findings-list');
    const findings = list.map((f: any): Finding => {
      if (!f || typeof f.checkId !== 'string' || f.checkId === '' || typeof f.severity !== 'string' || typeof f.passed !== 'boolean') {
        throw new ParseError('bad-finding');
      }
      return { checkId: f.checkId, severity: f.severity, passed: f.passed };
    });
    return {
      findings,
      scannerVersion: typeof report.hackmyagentVersion === 'string' ? report.hackmyagentVersion : null,
      measured: typeof report.measured === 'boolean' ? report.measured : null,
    };
  },
  seedHome(home: string, modelDir: string): void {
    cloneTree(modelDir, join(home, '.nanomind', 'models'));
  },
  modelPresent(home: string): boolean {
    return [join(home, '.nanomind', 'models'), join(home, '.opena2a', 'nanomind', 'models')].some(dir =>
      existsSync(join(dir, 'tokenizer.json')),
    );
  },
};

export const ADAPTERS: Record<string, ScannerAdapter> = { [hackmyagent.name]: hackmyagent };

// ---------------------------------------------------------------- verdict rule

/** The checks that make a sample malicious under the rule, sorted. */
export function flaggingChecks(findings: Finding[]): string[] {
  const ids = findings
    .filter(f => !f.passed && VERDICT_SEVERITIES.has(f.severity) && !RULE_EXCLUSIONS.has(f.checkId))
    .map(f => f.checkId);
  return [...new Set(ids)].sort();
}

export function verdictOf(findings: Finding[]): Verdict {
  return flaggingChecks(findings).length > 0 ? 'malicious' : 'benign';
}

/** The failed findings as sorted unique `checkId:severity` strings: the check set compared between runs. */
export function failedSet(findings: Finding[]): string[] {
  return [...new Set(findings.filter(f => !f.passed).map(f => `${f.checkId}:${f.severity}`))].sort();
}

function findingsOfFailedSet(failed: string[]): Finding[] {
  return failed.map(entry => {
    const at = entry.lastIndexOf(':');
    return { checkId: entry.slice(0, at), severity: entry.slice(at + 1), passed: false };
  });
}

// ------------------------------------------------------------------- selection

export const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

/** dev when the first hex digit of sha256(directory name) is 0-7, held-out when it is 8-f. */
export function splitOf(name: string): Split {
  return parseInt(sha256(name)[0], 16) < 8 ? 'dev' : 'held-out';
}

/** n keys ranked by sha256(seed, newline, key); the same seed gives the same keys in any input order. */
export function selectSeeded(keys: string[], n: number, seed: string): string[] {
  const rank = (key: string) => sha256(`${seed}\n${key}`);
  return [...keys]
    .map(key => ({ key, rank: rank(key) }))
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.key < b.key ? -1 : 1))
    .slice(0, n)
    .map(e => e.key)
    .sort();
}

export function neutralId(key: string): string {
  return `n-${sha256(`neutral\n${key}`).slice(0, 16)}`;
}

// ----------------------------------------------------------------- environment

/** The argv prefix that runs a process with outbound network denied. */
export function offlineWrapper(platform: NodeJS.Platform = process.platform): string[] {
  if (platform === 'darwin') return ['/usr/bin/sandbox-exec', '-p', SANDBOX_PROFILE];
  if (platform === 'linux') return ['unshare', '--map-root-user', '--net', '--'];
  throw new UsageError(`the offline arm has no network-denied process on ${platform}; run it on macOS (sandbox-exec) or Linux (unshare --net)`);
}

function scannerPath(): string {
  return [dirname(process.execPath), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
}

/** The whole environment of a scanner process. */
export function scannerEnv(home: string, tmp: string): Record<string, string> {
  return { HOME: home, LANG: 'en_US.UTF-8', OPENA2A_TELEMETRY: 'off', PATH: scannerPath(), TMPDIR: tmp };
}

/** Runs a TCP connect to host:443 behind `wrapper` and returns its outcome: connected, refused <code> or timeout. */
export function probeNetwork(wrapper: string[], host: string, timeoutMs = 15000): string {
  const box = mkdtempSync(join(tmpdir(), 'oasb-probe-'));
  try {
    const script = [
      `const s = require('node:net').connect(443, ${JSON.stringify(host)});`,
      `s.setTimeout(${Math.max(1000, timeoutMs - 3000)});`,
      "s.on('connect', () => { console.log('connected'); process.exit(0); });",
      "s.on('timeout', () => { console.log('timeout'); process.exit(0); });",
      "s.on('error', e => { console.log('refused ' + (e.code || 'error')); process.exit(0); });",
    ].join('');
    const argv = [...wrapper, process.execPath, '-e', script];
    const r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', timeout: timeoutMs, env: scannerEnv(box, box) });
    const last = (r.stdout || '').trim().split('\n').pop();
    return last || `no-answer status=${r.status} signal=${r.signal}`;
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
}

function gitEnv(): Record<string, string> {
  return { PATH: process.env.PATH ?? '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull, GIT_OPTIONAL_LOCKS: '0' };
}

function git(dir: string, ...args: string[]): string | null {
  const r = spawnSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=' + devNull, '-C', dir, ...args], {
    encoding: 'utf8',
    env: gitEnv(),
  });
  return r.status === 0 ? r.stdout.trim() : null;
}

interface GitState {
  commit: string | null;
  dirty: number | null;
}

function gitState(dir: string): GitState {
  const commit = git(dir, 'rev-parse', 'HEAD');
  if (!commit) return { commit: null, dirty: null };
  const status = git(dir, 'status', '--porcelain', '--untracked-files=all', '--', '.');
  return { commit, dirty: status === null ? null : status === '' ? 0 : status.split('\n').length };
}

// ---------------------------------------------------------------------- corpus

interface Sample {
  key: string;
  label: Label;
  name: string;
  dir: string;
  split: Split;
}

function isDir(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** The directory that holds both class directories: the corpus itself, or the one directory up to three levels below it that does. */
export function locateClassRoot(corpus: string, classDirs: Record<Label, string>): string {
  const holds = (dir: string) => LABELS.every(label => isDir(join(dir, classDirs[label])));
  if (holds(corpus)) return corpus;
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 3) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const path = join(dir, entry.name);
      if (holds(path)) found.push(path);
      else walk(path, depth + 1);
    }
  };
  walk(corpus, 1);
  if (found.length === 1) return found[0];
  const want = `${classDirs.malicious}/ and ${classDirs.benign}/`;
  if (found.length === 0) throw new UsageError(`no directory in ${corpus} holds both ${want}; set --malicious and --benign`);
  throw new UsageError(`several directories hold ${want}: ${found.join(', ')}; pass the one to scan as --corpus`);
}

function listSamples(classRoot: string, classDirs: Record<Label, string>): { samples: Sample[]; ignoredEntries: number } {
  const samples: Sample[] = [];
  let ignoredEntries = 0;
  for (const label of LABELS) {
    const base = join(classRoot, classDirs[label]);
    for (const entry of readdirSync(base, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!entry.isDirectory()) {
        ignoredEntries += 1;
        continue;
      }
      samples.push({ key: `${label}/${entry.name}`, label, name: entry.name, dir: join(base, entry.name), split: splitOf(entry.name) });
    }
  }
  return { samples, ignoredEntries };
}

function walkFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(path, out);
    else out.push(path);
  }
}

/** sha256 over `<sha256>  <path>` lines of every file under the class directories (a symlink hashes its target text). */
function manifestOf(root: string, dirs: string[]): { sha256: string; files: number; bytes: number; symlinks: number } {
  const paths: string[] = [];
  for (const dir of dirs) walkFiles(join(root, dir), paths);
  const lines: string[] = [];
  let bytes = 0;
  let symlinks = 0;
  for (const path of paths) {
    const rel = relative(root, path).split(sep).join('/');
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      symlinks += 1;
      lines.push(`${sha256(`symlink:${readlinkSync(path)}`)}  ${rel}`);
      continue;
    }
    if (!stat.isFile()) {
      // A FIFO, socket or device is named, never read: reading a FIFO would block.
      lines.push(`${sha256('special')}  ${rel}`);
      continue;
    }
    const data = readFileSync(path);
    bytes += data.length;
    lines.push(`${sha256(data)}  ${rel}`);
  }
  return { sha256: sha256(lines.join('\n') + '\n'), files: paths.length, bytes, symlinks };
}

/** Copies a directory tree, cloning files copy-on-write where the filesystem can. */
function cloneTree(from: string, to: string, skip: (name: string) => boolean = () => false): number {
  let skipped = 0;
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (skip(entry.name)) {
      skipped += 1;
      continue;
    }
    if (entry.isDirectory()) skipped += cloneTree(src, dst, skip);
    else if (entry.isSymbolicLink()) cpSync(src, dst, { verbatimSymlinks: true });
    else if (entry.isFile()) copyFileSync(src, dst, fsConstants.COPYFILE_FICLONE);
    // A FIFO, socket or device is not copied: copying a FIFO would block.
  }
  return skipped;
}

// --------------------------------------------------------------------- scanner

export interface ResolvedScanner {
  name: string;
  spec: string;
  version: string;
  source: 'npm' | 'checkout';
  entryPath: string;
  /** The entry as recorded: relative to the install directory or checkout. */
  entryRel: string;
  integrity: string | null;
  resolved: string | null;
  lockSha256: string | null;
  gitCommit: string | null;
  gitDirty: number | null;
}

const isReleaseVersion = (v: string) => /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(v);

function installScanner(name: string, version: string, dir: string, log: (line: string) => void): void {
  mkdirSync(dir, { recursive: true });
  const home = mkdtempSync(join(tmpdir(), 'oasb-npm-home-'));
  try {
    const npmrc = join(home, 'npmrc');
    writeFileSync(npmrc, '');
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'oasb-external-scanner', private: true }) + '\n');
    log(`installing ${name}@${version} into ${dir} (empty npm user config, empty HOME)`);
    const r = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--userconfig', npmrc, `${name}@${version}`], {
      cwd: dir,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, TMPDIR: tmpdir() },
    });
    if (r.status !== 0) throw new Error(`npm install ${name}@${version} failed (status ${r.status})`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

/**
 * Finds the scanner to run: an npm install directory (node_modules/<name> and
 * package-lock.json), or a git checkout of the scanner built from source.
 * Without a directory, a release version is installed into the temporary
 * directory first.
 */
export function resolveScanner(
  adapter: ScannerAdapter,
  spec: string,
  scannerDir?: string,
  log: (line: string) => void = () => {},
): ResolvedScanner {
  const at = spec.lastIndexOf('@');
  if (at <= 0) throw new UsageError(`--scanner takes <name>@<version>, not ${spec}`);
  const name = spec.slice(0, at);
  const want = spec.slice(at + 1);
  if (name !== adapter.name) throw new UsageError(`the adapter is ${adapter.name}, the scanner is ${name}`);
  let dir = scannerDir ? resolve(scannerDir) : undefined;
  if (!dir) {
    if (!isReleaseVersion(want)) throw new UsageError(`${spec} is not a release version: pass --scanner-dir <checkout>`);
    dir = join(tmpdir(), 'oasb-external-scanners', `${name}-${want}`);
    if (!existsSync(join(dir, 'node_modules', name, 'package.json'))) installScanner(name, want, dir, log);
  }
  const pkgDir = join(dir, 'node_modules', name);
  const lockPath = join(dir, 'package-lock.json');
  if (existsSync(join(pkgDir, 'package.json')) && existsSync(lockPath)) {
    const lockText = readFileSync(lockPath, 'utf8');
    const pinned = JSON.parse(lockText).packages?.[`node_modules/${name}`];
    const version = String(JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version);
    if (!pinned || pinned.version !== version) throw new UsageError(`${lockPath} does not pin the installed ${name}@${version}`);
    if (isReleaseVersion(want) && version !== want) throw new UsageError(`${dir} holds ${name}@${version}, not ${want}`);
    const entryPath = join(pkgDir, adapter.entry);
    if (!existsSync(entryPath)) throw new UsageError(`${entryPath} does not exist`);
    return {
      name, spec, version, source: 'npm', entryPath, entryRel: `node_modules/${name}/${adapter.entry}`,
      integrity: typeof pinned.integrity === 'string' ? pinned.integrity : null,
      resolved: typeof pinned.resolved === 'string' ? pinned.resolved : null,
      lockSha256: sha256(lockText), gitCommit: null, gitDirty: null,
    };
  }
  const pkgPath = join(dir, 'package.json');
  if (existsSync(pkgPath) && JSON.parse(readFileSync(pkgPath, 'utf8')).name === name) {
    const state = gitState(dir);
    if (!state.commit) throw new UsageError(`${dir} is a checkout of ${name} but not a git checkout; its commit cannot be recorded`);
    if (state.dirty !== 0) throw new UsageError(`${dir} has ${state.dirty} modified or untracked paths; build the scanner from a clean checkout`);
    const entryPath = join(dir, adapter.entry);
    if (!existsSync(entryPath)) throw new UsageError(`${entryPath} does not exist; build the checkout first`);
    return {
      name, spec, version: String(JSON.parse(readFileSync(pkgPath, 'utf8')).version), source: 'checkout', entryPath,
      entryRel: adapter.entry, integrity: null, resolved: null,
      lockSha256: existsSync(lockPath) ? sha256(readFileSync(lockPath)) : null,
      gitCommit: state.commit, gitDirty: state.dirty,
    };
  }
  throw new UsageError(`${dir} is neither an npm install of ${name} nor a checkout of it`);
}

// ---------------------------------------------------------------------- scans

export interface PredictionRow {
  sample: string;
  label: Label;
  split: Split;
  verdict: Verdict | null;
  excluded: Excluded | null;
  /** Failed findings as `checkId:severity`, sorted: the check set. */
  failed: string[];
  /** The checks that decide a malicious verdict. */
  flaggedBy: string[];
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  measured: boolean | null;
  scannerVersion: string | null;
  modelPresentBefore: boolean;
  modelPresentAfter: boolean;
  neutralId?: string;
}

interface ChildResult {
  stdout: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  tooLarge: boolean;
  spawnError: boolean;
}

function killGroup(pid: number | undefined): void {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // the group has already exited
  }
}

function runChild(argv: string[], cwd: string, env: Record<string, string>, timeoutMs: number): Promise<ChildResult> {
  return new Promise(resolveRun => {
    const chunks: Buffer[] = [];
    let size = 0;
    let timedOut = false;
    let tooLarge = false;
    let settled = false;
    const child = spawn(argv[0], argv.slice(1), { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const finish = (result: Omit<ChildResult, 'stdout' | 'timedOut' | 'tooLarge'>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killGroup(child.pid);
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolveRun({ ...result, stdout: Buffer.concat(chunks).toString('utf8'), timedOut, tooLarge });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid);
    }, timeoutMs);
    child.stdout?.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > OUTPUT_CAP_BYTES) {
        tooLarge = true;
        killGroup(child.pid);
        return;
      }
      chunks.push(chunk);
    });
    child.stderr?.resume();
    child.on('error', () => finish({ exitCode: null, signal: null, spawnError: true }));
    child.on('exit', (code, signal) => {
      // A descendant can hold stdout open after the scanner exits; give the
      // pipe a moment to drain, then stop waiting for it.
      let closed = false;
      child.stdout?.on('close', () => {
        closed = true;
        finish({ exitCode: code, signal, spawnError: false });
      });
      setTimeout(() => {
        if (!closed) finish({ exitCode: code, signal, spawnError: false });
      }, 2000);
      if (child.stdout?.closed || !child.stdout) finish({ exitCode: code, signal, spawnError: false });
    });
  });
}

/** Removes a scratch tree; what a stray process still holds is left to the operating system's temporary-file cleanup. */
function removeQuietly(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 2 });
  } catch {
    // left in place
  }
}

async function pool<T, R>(items: T[], workers: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, items.length)) }, worker));
  return results;
}

// --------------------------------------------------------------------- scoring

export interface ClassCount {
  n: number;
  scanned: number;
  excluded: number;
}

export interface Metrics {
  malicious: ClassCount;
  benign: ClassCount;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  fpr: number | null;
}

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

function metricsOf(counts: { malicious: ClassCount; benign: ClassCount; tp: number; fp: number; fn: number; tn: number }): Metrics {
  const { tp, fp, fn, tn } = counts;
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const f1 = precision === null || recall === null || precision + recall === 0 ? null : (2 * precision * recall) / (precision + recall);
  return { ...counts, precision, recall, f1, fpr: ratio(fp, fp + tn) };
}

/** Precision, recall, F1 and FPR over every scanned sample; excluded samples are counted per class, not dropped. */
export function scoreRows(rows: Array<Pick<PredictionRow, 'label' | 'verdict' | 'excluded'>>): Metrics {
  const cls = (label: Label): ClassCount => {
    const of = rows.filter(r => r.label === label);
    const excluded = of.filter(r => r.excluded !== null).length;
    return { n: of.length, scanned: of.length - excluded, excluded };
  };
  const scanned = rows.filter(r => r.excluded === null);
  const count = (label: Label, verdict: Verdict) => scanned.filter(r => r.label === label && r.verdict === verdict).length;
  return metricsOf({
    malicious: cls('malicious'),
    benign: cls('benign'),
    tp: count('malicious', 'malicious'),
    fp: count('benign', 'malicious'),
    fn: count('malicious', 'benign'),
    tn: count('benign', 'benign'),
  });
}

/** The flag-everything baseline on the same scanned composition. */
function flagAll(m: Metrics): Metrics {
  return metricsOf({ malicious: m.malicious, benign: m.benign, tp: m.tp + m.fn, fp: m.fp + m.tn, fn: 0, tn: 0 });
}

export interface Summary {
  schema: string;
  runId: string;
  metrics: { all: Metrics; dev: Metrics; 'held-out': Metrics };
  flagAll: Metrics;
  excludedBy: Record<Excluded, number>;
  scannerVersionsSeen: string[];
  measuredFalse: number;
  modelPresentBefore: number;
  modelPresentAfter: number;
}

export function summarize(rows: PredictionRow[], runId: string): Summary {
  const all = scoreRows(rows);
  const excludedBy = Object.fromEntries(EXCLUDED_REASONS.map(r => [r, rows.filter(row => row.excluded === r).length])) as Record<Excluded, number>;
  return {
    schema: RUN_SCHEMA,
    runId,
    metrics: {
      all,
      dev: scoreRows(rows.filter(r => r.split === 'dev')),
      'held-out': scoreRows(rows.filter(r => r.split === 'held-out')),
    },
    flagAll: flagAll(all),
    excludedBy,
    scannerVersionsSeen: [...new Set(rows.map(r => r.scannerVersion).filter((v): v is string => v !== null))].sort(),
    measuredFalse: rows.filter(r => r.measured === false).length,
    modelPresentBefore: rows.filter(r => r.modelPresentBefore).length,
    modelPresentAfter: rows.filter(r => r.modelPresentAfter).length,
  };
}

export interface Comparison {
  to: string;
  compared: number;
  verdictAgree: number;
  identicalCheckSet: number;
  verdictDisagree: number;
  gap: number | null;
  metricDelta: { precision: number | null; recall: number | null; f1: number | null; fpr: number | null };
  disagreements: string[];
}

const sameOutcome = (a: PredictionRow, b: PredictionRow) => a.verdict === b.verdict && a.excluded === b.excluded;

/** Per-sample agreement between a reference run and this run, over the samples both scanned. */
export function compareRows(reference: PredictionRow[], current: PredictionRow[], referenceRunId: string): Comparison {
  const byKey = new Map(reference.map(r => [r.sample, r]));
  const pairs = current.filter(r => byKey.has(r.sample)).map(r => [byKey.get(r.sample)!, r] as const);
  const verdictAgree = pairs.filter(([a, b]) => sameOutcome(a, b)).length;
  const identicalCheckSet = pairs.filter(([a, b]) => sameOutcome(a, b) && a.failed.join('\n') === b.failed.join('\n')).length;
  const ref = scoreRows(pairs.map(([a]) => a));
  const cur = scoreRows(pairs.map(([, b]) => b));
  const delta = (x: number | null, y: number | null) => (x === null || y === null ? null : y - x);
  return {
    to: referenceRunId,
    compared: pairs.length,
    verdictAgree,
    identicalCheckSet,
    verdictDisagree: pairs.length - verdictAgree,
    gap: pairs.length === 0 ? null : (pairs.length - verdictAgree) / pairs.length,
    metricDelta: {
      precision: delta(ref.precision, cur.precision),
      recall: delta(ref.recall, cur.recall),
      f1: delta(ref.f1, cur.f1),
      fpr: delta(ref.fpr, cur.fpr),
    },
    disagreements: pairs.filter(([a, b]) => !sameOutcome(a, b) || a.failed.join('\n') !== b.failed.join('\n')).map(([, b]) => b.sample).slice(0, 50),
  };
}

// ----------------------------------------------------------------- run record

export interface RunOptions {
  /** The corpus: the directory holding the class directories, or a directory above it. */
  corpus: string;
  malicious?: string;
  benign?: string;
  corpusName?: string;
  /** Refuse to run when the corpus checkout is at another commit. */
  corpusCommit?: string;
  adapter: ScannerAdapter;
  scanner: ResolvedScanner;
  /** Refuse to run when the scanner's tarball integrity differs. */
  integrity?: string;
  instrument: string;
  network: Network;
  /** The model-present arm: a model directory placed in each fresh HOME. */
  model?: string;
  neutral?: boolean;
  split?: 'all' | Split;
  sample?: number;
  seed?: string;
  samplesFrom?: string;
  determinismOf?: string;
  determinismN?: number;
  compareTo?: string;
  maxGap?: number;
  probeHost?: string;
  workers?: number;
  timeoutMs?: number;
  out?: string;
  log?: (line: string) => void;
}

export interface RunResult {
  status: 'complete' | 'already-complete';
  ok: boolean;
  out: string;
  record: any;
  summary: Summary | null;
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function readPredictions(dir: string): PredictionRow[] {
  const text = readFileSync(join(dir, 'predictions.jsonl'), 'utf8');
  return text.split('\n').filter(line => line !== '').map(line => JSON.parse(line) as PredictionRow);
}

function referenceRun(dir: string): { record: any; rows: PredictionRow[] } {
  const record = readJson(join(dir, 'record.json'));
  if (record.schema !== RUN_SCHEMA) throw new UsageError(`${dir} is not a run directory of this runner`);
  return { record, rows: readPredictions(dir) };
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'corpus';
}

const keysSha256 = (keys: string[]) => sha256([...keys].sort().join('\n') + '\n');

/** Scans the selected samples and writes the run directory. */
export async function runBenchmark(opts: RunOptions): Promise<RunResult> {
  const log = opts.log ?? ((line: string) => process.stderr.write(line + '\n'));
  const { adapter, scanner } = opts;
  const instrumentArgs = adapter.instruments[opts.instrument];
  if (!instrumentArgs) throw new UsageError(`${adapter.name} has no instrument ${opts.instrument} (${Object.keys(adapter.instruments).join(', ')})`);
  if (opts.network !== 'off' && opts.network !== 'on') throw new UsageError('--network is off or on');
  if (opts.integrity && opts.integrity !== scanner.integrity) {
    throw new UsageError(`${scanner.spec} has integrity ${scanner.integrity}, not ${opts.integrity}`);
  }
  if (opts.model && (!adapter.seedHome || !isDir(opts.model))) throw new UsageError(`--model ${opts.model}: not a directory, or ${adapter.name} takes no model`);
  const arm = opts.network === 'off' ? 'offline' : 'online';
  const classDirs: Record<Label, string> = { malicious: opts.malicious ?? 'malware', benign: opts.benign ?? 'benign' };
  const corpus = resolve(opts.corpus);
  const classRoot = locateClassRoot(corpus, classDirs);
  const { samples: allSamples, ignoredEntries } = listSamples(classRoot, classDirs);

  const runId = randomBytes(4).toString('hex');
  const startedAt = new Date().toISOString();
  const corpusGit = gitState(classRoot);
  const corpusName = slug(opts.corpusName ?? basename(git(classRoot, 'rev-parse', '--show-toplevel') ?? corpus));
  const out = resolve(
    opts.out ?? join(REPO_ROOT, 'results', `${startedAt.slice(0, 10)}-${corpusName}-${opts.instrument}-${arm}${opts.neutral ? '-neutral' : ''}-${runId}`),
  );
  if (existsSync(join(out, 'record.json'))) {
    const record = readJson(join(out, 'record.json'));
    log(`${out}: complete (run ${record.runId}); not run again`);
    return { status: 'already-complete', ok: record.ok === true, out, record, summary: readJson(join(out, 'summary.json')) };
  }
  if (existsSync(out)) throw new Error(`${out} exists and holds no record.json: not a run directory this runner completed`);
  const partial = `${out}.incomplete`;
  if (existsSync(partial)) {
    if (!existsSync(join(partial, INCOMPLETE_MARKER))) throw new Error(`${partial} exists and is not an incomplete run of this runner`);
    log(`${partial}: incomplete run removed; the run starts again whole`);
    rmSync(partial, { recursive: true, force: true });
  }

  // Selection.
  const split = opts.split ?? 'all';
  const references = [opts.determinismOf, opts.compareTo, opts.samplesFrom].filter(r => r !== undefined);
  if (references.length > 1) throw new UsageError('take one of --determinism-of, --compare-to and --samples-from');
  if (references.length === 1 && (opts.sample !== undefined || split !== 'all')) {
    throw new UsageError('a run that repeats the samples of another run takes no --sample and no --split');
  }
  let pool0 = allSamples.filter(s => split === 'all' || s.split === split);
  const reference = opts.determinismOf ?? opts.compareTo ?? opts.samplesFrom;
  const ref = reference ? referenceRun(reference) : null;
  let keys: string[];
  const seed = opts.determinismOf ? (opts.seed ?? 'determinism') : opts.seed;
  if (ref) {
    keys = ref.rows.map(r => r.sample);
    if (opts.determinismOf) keys = selectSeeded(keys, Math.min(opts.determinismN ?? DETERMINISM_N, keys.length), seed!);
  } else if (opts.sample !== undefined) {
    if (opts.seed === undefined) throw new UsageError('--sample needs --seed');
    keys = selectSeeded(pool0.map(s => s.key), opts.sample, opts.seed);
  } else {
    keys = pool0.map(s => s.key);
  }
  const byKey = new Map(allSamples.map(s => [s.key, s]));
  const missing = keys.filter(k => !byKey.has(k));
  if (missing.length > 0) throw new UsageError(`${missing.length} samples of ${reference} are not in this corpus (first: ${missing[0]})`);
  pool0 = keys.map(k => byKey.get(k)!);
  if (pool0.length === 0) throw new UsageError('no sample selected');

  if (opts.determinismOf && ref) {
    const r = ref.record;
    const same = r.scanner.name === scanner.name && r.scanner.version === scanner.version && r.scanner.integrity === scanner.integrity
      && r.scanner.gitCommit === scanner.gitCommit && r.instrument === opts.instrument && r.network.arm === arm && r.neutral.enabled === !!opts.neutral
      && r.model.seeded === !!opts.model;
    if (!same) throw new UsageError('a determinism re-run uses the scanner, instrument and arm of the run it repeats');
  }
  if (opts.compareTo && ref) {
    const r = ref.record;
    if (r.scanner.name !== scanner.name || r.scanner.version !== scanner.version || r.instrument !== opts.instrument || r.network.arm !== arm) {
      throw new UsageError('--compare-to takes a run of the same scanner, instrument and network arm');
    }
  }
  if (opts.corpusCommit && corpusGit.commit !== opts.corpusCommit) {
    throw new UsageError(`the corpus checkout is at ${corpusGit.commit}, not ${opts.corpusCommit}`);
  }
  if (corpusGit.dirty) throw new UsageError(`the corpus checkout has ${corpusGit.dirty} modified or untracked paths; scan it unmodified`);

  // The offline arm proves its denial before any sample is scanned.
  const wrapper = opts.network === 'off' ? offlineWrapper() : [];
  const probeHost = opts.probeHost ?? DEFAULT_PROBE_HOST;
  let deniedProbe: string | null = null;
  let hostProbe: string | null = null;
  if (opts.network === 'off') {
    deniedProbe = probeNetwork(wrapper, probeHost);
    if (deniedProbe === 'connected') throw new Error(`the offline arm reached ${probeHost}:443 through ${wrapper[0]}; refusing to scan`);
    hostProbe = probeNetwork([], probeHost);
    log(`offline arm: connect to ${probeHost}:443 inside ${basename(wrapper[0])}: ${deniedProbe}; outside: ${hostProbe}`);
  }

  log(`hashing the corpus (${allSamples.length} samples)`);
  const manifest = manifestOf(classRoot, LABELS.map(l => classDirs[l]));
  const harness = gitState(REPO_ROOT);
  const harnessFiles = HARNESS_FILES.map(path => ({ path, sha256: sha256(readFileSync(join(REPO_ROOT, path))) }));
  const modelFiles: Array<{ path: string; sha256: string }> = [];
  if (opts.model) {
    const files: string[] = [];
    walkFiles(opts.model, files);
    for (const f of files) modelFiles.push({ path: relative(opts.model, f).split(sep).join('/'), sha256: sha256(readFileSync(f)) });
  }

  mkdirSync(partial, { recursive: true });
  writeFileSync(join(partial, INCOMPLETE_MARKER), '');
  const scratch = mkdtempSync(join(tmpdir(), 'oasb-external-'));
  let droppedFiles = 0;
  const scanDirs = new Map<string, string>();
  try {
    if (opts.neutral) {
      const neutralRoot = join(scratch, 'neutral');
      for (const s of pool0) {
        const copy = join(neutralRoot, neutralId(s.key));
        droppedFiles += cloneTree(s.dir, copy, name => NEUTRAL_DROPPED.includes(name));
        scanDirs.set(s.key, copy);
      }
    }
    const workers = opts.workers ?? Math.max(1, Math.min(8, cpus().length));
    const timeoutMs = opts.timeoutMs ?? 120000;
    let done = 0;
    let excludedSoFar = 0;
    const t0 = Date.now();
    log(`scanning ${pool0.length} samples with ${scanner.spec} ${opts.instrument}, ${arm}${opts.neutral ? ', neutralised' : ''}, ${workers} workers`);
    const rows = await pool(pool0, workers, async (s): Promise<PredictionRow> => {
      const box = mkdtempSync(join(scratch, 's-'));
      const home = join(box, 'home');
      const tmp = join(box, 'tmp');
      mkdirSync(home);
      mkdirSync(tmp);
      try {
        if (opts.model) adapter.seedHome!(home, opts.model);
        const modelPresentBefore = adapter.modelPresent?.(home) ?? false;
        const argv = [...wrapper, process.execPath, scanner.entryPath, ...instrumentArgs];
        const started = Date.now();
        const res = await runChild(argv, scanDirs.get(s.key) ?? s.dir, scannerEnv(home, tmp), timeoutMs);
        const durationMs = Date.now() - started;
        const modelPresentAfter = adapter.modelPresent?.(home) ?? false;
        let excluded: Excluded | null = res.timedOut ? 'timeout' : res.tooLarge ? 'output-too-large' : res.spawnError ? 'spawn-error' : null;
        let parsed: ParsedReport | null = null;
        if (excluded === null) {
          try {
            parsed = adapter.parse(res.stdout);
          } catch {
            excluded = 'unparsed';
          }
        }
        const findings = parsed?.findings ?? [];
        const row: PredictionRow = {
          sample: s.key,
          label: s.label,
          split: s.split,
          verdict: parsed ? verdictOf(findings) : null,
          excluded,
          failed: failedSet(findings),
          flaggedBy: flaggingChecks(findings),
          exitCode: res.exitCode,
          signal: res.signal,
          durationMs,
          measured: parsed?.measured ?? null,
          scannerVersion: parsed?.scannerVersion ?? null,
          modelPresentBefore,
          modelPresentAfter,
        };
        if (opts.neutral) row.neutralId = neutralId(s.key);
        return row;
      } finally {
        removeQuietly(box);
        done += 1;
        if (done % 100 === 0 || done === pool0.length) {
          log(`scanned ${done}/${pool0.length} in ${Math.round((Date.now() - t0) / 1000)}s`);
        }
      }
    });
    rows.sort((a, b) => (a.sample < b.sample ? -1 : 1));
    excludedSoFar = rows.filter(r => r.excluded !== null).length;

    const summary = summarize(rows, runId);
    let determinism: any = null;
    let comparison: any = null;
    if (opts.determinismOf && ref) {
      const c = compareRows(ref.rows, rows, ref.record.runId);
      determinism = {
        of: ref.record.runId,
        requested: pool0.length,
        compared: c.compared,
        verdictAgree: c.verdictAgree,
        identicalCheckSet: c.identicalCheckSet,
        disagreements: c.disagreements,
        pass: c.compared === pool0.length && c.verdictAgree === c.compared && c.identicalCheckSet === c.compared,
      };
    }
    if (opts.compareTo && ref) {
      const c = compareRows(ref.rows, rows, ref.record.runId);
      const maxGap = opts.maxGap ?? NEUTRAL_GAP_LIMIT;
      comparison = { ...c, referenceNeutral: ref.record.neutral.enabled, maxGap, pass: c.gap !== null && c.gap <= maxGap };
    }
    const ok = (determinism?.pass ?? true) && (comparison?.pass ?? true);
    const record = {
      schema: RUN_SCHEMA,
      runId,
      ok,
      startedAt,
      finishedAt: new Date().toISOString(),
      harness: {
        name: 'scripts/run-external-skill-benchmark.ts',
        commit: harness.commit,
        dirty: harness.dirty !== 0,
        files: harnessFiles,
      },
      scanner: {
        name: scanner.name,
        spec: scanner.spec,
        version: scanner.version,
        source: scanner.source,
        integrity: scanner.integrity,
        resolved: scanner.resolved,
        lockSha256: scanner.lockSha256,
        gitCommit: scanner.gitCommit,
        gitDirty: scanner.gitDirty,
      },
      instrument: opts.instrument,
      argv: ['node', scanner.entryRel, ...instrumentArgs],
      cwd: 'the sample directory',
      network: { arm, wrapper, probeHost: opts.network === 'off' ? probeHost : null, deniedProbe, hostProbe },
      environment: {
        names: [...SCANNER_ENV_NAMES],
        values: { LANG: 'en_US.UTF-8', OPENA2A_TELEMETRY: 'off', PATH: '<node directory>:/usr/bin:/bin:/usr/sbin:/sbin' },
        home: 'fresh-empty-per-sample',
        tmpdir: 'fresh-empty-per-sample',
      },
      model: { seeded: !!opts.model, files: modelFiles, manifestSha256: opts.model ? sha256(modelFiles.map(f => `${f.sha256}  ${f.path}`).join('\n') + '\n') : null },
      neutral: {
        enabled: !!opts.neutral,
        dropped: opts.neutral ? [...NEUTRAL_DROPPED] : [],
        droppedFiles,
        ids: opts.neutral ? 'n- and the first 16 hex digits of sha256("neutral\\n" + sample)' : null,
      },
      runtime: { node: process.version, platform: process.platform, arch: process.arch },
      corpus: {
        name: corpusName,
        commit: corpusGit.commit,
        tree: git(classRoot, 'rev-parse', 'HEAD:./'),
        dirty: corpusGit.dirty,
        manifestSha256: manifest.sha256,
        files: manifest.files,
        bytes: manifest.bytes,
        symlinks: manifest.symlinks,
        classDirs,
        samples: { malicious: allSamples.filter(s => s.label === 'malicious').length, benign: allSamples.filter(s => s.label === 'benign').length },
        ignoredEntries,
      },
      selection: {
        split,
        sample: opts.sample ?? null,
        seed: seed ?? null,
        from: ref ? ref.record.runId : null,
        n: rows.length,
        keysSha256: keysSha256(rows.map(r => r.sample)),
      },
      rule: { text: RULE_TEXT, exclusions: [...RULE_EXCLUSIONS].sort(), source: RULE_SOURCE },
      counts: {
        malicious: rows.filter(r => r.label === 'malicious').length,
        benign: rows.filter(r => r.label === 'benign').length,
        excluded: excludedSoFar,
      },
      metrics: summary.metrics.all,
      workers,
      timeoutMs,
      determinism,
      comparison,
      outputs: { predictions: 'predictions.jsonl', summary: 'summary.json' },
    };
    writeFileSync(join(partial, 'predictions.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
    writeFileSync(join(partial, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    writeFileSync(join(partial, 'record.json'), JSON.stringify(record, null, 2) + '\n');
    rmSync(join(partial, INCOMPLETE_MARKER));
    renameSync(partial, out);
    return { status: 'complete', ok, out, record, summary };
  } finally {
    removeQuietly(scratch);
  }
}

// ---------------------------------------------------------------------- verify

/**
 * Checks a run directory against itself: the files the runner writes and no
 * other, a record that names every pinned input, the published exclusions, a
 * verdict on every row that the rule gives from the row's own check set, and a
 * summary and record totals that the rows give. Returns the problems found.
 */
export function verifyRun(dir: string, opts: { requireCleanHarness?: boolean } = {}): string[] {
  const problems: string[] = [];
  const files = readdirSync(dir).sort();
  if (JSON.stringify(files) !== JSON.stringify(RUN_FILES)) problems.push(`files are ${files.join(', ')}, not ${RUN_FILES.join(', ')}`);
  let record: any;
  let summary: any;
  let rows: PredictionRow[];
  try {
    record = readJson(join(dir, 'record.json'));
    summary = readJson(join(dir, 'summary.json'));
    rows = readPredictions(dir);
  } catch (e) {
    return [...problems, `unreadable run: ${(e as Error).message}`];
  }
  const hex = (n: number) => new RegExp(`^[0-9a-f]{${n}}$`);
  const need = (cond: unknown, what: string) => {
    if (!cond) problems.push(what);
  };
  need(record.schema === RUN_SCHEMA, `schema ${record.schema}`);
  need(hex(40).test(record.harness?.commit ?? ''), 'harness commit');
  if (opts.requireCleanHarness) need(record.harness?.dirty === false, 'harness checkout was dirty');
  const s = record.scanner ?? {};
  need(typeof s.name === 'string' && s.name !== '' && typeof s.version === 'string' && s.version !== '', 'scanner name and version');
  const npmPinned = s.source === 'npm' && /^sha(256|384|512)-\S+$/.test(s.integrity ?? '') && hex(64).test(s.lockSha256 ?? '');
  const checkoutPinned = s.source === 'checkout' && hex(40).test(s.gitCommit ?? '') && s.gitDirty === 0;
  need(npmPinned || checkoutPinned, 'scanner pin: tarball integrity and lock sha256, or a clean checkout commit');
  need(hex(40).test(record.corpus?.commit ?? ''), 'corpus commit');
  need(hex(64).test(record.corpus?.manifestSha256 ?? ''), 'corpus manifest sha256');
  need(record.corpus?.dirty === 0, 'corpus checkout was modified');
  need(Array.isArray(record.argv) && record.argv.length > 1 && record.argv.every((a: unknown) => typeof a === 'string'), 'argv');
  need(['offline', 'online'].includes(record.network?.arm), 'network arm');
  if (record.network?.arm === 'offline') {
    need(Array.isArray(record.network.wrapper) && record.network.wrapper.length > 0, 'offline wrapper');
    need(typeof record.network.deniedProbe === 'string' && record.network.deniedProbe !== 'connected', 'offline denial probe');
  }
  need(JSON.stringify(record.environment?.names) === JSON.stringify(SCANNER_ENV_NAMES), 'environment names');
  need(record.environment?.home === 'fresh-empty-per-sample', 'fresh HOME per sample');
  need(!Number.isNaN(Date.parse(record.startedAt)) && !Number.isNaN(Date.parse(record.finishedAt)), 'run dates');
  need(JSON.stringify(record.rule?.exclusions) === JSON.stringify([...RULE_EXCLUSIONS].sort()), 'the rule exclusions are not the published ones');

  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const at = `row ${i + 1} (${row.sample})`;
    if (seen.has(row.sample)) problems.push(`${at}: repeated`);
    seen.add(row.sample);
    if (!LABELS.includes(row.label)) problems.push(`${at}: label ${row.label}`);
    if (row.sample !== `${row.label}/${row.sample.slice(row.sample.indexOf('/') + 1)}`) problems.push(`${at}: sample key does not carry its label`);
    if (row.split !== splitOf(row.sample.slice(row.sample.indexOf('/') + 1))) problems.push(`${at}: split`);
    if (row.excluded !== null) {
      if (!EXCLUDED_REASONS.includes(row.excluded) || row.verdict !== null) problems.push(`${at}: excluded row with a verdict`);
    } else if (row.verdict !== verdictOf(findingsOfFailedSet(row.failed))) {
      problems.push(`${at}: verdict ${row.verdict} is not the rule's verdict on its check set`);
    }
  });
  const counts = {
    malicious: rows.filter(r => r.label === 'malicious').length,
    benign: rows.filter(r => r.label === 'benign').length,
    excluded: rows.filter(r => r.excluded !== null).length,
  };
  need(JSON.stringify(record.counts) === JSON.stringify(counts), 'record counts are not the rows');
  need(record.selection?.n === rows.length && record.selection?.keysSha256 === keysSha256(rows.map(r => r.sample)), 'selection');
  const recomputed = summarize(rows, record.runId);
  need(JSON.stringify(summary) === JSON.stringify(recomputed), 'summary.json is not the summary of predictions.jsonl');
  need(JSON.stringify(record.metrics) === JSON.stringify(recomputed.metrics.all), 'record metrics are not the summary');
  need(record.ok === ((record.determinism?.pass ?? true) && (record.comparison?.pass ?? true)), 'record ok');
  return problems;
}

// ------------------------------------------------------------------------- CLI

export const USAGE = `Usage: npx tsx scripts/run-external-skill-benchmark.ts --corpus <dir> --scanner <name>@<version> [options]

Scans every sample of a skill corpus with a pinned scanner, one child process per sample
(cwd = the sample, a fresh empty HOME, a five-variable environment), scores each sample with
the published OASB verdict rule, prints the table and writes a run directory.

  --corpus <dir>              the directory holding the class directories, or one above it
  --malicious <name>          malicious class directory (default: malware)
  --benign <name>             benign class directory (default: benign)
  --corpus-commit <sha>       refuse to run when the corpus checkout is at another commit
  --corpus-name <name>        name used in the default run directory
  --scanner <name>@<version>  scanner and release (adapters: ${Object.keys(ADAPTERS).join(', ')})
  --scanner-dir <dir>         an npm install of the scanner, or a built git checkout of it
                              (default: install the release into the temporary directory)
  --integrity <sha512-...>    refuse to run when the scanner's tarball integrity differs
  --instrument <name>         check (default) or secure
  --network off|on            off (default): outbound network denied to the scanner process
  --model <dir>               place this model directory in each fresh HOME (model-present arm)
  --neutral                   scan copies under neutral ids without _meta.json (leak control)
  --compare-to <run dir>      compare per-sample verdicts with that run; fails above --max-gap
  --max-gap <x>               default ${NEUTRAL_GAP_LIMIT}
  --determinism-of <run dir>  re-scan up to --determinism-n samples of that run; all must agree
  --determinism-n <n>         default ${DETERMINISM_N}
  --split all|dev|held-out    dev: sha256(directory name) starts 0-7; held-out: 8-f (default all)
  --sample <n> --seed <s>     a seeded selection of n samples
  --samples-from <run dir>    exactly the samples of that run
  --workers <n>               parallel scans (default: up to 8)
  --timeout-ms <n>            per sample (default 120000); a timeout is an excluded sample
  --probe-host <ip>           host for the offline arm's connect probe (default ${DEFAULT_PROBE_HOST})
  --out <dir>                 run directory (default results/<date>-<corpus>-<instrument>-<arm>-<runId>/);
                              a complete one is not run again, an incomplete one is re-run whole
  --verify <run dir>          check a run directory against itself and exit
  --help

Exit status: 0 when the run completed and every check it was asked for passed, 1 when a
determinism or comparison check failed, 2 on a usage error.`;

const VALUE_FLAGS = new Set([
  'corpus', 'malicious', 'benign', 'corpus-commit', 'corpus-name', 'scanner', 'scanner-dir', 'integrity', 'instrument', 'network',
  'model', 'compare-to', 'max-gap', 'determinism-of', 'determinism-n', 'split', 'sample', 'seed', 'samples-from', 'workers',
  'timeout-ms', 'probe-host', 'out', 'verify',
]);
const BOOLEAN_FLAGS = new Set(['neutral', 'help']);

export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith('--')) throw new UsageError(`unexpected argument ${raw}`);
    const eq = raw.indexOf('=');
    const name = raw.slice(2, eq === -1 ? undefined : eq);
    if (BOOLEAN_FLAGS.has(name)) {
      if (eq !== -1) throw new UsageError(`--${name} takes no value`);
      args[name] = true;
    } else if (VALUE_FLAGS.has(name)) {
      const value = eq === -1 ? argv[++i] : raw.slice(eq + 1);
      if (value === undefined || value === '') throw new UsageError(`--${name} needs a value`);
      args[name] = value;
    } else {
      throw new UsageError(`unknown option --${name}`);
    }
  }
  return args;
}

function int(value: string | boolean | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new UsageError(`--${name} takes a positive integer`);
  return n;
}

const fmt = (x: number | null) => (x === null ? '   -  ' : x.toFixed(4));

export function formatTable(record: any, summary: Summary): string {
  const row = (name: string, m: Metrics) =>
    `${name.padEnd(28)} ${String(m.tp).padStart(6)} ${String(m.fp).padStart(6)} ${String(m.fn).padStart(6)} ${String(m.tn).padStart(6)}   ${fmt(m.precision)}  ${fmt(m.recall)}  ${fmt(m.f1)}  ${fmt(m.fpr)}  ${String(m.malicious.excluded + m.benign.excluded).padStart(8)}`;
  const all = summary.metrics.all;
  const lines = [
    `${record.scanner.spec} ${record.instrument}, network ${record.network.arm}${record.neutral.enabled ? ', neutralised' : ''}${record.model.seeded ? ', model seeded' : ''}`,
    `corpus ${record.corpus.name} at ${record.corpus.commit ?? 'no commit'}, manifest ${record.corpus.manifestSha256.slice(0, 16)}`,
    `n malicious ${all.malicious.n} (excluded ${all.malicious.excluded}), n benign ${all.benign.n} (excluded ${all.benign.excluded}); run ${record.runId}`,
    '',
    `${''.padEnd(28)} ${'tp'.padStart(6)} ${'fp'.padStart(6)} ${'fn'.padStart(6)} ${'tn'.padStart(6)}   precision recall  F1      FPR     excluded`,
    row(`${record.scanner.name} ${record.scanner.version}`, all),
    row('  dev half', summary.metrics.dev),
    row('  held-out half', summary.metrics['held-out']),
    row('flag every sample', summary.flagAll),
  ];
  if (record.determinism) {
    const d = record.determinism;
    lines.push('', `determinism against run ${d.of}: ${d.verdictAgree}/${d.requested} verdicts, ${d.identicalCheckSet}/${d.requested} check sets: ${d.pass ? 'pass' : 'FAIL'}`);
  }
  if (record.comparison) {
    const c = record.comparison;
    lines.push('', `comparison with run ${c.to}: ${c.verdictDisagree} of ${c.compared} verdicts differ, gap ${c.gap}, limit ${c.maxGap}: ${c.pass ? 'pass' : 'FAIL'}`);
  }
  return lines.join('\n');
}

export async function runCli(argv: string[], print: (text: string) => void = t => process.stdout.write(t + '\n')): Promise<number> {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      print(USAGE);
      return 0;
    }
    if (typeof args.verify === 'string') {
      const problems = verifyRun(resolve(args.verify));
      print(problems.length === 0 ? `${args.verify}: consistent` : problems.map(p => `${args.verify}: ${p}`).join('\n'));
      return problems.length === 0 ? 0 : 1;
    }
    if (typeof args.corpus !== 'string') throw new UsageError('--corpus is required');
    if (typeof args.scanner !== 'string') throw new UsageError('--scanner is required');
    const name = args.scanner.slice(0, Math.max(0, args.scanner.lastIndexOf('@')));
    const adapter = ADAPTERS[name];
    if (!adapter) throw new UsageError(`no adapter for scanner ${name || args.scanner} (adapters: ${Object.keys(ADAPTERS).join(', ')})`);
    if (!isDir(resolve(args.corpus))) throw new UsageError(`--corpus ${args.corpus} is not a directory`);
    const split = (args.split ?? 'all') as string;
    if (!['all', 'dev', 'held-out'].includes(split)) throw new UsageError('--split is all, dev or held-out');
    const maxGap = args['max-gap'] === undefined ? undefined : Number(args['max-gap']);
    if (maxGap !== undefined && !(maxGap >= 0 && maxGap <= 1)) throw new UsageError('--max-gap takes a number from 0 to 1');
    const log = (line: string) => process.stderr.write(line + '\n');
    const scanner = resolveScanner(adapter, args.scanner, args['scanner-dir'] as string | undefined, log);
    const result = await runBenchmark({
      corpus: args.corpus,
      malicious: args.malicious as string | undefined,
      benign: args.benign as string | undefined,
      corpusName: args['corpus-name'] as string | undefined,
      corpusCommit: args['corpus-commit'] as string | undefined,
      adapter,
      scanner,
      integrity: args.integrity as string | undefined,
      instrument: (args.instrument as string | undefined) ?? 'check',
      network: ((args.network as string | undefined) ?? 'off') as Network,
      model: args.model === undefined ? undefined : resolve(args.model as string),
      neutral: args.neutral === true,
      split: split as 'all' | Split,
      sample: int(args.sample, 'sample'),
      seed: args.seed as string | undefined,
      samplesFrom: args['samples-from'] as string | undefined,
      determinismOf: args['determinism-of'] as string | undefined,
      determinismN: int(args['determinism-n'], 'determinism-n'),
      compareTo: args['compare-to'] as string | undefined,
      maxGap,
      probeHost: args['probe-host'] as string | undefined,
      workers: int(args.workers, 'workers'),
      timeoutMs: int(args['timeout-ms'], 'timeout-ms'),
      out: args.out as string | undefined,
      log,
    });
    if (result.summary) print(formatTable(result.record, result.summary));
    print(`\nrun directory: ${result.out}`);
    return result.ok ? 0 : 1;
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`${e.message}\n\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`${(e as Error).message}\n`);
    return 1;
  }
}
