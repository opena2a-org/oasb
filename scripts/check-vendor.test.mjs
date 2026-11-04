// Tests for scripts/check-vendor.mjs, the check that holds
// bin/oasb-1-checklist.json to the OASB-1 catalogue of the hackmyagent
// release VENDOR.json pins.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.
//
// Two of the tests reach the npm registry: one runs the check as npm test
// runs it, and the first of the tests that run the check with --tarball
// packs the pinned release for them. Those run the check on copies of
// VENDOR.json, bin/oasb-1-checklist.json and docs/oasb-1-checklist.md in a
// temporary directory, with a change planted in one of them. The tests of
// how a step is made and how VENDOR.json and the catalogue module are read
// use no network.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPY, PAGE, USAGE, VENDOR, checkVendor, loadCatalogue, pack, readVendor, stepsOf } from './check-vendor.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'check-vendor.mjs');
const repo = join(dirname(script), '..');
const read = (path) => readFileSync(join(repo, path), 'utf8');
const pin = readVendor(read(VENDOR));
const release = `hackmyagent ${pin.version}`;
const controls = JSON.parse(read(COPY)).controls.length;

const dirs = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

let packed = null;
/** The tarball of the pinned release, packed from the npm registry on the first call. */
function tarball() {
  packed ??= pack(pin.version, tempDir('oasb-vendor-pack-'));
  return packed;
}

/**
 * A directory that holds VENDOR.json, bin/oasb-1-checklist.json and
 * docs/oasb-1-checklist.md as the repository has them, but with
 * `changes[path](text)` as the text of each file `changes` names.
 */
function scratch(changes = {}) {
  const dir = tempDir('oasb-vendor-repo-');
  for (const path of [VENDOR, COPY, PAGE]) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    const text = read(path);
    writeFileSync(join(dir, path), changes[path] ? changes[path](text) : text);
  }
  return dir;
}

