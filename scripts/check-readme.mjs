#!/usr/bin/env node
// README layout and link check.
//
// Guards the first screen a visitor sees and the links that hold the README
// together after content moves into docs/:
//   1. the README stays under MAX_LINES lines;
//   2. the first H2 is "Quick Start" and starts before line QUICK_START_BY;
//   3. a fenced code block with a runnable command starts before line COMMAND_BY;
//   4. each relative link the check reads resolves to a file in the
//      repository, and an #anchor in a link to a .md file resolves to a
//      heading in that file. The check reads three forms, each written within
//      one line: inline `[text](target)` with an optional double-quoted title,
//      a reference definition `[label]: target` at the start of a line
//      (indented at most three spaces), and a quoted HTML `href="target"` or
//      `href='target'` attribute. Other forms, such as an unquoted href or a
//      definition inside a list item, are not read. A link whose path, or
//      whose anchor in a link to a .md file, has a malformed %-escape
//      (100%.md) fails with its line. For a path the message says to write
//      a literal % as %25; a heading's anchor holds no %, so for an anchor it
//      says to drop the %, and names the anchor that then matches a heading
//      when one does (#100%-coverage, with a heading "100% coverage", is
//      told to write #100-coverage).
//   5. every test count the README states equals the suite: the badge, the
//      Quick Start comment, the Counts note, the per-group `npm run test:*`
//      comments, the scenario counts in the prose, the MITRE ATLAS counts
//      (a scenario file under the README's directory maps to ATLAS when it
//      cites a technique ID), and each row of the
//      "What Gets Tested" table, counted per source directory. Without
//      --tests the check collects the suite with vitest (no test runs), so a
//      "passing" count is compared with the tests that are not skipped; with
//      --tests it reads a vitest JSON report (`vitest run --reporter=json`)
//      and compares it with the tests that passed. A test the report shows
//      skipped as inconclusive at run time (isInconclusiveSkip in
//      scripts/readme-counts.mjs) is counted with them, not with the skipped
//      ones, as the release smoke's drift guard counts it, and the number of
//      such tests is printed; whether the run measured their file is the
//      drift guard's check, not this one's. A report written in
//      another checkout is read by each file's path from its src/ directory.
//      A stated count the check cannot find fails, so a reworded claim is
//      never silently unchecked. The statements are listed in
//      scripts/readme-counts.mjs, which the release smoke's drift guard reads
//      too.
//   6. no line, in prose or in a code block, shows an OpenA2A CLI command
//      the published CLI does not have. Each entry of UNSHIPPED is one such
//      command; remove it when the CLI ships the command.
//   7. a scenario test that a MITRE ATLAS coverage table lists, and whose
//      tests are all skipped, is marked as skipped there. The tables read are
//      those in the README's "MITRE ATLAS Coverage" section and in each .md
//      page that section links to. A table lists a test by the ID its file
//      name starts with (E2E-003), or several with one prefix
//      (AT-NET-001/002); a skipped one must be written out in full and
//      followed by "(skipped", as in "E2E-003 (skipped)". Like the counts,
//      this reads the suite, so --no-counts skips it.
//   8. a paragraph, table row or heading that offers the Scanner Benchmark
//      for comparing products calls it a recall-only comparison. Its benign
//      class was labeled by HackMyAgent, one of the scanners it compares, so
//      only recall on the malicious samples is comparable across products.
//      Retire this check when the benchmark has a benign set that no scanner
//      under test labeled.
//   9. a linked .md page whose file name carries a date (YYYY-MM-DD) says
//      "as of <that date>" and links to the README above its first H2. Its
//      counts are those of that day and are not compared with the suite, so
//      the page itself sends the reader to the README for the current ones.
//
// Checks 4, 5, 6 and 8 read the pages that took text moved out of the README
// (README_PAGES in scripts/readme-counts.mjs) as they read the README, so the
// test totals, the "What Gets Tested" table and the links that moved are
// still checked; a message about one of those pages names it before the
// line number. A link on a page resolves from the page's directory.
//
// Usage: node scripts/check-readme.mjs [--tests <report.json> | --no-counts] [path/to/README.md]
// Exit code 0 when every check passes (and for --help), 1 otherwise. Run by npm run smoke.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUALIFIERS, README_PAGES, SCENARIO_DIRS, STATEMENTS, atlasCounts, isInconclusiveSkip, readFailure, reportFiles, sourcePath } from './readme-counts.mjs';

