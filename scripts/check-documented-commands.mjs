#!/usr/bin/env node
// Documented-command check.
//
// Runs what the README tells a user to run and holds each result to what the
// README says it does:
//   1. a product chosen by name: `OASB_ADAPTER=llm-guard` on a scenario file
//      gated by capability (AT-AI-002, prompt output scanning) and on an
//      OS-level one (AT-PROC-003, process monitoring). llm-guard declares
//      neither surface, and "Evaluating Other Products" says the tests for a
//      surface the product does not support are N/A (skipped), not FAIL, so
//      every test in both files must be skipped. The reference adapter runs
//      the gated file, so its skip shows that the name chose llm-guard;
//   2. a product chosen by a relative path: `OASB_ADAPTER=./<dir>/my-adapter.js`
//      run from the checkout, with an adapter that declares no capabilities,
//      on the gated file. Every test in it must be skipped;
//   3. the README library example in a fresh install: packs the checkout,
//      runs the `npm install` lines of "Use as a library" in a new, empty
//      project with `@opena2a/oasb` replaced by the tarball, and runs the
//      section's TypeScript block there, compiled with the checkout's
//      TypeScript, without OASB_ADAPTER set. A call whose argument list is
//      only a comment, such as `benchmark.determineTier(/* aggregate metrics */)`,
//      is a placeholder: the check asserts it names a function instead of
//      calling it.
//
// The checkout must be installed (npm ci) and built (npm run build). Step 3
// installs the tarball's dependencies from the npm registry.
//
// Usage: node scripts/check-documented-commands.mjs [path/to/checkout]
// Exit code 0 when every documented command does what the README says (and
// for --help), 1 otherwise. Run by npm run smoke.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportFiles, sourcePath } from './readme-counts.mjs';

const USAGE = 'Usage: node scripts/check-documented-commands.mjs [path/to/checkout]';

export const GATED_FILE = 'src/atomic/ai-layer/AT-AI-002.prompt-output-scan.test.ts';
export const OS_LEVEL_FILE = 'src/atomic/process/AT-PROC-003.high-cpu.test.ts';
export const LIBRARY_HEADING = '## Use as a library';
const NA_CLAIM = 'README "Evaluating Other Products" says the tests for a surface the product does not support are N/A (skipped), not FAIL';

// A custom adapter that declares no capabilities, so every test gated by
// capability reports N/A against it.
const NO_CAPABILITY_ADAPTER = `exports.ReleaseSmokeAdapter = class ReleaseSmokeAdapter {
  getCapabilities() {
    return { product: 'release-smoke-adapter', version: '0.0.0', capabilities: new Set() };
  }
};
`;

