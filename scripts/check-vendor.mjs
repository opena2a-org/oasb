#!/usr/bin/env node
// Vendored catalogue check.
//
// bin/oasb-1-checklist.json, the controls `npx @opena2a/oasb checklist`
// prints, is a projection of the OASB-1 catalogue in hackmyagent: the module
// dist/benchmarks/oasb-1.js of the npm package of the release that
// VENDOR.json pins by exact version and tarball integrity. This check:
//   1. packs that release from the npm registry with
//      `npm pack hackmyagent@<version>` (or reads the tarball --tarball
//      names), and refuses a tarball whose sha512 is not the integrity
//      VENDOR.json pins, or whose package.json names another package or
//      version;
//   2. reads the catalogue module as data, without running any of it: the
//      parser of the typescript package (a devDependency) reads the values
//      the module assigns to exports.OASB_1_NAME, OASB_1_VERSION and
//      OASB_1_CATEGORIES, each of which must be a literal. It then writes
//      the projection of the catalogue: the standard and its version, and
//      each control's ID, name, level, category, requirement (the
//      catalogue's description), verification and checks (its checkIds), in
//      catalogue order, with its steps made from its audit steps as
//      stepsOf() describes and its question from the `**Ask the vendor:**`
//      line under its heading in docs/oasb-1-checklist.md, where the
//      questions are written. The level names and the specification URL are
//      the checklist's own, LEVELS and SPEC below;
//   3. compares the projection with bin/oasb-1-checklist.json byte for byte,
//      and names the line and column of the first difference;
//   4. fails when the page asks no question of a control, or names a release
//      of hackmyagent other than the pinned one.
//
// --write writes the projection to bin/oasb-1-checklist.json in place of
// step 3. After a change of the pin in VENDOR.json, it writes the controls of
// the new release; the page is then changed to match, which
// scripts/oasb-1-checklist.test.mjs checks.
//
// Usage: node scripts/check-vendor.mjs [--write] [--tarball <file>] [path/to/repo]
// Exit code 0 when step 4 finds nothing and bin/oasb-1-checklist.json is the
// projection, or with --write has been written with it (and for --help); 1
// otherwise. scripts/check-vendor.test.mjs runs it in npm run test:scripts,
// which npm test runs first.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorLine } from './check-documented-commands.mjs';
import { isMain } from './is-main.mjs';

export const VENDOR = 'VENDOR.json';
export const COPY = 'bin/oasb-1-checklist.json';
export const PAGE = 'docs/oasb-1-checklist.md';
/** The catalogue module and the manifest, as paths in the npm tarball. */
export const CATALOGUE = 'package/dist/benchmarks/oasb-1.js';
export const MANIFEST = 'package/package.json';

/** The names the checklist gives the levels of OASB-1. */
export const LEVELS = [
  { id: 'L1', name: 'Essential' },
  { id: 'L2', name: 'Standard' },
  { id: 'L3', name: 'Hardened' },
];
/** The page of the specification the checklist links. */
export const SPEC = 'https://oasb.ai/oasb-1';

export const USAGE = 'usage: node scripts/check-vendor.mjs [--write] [--tarball <file>] [path/to/repo]';

const ASK = '**Ask the vendor:** ';

// An exact npm version, such as 0.33.2 or 1.0.0-rc.1: no range, tag, URL or
// git reference. A version that holds a 40-character hex run, a commit ID,
// is refused too.
const EXACT = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const COMMIT = /[0-9a-f]{40}/i;
const SHA512 = /^sha512-[A-Za-z0-9+/]{86}==$/;
// A release of hackmyagent as the page names it: "hackmyagent 0.33.2".
const RELEASE = /\bhackmyagent (\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)/g;

/**
 * The release of hackmyagent that `text`, the content of VENDOR.json, pins:
 * its exact version and the sha512 integrity of its tarball. Throws when
 * either is missing or has another form.
 */
export function readVendor(text) {
  let vendor;
  try {
    vendor = JSON.parse(text);
  } catch (err) {
    throw new Error(`${VENDOR} is not JSON: ${err.message}`);
  }
  const { version, integrity } = vendor?.hackmyagent ?? {};
  if (typeof version !== 'string' || !EXACT.test(version) || COMMIT.test(version)) {
    throw new Error(`${VENDOR}: hackmyagent.version is ${JSON.stringify(version)}, not an exact version such as "0.33.2"`);
  }
  if (typeof integrity !== 'string' || !SHA512.test(integrity)) {
    throw new Error(`${VENDOR}: hackmyagent.integrity is ${JSON.stringify(integrity)}, not the sha512 integrity of a tarball`);
  }
  return { version, integrity };
}

