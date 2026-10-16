// Tests for scripts/check-documented-commands.mjs, the release smoke's check
// that three of the commands the README documents do what it says.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GATED_FILE,
  LIBRARY_HEADING,
  OS_LEVEL_FILE,
  compileLibraryExample,
  errorLine,
  libraryExampleFailure,
  librarySection,
  notSkipped,
} from './check-documented-commands.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'check-documented-commands.mjs');
const repo = join(dirname(script), '..');

const results = (status, n) => Array.from({ length: n }, (_, i) => ({ title: `t${i}`, status }));
const report = (...files) => ({ testResults: files });
const file = (path, assertionResults, extra = {}) => ({ name: `/checkout/${path}`, assertionResults, ...extra });

test('the release smoke runs the documented-command check after the build', () => {
  const lines = readFileSync(join(repo, 'scripts/release-smoke.sh'), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'));
  const build = lines.findIndex((l) => l.trim() === 'npm run build');
  const check = lines.findIndex((l) => /^node scripts\/check-documented-commands\.mjs\b/.test(l.trim()));
  assert.notEqual(check, -1, 'scripts/release-smoke.sh does not run scripts/check-documented-commands.mjs');
  assert.ok(build !== -1 && build < check, 'the check runs before npm run build, but needs dist/');
});

test('a scenario file that ran a test fails, naming the counts and the README claim', () => {
  const failures = notSkipped(
    report(file(GATED_FILE, results('skipped', 6)), file(OS_LEVEL_FILE, results('passed', 4))),
    [GATED_FILE, OS_LEVEL_FILE],
    'OASB_ADAPTER=llm-guard',
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^OASB_ADAPTER=llm-guard: src\/atomic\/process\/AT-PROC-003\.high-cpu\.test\.ts ran 4 of 4 tests \(4 passed, 0 failed\); /);
  assert.match(failures[0], /N\/A \(skipped\), not FAIL$/);
});

test('scenario files whose tests are all skipped pass', () => {
  const r = report(file(GATED_FILE, results('skipped', 6)), file(OS_LEVEL_FILE, results('pending', 4)));
  assert.deepEqual(notSkipped(r, [GATED_FILE, OS_LEVEL_FILE], 'OASB_ADAPTER=llm-guard'), []);
});

test('a scenario file that did not load fails with its first error line', () => {
  const r = report(file(GATED_FILE, [], { status: 'failed', message: "Cannot find module './my-adapter.js'\nRequire stack:\n- create-adapter.ts" }));
  assert.deepEqual(notSkipped(r, [GATED_FILE], 'OASB_ADAPTER=./my-adapter.js'), [
    `OASB_ADAPTER=./my-adapter.js: ${GATED_FILE} did not load: Cannot find module './my-adapter.js'`,
  ]);
});

test('a scenario file missing from the report fails', () => {
  assert.deepEqual(notSkipped(report(), [OS_LEVEL_FILE], 'OASB_ADAPTER=llm-guard'), [
    `OASB_ADAPTER=llm-guard: ${OS_LEVEL_FILE} is not in the vitest report`,
  ]);
});

test("the README's library section yields its install line and its TypeScript block", () => {
  const { installs, code } = librarySection(readFileSync(join(repo, 'README.md'), 'utf8'));
  assert.ok(installs.some((args) => args[0] === 'install' && args.includes('@opena2a/oasb')), JSON.stringify(installs));
  assert.match(code, /from '@opena2a\/oasb'/);
  assert.match(code, /createAdapter\(\)/);
  assert.match(code, /getCapabilityMatrix\(\)/);
});

test("the README's library example has no call whose argument list is only a comment", () => {
  // The check runs the block as written, and so does a reader who copies it.
  const { code } = librarySection(readFileSync(join(repo, 'README.md'), 'utf8'));
  const placeholders = code.match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\(\s*\/\*[\s\S]*?\*\/\s*\)/g) ?? [];
  assert.deepEqual(placeholders, []);
});