const firstLine = (text) => String(text ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';

/**
 * Failures for each of `files` (paths from src/) that ran a test in a vitest
 * JSON report, did not load, or is missing from it. `label` names the command.
 */
export function notSkipped(report, files, label) {
  const results = reportFiles(report);
  const failures = [];
  for (const file of files) {
    const result = results.find((r) => sourcePath(r.name) === file);
    if (!result) {
      failures.push(`${label}: ${file} is not in the vitest report`);
      continue;
    }
    const tests = result.assertionResults;
    if (tests.length === 0 && result.status === 'failed') {
      failures.push(`${label}: ${file} did not load: ${firstLine(result.message)}`);
      continue;
    }
    const passed = tests.filter((t) => t.status === 'passed').length;
    const failed = tests.filter((t) => t.status === 'failed').length;
    if (passed + failed > 0) {
      failures.push(`${label}: ${file} ran ${passed + failed} of ${tests.length} tests (${passed} passed, ${failed} failed); ${NA_CLAIM}`);
    }
  }
  return failures;
}

/**
 * The README's library example: the argument lists of the `npm install`
 * lines in the section's shell blocks, and its TypeScript block. Throws when
 * the section, an install of @opena2a/oasb or the code block is missing.
 */
export function librarySection(readme) {
  const lines = readme.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trimEnd() === LIBRARY_HEADING);
  if (start < 0) throw new Error(`no "${LIBRARY_HEADING}" section`);
  const next = lines.findIndex((l, i) => i > start && /^## /.test(l));
  const blocks = [];
  let open = null;
  for (const line of lines.slice(start + 1, next < 0 ? lines.length : next)) {
    const fence = /^```\s*([\w-]*)\s*$/.exec(line);
    if (fence && open === null) open = { lang: fence[1], body: [] };
    else if (fence) {
      blocks.push({ lang: open.lang, text: open.body.join('\n') });
      open = null;
    } else if (open !== null) open.body.push(line);
  }
  const installs = blocks
    .filter((b) => ['bash', 'sh', 'shell', ''].includes(b.lang))
    .flatMap((b) => b.text.split('\n'))
    .map((l) => l.replace(/(^|\s)#.*$/, '').trim().split(/\s+/))
    .filter((args) => args[0] === 'npm' && ['install', 'i'].includes(args[1]))
    .map((args) => args.slice(1));
  if (!installs.some((args) => args.includes('@opena2a/oasb'))) {
    throw new Error(`"${LIBRARY_HEADING}" has no \`npm install\` line that installs @opena2a/oasb`);
  }
  const code = blocks.find((b) => ['ts', 'typescript', 'js', 'javascript'].includes(b.lang) && /['"]@opena2a\/oasb['"]/.test(b.text));
  if (!code) throw new Error(`"${LIBRARY_HEADING}" has no TypeScript or JavaScript block that imports @opena2a/oasb`);
  return { installs, code: code.text };
}

/**
 * Replaces each call whose argument list is only a comment, a placeholder
 * such as `benchmark.determineTier(/* aggregate metrics *\/)`, with a check
 * that the callee is a function.
 */
export function placeholdersToChecks(code) {
  const rewritten = code.replace(
    /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\(\s*\/\*[\s\S]*?\*\/\s*\)/g,
    (_, callee) => `__expectFunction(${callee}, ${JSON.stringify(callee)})`,
  );
  if (rewritten === code) return code;
  return `${rewritten}\n\nfunction __expectFunction(value, name) {\n  if (typeof value !== 'function') throw new TypeError(name + ' is not a function');\n}\n`;
}

function run(command, args, options) {
  const r = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  if (r.error) return { status: null, stdout: '', output: r.error.message };
  return { status: r.status, stdout: r.stdout ?? '', output: `${r.stderr ?? ''}\n${r.stdout ?? ''}` };
}

/** The first error a failed command printed, or its last line. */
function errorLine(output) {
  const lines = String(output).split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => /\b\w*Error\b|^npm (error|ERR!)/.test(l)) ?? lines.at(-1) ?? '(no output)';
}

function vitestSkips(root, files, env, label, work) {
  const vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs');
  if (!existsSync(vitest)) return [`${label}: ${relative(root, vitest)} is missing; run npm ci first`];
  const out = join(work, 'report.json');
  rmSync(out, { force: true });
  const r = run(process.execPath, [vitest, 'run', ...files, '--reporter=json', `--outputFile=${out}`], { cwd: root, env });
  if (!existsSync(out)) return [`${label}: vitest exited ${r.status} without a report: ${errorLine(r.output)}`];
  const failures = notSkipped(JSON.parse(readFileSync(out, 'utf8')), files, label);
  if (failures.length === 0 && r.status !== 0) failures.push(`${label}: vitest exited ${r.status}: ${errorLine(r.output)}`);
  return failures;
}

function checkByName(root, work) {
  const label = 'OASB_ADAPTER=llm-guard';
  return vitestSkips(root, [GATED_FILE, OS_LEVEL_FILE], { ...process.env, OASB_ADAPTER: 'llm-guard' }, label, work);
}

function checkByRelativePath(root, work) {
  const dir = mkdtempSync(join(root, '.oasb-smoke-adapter-'));
  try {
    writeFileSync(join(dir, 'my-adapter.js'), NO_CAPABILITY_ADAPTER);
    const adapter = `./${relative(root, dir)}/my-adapter.js`;
    return vitestSkips(root, [GATED_FILE], { ...process.env, OASB_ADAPTER: adapter }, `OASB_ADAPTER=${adapter}`, work);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function checkLibraryExample(root, work) {
  const label = 'README library example';
  let section;
  try {
    section = librarySection(readFileSync(join(root, 'README.md'), 'utf8'));
  } catch (err) {
    return [`${label}: README.md: ${err.message}`];
  }
  const env = { ...process.env };
  delete env.OASB_ADAPTER;
  const pack = run('npm', ['pack', '--json', '--pack-destination', work], { cwd: root, env });
  let tarball;
  try {
    tarball = join(work, JSON.parse(pack.stdout)[0].filename);
  } catch {
    return [`${label}: npm pack exited ${pack.status}: ${errorLine(pack.output)}`];
  }
  const project = join(work, 'project');
  mkdirSync(project);
  writeFileSync(join(project, 'package.json'), `${JSON.stringify({ name: 'oasb-library-example', version: '0.0.0', private: true }, null, 2)}\n`);
  for (const args of section.installs) {
    const install = [...args.map((a) => (a === '@opena2a/oasb' ? tarball : a)), '--no-audit', '--no-fund'];
    const r = run('npm', install, { cwd: project, env });
    if (r.status !== 0) return [`${label}: npm ${args.join(' ')} exited ${r.status}: ${errorLine(r.output)}`];
  }
  const ts = createRequire(join(root, 'package.json'))('typescript');
  const { outputText } = ts.transpileModule(placeholdersToChecks(section.code), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  writeFileSync(join(project, 'example.cjs'), outputText);
  const r = run(process.execPath, ['example.cjs'], { cwd: project, env });
  return r.status === 0 ? [] : [`${label}: exited ${r.status} after npm install @opena2a/oasb: ${errorLine(r.output)}`];
}

/** Runs the three documented commands in `root` and returns their failures. */
export function checkDocumentedCommands(root) {
  const failures = [];
  for (const check of [checkByName, checkByRelativePath, checkLibraryExample]) {
    const work = mkdtempSync(join(tmpdir(), 'oasb-documented-'));
    try {
      failures.push(...check(root, work));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  return failures;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }
  if (args.length > 1 || args.some((a) => a.startsWith('-'))) {
    console.error(USAGE);
    process.exit(1);
  }
  const root = resolve(args[0] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const failures = checkDocumentedCommands(root);
  if (failures.length > 0) {
    for (const f of failures) console.error(`FAIL ${f}`);
    console.error(`${failures.length} documented command${failures.length === 1 ? '' : 's'} not doing what the README says`);
    process.exit(1);
  }
  console.log('Documented commands: OASB_ADAPTER by name and by relative path report N/A for undeclared surfaces, and the README library example runs in a fresh install');
}
