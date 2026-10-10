/**
 * Input verification for the pinned benchmark harness.
 *
 * Every check here runs before anything is scanned, and again after the scan
 * so an input that changed during the run is caught. A failed check throws
 * PinError and names the input.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DVAAReadFile } from '../dvaa-suite.js';
import { PinError, type DvaaPin, type HackmyagentPin, type NanomindPin } from './pins.js';

function sha256Hex(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function byPath(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}

/**
 * Relative paths of every non-directory entry under `root`, sorted by byte
 * order. Directories named in `skipDirs` are not entered.
 */
function listFiles(root: string, skipDirs: Set<string> = new Set()): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      const relPath = rel ? `${rel}/${entry}` : entry;
      if (lstatSync(abs).isDirectory()) {
        if (!skipDirs.has(entry)) walk(abs, relPath);
      } else {
        out.push(relPath);
      }
    }
  };
  walk(root, '');
  return out.sort(byPath);
}

function shortList(items: string[]): string {
  const shown = items.slice(0, 5).join(', ');
  return items.length > 5 ? `${shown} and ${items.length - 5} more` : shown;
}

// ---------------------------------------------------------------------------
// OASB checkout and corpus
// ---------------------------------------------------------------------------

export interface VerifiedCorpus {
  oasbCommit: string;
  corpusPath: string;
  corpusSha256: string;
  corpusText: string;
}

/**
 * The OASB checkout must be clean outside results/, and the corpus file must
 * be tracked, so the scoring code and the corpus are both the committed ones.
 */
export function verifyCorpus(oasbRoot: string, corpusPath = 'corpus/v2.json'): VerifiedCorpus {
  let oasbCommit: string;
  try {
    oasbCommit = git(oasbRoot, ['rev-parse', 'HEAD']).trim();
  } catch {
    throw new PinError('unpinned input: the OASB directory is not a git checkout with a commit');
  }
  const status = git(oasbRoot, ['status', '--porcelain', '--untracked-files=all', '--', '.', ':(exclude)results'])
    .split('\n')
    .filter(Boolean);
  if (status.length > 0) {
    throw new PinError(
      `dirty input tree: the OASB checkout has uncommitted changes (${shortList(status.map(l => l.slice(3)))}); ` +
        'commit or remove them so the scoring code and corpus are the committed ones',
    );
  }
  try {
    git(oasbRoot, ['ls-files', '--error-unmatch', '--', corpusPath]);
  } catch {
    throw new PinError(`unpinned input: ${corpusPath} is not tracked in the OASB checkout`);
  }
  const bytes = readFileSync(join(oasbRoot, corpusPath));
  return { oasbCommit, corpusPath, corpusSha256: sha256Hex(bytes), corpusText: bytes.toString('utf-8') };
}

// ---------------------------------------------------------------------------
// hackmyagent: npm tarball plus the install made from it
// ---------------------------------------------------------------------------

export interface VerifiedHackmyagent {
  version: string;
  integrity: string;
  tarballSha256: string;
  /** sha256 of package-lock.json in the --hma directory, when present. */
  dependencyLockSha256: string | null;
  /** Absolute path of the installed package directory the harness loads. */
  packageDir: string;
}

export function tarballName(version: string): string {
  return `hackmyagent-${version}.tgz`;
}

function integrityOf(bytes: Buffer, algorithm: string): string {
  return `${algorithm}-${createHash(algorithm).update(bytes).digest('base64')}`;
}

/**
 * The --hma directory holds `hackmyagent-<version>.tgz` (from `npm pack`) and
 * `node_modules/hackmyagent` (from `npm install ./hackmyagent-<version>.tgz`).
 * The tarball must match the pinned integrity, and every file of the installed
 * package must be the file in that tarball, with no files added.
 */