/** Runs `node scripts/check-vendor.mjs <args>`. */
const check = (args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

/** Runs the check with --tarball on the pinned release, on the directory `dir`. */
const checkDir = (dir, args = []) => check([...args, '--tarball', tarball(), dir]);

/**
 * `text` with one character changed at `offset` characters into the first
 * `anchor` it holds: `remove` characters (0 or 1) replaced by `insert`. With
 * the line of the change.
 */
function plant(text, anchor, offset, remove, insert) {
  const at = text.indexOf(anchor);
  assert.ok(at >= 0, `the text no longer holds ${JSON.stringify(anchor)}; update this test`);
  assert.ok(remove <= 1 && insert.length <= 1 && remove + insert.length > 0, 'the change is not of one character');
  const i = at + offset;
  const changed = text.slice(0, i) + insert + text.slice(i + remove);
  assert.notEqual(changed, text);
  return { text: changed, line: text.slice(0, i).split('\n').length };
}

test('VENDOR.json pins hackmyagent by an exact version and the sha512 integrity of its tarball', () => {
  assert.match(pin.version, /^\d+\.\d+\.\d+$/);
  assert.match(pin.integrity, /^sha512-/);
  assert.equal(JSON.parse(read(COPY)).source, release, `${COPY} does not name ${release} as its source`);
  const commit = 'ab'.repeat(20);
  const vendor = (hackmyagent) => JSON.stringify({ hackmyagent });
  for (const version of ['^0.33.2', '~0.33.2', '>=0.33.2', '0.33', '0.33.x', 'latest', 'v0.33.2', ' 0.33.2', '', 33, undefined,
    `github:opena2a-org/hackmyagent#${commit}`, `0.33.2-${commit}`]) {
    assert.throws(() => readVendor(vendor({ version, integrity: pin.integrity })), /^Error: VENDOR\.json: hackmyagent\.version is /, String(version));
  }
  for (const integrity of [undefined, '', 'sha1-AAAA', `sha512-${'A'.repeat(20)}`, pin.integrity.slice(0, -1)]) {
    assert.throws(() => readVendor(vendor({ version: pin.version, integrity })), /^Error: VENDOR\.json: hackmyagent\.integrity is /, String(integrity));
  }
  assert.throws(() => readVendor('{'), /^Error: VENDOR\.json is not JSON: /);
  assert.throws(() => readVendor('{}'), /hackmyagent\.version is undefined/);
});

test('the check packs the pinned release from the npm registry and finds bin/oasb-1-checklist.json to be its projection, byte for byte', () => {
  const r = check([]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${COPY} is the projection of the OASB-1 catalogue in ${release}, the release ${VENDOR} pins, byte for byte: ${controls} controls\n`);
  assert.equal(r.stderr, '');
});

test('a one-character change planted in bin/oasb-1-checklist.json fails the check, which names the line of the change', () => {
  // The same files without a change pass, so each failure below is the
  // change's. The changes are checked with checkVendor(), the function the
  // command runs; the command itself runs on the first.
  const clean = checkDir(scratch());
  assert.equal(clean.status, 0, clean.stderr);
  const copy = read(COPY);
  const difference = (line) =>
    new RegExp(`^${COPY} is not the projection of the OASB-1 catalogue in ${release.replace(/\./g, '\\.')}, the release VENDOR\\.json pins\\. The first difference is at line ${line}, column \\d+:\n`);
  const requirement = plant(copy, 'cryptographic identity (public', 'cryptographic identit'.length, 1, 'x');
  const r = checkDir(scratch({ [COPY]: () => requirement.text }));
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stderr.startsWith('FAIL '), r.stderr);
  assert.match(r.stderr.slice('FAIL '.length), difference(requirement.line));
  assert.match(r.stderr, /\n1 vendored catalogue problem\n$/);
  const plants = [
    ['a requirement', 'cryptographic identity (public', 'cryptographic identit'.length, 1, 'x'],
    ['a step', 'Verify public key is published in agent manifest', 0, 1, 'v'],
    ['a check', '"SEM-MCP-001"', '"SEM-MCP-00'.length, 1, '2'],
    ['a question', 'Does each agent have its own keypair', 0, 1, 'd'],
    ['the source', `"source": "${release}"`, `"source": "${release}`.length - 1, 1, pin.version.endsWith('9') ? '8' : '9'],
    ['the version of the standard', '"version": "1.0.0"', '"version": "1.0.'.length, 1, '1'],
    ['the specification', '"spec": "https://oasb.ai/oasb-1"', '"spec": "https://oasb.ai/oasb-'.length, 1, '2'],
    ['the name of a level', '"name": "Essential"', '"name": "'.length, 1, 'e'],
    ['the verification of a control', '"verification": "forward"', '"verification": "'.length, 1, 'F'],
    // The JSON value of the next two is the same; the bytes are not.
    ['an escape that reads as the same text', 'public/private keypair', 'public'.length, 0, '\\'],
    ['the indentation', '\n  "title"', 1, 0, ' '],
    // Without this comma the file is not JSON; the check compares its bytes.
    ['a comma', '"verification": "forward",\n      "checks": []', '"verification": "forward"'.length, 1, ''],
  ];
  const problems = (text) => checkVendor(scratch({ [COPY]: () => text }), tarball).problems;
  for (const [what, anchor, offset, remove, insert] of plants) {
    const planted = plant(copy, anchor, offset, remove, insert);
    const found = problems(planted.text);
    assert.equal(found.length, 1, `${what}: ${JSON.stringify(found)}`);
    assert.match(found[0], difference(planted.line), what);
  }
  // A copy without its final line feed has ended where the projection has
  // one more line.
  const [ended] = problems(copy.slice(0, -1));
  assert.match(ended, difference(copy.split('\n').length));
  assert.match(ended, new RegExp(`:\n  ${COPY}: \\(the file has ended\\)\n  the projection: ""\n`));
});

test('the questions come from the page: a changed question on the page is a difference of bin/oasb-1-checklist.json', () => {
  const page = plant(read(PAGE), '**Ask the vendor:** Does each agent have its own keypair', '**Ask the vendor:** '.length, 1, 'd');
  const line = read(COPY).slice(0, read(COPY).indexOf('"question": "Does each agent have its own keypair')).split('\n').length;
  const r = checkDir(scratch({ [PAGE]: () => page.text }));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, new RegExp(`The first difference is at line ${line}, column \\d+:\n  ${COPY}: .*"Does each agent.*\n  the projection: .*"does each agent`));
});