/** Packs hackmyagent@`version` from the npm registry into the directory `dir`, and returns the tarball's path. */
export function pack(version, dir) {
  const r = spawnSync('npm', ['pack', `hackmyagent@${version}`, '--pack-destination', dir], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 180_000,
  });
  if (r.status !== 0) {
    throw new Error(`npm pack hackmyagent@${version} failed: ${r.error ? r.error.message : errorLine(r.stderr)}`);
  }
  const tarballs = readdirSync(dir).filter((name) => name.endsWith('.tgz'));
  if (tarballs.length !== 1) throw new Error(`npm pack hackmyagent@${version} wrote ${tarballs.length} tarballs`);
  return join(dir, tarballs[0]);
}

/** Throws unless the sha512 integrity of `bytes`, a tarball, is `integrity`. */
export function verifyIntegrity(bytes, integrity) {
  const actual = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  if (actual !== integrity) {
    throw new Error(`the tarball's integrity is ${actual}, not ${integrity}, the integrity ${VENDOR} pins`);
  }
}

/** The file `name` of the gzipped tarball at `path`, as text. */
export function member(path, name) {
  const r = spawnSync('tar', ['-xzOf', path, name], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${name} could not be read from the tarball: ${r.error ? r.error.message : errorLine(r.stderr)}`);
  return r.stdout;
}

/** The exports of the catalogue module the check reads. */
const EXPORTS = ['OASB_1_NAME', 'OASB_1_VERSION', 'OASB_1_CATEGORIES'];

/**
 * The value of the expression `node` of the parsed catalogue module `file`,
 * which must be a literal: a string, a number, true, false, null, or an
 * array or object of literals whose keys are names or strings. Throws on any
 * other expression, naming its line.
 */
function literal(ts, file, node) {
  const refuse = (at) => {
    const { line } = file.getLineAndCharacterOfPosition(at.getStart(file));
    return new Error(`the catalogue module: line ${line + 1} holds ${ts.SyntaxKind[at.kind]}, not a literal`);
  };
  switch (node.kind) {
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      return node.text;
    case ts.SyntaxKind.NumericLiteral:
      return Number(node.text);
    case ts.SyntaxKind.TrueKeyword:
      return true;
    case ts.SyntaxKind.FalseKeyword:
      return false;
    case ts.SyntaxKind.NullKeyword:
      return null;
    case ts.SyntaxKind.ArrayLiteralExpression:
      return node.elements.map((element) => literal(ts, file, element));
    case ts.SyntaxKind.ObjectLiteralExpression: {
      const value = {};
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
          throw refuse(property);
        }
        // defineProperty, so that a key named __proto__ is a key like another.
        const entry = { value: literal(ts, file, property.initializer), enumerable: true, writable: true, configurable: true };
        Object.defineProperty(value, property.name.text, entry);
      }
      return value;
    }
    default:
      throw refuse(node);
  }
}

/**
 * The catalogue that `source`, the text of the catalogue module, exports:
 * the standard's name (OASB_1_NAME) and version (OASB_1_VERSION), and its
 * categories with their controls (OASB_1_CATEGORIES). None of the module
 * runs: it is parsed with the parser of the typescript package, and each
 * value is read from the statement `exports.<name> = <literal>;` at its top
 * level. A statement that only declares exports, `exports.<name> = void 0`
 * or `exports.<a> = exports.<b> = void 0`, and the other statements are
 * passed over. Throws when one of the three is not assigned once, is not a
 * literal or has another shape.
 */
export function loadCatalogue(source) {
  let ts;
  try {
    ts = createRequire(import.meta.url)('typescript');
  } catch (err) {
    throw new Error(`the check reads the catalogue module with the parser of the typescript package, which npm ci installs: ${err.message}`);
  }
  const file = ts.createSourceFile(CATALOGUE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const values = new Map();
  for (const statement of file.statements) {
    const assignment = ts.isExpressionStatement(statement) ? statement.expression : null;
    if (!assignment || !ts.isBinaryExpression(assignment) || assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken) continue;
    const { left, right } = assignment;
    if (!ts.isPropertyAccessExpression(left) || !ts.isIdentifier(left.expression) || left.expression.text !== 'exports') continue;
    const declares = ts.isVoidExpression(right) || (ts.isBinaryExpression(right) && right.operatorToken.kind === ts.SyntaxKind.EqualsToken);
    if (!EXPORTS.includes(left.name.text) || declares) continue;
    if (values.has(left.name.text)) throw new Error(`the catalogue module assigns exports.${left.name.text} more than once`);
    values.set(left.name.text, literal(ts, file, right));
  }
  for (const name of EXPORTS) {
    if (!values.has(name)) throw new Error(`the catalogue module assigns no value to exports.${name}`);
  }
  const catalogue = { name: values.get('OASB_1_NAME'), version: values.get('OASB_1_VERSION'), categories: values.get('OASB_1_CATEGORIES') };
  const shape = (ok, what) => {
    if (!ok) throw new Error(`the catalogue module: ${what}`);
  };
  shape(typeof catalogue.name === 'string' && /^\S+: \S/.test(catalogue.name), `OASB_1_NAME is ${JSON.stringify(catalogue.name)}, not "<standard>: <title>"`);
  shape(typeof catalogue.version === 'string' && catalogue.version !== '', `OASB_1_VERSION is ${JSON.stringify(catalogue.version)}`);
  shape(Array.isArray(catalogue.categories), 'OASB_1_CATEGORIES is not a list');
  for (const category of catalogue.categories) {
    shape(Array.isArray(category?.controls), `category ${JSON.stringify(category?.name)} has no list of controls`);
    for (const c of category.controls) {
      for (const key of ['id', 'name', 'category', 'level', 'description', 'audit', 'verification']) {
        shape(typeof c?.[key] === 'string', `control ${JSON.stringify(c?.id)} of category ${JSON.stringify(category.name)} has no ${key} text`);
      }
      shape(Array.isArray(c.checkIds) && c.checkIds.every((id) => typeof id === 'string'), `control ${c.id} has no list of checkIds`);
    }
  }
  return catalogue;
}

// A step that runs HackMyAgent: the command of the control takes its place.
const RUNS_HACKMYAGENT = /^Run: hackmyagent /;

/**
 * The step of each of these controls whose examples the checklist leaves out,
 * by its text before the colon: the injection payloads of 3.1 and the search
 * patterns of 5.1 and 5.5.
 */
export const WITHOUT_EXAMPLES = new Map([
  ['3.1', 'Test with common injection payloads'],
  ['5.1', 'Search codebase for common secret patterns'],
  ['5.5', 'Search logs for credential patterns'],
]);

/** The first words of a command: text after a step's first colon, or a sub-step, that starts with one is set as code. */
export const COMMANDS = ['git', 'npm', 'pip-audit', 'ps', 'snyk'];

const isCommand = (text) => COMMANDS.includes(text.split(' ')[0]);
const asCode = (text) => `\`${text}\``;
// A sub-step joined into its step starts in lower case, unless its first word
// starts with two capitals, as an acronym does.
const lowerFirst = (text) => (/^[A-Z][a-z]/.test(text) ? `${text[0].toLowerCase()}${text.slice(1)}` : text);

/**
 * The steps of the catalogue control `control` as the checklist gives them:
 * its audit steps, the `<n>. <step>` lines of its audit, with the
 * `- <sub-step>` lines under a step joined into it after a space and
 * separated by semicolons, and commands set as code; less a step that runs
 * HackMyAgent, and with the examples of its WITHOUT_EXAMPLES step and their
 * sub-steps left out. Throws on an audit line that is neither a step nor a
 * sub-step, and when the control does not have exactly one WITHOUT_EXAMPLES
 * step that the map names for it.
 */
export function stepsOf(control) {
  const steps = [];
  control.audit.split('\n').forEach((line, i) => {
    let m;
    if ((m = /^\d+\. (.+)$/.exec(line))) steps.push({ text: m[1], subs: [] });
    else if (steps.length > 0 && (m = /^\s+- (.+)$/.exec(line))) steps.at(-1).subs.push(m[1]);
    else throw new Error(`control ${control.id}: line ${i + 1} of its audit is neither a step nor a sub-step: ${JSON.stringify(line)}`);
  });
  const trimmed = WITHOUT_EXAMPLES.get(control.id);
  let found = 0;
  const out = [];
  for (const { text, subs } of steps) {
    if (RUNS_HACKMYAGENT.test(text)) continue;
    if (trimmed !== undefined && text.startsWith(`${trimmed}:`)) {
      out.push(trimmed);
      found++;
      continue;
    }
    const colon = text.indexOf(': ');
    let step = colon >= 0 && isCommand(text.slice(colon + 2)) ? `${text.slice(0, colon + 2)}${asCode(text.slice(colon + 2))}` : text;
    if (subs.length > 0) step += ` ${subs.map((s) => (isCommand(s) ? asCode(s) : lowerFirst(s))).join('; ')}`;
    out.push(step);
  }
  if (trimmed !== undefined && found !== 1) {
    throw new Error(`control ${control.id} has ${found} steps that start "${trimmed}:", not 1: update WITHOUT_EXAMPLES in scripts/check-vendor.mjs`);
  }
  return out;
}

/**
 * The question docs/oasb-1-checklist.md asks of each control, by control ID:
 * the `**Ask the vendor:**` line under its `### <ID> <name>` heading. Throws
 * when a control has two.
 */
export function pageQuestions(text) {
  const questions = new Map();
  let id = null;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const heading = /^### (\d+\.\d+) /.exec(line);
    if (heading) {
      id = heading[1];
    } else if (line.startsWith('## ')) {
      id = null;
    } else if (id !== null && line.startsWith(ASK)) {
      if (questions.has(id)) throw new Error(`${PAGE} asks control ${id} more than one question`);
      questions.set(id, line.slice(ASK.length));
    }
  }
  return questions;
}

/**
 * The checklist that `catalogue` projects to, with `release`, the version of
 * hackmyagent, as its source and the question of each control from
 * `questions`, by control ID ('' for a control it has none for).
 */
export function projectChecklist(catalogue, release, questions) {
  const [, standard, title] = /^(\S+): (.+)$/.exec(catalogue.name);
  const controls = catalogue.categories
    .flatMap((category) => category.controls)
    .map((c) => {
      if (!LEVELS.some((level) => level.id === c.level)) {
        throw new Error(`control ${c.id} is at level ${JSON.stringify(c.level)}, which LEVELS in scripts/check-vendor.mjs does not name`);
      }
      return {
        id: c.id,
        name: c.name,
        level: c.level,
        category: c.category,
        requirement: c.description,
        question: questions.get(c.id) ?? '',
        steps: stepsOf(c),
        verification: c.verification,
        checks: [...c.checkIds],
      };
    });
  return { standard, title, version: catalogue.version, spec: SPEC, source: `hackmyagent ${release}`, levels: LEVELS, controls };
}

/**
 * The checklist `list` as bin/oasb-1-checklist.json holds it: JSON indented
 * by two spaces, with each level and each control's list of checks on one
 * line, and a line feed at the end.
 */
export function formatChecklist(list) {
  const q = (value) => JSON.stringify(value);
  const block = (open, items, close, indent) =>
    items.length === 0 ? `${open}${close}` : `${open}\n${items.map((item) => `${indent}  ${item}`).join(',\n')}\n${indent}${close}`;
  const control = (c) =>
    block(
      '{',
      [
        `"id": ${q(c.id)}`,
        `"name": ${q(c.name)}`,
        `"level": ${q(c.level)}`,
        `"category": ${q(c.category)}`,
        `"requirement": ${q(c.requirement)}`,
        `"question": ${q(c.question)}`,
        `"steps": ${block('[', c.steps.map(q), ']', '      ')}`,
        `"verification": ${q(c.verification)}`,
        `"checks": [${c.checks.map(q).join(', ')}]`,
      ],
      '}',
      '    ',
    );
  const levels = list.levels.map((level) => `{ "id": ${q(level.id)}, "name": ${q(level.name)} }`);
  const top = [
    `"standard": ${q(list.standard)}`,
    `"title": ${q(list.title)}`,
    `"version": ${q(list.version)}`,
    `"spec": ${q(list.spec)}`,
    `"source": ${q(list.source)}`,
    `"levels": ${block('[', levels, ']', '  ')}`,
    `"controls": ${block('[', list.controls.map(control), ']', '  ')}`,
  ];
  return `${block('{', top, '}', '')}\n`;
}

/**
 * The line and column of the first character where `copy` and `projected`
 * differ, with that line of each (undefined for a text that has ended), or
 * null when they are the same text.
 */
export function firstDifference(copy, projected) {
  if (copy === projected) return null;
  const a = copy.split('\n');
  const b = projected.split('\n');
  let i = 0;
  while (a[i] === b[i]) i++;
  const [x, y] = [a[i] ?? '', b[i] ?? ''];
  let column = 0;
  while (column < x.length && x[column] === y[column]) column++;
  return { line: i + 1, column: column + 1, copy: a[i], projected: b[i] };
}

const shown = (line) => (line === undefined ? '(the file has ended)' : JSON.stringify(line));

/**
 * Checks the files of the repository at `root` against the release
 * VENDOR.json pins, read from the tarball `tarballFor(version)` returns.
 * With `write`, writes the projection to bin/oasb-1-checklist.json in place
 * of comparing it. Returns the problems found, the release and the
 * projected checklist. Throws when the release cannot be read.
 */
export function checkVendor(root, tarballFor, { write = false } = {}) {
  const pin = readVendor(readFileSync(join(root, VENDOR), 'utf8'));
  const release = `hackmyagent ${pin.version}`;
  const tarball = tarballFor(pin.version);
  verifyIntegrity(readFileSync(tarball), pin.integrity);
  const manifest = JSON.parse(member(tarball, MANIFEST));
  if (manifest.name !== 'hackmyagent' || manifest.version !== pin.version) {
    throw new Error(`the tarball holds ${manifest.name} ${manifest.version}, not ${release}`);
  }
  const page = readFileSync(join(root, PAGE), 'utf8');
  const list = projectChecklist(loadCatalogue(member(tarball, CATALOGUE)), pin.version, pageQuestions(page));
  const projected = formatChecklist(list);
  const problems = [];
  if (write) {
    writeFileSync(join(root, COPY), projected);
  } else {
    const diff = firstDifference(readFileSync(join(root, COPY), 'utf8'), projected);
    if (diff) {
      problems.push(
        [
          `${COPY} is not the projection of the OASB-1 catalogue in ${release}, the release ${VENDOR} pins. The first difference is at line ${diff.line}, column ${diff.column}:`,
          `  ${COPY}: ${shown(diff.copy)}`,
          `  the projection: ${shown(diff.projected)}`,
          `  The controls come from the catalogue and the questions from ${PAGE}; node scripts/check-vendor.mjs --write writes the projection to ${COPY}.`,
        ].join('\n'),
      );
    }
  }
  for (const c of list.controls) {
    if (c.question === '') problems.push(`${PAGE} asks no question of control ${c.id}: it has no "${ASK.trim()}" line under the heading of the control`);
  }
  const named = [...new Set([...page.matchAll(RELEASE)].map((m) => m[1]))];
  if (named.length === 0) problems.push(`${PAGE} names no release of hackmyagent as the source of its controls`);
  for (const version of named) {
    if (version !== pin.version) problems.push(`${PAGE} names hackmyagent ${version}, not ${release}, the release ${VENDOR} pins`);
  }
  return { problems, release, list };
}

/** Runs the check with the command-line arguments `args`, and returns its exit code. */
export function main(args) {
  let write = false;
  let tarball = null;
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      return 0;
    }
    if (arg === '--write') {
      write = true;
    } else if (arg === '--tarball' && i + 1 < args.length) {
      tarball = resolve(args[++i]);
    } else if (arg.startsWith('-') || paths.length > 0) {
      console.error(USAGE);
      return 1;
    } else {
      paths.push(arg);
    }
  }
  const root = resolve(paths[0] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const dir = mkdtempSync(join(tmpdir(), 'oasb-vendor-'));
  try {
    const { problems, release, list } = checkVendor(root, (version) => tarball ?? pack(version, dir), { write });
    if (write) console.log(`Wrote ${COPY}: the projection of the OASB-1 catalogue in ${release}, ${list.controls.length} controls`);
    if (problems.length > 0) {
      for (const p of problems) console.error(`FAIL ${p}`);
      console.error(`${problems.length} vendored catalogue problem${problems.length === 1 ? '' : 's'}`);
      return 1;
    }
    if (!write) {
      console.log(`${COPY} is the projection of the OASB-1 catalogue in ${release}, the release ${VENDOR} pins, byte for byte: ${list.controls.length} controls`);
    }
    return 0;
  } catch (err) {
    console.error(`FAIL ${err.message}`);
    return 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