test('install lines keep every package and drop a trailing comment', () => {
  const readme = `${LIBRARY_HEADING}\n\n\`\`\`bash\nnpm install @opena2a/oasb arp-guard   # both\n\`\`\`\n\n\`\`\`ts\nimport { createAdapter } from '@opena2a/oasb';\n\`\`\`\n\n## Next\n\n\`\`\`ts\nimport { other } from '@opena2a/oasb';\n\`\`\`\n`;
  assert.deepEqual(librarySection(readme), {
    installs: [['install', '@opena2a/oasb', 'arp-guard']],
    code: "import { createAdapter } from '@opena2a/oasb';",
  });
});

test('a README without the library section, its install line or its code block is reported', () => {
  assert.throws(() => librarySection('# OASB\n'), /no "## Use as a library" section/);
  assert.throws(
    () => librarySection(`${LIBRARY_HEADING}\n\n\`\`\`ts\nimport { createAdapter } from '@opena2a/oasb';\n\`\`\`\n`),
    /no `npm install` line that installs @opena2a\/oasb/,
  );
  assert.throws(
    () => librarySection(`${LIBRARY_HEADING}\n\n\`\`\`bash\nnpm install @opena2a/oasb\n\`\`\`\n`),
    /no TypeScript or JavaScript block that imports @opena2a\/oasb/,
  );
});

test('the library example is compiled as written: a call whose argument list is only a comment is called', () => {
  const ts = createRequire(join(repo, 'package.json'))('typescript');
  const code = [
    "import { benchmark } from '@opena2a/oasb';",
    'const tier: string = benchmark.determineTier(/* aggregate metrics */);',
    '',
  ].join('\n');
  const out = compileLibraryExample(ts, code);
  const calls = [];
  const oasb = { benchmark: { determineTier: (...args) => { calls.push(args); return 'listed'; } } };
  new Function('require', 'exports', out)((name) => (name === '@opena2a/oasb' ? oasb : undefined), {});
  assert.deepEqual(calls, [[]]);
  const missing = { benchmark: { determineTier: (metrics) => metrics.f1 } };
  assert.throws(
    () => new Function('require', 'exports', out)(() => missing, {}),
    /^TypeError: Cannot read properties of undefined \(reading 'f1'\)$/,
  );
});

test('a library example that throws is reported with the install lines that ran and the message it threw', () => {
  // The shape of src/harness/arp-wrapper.ts when arp-guard is not installed:
  // Node echoes the throwing statement before the error's message.
  const dir = mkdtempSync(join(tmpdir(), 'oasb-documented-test-'));
  try {
    const example = join(dir, 'example.cjs');
    writeFileSync(example, [
      "const MISSING = 'The default OASB adapter needs arp-guard. Run \"npm install arp-guard\".';",
      'function arp() {',
      '  throw new Error(MISSING);',
      '}',
      'arp();',
      '',
    ].join('\n'));
    const r = spawnSync(process.execPath, [example], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    const output = `${r.stderr}\n${r.stdout}`;
    const message = 'Error: The default OASB adapter needs arp-guard. Run "npm install arp-guard".';
    assert.equal(errorLine(output), message);
    assert.equal(
      libraryExampleFailure([['install', '@opena2a/oasb'], ['install', 'arp-guard']], r.status, output),
      `README library example: exited 1 after npm install @opena2a/oasb and npm install arp-guard: ${message}`,
    );
    assert.equal(
      libraryExampleFailure([['install', '@opena2a/oasb']], r.status, output),
      `README library example: exited 1 after npm install @opena2a/oasb: ${message}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an npm failure is reported by its first error line, a silent one by its last line', () => {
  assert.equal(errorLine('npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/nope'), 'npm error code E404');
  assert.equal(errorLine("\nError [ERR_MODULE_NOT_FOUND]: Cannot find package 'nope'\n"), "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'nope'");
  assert.equal(errorLine('first\nlast\n'), 'last');
  assert.equal(errorLine(''), '(no output)');
});

test('--help prints the usage and exits 0; an unknown option exits 1', () => {
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^Usage: node scripts\/check-documented-commands\.mjs/);
  const bad = spawnSync(process.execPath, [script, '--nope'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^Usage: /);
});