test('a tarball that is not the pinned release is refused', () => {
  // The integrity VENDOR.json pins, with one character changed.
  const last = pin.integrity.at(-3);
  const other = `${pin.integrity.slice(0, -3)}${last === 'A' ? 'B' : 'A'}==`;
  let r = checkDir(scratch({ [VENDOR]: (text) => text.replace(pin.integrity, other) }));
  assert.equal(r.status, 1, r.stdout);
  assert.equal(r.stderr, `FAIL the tarball's integrity is ${pin.integrity}, not ${other}, the integrity VENDOR.json pins\n`);
  // The pinned integrity under another version: the tarball's package.json
  // names the release it is.
  r = checkDir(scratch({ [VENDOR]: (text) => text.replace(`"version": "${pin.version}"`, '"version": "0.0.1"') }));
  assert.equal(r.status, 1, r.stdout);
  assert.equal(r.stderr, `FAIL the tarball holds ${release}, not hackmyagent 0.0.1\n`);
});

test('--write writes the projection to bin/oasb-1-checklist.json', () => {
  const planted = plant(read(COPY), 'cryptographic identity (public', 'cryptographic identit'.length, 1, 'x');
  const dir = scratch({ [COPY]: () => planted.text });
  const r = checkDir(dir, ['--write']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `Wrote ${COPY}: the projection of the OASB-1 catalogue in ${release}, ${controls} controls\n`);
  assert.equal(readFileSync(join(dir, COPY), 'utf8'), read(COPY));
});

test('a control the page asks no question of fails the check, and --write writes it with an empty question', () => {
  const question = JSON.parse(read(COPY)).controls.find((c) => c.id === '1.1').question;
  const line = `**Ask the vendor:** ${question}\n`;
  assert.ok(read(PAGE).includes(line), `${PAGE} no longer asks control 1.1 "${question}"; update this test`);
  const dir = scratch({ [PAGE]: (text) => text.replace(line, '') });
  const missing = `FAIL ${PAGE} asks no question of control 1.1: it has no "**Ask the vendor:**" line under the heading of the control\n`;
  let r = checkDir(dir, ['--write']);
  assert.equal(r.status, 1, r.stdout);
  assert.equal(r.stderr, `${missing}1 vendored catalogue problem\n`);
  const written = JSON.parse(readFileSync(join(dir, COPY), 'utf8'));
  assert.equal(written.controls.find((c) => c.id === '1.1').question, '');
  // The file is now the projection, and the control still has no question.
  r = checkDir(dir);
  assert.equal(r.status, 1, r.stdout);
  assert.equal(r.stderr, `${missing}1 vendored catalogue problem\n`);
  // A control asked two questions is refused.
  r = checkDir(scratch({ [PAGE]: (text) => text.replace(line, `${line}\n${line}`) }));
  assert.equal(r.status, 1, r.stdout);
  assert.equal(r.stderr, `FAIL ${PAGE} asks control 1.1 more than one question\n`);
});

test('the page names the pinned release as the source of its controls', () => {
  assert.ok(read(PAGE).includes(`catalogue in ${release}.`), `${PAGE} no longer names ${release} as its source; update this test`);
  let r = checkDir(scratch({ [PAGE]: (text) => text.replace(`catalogue in ${release}.`, 'catalogue in hackmyagent 0.0.1.') }));
  assert.equal(r.status, 1, r.stdout);
  assert.equal(r.stderr, `FAIL ${PAGE} names hackmyagent 0.0.1, not ${release}, the release VENDOR.json pins\n1 vendored catalogue problem\n`);
  r = checkDir(scratch({ [PAGE]: (text) => text.replace(`catalogue in ${release}.`, 'catalogue in hackmyagent.') }));
  assert.equal(r.status, 1, r.stdout);
  assert.equal(r.stderr, `FAIL ${PAGE} names no release of hackmyagent as the source of its controls\n1 vendored catalogue problem\n`);
});

