#!/usr/bin/env node
// README library example check.
//
// The TypeScript block under "## Use as a library" in README.md is the
// example a user copies after `npm install @opena2a/oasb`. This check runs
// it as such a user would, without the network that the same step of
// scripts/check-documented-commands.mjs (npm run smoke) installs from, and
// type-checks it, which that step does not:
//   1. builds src/ with tsc into a temporary directory, beside a copy of
//      package.json and the other entries of its "files" list, and packs
//      that with `npm pack`: the tarball `npm pack` makes in the checkout
//      after `npm run build`, made without writing to its dist/, which other
//      tests in scripts/ read while this one runs;
//   2. extracts the tarball as node_modules/@opena2a/oasb of a new project,
//      where npm places it, beside arp-guard, the optional dependency that
//      `npm install @opena2a/oasb` installs with it, and @types/node, both
//      linked from this checkout's node_modules, where `npm ci` installed
//      them. Nothing is fetched from the network;
//   3. type-checks the example against the type declarations of the
//      tarball with the typescript package (a devDependency), so a call
//      whose arguments no longer match what the package exports fails here;
//   4. compiles the example to CommonJS and runs it with node in the
//      project. It must exit 0, and where its last console.log() carries a
//      `// <value>` comment, the last line it prints must be that value.
//
// Usage: node scripts/check-readme-library-example.mjs [path/to/repo]
// Exit code 0 when the example type-checks, runs and prints what it says
// (and for --help); 1 otherwise, and for an argument it does not take.
// scripts/check-readme-library-example.test.mjs runs it in
// npm run test:scripts, which npm test runs first.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileLibraryExample, librarySection } from './check-documented-commands.mjs';
import { isMain } from './is-main.mjs';

/**
 * The value the `// <value>` comment of the last console.log() line of
 * `source` says it prints: the comment up to its first colon, trimmed.
 * Undefined when that line carries no such comment.
 */
export function expectedLastLine(source) {
  const logs = source.split('\n').filter(line => /^\s*console\.log\(/.test(line));
  const last = logs[logs.length - 1];
  const comment = last?.match(/\)\s*;?\s*\/\/\s*([^:]+)/);
  return comment ? comment[1].trim() : undefined;
}

function run(command, args, options) {
  const r = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (r.error) throw r.error;
  return r;
}

function failure(step, r) {
  return `${step} failed (exit ${r.status}):\n${r.stdout ?? ''}${r.stderr ?? ''}`;
}

/**
 * Runs the check for the repository at `repo`, on the text `readme` in place
 * of its README.md where given. Returns { ok, report }:
 * `report` is what the example printed when it passed, or why it failed.
 */
export function checkLibraryExample(repo, { readme } = {}) {
  const require = createRequire(join(repo, 'package.json'));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const source = `${librarySection(readme ?? readFileSync(join(repo, 'README.md'), 'utf8')).code}\n`;

  for (const dep of ['arp-guard', '@types/node', 'typescript']) {
    if (!existsSync(join(repo, 'node_modules', dep, 'package.json'))) {
      return { ok: false, report: `${dep} is not installed in ${join(repo, 'node_modules')}: run npm ci first` };
    }
  }

  const base = mkdtempSync(join(tmpdir(), 'oasb-readme-example-'));
  try {
    const stage = join(base, 'stage');
    const manifest = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
    mkdirSync(stage);
    cpSync(join(repo, 'package.json'), join(stage, 'package.json'));
    for (const entry of manifest.files ?? []) {
      if (entry.startsWith('!') || entry === 'dist' || !existsSync(join(repo, entry))) continue;
      cpSync(join(repo, entry), join(stage, entry), { recursive: true });
    }
    const tsc = require.resolve('typescript/bin/tsc');
    const build = run(process.execPath, [tsc, '-p', join(repo, 'tsconfig.json'), '--outDir', join(stage, 'dist')]);
    if (build.status !== 0) return { ok: false, report: failure('building src/ with tsc', build) };

    const pack = run(npm, ['pack', '--json', '--ignore-scripts', '--pack-destination', base], { cwd: stage });
    if (pack.status !== 0) return { ok: false, report: failure('npm pack', pack) };
    const tarball = join(base, JSON.parse(pack.stdout)[0].filename);

    const project = join(base, 'project');
    const pkg = join(project, 'node_modules', '@opena2a', 'oasb');
    mkdirSync(pkg, { recursive: true });
    mkdirSync(join(project, 'node_modules', '@types'), { recursive: true });
    const tar = run('tar', ['-xzf', tarball, '-C', pkg, '--strip-components=1']);
    if (tar.status !== 0) return { ok: false, report: failure('tar -xzf', tar) };
    for (const dep of ['arp-guard', '@types/node']) {
      symlinkSync(join(repo, 'node_modules', dep), join(project, 'node_modules', dep), 'dir');
    }
    writeFileSync(join(project, 'package.json'), '{"name":"readme-example","private":true}\n');
    writeFileSync(join(project, 'example.ts'), source);

    const typecheck = run(process.execPath, [
      tsc, '--noEmit', '--strict', '--target', 'ES2020', '--module', 'commonjs',
      '--moduleResolution', 'node', '--esModuleInterop', '--types', 'node', 'example.ts',
    ], { cwd: project });
    if (typecheck.status !== 0) return { ok: false, report: failure('type-checking the README example', typecheck) };

    writeFileSync(join(project, 'example.cjs'), compileLibraryExample(require('typescript'), source));
    const env = { ...process.env };
    delete env.OASB_ADAPTER;
    delete env.NODE_OPTIONS;
    const example = run(process.execPath, ['example.cjs'], { cwd: project, env });
    if (example.status !== 0) return { ok: false, report: failure('running the README example', example) };

    const expected = expectedLastLine(source);
    const printed = example.stdout.trimEnd().split('\n');
    const last = printed[printed.length - 1];
    if (expected !== undefined && last !== expected) {
      return {
        ok: false,
        report: `the README example's last console.log() says it prints ${expected}, but it printed ${last}:\n${example.stdout}`,
      };
    }
    return { ok: true, report: example.stdout };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

const USAGE = 'Usage: node scripts/check-readme-library-example.mjs [path/to/repo]';

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(USAGE);
    process.exit(0);
  }
  const paths = args.filter(a => !a.startsWith('-'));
  if (paths.length < args.length || paths.length > 1) {
    console.error(USAGE);
    process.exit(1);
  }
  const repo = resolve(paths[0] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  let result;
  try {
    result = checkLibraryExample(repo);
  } catch (err) {
    result = { ok: false, report: err.stack ?? String(err) };
  }
  if (result.ok) {
    process.stdout.write(result.report);
    console.log('README library example: type-checks and runs from the packed tarball');
    process.exit(0);
  }
  console.error(`README library example: ${result.report}`);
  process.exit(1);
}