export function verifyHackmyagent(hmaDir: string, pin: HackmyagentPin): VerifiedHackmyagent {
  const tarball = join(hmaDir, tarballName(pin.version));
  if (!existsSync(tarball)) {
    throw new PinError(
      `unpinned input: ${tarballName(pin.version)} is not in the --hma directory; ` +
        `create it there with: npm pack hackmyagent@${pin.version}`,
    );
  }
  const bytes = readFileSync(tarball);
  const algorithm = pin.integrity.slice(0, pin.integrity.indexOf('-'));
  const actual = integrityOf(bytes, algorithm);
  if (actual !== pin.integrity) {
    throw new PinError(
      `pinned input mismatch: ${tarballName(pin.version)} has integrity ${actual}, the pin is ${pin.integrity}`,
    );
  }

  const packageDir = join(hmaDir, 'node_modules', 'hackmyagent');
  if (!existsSync(join(packageDir, 'package.json'))) {
    throw new PinError(
      'unpinned input: hackmyagent is not installed in the --hma directory; ' +
        `install the pinned tarball there with: npm install ./${tarballName(pin.version)}`,
    );
  }

  const scratch = mkdtempSync(join(tmpdir(), 'oasb-hma-'));
  try {
    try {
      execFileSync('tar', ['-xzf', tarball, '-C', scratch], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      throw new PinError(`pinned input mismatch: ${tarballName(pin.version)} is not a readable npm tarball`);
    }
    const unpacked = join(scratch, 'package');
    let manifest: { name?: unknown; version?: unknown };
    try {
      manifest = JSON.parse(readFileSync(join(unpacked, 'package.json'), 'utf-8'));
    } catch {
      throw new PinError(`pinned input mismatch: ${tarballName(pin.version)} has no package/package.json`);
    }
    if (manifest.name !== 'hackmyagent' || manifest.version !== pin.version) {
      throw new PinError(
        `pinned input mismatch: ${tarballName(pin.version)} holds ${String(manifest.name)}@${String(manifest.version)}, ` +
          `the pin is hackmyagent@${pin.version}`,
      );
    }

    const packed = listFiles(unpacked);
    const changed = packed.filter(rel => {
      const installed = join(packageDir, rel);
      return !existsSync(installed) || sha256Hex(readFileSync(installed)) !== sha256Hex(readFileSync(join(unpacked, rel)));
    });
    if (changed.length > 0) {
      throw new PinError(
        `dirty input tree: installed hackmyagent files differ from the pinned tarball (${shortList(changed)}); ` +
          `reinstall with: npm install ./${tarballName(pin.version)}`,
      );
    }
    const packedSet = new Set(packed);
    const added = listFiles(packageDir, new Set(['node_modules'])).filter(rel => !packedSet.has(rel));
    if (added.length > 0) {
      throw new PinError(
        `dirty input tree: installed hackmyagent has files that are not in the pinned tarball (${shortList(added)})`,
      );
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const lock = join(hmaDir, 'package-lock.json');
  return {
    version: pin.version,
    integrity: pin.integrity,
    tarballSha256: sha256Hex(bytes),
    dependencyLockSha256: existsSync(lock) ? sha256Hex(readFileSync(lock)) : null,
    packageDir,
  };
}

/** Read the version and integrity of the single hackmyagent tarball in `hmaDir`. */
export function observeHackmyagent(hmaDir: string): HackmyagentPin {
  const tarballs = existsSync(hmaDir)
    ? readdirSync(hmaDir).filter(f => /^hackmyagent-.+\.tgz$/.test(f))
    : [];
  if (tarballs.length !== 1) {
    throw new PinError(
      `expected exactly one hackmyagent-<version>.tgz in the --hma directory, found ${tarballs.length}`,
    );
  }
  const version = tarballs[0].slice('hackmyagent-'.length, -'.tgz'.length);
  return { version, integrity: integrityOf(readFileSync(join(hmaDir, tarballs[0])), 'sha512') };
}

// ---------------------------------------------------------------------------
// NanoMind model directory
// ---------------------------------------------------------------------------

export interface NanomindManifest {
  manifestSha256: string;
  /** Version field of nanomind-version.json, when the directory has one. */
  modelVersion: string | null;
  files: Array<{ path: string; sha256: string }>;
}

/**
 * The manifest lists every file in the model directory as one
 * `<sha256>  <relative path>` line, sorted by path. `manifestSha256` is the
 * sha256 of that text, so it pins every byte of every model file, not only a
 * version label. `.DS_Store` files are left out.
 */
export function nanomindManifest(modelsDir: string): NanomindManifest {
  if (!existsSync(modelsDir) || !statSync(modelsDir).isDirectory()) {
    throw new PinError('unpinned input: the NanoMind model directory does not exist');
  }
  const paths = listFiles(modelsDir).filter(p => !p.split('/').includes('.DS_Store'));
  if (paths.length === 0) {
    throw new PinError('unpinned input: the NanoMind model directory is empty');
  }
  const files = paths.map(path => ({ path, sha256: sha256Hex(readFileSync(join(modelsDir, path))) }));
  const text = files.map(f => `${f.sha256}  ${f.path}\n`).join('');
  let modelVersion: string | null = null;
  try {
    const parsed = JSON.parse(readFileSync(join(modelsDir, 'nanomind-version.json'), 'utf-8'));
    modelVersion = typeof parsed?.version === 'string' ? parsed.version : null;
  } catch {
    modelVersion = null;
  }
  return { manifestSha256: sha256Hex(text), modelVersion, files };
}

export function verifyNanomind(modelsDir: string, pin: NanomindPin): NanomindManifest {
  const manifest = nanomindManifest(modelsDir);
  if (manifest.manifestSha256 !== pin.manifestSha256) {
    throw new PinError(
      `pinned input mismatch: the NanoMind model directory has manifest sha256 ${manifest.manifestSha256}, ` +
        `the pin is ${pin.manifestSha256}`,
    );
  }
  return manifest;
}

// ---------------------------------------------------------------------------
// DVAA checkout
// ---------------------------------------------------------------------------

export interface VerifiedDvaa {
  commit: string;
  objectFormat: 'sha1' | 'sha256';
}

/** Read the HEAD commit of the DVAA checkout and whether it is clean. */
export function observeDvaa(dvaaDir: string): { commit: string; dirty: string[]; objectFormat: 'sha1' | 'sha256' } {
  let commit: string;
  try {
    commit = git(dvaaDir, ['rev-parse', 'HEAD']).trim();
  } catch {
    throw new PinError('unpinned input: the --dvaa directory is not a git checkout with a commit');
  }
  const dirty = git(dvaaDir, ['status', '--porcelain', '--untracked-files=all'])
    .split('\n')
    .filter(Boolean)
    .map(l => l.slice(3));
  const format = git(dvaaDir, ['rev-parse', '--show-object-format']).trim();
  return { commit, dirty, objectFormat: format === 'sha256' ? 'sha256' : 'sha1' };
}

export function verifyDvaa(dvaaDir: string, pin: DvaaPin): VerifiedDvaa {
  const { commit, dirty, objectFormat } = observeDvaa(dvaaDir);
  if (commit !== pin.commit) {
    throw new PinError(`pinned input mismatch: the DVAA checkout is at ${commit}, the pin is ${pin.commit}`);
  }
  if (dirty.length > 0) {
    throw new PinError(`dirty input tree: the DVAA checkout has uncommitted changes (${shortList(dirty)})`);
  }
  return { commit, objectFormat };
}

/**
 * Every file the DVAA loader read must be the committed file at `commit`.
 * This also refuses git-ignored files, which `git status` does not report but
 * the loader reads.
 */
export function verifyDvaaFiles(dvaaDir: string, commit: string, readFiles: DVAAReadFile[]): void {
  const tree = new Map<string, string>();
  for (const entry of git(dvaaDir, ['ls-tree', '-r', '-z', '--full-tree', commit, '--', 'scenarios']).split('\0')) {
    if (!entry) continue;
    const tab = entry.indexOf('\t');
    const [, type, id] = entry.slice(0, tab).split(' ');
    if (type === 'blob') tree.set(entry.slice(tab + 1), id);
  }
  const notCommitted = readFiles.filter(f => tree.get(f.path) !== f.blobId).map(f => f.path);
  if (notCommitted.length > 0) {
    throw new PinError(
      `dirty input tree: DVAA files read for the scan are not the files committed at ${commit} ` +
        `(${shortList(notCommitted)}); remove untracked or ignored files under scenarios/`,
    );
  }
}
