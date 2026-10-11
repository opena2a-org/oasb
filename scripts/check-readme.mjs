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
//      definition inside a list item, are not read.
//   5. every test count the README states equals the suite: the badge, the
//      Quick Start comment, the Counts note, the per-group `npm run test:*`
//      comments, the scenario counts in the prose and in the
//      `opena2a benchmark run` comment, and each row of the
//      "What Gets Tested" table, counted per source directory. Without
//      --tests the check collects the suite with vitest (no test runs), so a
//      "passing" count is compared with the tests that are not skipped; with
//      --tests it reads a vitest JSON report (`vitest run --reporter=json`)
//      and compares it with the tests that passed. A stated count the check
//      cannot find fails, so a reworded claim is never silently unchecked.
//
// Usage: node scripts/check-readme.mjs [--tests <report.json> | --no-counts] [path/to/README.md]
// Exit code 0 when every check passes, 1 otherwise. Run by npm run smoke.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_LINES = 400;
const QUICK_START_BY = 25;
const COMMAND_BY = 30;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let noCounts = false;
let reportPath;
let readmeArg;
let badArgs = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--no-counts') noCounts = true;
  else if (args[i] === '--tests' && i + 1 < args.length) reportPath = args[++i];
  else if (!args[i].startsWith('-') && readmeArg === undefined) readmeArg = args[i];
  else badArgs = true;
}
if (badArgs || (noCounts && reportPath)) {
  console.error('usage: node scripts/check-readme.mjs [--tests <report.json> | --no-counts] [path/to/README.md]');
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

const readmeText = readFileSync(readmePath, 'utf8');
const readme = parse(readmeText);

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

for (const { n, line, inFence } of readme) {
  if (inFence) continue;
  const prose = line.replace(/`[^`]*`/g, '');
  for (const target of linkTargets(prose)) {
    if (!target) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http:, https:, mailto:
    const [pathPart, anchor] = target.split('#');
    const file = pathPart ? resolve(dirname(readmePath), decodeURIComponent(pathPart)) : readmePath;
    if (!existsSync(file)) {
      fail(`line ${n}: link target "${target}" does not exist.`);
      continue;
    }
    if (anchor && /\.md$/i.test(file) && !anchorsOf(file).has(decodeURIComponent(anchor).toLowerCase())) {
      fail(`line ${n}: anchor "#${anchor}" has no matching heading in ${pathPart || 'README.md'}.`);
    }
  }
}

// 5. Every stated test count equals the suite.

// Each claim: where it is, the expression that finds it (every match is
// checked, and at least one must exist) and, per capture group, the measure
// the number must equal.
const CLAIMS = [
  { what: 'the tests badge', re: /tests-(\d+)%20passing/g, measures: ['passed'] },
  {
    what: 'the "Full suite" comment',
    re: /Full suite: (\d+) tests \((\d+) pass, (\d+) skip\)/g,
    measures: ['total', 'passed', 'skipped'],
  },
  {
    what: 'the Counts note',
    re: /runs \*\*(\d+) tests\*\* \((\d+) passing, (\d+) skipped/g,
    measures: ['total', 'passed', 'skipped'],
  },
  { what: 'the Counts note', re: /\*\*(\d+) attack scenarios\*\*/g, measures: ['scenarios'] },
  { what: 'the Counts note', re: /\*\*(\d+) scoring-engine unit tests\*\*/g, measures: ['scoring'] },
  { what: 'the Counts note', re: /\*\*(\d+) pinned benchmark harness tests\*\*/g, measures: ['pinned'] },
  { what: 'the Counts note', re: /"(\d+)" is the scenario count/g, measures: ['scenarios'] },
  { what: 'the Counts note', re: /"(\d+) passing" is the full `npm test` total/g, measures: ['passed'] },
  { what: 'the introduction', re: /^(\d+) standardized attack scenarios/gm, measures: ['scenarios'] },
  { what: 'the adapter sentence', re: /run the same (\d+) attack scenarios/g, measures: ['scenarios'] },
  { what: 'the test:atomic comment', re: /test:atomic +# (\d+) atomic detection tests/g, measures: ['dir:src/atomic'] },
  {
    what: 'the test:integration comment',
    re: /test:integration +# (\d+) tests across (\d+) integration scenarios/g,
    measures: ['dir:src/integration', 'files:src/integration'],
  },
  { what: 'the test:baseline comment', re: /test:baseline +# (\d+) false-positive/g, measures: ['dir:src/baseline'] },
  { what: 'the test:e2e comment', re: /test:e2e +# (\d+) E2E tests/g, measures: ['dir:src/e2e'] },
  { what: 'the benchmark run comment', re: /# all (\d+) scenarios/g, measures: ['scenarios'] },
  { what: 'the MITRE ATLAS coverage line', re: /across (\d+) scenario files/g, measures: ['scenarioFiles'] },
];

// A table row whose Source is `src/e2e` (qualifier) counts the files of that
// directory whose name matches the qualifier's pattern.
const QUALIFIERS = {
  'live monitors': /^E2E-\d+\.live-/,
  interceptors: /^E2E-\d+\.interceptor-/,
};

function repoPath(file) {
  let rel = relative(root, file);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    try {
      rel = relative(realpathSync(root), realpathSync(file));
    } catch {
      // keep the path as given; it is reported as counted by no table row
    }
  }
  return rel.split(sep).join('/');
}

// The suite as a list of { file, state }: state is 'passed', 'failed' or
// 'skipped' from a report, and 'skipped' or 'collected' from a collection.
async function suiteTests() {
  if (reportPath) {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    return report.testResults.flatMap((file) =>
      file.assertionResults.map((t) => ({
        file: repoPath(file.name),
        state: t.status === 'passed' || t.status === 'failed' ? t.status : 'skipped',
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

function checkCounts(text, tests) {
  const ran = Boolean(reportPath);
  const source = ran ? 'the test report' : 'the suite';
  const under = (dir) => tests.filter((t) => t.file.startsWith(dir + '/'));
  const files = (list) => new Set(list.map((t) => t.file)).size;
  const scenarioTests = tests.filter((t) => !t.file.startsWith('src/benchmark/'));
  const fixed = {
    total: [tests.length, 'tests'],
    passed: ran
      ? [tests.filter((t) => t.state === 'passed').length, 'passing tests']
      : [tests.filter((t) => t.state !== 'skipped').length, 'tests that are not skipped (collected, not run)'],
    skipped: [tests.filter((t) => t.state === 'skipped').length, 'skipped tests'],
    scenarios: [scenarioTests.length, 'attack-scenario tests (outside src/benchmark)'],
    scenarioFiles: [files(scenarioTests), 'scenario test files (outside src/benchmark)'],
    scoring: [
      under('src/benchmark').length - under('src/benchmark/pinned').length,
      'scoring-engine tests (src/benchmark outside src/benchmark/pinned)',
    ],
    pinned: [under('src/benchmark/pinned').length, 'tests in src/benchmark/pinned'],
  };
  const measure = (key) => {
    if (key.startsWith('dir:')) return [under(key.slice(4)).length, `tests in ${key.slice(4)}`];
    if (key.startsWith('files:')) return [files(under(key.slice(6))), `test files in ${key.slice(6)}`];
    return fixed[key];
  };
  const compare = (n, what, stated, [live, label]) => {
    if (stated !== live) fail(`line ${n}: ${what} says ${stated}; ${source} has ${live} ${label}.`);
  };

  for (const claim of CLAIMS) {
    const matches = [...text.matchAll(claim.re)];
    if (matches.length === 0) {
      fail(`${claim.what} (${claim.re}) was not found; if its wording changed, update CLAIMS in scripts/check-readme.mjs.`);
    }
    for (const m of matches) {
      claim.measures.forEach((key, i) => compare(lineOf(text, m.index), claim.what, Number(m[i + 1]), measure(key)));
    }
  }

  // The "What Gets Tested" table: each test file belongs to the row with the
  // longest Source directory that holds it (and whose qualifier matches), and
  // every test file must belong to a row.
  const start = readme.findIndex((l) => !l.inFence && /^##\s+What Gets Tested\s*$/.test(l.line));
  const rows = [];
  for (let i = start + 1; start >= 0 && i < readme.length && !/^##\s/.test(readme[i].line); i++) {
    const { n, line } = readme[i];
    if (!line.startsWith('|') || /^\|\s*:?-/.test(line)) continue;
    rows.push({ n, cells: line.split('|').slice(1, -1).map((c) => c.trim()) });
  }
  if (rows.length < 2) {
    fail('the "What Gets Tested" table was not found; if it moved, update scripts/check-readme.mjs.');
    return fixed;
  }
  const plain = (s) => (s || '').replace(/[*`]/g, '').trim();
  const dirRows = [];
  for (const { n, cells } of rows.slice(1)) {
    const category = plain(cells[0]);
    const what = `the "${category}" row`;
    const stated = plain(cells[1]);
    if (!/^\d+$/.test(stated)) {
      fail(`line ${n}: ${what} has no test count.`);
      continue;
    }
    if (category === 'Attack scenarios') {
      compare(n, what, Number(stated), fixed.scenarios);
    } else if (category === 'npm test total') {
      compare(n, what, Number(stated), fixed.total);
      const split = plain(cells[2]).match(/^\((\d+) pass, (\d+) [a-z-]*skipped\)$/);
      if (!split) {
        fail(`line ${n}: ${what} does not state "(<n> pass, <n> skipped)" in its Source column.`);
      } else {
        compare(n, what, Number(split[1]), fixed.passed);
        compare(n, what, Number(split[2]), fixed.skipped);
      }
    } else {
      const src = (cells[2] || '').match(/^`([^`]+)`(?:\s+\(([^)]+)\))?$/);
      if (!src || (src[2] && !QUALIFIERS[src[2]])) {
        fail(`line ${n}: cannot tell which tests ${what} counts; its Source must be a \`directory\`, optionally followed by one of: ${Object.keys(QUALIFIERS).map((q) => `(${q})`).join(', ')}.`);
        continue;
      }
      dirRows.push({ n, what, stated: Number(stated), dir: src[1].replace(/\/$/, ''), qualifier: src[2], count: 0 });
    }
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
    compare(r.n, r.what, r.stated, [r.count, label]);
  }
  for (const f of unowned) fail(`no row of the "What Gets Tested" table counts the tests in ${f}.`);
  return fixed;
}

let counted = null;
if (!noCounts) {
  let tests = null;
  try {
    tests = await suiteTests();
  } catch (err) {
    fail(reportPath ? `cannot read the test report ${reportPath}: ${err.message}` : err.message);
  }
  if (tests) counted = checkCounts(readmeText, tests);
}

if (failures.length) {
  for (const f of failures) console.error('README: ' + f);
  process.exit(1);
}
console.log(`   README: ${readme.length} lines, Quick Start at line ${firstH2.n}, first command at line ${commandLine}, links resolve.`);
if (counted) {
  console.log(
    `   README test counts match ${reportPath ? 'the test report' : 'the collected suite'}: ` +
      `${counted.total[0]} tests, ${counted.passed[0]} ${reportPath ? 'passing' : 'not skipped'}, ` +
      `${counted.skipped[0]} skipped, ${counted.scenarios[0]} attack scenarios, ` +
      `${counted.scoring[0]} scoring-engine, ${counted.pinned[0]} pinned.`,
  );
}