const MAX_LINES = 400;
const QUICK_START_BY = 25;
const COMMAND_BY = 30;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = 'usage: node scripts/check-readme.mjs [--tests <report.json> | --no-counts] [path/to/README.md]';
let noCounts = false;
let reportPath;
let readmeArg;
let badArgs = false;
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--no-counts') noCounts = true;
  else if (args[i] === '--tests' && i + 1 < args.length) reportPath = args[++i];
  else if (!args[i].startsWith('-') && readmeArg === undefined) readmeArg = args[i];
  else badArgs = true;
}
if (badArgs || (noCounts && reportPath)) {
  console.error(USAGE);
  process.exit(1);
}
const readmePath = resolve(readmeArg || join(root, 'README.md'));

const failures = [];
const fail = (msg) => failures.push(msg);

// Split a markdown file into lines, tagging each with whether it sits inside a
// fenced code block, so headings and links are only read from prose.
function parse(text) {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  let fence = null;
  return lines.map((line, i) => {
    const marker = line.match(/^\s*(```+|~~~+)/);
    if (marker) {
      if (fence === null) {
        fence = marker[1][0];
        return { n: i + 1, line, fenceOpen: true, inFence: false };
      }
      if (marker[1][0] === fence) {
        fence = null;
        return { n: i + 1, line, fenceClose: true, inFence: false };
      }
    }
    return { n: i + 1, line, inFence: fence !== null };
  });
}

// GitHub heading anchor: lowercase, drop punctuation except - and _, spaces to -.
function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function anchors(lines) {
  const seen = new Map();
  const out = new Set();
  for (const { line, inFence } of lines) {
    if (inFence) continue;
    const h = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!h) continue;
    const base = slug(h[1]);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    out.add(count === 0 ? base : `${base}-${count}`);
  }
  return out;
}

let readmeText;
try {
  readmeText = readFileSync(readmePath, 'utf8');
} catch (err) {
  console.error(`README: cannot read the README ${readmePath}: ${readFailure(err)}`);
  process.exit(1);
}
const readme = parse(readmeText);

// The README and the pages that took its text, each with the prefix that
// names it in a message: none for the README, its path for a page. A page
// that does not exist is not read; the README's link to it is reported by
// check 4, and a count it held by check 5.
const documents = [{ file: readmePath, prefix: '', text: readmeText, lines: readme }];
for (const path of README_PAGES) {
  const file = resolve(dirname(readmePath), path);
  if (!existsSync(file)) continue;
  try {
    const text = readFileSync(file, 'utf8');
    documents.push({ file, prefix: `${path} `, text, lines: parse(text) });
  } catch (err) {
    fail(`cannot read ${path}, a page that took text from the README: ${readFailure(err)}`);
  }
}

// 1. Length budget.
if (readme.length >= MAX_LINES) {
  fail(`README has ${readme.length} lines; the budget is under ${MAX_LINES}. Move reference detail into docs/ and link to it.`);
}

// 2. Quick Start is the first H2 and sits near the top.
const firstH2 = readme.find((l) => !l.inFence && /^##\s/.test(l.line));
if (!firstH2) {
  fail('README has no H2 heading; the first one must be "## Quick Start".');
} else {
  const title = firstH2.line.replace(/^##\s+/, '').trim();
  if (title !== 'Quick Start') {
    fail(`first H2 is "${title}" at line ${firstH2.n}; it must be "Quick Start".`);
  } else if (firstH2.n >= QUICK_START_BY) {
    fail(`"## Quick Start" is at line ${firstH2.n}; it must start before line ${QUICK_START_BY}.`);
  }
}

// 3. A runnable command appears before line COMMAND_BY.
let commandLine = null;
for (let i = 0; i < readme.length && commandLine === null; i++) {
  if (!readme[i].fenceOpen || readme[i].n >= COMMAND_BY) continue;
  const lang = readme[i].line.replace(/^\s*(```+|~~~+)/, '').trim().toLowerCase();
  if (lang && !['bash', 'sh', 'shell', 'console', 'zsh'].includes(lang)) continue;
  for (let j = i + 1; j < readme.length && readme[j].inFence; j++) {
    const cmd = readme[j].line.trim().replace(/^\$\s*/, '');
    if (cmd && !cmd.startsWith('#')) {
      if (readme[j].n < COMMAND_BY) commandLine = readme[j].n;
      break;
    }
  }
}
if (commandLine === null) {
  fail(`no shell code block with a command starts before line ${COMMAND_BY}; the first screen must show the first command to run.`);
}

// 4. Relative links and anchors resolve.

// A link path or anchor with its %-escapes decoded, or null when an escape is
// malformed (100%.md), which names no file or heading.
function decoded(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

// What to do about an anchor with a malformed %-escape. A heading's anchor
// holds no % (slug() drops it), so writing the % as %25 cannot match one.
// With each % that starts no escape dropped, the anchor is named when it then
// matches a heading in `ids`; otherwise the advice names the page `where`.
function malformedAnchorAdvice(anchor, ids, where) {
  const stripped = anchor.replace(/%(?![0-9a-f]{2})/gi, '');
  const id = decoded(stripped);
  if (id !== null && ids.has(id.toLowerCase())) return `a heading's anchor has no %, so write "#${stripped}".`;
  return `a heading's anchor has no %, so drop the % and link a heading in ${where}.`;
}

const anchorCache = new Map();
function anchorsOf(file) {
  if (!anchorCache.has(file)) anchorCache.set(file, anchors(parse(readFileSync(file, 'utf8'))));
  return anchorCache.get(file);
}

// Link targets on one prose line: inline [text](target), a reference
// definition [label]: target (footnotes [^1]: are not links), and HTML
// href="target" / href='target'.
function linkTargets(prose) {
  const targets = [...prose.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1]);
  const def = prose.match(/^ {0,3}\[(?!\^)[^\]]+\]:\s*(?:<([^>\s]+)>|(\S+))/);
  if (def) targets.push(def[1] || def[2]);
  for (const m of prose.matchAll(/<[a-z][^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    targets.push(m[1] ?? m[2]);
  }
  return targets;
}

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i; // http:, https:, mailto:

// The linked .md pages whose file name carries a date, each with the first
// line of the README, or else of a page that took its text, that links it.
// Read by check 9.
const DATE_IN_NAME = /\d{4}-\d{2}-\d{2}/;
const datedPages = new Map();

for (const { file: doc, prefix, lines } of documents) {
  for (const { n, line, inFence } of lines) {
    if (inFence) continue;
    const prose = line.replace(/`[^`]*`/g, '');
    for (const target of linkTargets(prose)) {
      if (!target) continue;
      if (ABSOLUTE.test(target)) continue;
      const [pathPart, anchor] = target.split('#');
      const path = pathPart ? decoded(pathPart) : '';
      if (path === null) {
        fail(`${prefix}line ${n}: link target "${target}" has a malformed %-escape; write a literal % as %25.`);
        continue;
      }
      const file = path ? resolve(dirname(doc), path) : doc;
      if (!existsSync(file)) {
        fail(`${prefix}line ${n}: link target "${target}" does not exist.`);
        continue;
      }
      if (anchor && /\.md$/i.test(file)) {
        const id = decoded(anchor);
        const where = pathPart || prefix.trim() || 'README.md';
        if (id === null) {
          fail(`${prefix}line ${n}: anchor "#${anchor}" has a malformed %-escape; ${malformedAnchorAdvice(anchor, anchorsOf(file), where)}`);
        } else if (!anchorsOf(file).has(id.toLowerCase())) {
          fail(`${prefix}line ${n}: anchor "#${anchor}" has no matching heading in ${where}.`);
        }
      }
      if (/\.md$/i.test(file) && DATE_IN_NAME.test(basename(file)) && !datedPages.has(file)) {
        datedPages.set(file, { at: `${prefix}line ${n}`, shown: pathPart });
      }
    }
  }
}

// 5. Every stated test count equals the suite. The statements, and the
// measure each number must equal, are listed in scripts/readme-counts.mjs.

// A test file's path in this checkout. A report written in another checkout
// names files outside it; those are read from their src/ directory on.
function repoPath(file) {
  const outside = (rel) => rel.startsWith('..') || isAbsolute(rel);
  let rel = relative(root, file);
  if (outside(rel)) {
    try {
      rel = relative(realpathSync(root), realpathSync(file));
    } catch {
      // the file is not in this checkout
    }
  }
  return outside(rel) ? sourcePath(file) : rel.split(sep).join('/');
}

// The suite as a list of { file, state }: state is 'passed', 'failed' or
// 'skipped' from a report, and 'skipped' or 'collected' from a collection.
// A test of a report also says whether it was skipped as `inconclusive`.
async function suiteTests() {
  if (reportPath) {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    // A test skipped as inconclusive at run time is counted with the tests
    // that passed, as the drift guard counts it.
    return reportFiles(report).flatMap((file) =>
      file.assertionResults.map((t) => ({
        file: repoPath(file.name),
        state: t.status === 'passed' || t.status === 'failed' ? t.status : isInconclusiveSkip(t) ? 'passed' : 'skipped',
        inconclusive: isInconclusiveSkip(t),
      })),
    );
  }
  let createVitest;
  try {
    ({ createVitest } = await import('vitest/node'));
  } catch {
    throw new Error('the test count check needs vitest: run npm ci first, or pass --no-counts');
  }
  const vitest = await createVitest('test', { root, watch: false, reporters: [] });
  try {
    const { testModules } = await vitest.collect();
    const tests = [];
    for (const m of testModules) {
      for (const e of m.errors()) fail(`vitest could not collect ${repoPath(m.moduleId)}: ${e.message}`);
      for (const t of m.children.allTests()) {
        tests.push({ file: repoPath(m.moduleId), state: t.result().state === 'skipped' ? 'skipped' : 'collected' });
      }
    }
    return tests;
  } finally {
    await vitest.close();
  }
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function checkCounts(tests) {
  const ran = Boolean(reportPath);
  const source = ran ? 'the test report' : 'the suite';
  const under = (dir) => tests.filter((t) => t.file.startsWith(dir + '/'));
  const files = (list) => new Set(list.map((t) => t.file)).size;
  const inDir = (dir) => [under(dir).length, `tests in ${dir}`];
  const scenarioTests = tests.filter((t) => SCENARIO_DIRS.some((dir) => t.file.startsWith(dir + '/')));
  const scenarioDirs = `${SCENARIO_DIRS.slice(0, -1).join(', ')} and ${SCENARIO_DIRS.at(-1)}`;
  // The MITRE ATLAS counts, from the scenario files under the README's directory.
  const scenarioFiles = [...new Set(scenarioTests.map((t) => t.file))].map((path) => ({
    path,
    tests: scenarioTests.filter((t) => t.file === path).length,
  }));
  let atlas = null;
  try {
    atlas = atlasCounts(scenarioFiles, (path) => {
      const file = join(dirname(readmePath), path);
      try {
        return readFileSync(file, 'utf8');
      } catch (err) {
        throw new Error(`cannot read ${file}, a scenario file ${source} names: ${readFailure(err)}`);
      }
    });
  } catch (err) {
    fail(`${err.message}; the MITRE ATLAS counts are not checked.`);
  }
  const fixed = {
    total: [tests.length, 'tests'],
    passed: ran
      ? [tests.filter((t) => t.state === 'passed').length, 'passing tests']
      : [tests.filter((t) => t.state !== 'skipped').length, 'tests that are not skipped (collected, not run)'],
    skipped: [tests.filter((t) => t.state === 'skipped').length, 'skipped tests'],
    scenarios: [scenarioTests.length, `attack-scenario tests (${scenarioDirs})`],
    scenarioFiles: [files(scenarioTests), `scenario test files (${scenarioDirs})`],
    scoringEngine: [
      under('src/benchmark').length - under('src/benchmark/pinned').length,
      'scoring-engine tests (src/benchmark outside src/benchmark/pinned)',
    ],
    pinned: inDir('src/benchmark/pinned'),
    atomic: inDir('src/atomic'),
    integration: inDir('src/integration'),
    integrationFiles: [files(under('src/integration')), 'test files in src/integration'],
    baseline: inDir('src/baseline'),
    e2e: inDir('src/e2e'),
    // The ATLAS measures are null when the scenario files could not be read, which is reported above.
    mappedScenarios: atlas && [atlas.mappedScenarios, 'scenario tests in files that cite a MITRE ATLAS technique ID'],
    mappedScenarioFiles: atlas && [atlas.mappedScenarioFiles, 'scenario files that cite a MITRE ATLAS technique ID'],
    unmappedScenarios: atlas && [atlas.unmappedScenarios, 'scenario tests in files that cite no MITRE ATLAS technique ID'],
    unmappedScenarioFiles: atlas && [atlas.unmappedScenarioFiles, 'scenario files that cite no MITRE ATLAS technique ID'],
    techniques: atlas && [atlas.techniques, 'MITRE ATLAS technique IDs cited by the scenario files'],
  };
  // `at` is where the count is stated: "line N" in the README, "<page> line N" on a page.
  const compare = (at, what, stated, [live, label]) => {
    if (stated !== live) fail(`${at}: ${what} says ${stated}; ${source} has ${live} ${label}.`);
  };

  for (const { where, re, keys } of STATEMENTS) {
    for (const key of keys.filter((k) => !Object.hasOwn(fixed, k))) {
      fail(
        `STATEMENTS in scripts/readme-counts.mjs gives the ${where} the key "${key}", which names no count this check measures (${Object.keys(fixed).join(', ')}).`,
      );
    }
    const matches = documents.flatMap(({ prefix, text }) =>
      [...text.matchAll(re)].map((m) => ({ m, at: `${prefix}line ${lineOf(text, m.index)}` })),
    );
    if (matches.length === 0) {
      fail(`the ${where} (${re}) was not found; if its wording changed, update STATEMENTS in scripts/readme-counts.mjs.`);
    }
    for (const { m, at } of matches) {
      keys.forEach((key, i) => {
        // An unknown key and an unread scenario file (null ATLAS measures) are reported above.
        if (!Object.hasOwn(fixed, key) || !fixed[key]) return;
        compare(at, `the ${where}`, Number(m[i + 1]), fixed[key]);
      });
    }
  }

  // The "What Gets Tested" table, in the README or a page that took its
  // text: each test file belongs to the row with the longest Source directory
  // that holds it (and whose qualifier matches), and every test file must
  // belong to a row. The "Attack scenarios" and "npm test total" rows are
  // statements, compared above. Every copy of the table is checked.
  const tables = [];
  for (const { prefix, lines } of documents) {
    const start = lines.findIndex((l) => !l.inFence && /^##\s+What Gets Tested\s*$/.test(l.line));
    const rows = [];
    for (let i = start + 1; start >= 0 && i < lines.length && !/^##\s/.test(lines[i].line); i++) {
      const { n, line } = lines[i];
      if (!line.startsWith('|') || /^\|\s*:?-/.test(line)) continue;
      rows.push({ n, cells: line.split('|').slice(1, -1).map((c) => c.trim()) });
    }
    if (rows.length >= 2) tables.push({ prefix, rows });
  }
  if (tables.length === 0) {
    fail('the "What Gets Tested" table was not found; if it moved, update scripts/check-readme.mjs.');
    return fixed;
  }
  for (const table of tables) checkTable(table, tests, compare);
  return fixed;
}

// One "What Gets Tested" table: its rows, the prefix that names its page, and
// the compare function of checkCounts.
function checkTable({ prefix, rows }, tests, compare) {
  const plain = (s) => (s || '').replace(/[*`]/g, '').trim();
  const dirRows = [];
  for (const { n, cells } of rows.slice(1)) {
    const category = plain(cells[0]);
    if (category === 'Attack scenarios' || category === 'npm test total') continue;
    const what = `the "${category}" row`;
    const stated = plain(cells[1]);
    if (!/^\d+$/.test(stated)) {
      fail(`${prefix}line ${n}: ${what} has no test count.`);
      continue;
    }
    const src = (cells[2] || '').match(/^`([^`]+)`(?:\s+\(([^)]+)\))?$/);
    if (!src || (src[2] && !QUALIFIERS[src[2]])) {
      fail(`${prefix}line ${n}: cannot tell which tests ${what} counts; its Source must be a \`directory\`, optionally followed by one of: ${Object.keys(QUALIFIERS).map((q) => `(${q})`).join(', ')}.`);
      continue;
    }
    dirRows.push({ n, what, stated: Number(stated), dir: src[1].replace(/\/$/, ''), qualifier: src[2], count: 0 });
  }
  const unowned = new Set();
  for (const t of tests) {
    const name = t.file.slice(t.file.lastIndexOf('/') + 1);
    const holders = dirRows.filter(
      (r) => t.file.startsWith(r.dir + '/') && (!r.qualifier || QUALIFIERS[r.qualifier].test(name)),
    );
    if (holders.length === 0) {
      unowned.add(t.file);
      continue;
    }
    holders.reduce((a, b) => (b.dir.length > a.dir.length ? b : a)).count++;
  }
  for (const r of dirRows) {
    const narrower = dirRows.filter((o) => o.dir.startsWith(r.dir + '/')).map((o) => o.dir);
    const label =
      `tests in ${r.dir}` +
      (r.qualifier ? ` (${r.qualifier})` : '') +
      (narrower.length ? ` outside ${[...new Set(narrower)].join(', ')}` : '');
    compare(`${prefix}line ${r.n}`, r.what, r.stated, [r.count, label]);
  }
  const table = prefix ? `the "What Gets Tested" table in ${prefix.trim()}` : 'the "What Gets Tested" table';
  for (const f of unowned) fail(`no row of ${table} counts the tests in ${f}.`);
}