test('a step is made from its audit step and sub-steps, less a step that runs HackMyAgent', () => {
  const steps = (id, audit) => stepsOf({ id, audit });
  assert.deepEqual(
    steps('1.1', [
      '1. Check the deployment:',
      '   - Look for key files',
      '   - MCP servers in use',
      '2. Check process owner: ps aux | grep agent',
      '3. Run scanners on dependencies:',
      '   - npm audit',
      '   - Read the report',
      '4. Test: Can the agent do this?',
      '5. Run: hackmyagent secure --verbose  (look for X-001)',
    ].join('\n')),
    [
      'Check the deployment: look for key files; MCP servers in use',
      'Check process owner: `ps aux | grep agent`',
      'Run scanners on dependencies: `npm audit`; read the report',
      'Test: Can the agent do this?',
    ],
  );
  // The examples of the steps WITHOUT_EXAMPLES names are left out, with
  // their sub-steps.
  assert.deepEqual(steps('3.1', '1. Review the code\n2. Test with common injection payloads: "one", "two"'), ['Review the code', 'Test with common injection payloads']);
  assert.deepEqual(steps('5.1', '1. Search codebase for common secret patterns:\n   - grep -r "one" .\n2. Check the history'), ['Search codebase for common secret patterns', 'Check the history']);
  assert.throws(() => steps('5.5', '1. Review the logs'), /^Error: control 5\.5 has 0 steps that start "Search logs for credential patterns:", not 1: update WITHOUT_EXAMPLES in scripts\/check-vendor\.mjs$/);
  assert.throws(() => steps('2.1', '1. A step\nnot a step'), /^Error: control 2\.1: line 2 of its audit is neither a step nor a sub-step: "not a step"$/);
  assert.throws(() => steps('2.1', '   - a sub-step first'), /line 1 of its audit is neither a step nor a sub-step/);
});

test('the catalogue module is read as data: none of it runs, and a value that is not a literal is refused', () => {
  const catalogue = (version) =>
    [
      '"use strict";',
      'exports.OASB_1_NAME = exports.OASB_1_VERSION = exports.OASB_1_CATEGORIES = void 0;',
      "throw new Error('the module ran');",
      'exports.OASB_1_CATEGORIES = [{ id: 1, name: \'C\', controls: [',
      "  { id: '1.1', name: 'N', category: 'C', level: 'L1', scored: true, description: 'It\\'s D', audit: '1. S\\n2. T', checkIds: [], verification: 'manual' }] }];",
      `exports.OASB_1_VERSION = ${version};`,
      "exports.OASB_1_NAME = 'STD-1: A Title';",
    ].join('\n');
  // The module throws at its third line when it runs.
  const values = loadCatalogue(catalogue("'1.0.0'"));
  assert.deepEqual(values.categories[0].controls[0], {
    id: '1.1', name: 'N', category: 'C', level: 'L1', scored: true, description: "It's D", audit: '1. S\n2. T', checkIds: [], verification: 'manual',
  });
  assert.equal(values.version, '1.0.0');
  assert.equal(values.name, 'STD-1: A Title');
  assert.throws(() => loadCatalogue(catalogue("(() => { throw new Error('the module ran'); })()")), /^Error: the catalogue module: line 6 holds CallExpression, not a literal$/);
  assert.throws(() => loadCatalogue(catalogue("'1.' + '0.0'")), /^Error: the catalogue module: line 6 holds BinaryExpression, not a literal$/);
  assert.throws(() => loadCatalogue(`${catalogue("'1.0.0'")}\nexports.OASB_1_VERSION = '2.0.0';`), /^Error: the catalogue module assigns exports\.OASB_1_VERSION more than once$/);
  assert.throws(() => loadCatalogue(catalogue("'1.0.0'").replace("exports.OASB_1_NAME = 'STD-1: A Title';", '')), /^Error: the catalogue module assigns no value to exports\.OASB_1_NAME$/);
  assert.throws(() => loadCatalogue(catalogue("'1.0.0'").replace("'STD-1: A Title'", "'no title'")), /^Error: the catalogue module: OASB_1_NAME is "no title", not "<standard>: <title>"$/);
  assert.throws(() => loadCatalogue(catalogue("'1.0.0'").replace('checkIds: []', "checkIds: 'X-001'")), /^Error: the catalogue module: control 1\.1 has no list of checkIds$/);
});

test('an argument the check does not take exits 1 with the usage', () => {
  for (const args of [['--bogus'], ['--tarball'], ['one', 'two']]) {
    const r = check(args);
    assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}`);
    assert.equal(r.stderr, `${USAGE}\n`, args.join(' '));
  }
  const r = check(['--help']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${USAGE}\n`);
});
