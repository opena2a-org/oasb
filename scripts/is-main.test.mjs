// Tests for scripts/is-main.mjs, which tells a script whether node was
// started with it, and for the scripts that ask it.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './is-main.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');

// The scripts that run their check only when node is started with them.
const SCRIPTS = [
  'bait-edition.mjs',
  'check-documented-commands.mjs',
  'check-maturity-page.mjs',
  'check-owasp-mapping.mjs',
  'check-test-counts.mjs',
  'check-vendor.mjs',
];

// A temporary directory that holds a symbolic link to the repository and one
// to each script and to scripts/is-main.mjs. Removing it removes the links,
// not what they link to.
const dir = mkdtempSync(join(tmpdir(), 'oasb-is-main-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const linkedRepo = join(dir, 'oasb');
symlinkSync(repo, linkedRepo, 'dir');
for (const name of [...SCRIPTS, 'is-main.mjs']) symlinkSync(join(here, name), join(dir, name));

/** Runs `node <options> <path> --bogus`, an argument none of the scripts takes. */
function run(path, options = []) {
  const r = spawnSync(process.execPath, [...options, path, '--bogus'], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('each script started through a symbolic link exits as it does started by its own path: 1, with its usage', () => {
  for (const name of SCRIPTS) {
    const own = run(join(here, name));
    assert.equal(own.status, 1, `${name} started by its own path: ${own.stdout}${own.stderr}`);
    assert.match(own.stderr, /^usage: node scripts\//i, `${name} started by its own path`);
    for (const [how, path, options] of [
      ['through a link to the repository', join(linkedRepo, 'scripts', name), []],
      ['through a link to the script', join(dir, name), []],
      ['through a link to the repository, under --preserve-symlinks-main', join(linkedRepo, 'scripts', name), ['--preserve-symlinks-main']],
    ]) {
      assert.deepEqual(run(path, options), own, `${name} started ${how}`);
    }
  }
});

test('isMain is true when argv[1] names the file of the module by its own path or through a link, and false otherwise', () => {
  const self = join(here, 'is-main.mjs');
  const url = pathToFileURL(self).href;
  assert.equal(isMain(url, ['node', self]), true, 'its own path');
  assert.equal(isMain(url, ['node', join(linkedRepo, 'scripts', 'is-main.mjs')]), true, 'through a link to the repository');
  assert.equal(isMain(url, ['node', join(dir, 'is-main.mjs')]), true, 'through a link to the file');
  // Under --preserve-symlinks-main, the URL of the module keeps the link.
  assert.equal(isMain(pathToFileURL(join(linkedRepo, 'scripts', 'is-main.mjs')).href, ['node', self]), true, 'a URL through a link');
  assert.equal(isMain(url, ['node', join(here, 'check-vendor.mjs')]), false, 'another file');
  assert.equal(isMain(url, ['node']), false, 'no path, as under node -e');
  assert.equal(isMain(url, ['node', '']), false, 'an empty path');
  assert.equal(isMain(url, ['node', '-']), false, 'node -, which reads the script from standard input');
  // A path that names no file is compared made absolute.
  const gone = join(dir, 'gone.mjs');
  assert.equal(isMain(pathToFileURL(gone).href, ['node', gone]), true, 'a path that names no file, the same');
  assert.equal(isMain(pathToFileURL(gone).href, ['node', join(dir, 'other.mjs')]), false, 'a path that names no file, another');
});

test('no script in scripts/ or bin/ but scripts/is-main.mjs names process.argv[1], and the scripts that import isMain are the ones started through links above', () => {
  const importers = [];
  for (const base of ['scripts', 'bin']) {
    for (const name of readdirSync(join(repo, base))) {
      if (!/\.(?:[cm]?js|ts)$/.test(name) || /\.test\.[cm]?[jt]s$/.test(name)) continue;
      const path = `${base}/${name}`;
      const text = readFileSync(join(repo, path), 'utf8');
      if (path !== 'scripts/is-main.mjs') {
        assert.ok(!text.includes('process.argv[1]'), `${path} names process.argv[1]: ask isMain of scripts/is-main.mjs whether node was started with it`);
      }
      if (/from '(?:\.\/|\.\.\/scripts\/)is-main\.mjs'/.test(text)) importers.push(path);
    }
  }
  assert.deepEqual(importers.sort(), SCRIPTS.map((name) => `scripts/${name}`));
});