// 7. A skipped scenario test listed as MITRE ATLAS coverage is marked as skipped.

// A scenario test's ID: its file name up to the first dot, such as E2E-003.
function scenarioId(file) {
  const id = file.slice(file.lastIndexOf('/') + 1).split('.')[0];
  return /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/.test(id) ? id : null;
}

// The test IDs a table row lists: AT-NET-001/002 lists AT-NET-001 and AT-NET-002.
function listedIds(row) {
  const ids = [];
  for (const m of row.matchAll(/\b([A-Z][A-Z0-9]*(?:-[A-Z]+)*-)(\d+)((?:\/\d+)*)/g)) {
    ids.push(m[1] + m[2]);
    for (const n of m[3].split('/').slice(1)) ids.push(m[1] + n);
  }
  return ids;
}

function checkSkippedCoverage(tests) {
  const byId = new Map();
  for (const t of tests) {
    if (!SCENARIO_DIRS.some((dir) => t.file.startsWith(dir + '/'))) continue;
    const id = scenarioId(t.file);
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, { file: t.file, states: [] });
    byId.get(id).states.push(t.state);
  }
  const skipped = new Map([...byId].filter(([, v]) => v.states.every((s) => s === 'skipped')));

  // The README's MITRE ATLAS Coverage section, and the .md pages it links to.
  const start = readme.findIndex((l) => !l.inFence && /^##\s+MITRE ATLAS Coverage\s*$/.test(l.line));
  if (start < 0) return;
  let end = start + 1;
  while (end < readme.length && (readme[end].inFence || !/^##\s/.test(readme[end].line))) end++;
  const section = readme.slice(start + 1, end);
  const pages = [{ lines: section, prefix: '' }];
  const seen = new Set([readmePath]);
  for (const { line, inFence } of section) {
    if (inFence) continue;
    for (const target of linkTargets(line.replace(/`[^`]*`/g, ''))) {
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      const pathPart = target.split('#')[0];
      if (!pathPart || !/\.md$/i.test(pathPart)) continue;
      const path = decoded(pathPart);
      if (path === null) continue; // a malformed %-escape is reported by the link check
      const file = resolve(dirname(readmePath), path);
      if (seen.has(file) || !existsSync(file)) continue; // a missing page is reported by the link check
      seen.add(file);
      pages.push({ lines: parse(readFileSync(file, 'utf8')), prefix: `${pathPart} ` });
    }
  }

  for (const { lines, prefix } of pages) {
    for (const { n, line, inFence } of lines) {
      if (inFence || !line.startsWith('|')) continue;
      for (const id of new Set(listedIds(line))) {
        if (!skipped.has(id)) continue;
        if (new RegExp(`\\b${id}\\s*\\(skipped`).test(line)) continue;
        fail(
          `${prefix}line ${n}: ${id} is listed as MITRE ATLAS coverage, but every test in ${skipped.get(id).file} is skipped; ` +
            `write it as "${id} (skipped)" or remove it.`,
        );
      }
    }
  }
}

// 8. The Scanner Benchmark is offered for comparing products only as a
// recall-only comparison.
const NAMES_BENCHMARK = /\]\(#skills-security-benchmark\)|\b(?:Scanner|Skills Security) Benchmark\b/;
const COMPARES_PRODUCTS = /\bcross-product\b|\bapples-to-apples\b|\b(?:across|between) (?:products|scanners)\b/i;
const RECALL_ONLY = /\brecall-only\b/i;

// The prose blocks of a parsed file, each with the line it starts on: a
// paragraph (a blank line, or a blank ">" line, ends it), a table row or a
// heading. Fenced code is not read.
function blocks(lines) {
  const out = [];
  let open = null;
  for (const { n, line, inFence, fenceOpen, fenceClose } of lines) {
    if (inFence || fenceOpen || fenceClose || /^[\s>]*$/.test(line)) {
      open = null;
      continue;
    }
    if (/^[\s>]*(?:\||#{1,6}\s)/.test(line)) {
      out.push({ n, text: line });
      open = null;
      continue;
    }
    if (open) open.text += ' ' + line;
    else out.push((open = { n, text: line }));
  }
  return out;
}

for (const { n, text, prefix } of documents.flatMap((d) => blocks(d.lines).map((b) => ({ ...b, prefix: d.prefix })))) {
  const prose = text.replace(/`[^`]*`/g, '');
  if (NAMES_BENCHMARK.test(prose) && COMPARES_PRODUCTS.test(prose) && !RECALL_ONLY.test(prose)) {
    fail(
      `${prefix}line ${n}: the Scanner Benchmark is offered for comparing products without calling it a recall-only comparison. ` +
        'Its benign class was labeled by HackMyAgent, one of the scanners it compares, so false-positive rate, precision, ' +
        'F1, flag rate and tier favor that scanner; say "recall-only comparison".',
    );
  }
}

let counted = null;
let inconclusive = 0;
if (!noCounts) {
  let tests = null;
  try {
    tests = await suiteTests();
  } catch (err) {
    fail(reportPath ? `cannot read the test report ${reportPath}: ${readFailure(err)}` : err.message);
  }
  if (tests) {
    counted = checkCounts(tests);
    checkSkippedCoverage(tests);
    inconclusive = tests.filter((t) => t.inconclusive).length;
  }
}

// 6. OpenA2A CLI commands the CLI does not have. A reader who copies one gets
// an error or a different command, so each entry says what the CLI does.
const UNSHIPPED = [
  {
    re: /\bopena2a\s+benchmark\s+run\b/,
    why: 'the OpenA2A CLI has no "benchmark run" subcommand: `opena2a benchmark run` checks a directory named run against the OASB-1 controls',
  },
  { re: /\bopena2a\b.*\s--technique\b/, why: 'the OpenA2A CLI has no --technique option' },
];
for (const { n, line, prefix } of documents.flatMap((d) => d.lines.map((l) => ({ ...l, prefix: d.prefix })))) {
  for (const { re, why } of UNSHIPPED) {
    if (re.test(line)) {
      fail(
        `${prefix}line ${n}: ${why}; describe what the CLIs do today (opena2a benchmark and hackmyagent secure -b oasb-1 ` +
          'check the OASB-1 controls; the attack scenarios run with npm test).',
      );
    }
  }
}

// 9. A dated page the README links says it is one. Nothing compares its
// counts with the suite, so above its first H2 it says "as of <the date in
// its file name>" and links to the README. The note may be wrapped and may
// sit in a blockquote; text in a code block or inline code is not the note.
for (const [file, { at, shown }] of datedPages) {
  const date = basename(file).match(DATE_IN_NAME)[0];
  const page = parse(readFileSync(file, 'utf8'));
  const h2 = page.findIndex((l) => !l.inFence && /^##\s/.test(l.line));
  const intro = (h2 === -1 ? page : page.slice(0, h2))
    .filter((l) => !l.inFence && !l.fenceOpen && !l.fenceClose)
    .map((l) => l.line.replace(/`[^`]*`/g, '').replace(/^\s*(?:>\s?)+/, ''));
  const toReadme = (target) => {
    const pathPart = target.split('#')[0];
    if (!pathPart || ABSOLUTE.test(target)) return false;
    const path = decoded(pathPart);
    return path !== null && resolve(dirname(file), path) === readmePath;
  };
  const missing = [];
  if (!new RegExp(`\\bas of ${date}\\b`, 'i').test(intro.join(' ').replace(/\s+/g, ' '))) {
    missing.push(`say "as of ${date}"`);
  }
  if (!intro.some((line) => linkTargets(line).some(toReadme))) {
    missing.push('link to the README for the current figures');
  }
  if (missing.length) {
    fail(
      `${at}: "${shown}" is a dated page, so above its first H2 it must ${missing.join(' and ')}; ` +
        `its counts are those of ${date} and are not compared with the suite.`,
    );
  }
}

if (failures.length) {
  for (const f of failures) console.error('README: ' + f);
  process.exit(1);
}
console.log(`   README: ${readme.length} lines, Quick Start at line ${firstH2.n}, first command at line ${commandLine}, links resolve, also on the ${documents.length - 1} pages that took its text.`);
if (counted) {
  console.log(
    `   README test counts match ${reportPath ? 'the test report' : 'the collected suite'}: ` +
      `${counted.total[0]} tests, ${counted.passed[0]} ${reportPath ? 'passing' : 'not skipped'}, ` +
      `${counted.skipped[0]} skipped, ${counted.scenarios[0]} attack scenarios, ` +
      `${counted.scoringEngine[0]} scoring-engine, ${counted.pinned[0]} pinned.`,
  );
  if (inconclusive > 0) console.log(`   ${inconclusive} skipped as inconclusive, counted with the passing tests.`);
}
