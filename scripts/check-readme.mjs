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
//      whose target may be written `<target>` or hold balanced parentheses,
//      and whose text opens at a `[` that no backslash escapes, on that line
//      or on an earlier line of its paragraph (`foo](target)` is text),
//      a reference definition `[label]: target` at the start of a line
//      (indented at most three spaces), and a quoted HTML `href="target"` or
//      `href='target'` attribute. An inline link or definition on a line of
//      indented code is not read: a line that does not go on with a
//      paragraph and starts 4 or more columns past where the text of the
//      block quote or list item that holds it starts, a tab moving on to the
//      next multiple of 4. An href on such a line is read, as the line may
//      be raw HTML inside an HTML block, where an href is a link. A table
//      starts at a header row: a line that holds a |, does not go on with a
//      paragraph lazily, and is followed, in the same block quotes and list
//      items, by a delimiter row (| - | or --- | ---) with as many cells.
//      It goes on until a blank line, indented code, another block, or a
//      line that leaves those block quotes and list items or opens another,
//      and its lines are table rows whether or not they start with |. A
//      line whose text starts with | is paragraph text otherwise. The links
//      on indented code that follows a table row, with no other line
//      between, are read too.
//      No link is read in a fenced code block inside a block quote, which
//      ends a paragraph: from a fence, 3 or more backticks that no backtick
//      follows on its line or 3 or more tildes, at most 3 columns past where
//      the text of the block quote or list item that holds it starts, to a
//      fence of as many or more of the same with only spaces or tabs after
//      it, or to the end of that block quote or list item. Links
//      inside code spans are not read, a
//      code span ending at the next run of as many backticks, on its line or
//      on a later line of its paragraph, and a line that starts inside one
//      holds no definition; a backtick after a backslash (\`) is text and
//      opens none. A `[` or `]` inside a code span, an autolink
//      (`<https://...>`) or raw HTML (a tag, comment, processing
//      instruction, declaration or CDATA section) neither opens nor closes
//      link text, and of these the one that starts first holds the others
//      as text; an autolink or raw HTML is read when it opens and closes on
//      the same line. Other forms,
//      such as an unquoted href or a definition on the same line as a list
//      marker (`- [label]: target`), are not read. A link whose path, or
//      whose anchor in a link to a .md file, has a malformed %-escape
//      (100%.md) fails with its line. For a path the message says to write
//      a literal % as %25; a heading's anchor holds no %, so for an anchor it
//      says to drop the %, and names the anchor that then matches a heading
//      when one does (#100%-coverage, with a heading "100% coverage", is
//      told to write #100-coverage). A link with an #anchor to a directory
//      whose name ends in .md (x.md#setup) fails with its line, since a
//      directory has no headings; checks 7 and 9 do not read such a
//      directory as a page.
//   5. every test count the README states equals the suite: the Quick Start
//      comment, the Counts note, the per-group `npm run test:*`
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
//      Fenced code and the text inside a code span are not read, a code span
//      ending at the next run of as many backticks. Retire this check when
//      the benchmark has a benign set that no scanner under test labeled.
//   9. a linked .md page whose file name carries a date (YYYY-MM-DD) says
//      "as of <that date>" and links to the README above its first H2. Its
//      counts are those of that day and are not compared with the suite, so
//      the page itself sends the reader to the README for the current ones.
//  10. no static img.shields.io badge in the README's prose has a message
//      that starts with a digit, as `tests-404%20passing` and
//      `MITRE%20ATLAS-15%20techniques` did. Such a number is typed into the
//      badge's URL, and check 5 does not read it; the counts are stated on
//      the pages that check reads, and the CI status badge shows the result
//      of the latest CI run, which runs the suite.
//  11. a capture of a vitest run is what that run prints on the suite. A
//      code block that holds a summary line ("Tests  11 passed (11)") is a
//      capture; the line above it must name the command as
//      "What `<command>` prints", and the command must be one that a code
//      block above that line shows: a `vitest run`, whose file filters
//      select the test files whose path contains one of them, ignoring
//      case, as vitest selects them, or `npx @opena2a/oasb <ID>`, which
//      selects the scenario file whose ID is <ID>, ignoring case, as the
//      package's oasb command (bin/run-scenario.mjs) selects it. Each
//      "✓ <file> > <name>" line must name a test of a selected file that is
//      not skipped (with --tests: that passed), and each "Tests" and
//      "Test Files" line must state the passed, failed and skipped counts
//      and the total of the selected tests and files. In the capture of
//      `npx @opena2a/oasb <ID>`, a line that starts with "OASB " must be the
//      verdict line the oasb command prints for the selected tests
//      ("OASB AT-AI-001 against <product>: PASS (11 of 11 tests passed)");
//      the product it names is not checked. A capture may leave lines out.
//      When the line above it links "[full output](<file>)", that file is
//      held to the run the same way, must show a ✓ line for each selected
//      test that is not skipped (with --tests: that passed) and both
//      summary lines, and for `npx @opena2a/oasb <ID>` the verdict line,
//      must hold each line of the capture other than a "..." line, and must
//      have a .json file of the same name beside it whose "command" is the
//      command and whose "outputs.capture" is the file's path from the
//      README's directory. Like the counts, this reads the suite, so
//      --no-counts skips it.
//  12. a shell comment on an `opena2a benchmark` line, or on a
//      `hackmyagent secure` line with `-b oasb-1`, in a code block, that
//      names OASB-1 levels (L1, L2, L3) names the levels that command
//      checks: those up to the level given with --level (hackmyagent also
//      takes -l), or L1 when none is given. A comment that names no level is
//      not read.
//
// Checks 4, 5, 6 and 8 read the pages that took text moved out of the README
// (README_PAGES in scripts/readme-counts.mjs) as they read the README, so the
// test totals, the "What Gets Tested" table and the links that moved are
// still checked; a message about one of those pages names it before the
// line number. A link on a page resolves from the page's directory. One of
// those pages that the check cannot read fails once, with the reason, also
// when check 4 or 7 reads a link to it.
//
// Check 4 also reads the links on each other .md page that a link it reads
// leads to, and on each .md page a link there leads to, and so on, each page
// once, so the links on a page a reader reaches from the README this way
// must resolve as well. A message about such a page names it by its path
// from the README's directory; a page the check cannot read fails with the
// reason, also when a link to it carries an #anchor, which then is not
// matched with its headings, and checks 7 and 9 skip it.
//
// Usage: node scripts/check-readme.mjs [--tests <report.json> | --no-counts] [path/to/README.md]
// Exit code 0 when every check passes (and for --help), 1 otherwise. Run by npm run smoke.

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUALIFIERS, README_PAGES, SCENARIO_DIRS, STATEMENTS, atlasCounts, isInconclusiveSkip, readFailure, reportFiles, sourcePath } from './readme-counts.mjs';
import { findScenario, verdictLine } from '../bin/run-scenario.mjs';

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
// check 4, and a count it held by check 5. A page that cannot be read fails
// here with the reason and is listed in `unreadable`, so that readPage does
// not read it again and check 4 does not follow a link to it.
const documents = [{ file: readmePath, prefix: '', text: readmeText, lines: readme }];
const unreadable = [];
for (const path of README_PAGES) {
  const file = resolve(dirname(readmePath), path);
  if (!existsSync(file)) continue;
  try {
    const text = readFileSync(file, 'utf8');
    documents.push({ file, prefix: `${path} `, text, lines: parse(text) });
  } catch (err) {
    fail(`cannot read ${path}, a page that took text from the README: ${readFailure(err)}`);
    unreadable.push(file);
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
// matches a heading in `ids` (null for a page the check cannot read);
// otherwise the advice names the page `where`.
function malformedAnchorAdvice(anchor, ids, where) {
  const stripped = anchor.replace(/%(?![0-9a-f]{2})/gi, '');
  const id = decoded(stripped);
  if (id !== null && ids?.has(id.toLowerCase())) return `a heading's anchor has no %, so write "#${stripped}".`;
  return `a heading's anchor has no %, so drop the % and link a heading in ${where}.`;
}

// Whether a link target is a page: a file, and not a directory whose name
// ends in .md. readPage says whether the check can read it.
function isPage(file) {
  return statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
}

// The lines of a page a link leads to, read once, or null when the page
// cannot be read, which fails once with the reason. The README and the pages
// that took its text are already read; a page that took its text and cannot
// be read has already failed, and is null here.
const pageLines = new Map([...documents.map((d) => [d.file, d.lines]), ...unreadable.map((file) => [file, null])]);
function readPage(file) {
  if (!pageLines.has(file)) {
    try {
      pageLines.set(file, parse(readFileSync(file, 'utf8')));
    } catch (err) {
      const path = relative(dirname(readmePath), file).split(sep).join('/');
      fail(`cannot read ${path}, a page a link leads to: ${readFailure(err)}`);
      pageLines.set(file, null);
    }
  }
  return pageLines.get(file);
}

// The anchors of a page's headings, or null when the page cannot be read.
const anchorCache = new Map();
function anchorsOf(file) {
  if (!anchorCache.has(file)) {
    const lines = readPage(file);
    anchorCache.set(file, lines && anchors(lines));
  }
  return anchorCache.get(file);
}

// The code spans of a text: one line, or the lines of a paragraph joined by
// line breaks, where a code span may run from one line on to a later one. As
// in CommonMark, a run of backticks opens a code span that the next run of
// the same length closes, so ``a ` b`` is one span; a run that no run of its
// length follows is text. Inside a code span a backslash is text and does
// not stop a run closing it. For the run of backticks that starts at
// text[i], codeSpanAt(i) says whether it opens a span and gives the index
// after that span, or after the run when it opens none. The runs are listed
// by length in one pass first, and the run that closes a span is the next
// one of its length on that list, so the text is not read again from each
// run that opens one; a reader asks about the runs it meets from left to
// right.
function codeSpans(text) {
  const runs = new Map(); // run length -> the start of each run of that length, in order
  for (let i = 0; i < text.length; ) {
    if (text[i] !== '`') {
      i += 1;
      continue;
    }
    const start = i;
    while (text[i] === '`') i += 1;
    if (!runs.has(i - start)) runs.set(i - start, []);
    runs.get(i - start).push(start);
  }
  const passed = new Map(); // run length -> how many runs of that length start before the text read
  return (i) => {
    let end = i;
    while (text[end] === '`') end += 1;
    const run = end - i;
    const starts = runs.get(run) ?? [];
    let next = passed.get(run) ?? 0;
    while (next < starts.length && starts[next] < end) next += 1;
    passed.set(run, next);
    return next < starts.length ? { opens: true, end: starts[next] + run } : { opens: false, end };
  };
}

// Reads the code spans in the lines of one paragraph, given in order, as
// codeSpans finds them in the lines joined by line breaks: a run of
// backticks that no run on its line closes opens a span when a run of as
// many on a later line of the paragraph closes it, and the lines between
// are inside that span. Each call reads the next line and returns `from`,
// the index on it after a code span that an earlier line opened (0 when
// none holds the start of the line, and its length or more when one holds
// all of it), and codeSpanAt(i), which answers as codeSpans does for the
// run of backticks at line[i], with an index on the line, past its end when
// the span closes on a later line; `to` is then the index of that run, and
// otherwise the length of the line.
function paragraphCodeSpans(lines) {
  const codeSpanAt = codeSpans(lines.join('\n'));
  let k = 0; // the line read next
  let start = 0; // the index in the joined lines where that line starts
  let after = 0; // the index in the joined lines after the code span read last
  return () => {
    const at = start;
    const { length } = lines[k++];
    start += length + 1;
    const spans = {
      from: Math.max(0, after - at),
      to: length,
      codeSpanAt: (i) => {
        const span = codeSpanAt(at + i);
        if (span.opens) after = span.end;
        if (span.opens && span.end - at > length) spans.to = i;
        return { opens: span.opens, end: span.end - at };
      },
    };
    return spans;
  };
}

// A line with its code spans removed. Outside a code span a backslash
// escapes the character after it, so \` is a literal backtick and \`` opens
// a span with the one backtick left of its run, while \\` is a literal
// backslash and then a run that may open one.
function withoutCodeSpans(line) {
  const codeSpanAt = codeSpans(line);
  let out = '';
  let from = 0;
  let i = 0;
  while (i < line.length) {
    if (line[i] === '\\') {
      i += 2;
      continue;
    }
    if (line[i] !== '`') {
      i += 1;
      continue;
    }
    const span = codeSpanAt(i);
    if (span.opens) {
      out += line.slice(from, i);
      from = span.end;
    }
    i = span.end;
  }
  return out + line.slice(from);
}

// The autolinks and raw HTML of one line, as CommonMark reads them: an
// autolink <scheme:target> or <name@host>, an open tag with its attributes,
// a closing tag, a comment from <!-- to the first --> after its <!, so that
// <!--> is one, a processing instruction from <? to the first ?> after it, a
// CDATA section from <![CDATA[ to the first ]]> after it, and a declaration
// from <! and a letter to the first > after it. A backslash inside one is
// text. For the < at line[i], htmlAt(i) is the index after the autolink or
// raw HTML that starts there, or i + 1 when none does. A reader asks about
// each < it meets from left to right, and the line is searched for the end
// of a comment, processing instruction, CDATA section or declaration on from
// where that end was last found, so a line of many <!-- that no --> follows
// is not read again from each one.
const AUTOLINK = /<[A-Za-z][A-Za-z0-9.+-]{1,31}:[^<>\x00-\x20]*>/;
const EMAIL_AUTOLINK = /<[\w.!#$%&'*+\/=?^`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*>/;
const OPEN_TAG = /<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:[^"'=<>`\x00-\x20]+|'[^']*'|"[^"]*"))?)*\s*\/?>/;
const CLOSING_TAG = /<\/[A-Za-z][A-Za-z0-9-]*\s*>/;
const AUTOLINK_OR_TAG = new RegExp([AUTOLINK, EMAIL_AUTOLINK, OPEN_TAG, CLOSING_TAG].map((r) => r.source).join('|'), 'y');
function inlineHtml(line) {
  const found = new Map(); // end -> where it was last found, or -1 when nowhere after
  const after = (end, from) => {
    let at = found.get(end);
    if (at === undefined || (at !== -1 && at < from)) {
      at = line.indexOf(end, from);
      found.set(end, at);
    }
    return at === -1 ? -1 : at + end.length;
  };
  return (i) => {
    AUTOLINK_OR_TAG.lastIndex = i;
    const tag = AUTOLINK_OR_TAG.exec(line);
    if (tag) return i + tag[0].length;
    let end = -1;
    if (line.startsWith('<!--', i)) end = after('-->', i + 2);
    else if (line.startsWith('<?', i)) end = after('?>', i + 2);
    else if (line.startsWith('<![CDATA[', i)) end = after(']]>', i + 9);
    else if (line[i + 1] === '!' && /[A-Za-z]/.test(line[i + 2] ?? '')) end = after('>', i + 3);
    return end === -1 ? i + 1 : end;
  };
}

// As in CommonMark, a backslash escapes the character after it when that is
// ASCII punctuation, which then stands for itself; before any other
// character, such as a space, a backslash is text.
const PUNCTUATION = /[!-/:-@[-`{-~]/;
const ESCAPE = /\\([!-/:-@[-`{-~])/g;
const escapes = (line, i) => line[i] === '\\' && PUNCTUATION.test(line[i + 1] ?? '');

// The inline link whose destination opens at the ( at line[paren], read as
// CommonMark reads a link destination: <target> runs to the closing > and may
// hold spaces but no unescaped < or >; a bare target ends at a space, at a
// control character or at the ) that closes the link, and may hold balanced
// parentheses, nested up to 32 deep as markdown-it allows. The destination
// may be followed by a double-quoted title that may hold \". Returns the
// target, with each escape read as the character it escapes, and the index
// after the ) that closes the link, or null when no link closes there.
const MAX_PAREN_DEPTH = 32;
function inlineLink(line, paren) {
  let i = paren + 1;
  while (line[i] === ' ' || line[i] === '\t') i++;
  let raw = null;
  if (line[i] === '<') {
    let j = i + 1;
    while (j < line.length && line[j] !== '>' && line[j] !== '<') j += escapes(line, j) ? 2 : 1;
    if (line[j] !== '>') return null;
    raw = line.slice(i + 1, j);
    i = j + 1;
  } else {
    let j = i;
    let depth = 0;
    for (; j < line.length; j++) {
      const c = line[j];
      if (escapes(line, j)) j++;
      else if (c <= ' ' || c === '\x7f') break;
      else if (c === '(') {
        if (++depth > MAX_PAREN_DEPTH) break;
      } else if (c === ')') {
        if (depth === 0) break;
        depth--;
      }
    }
    if (depth !== 0) return null;
    raw = line.slice(i, j);
    i = j;
  }
  const rest = line.slice(i).match(/^(?:[ \t]+"(?:[^"\\]|\\.)*")?[ \t]*\)/);
  return rest && { target: raw.replace(ESCAPE, '$1'), end: i + rest[0].length };
}

// The destinations of the inline links [text](target) on one line, read as
// CommonMark finds them. Link text opens at a [ that no backslash escapes,
// or at the [ of ![ for an image, and ends at the first unescaped ] that no
// [ inside it pairs with, so foo](target) and [x\](target) are text. Link
// text that holds a link is not a link's text, as links do not nest, while
// an image's text may hold one. The line is read from left to right, and a
// code span, an autolink or raw HTML is read whole where it starts, so a [
// or ] inside one is text: [a <b title="]"> c](target) is a link, and
// <b title="[">c](target) is text. Whichever of them starts first holds the
// others, so a backtick inside an HTML tag opens no code span, and a < inside
// a code span opens no tag. `spans` reads the line's code spans as
// paragraphCodeSpans reads those of a line of a paragraph, so a code span
// may run on to a later line, and the line is read from spans.from, after a
// code span that an earlier line opened. The line is read on from the )
// that closes a link, so its destination and title, which may hold a
// backtick, are not read as text. open.brackets is the stack of the [ that
// no ] has closed yet, true for one that opens an image, and open.aroundLink
// how many of them, from the bottom, were open when a link was read, so text
// that one of them opens holds that link. `open` starts with what an earlier
// line of the paragraph left open and keeps what this line leaves open.
function inlineDestinations(line, open, spans) {
  const targets = [];
  const { brackets } = open;
  const { codeSpanAt } = spans;
  const htmlAt = inlineHtml(line);
  for (let i = spans.from; i < line.length; i++) {
    const c = line[i];
    if (escapes(line, i)) {
      i++;
    } else if (c === '`') {
      i = codeSpanAt(i).end - 1;
    } else if (c === '<') {
      i = htmlAt(i) - 1;
    } else if (c === '[' || (c === '!' && line[i + 1] === '[')) {
      brackets.push(c === '!');
      if (c === '!') i++;
    } else if (c === ']' && brackets.length > 0) {
      const image = brackets.pop();
      const holdsLink = !image && brackets.length < open.aroundLink;
      open.aroundLink = Math.min(open.aroundLink, brackets.length);
      if (holdsLink || line[i + 1] !== '(') continue;
      const link = inlineLink(line, i + 1);
      if (!link) continue;
      targets.push(link.target);
      if (!image) open.aroundLink = brackets.length;
      i = link.end - 1;
    }
  }
  return targets;
}

// The targets of the HTML href="target" / href='target' attributes on one
// line, after attribute values that may hold >, read on the line with its
// code spans removed.
function hrefTargets(line) {
  const targets = [];
  for (const m of withoutCodeSpans(line).matchAll(/<[a-z](?:[^>"']|"[^"]*"|'[^']*')*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    targets.push(m[1] ?? m[2]);
  }
  return targets;
}

// Link targets on one prose line: inline [text](target), whose destination
// inlineDestinations reads, with spaces inside the parentheses, a
// reference definition [label]: target (footnotes [^1]: are not links),
// whose label may hold a code span or \], and the hrefs hrefTargets reads.
// Links inside code spans are not read: inlineDestinations reads past each
// code span, and hrefTargets removes them. A definition is matched on the
// whole line, as a code span in its label does not make it text, but not
// on a line that starts inside a code span an earlier line of the
// paragraph opened. `open` carries what an earlier line of the paragraph
// left open: link text, as inlineDestinations reads it, and a code span.
// open.code reads the code spans of the paragraph's lines, as
// paragraphCodeSpans does, for inlineDestinations, which meets each run of
// backticks after the autolinks, raw HTML and link destinations that start
// before it. An href is read on the part of the line outside the code spans
// that run on to it from an earlier line or from it on to a later one.
function linkTargets(line, open) {
  const targets = [];
  const spans = open.code();
  const def = spans.from === 0 && line.match(/^ {0,3}\[(?!\^)(?:[^\]\\]|\\.)+\]:\s*(?:<([^>\s]+)>|(\S+))/);
  if (def) targets.push(def[1] || def[2]);
  targets.push(...inlineDestinations(line, open, spans));
  targets.push(...hrefTargets(line.slice(spans.from, spans.to)));
  return targets;
}

// A line that ends a paragraph (a blank line, or a blank ">" line) and one
// that is a block of its own (a table row or a heading), as blocks() reads
// them.
const BLANK = /^[\s>]*$/;
const OWN_BLOCK = /^[\s>]*(?:\||#{1,6}\s)/;

// The blocks that lineStart() reads where a line's block quote markers, list
// markers and indentation end, each matched at lastIndex: an ATX heading, a
// setext heading underline (=== or ---), a thematic break (***, ___, - - -),
// the first line of an HTML block of the kinds that may interrupt a
// paragraph (CommonMark kinds 1 to 6: <script>, <pre>, <style>, <textarea>, a
// comment, a processing instruction, a declaration, CDATA, whose name is
// matched in capitals only, or a block tag such as <div> or </p>; a tag such
// as <span> does not interrupt one), and a list marker. The spaces and tabs
// after a thematic break's last mark are matched by that mark's [ \t]*
// alone: with a second [ \t]* after the marks, the two could share them in
// every way, which took seconds on a line of 100,000 of them.
const ATX_HEADING = /#{1,6}(?:[ \t]|$)/y;
const SETEXT_UNDERLINE = /(?:=+|-+)[ \t]*$/y;
const THEMATIC_BREAK = /(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/y;
const HTML_BLOCK_START = new RegExp(
  '<(?:script|pre|style|textarea)(?:[\\s>]|$)|<!--|<\\?|<![a-z]|' +
    '</?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|' +
    'fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|' +
    'menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|' +
    'track|ul)(?:\\s|/?>|$)',
  'iy',
);
const CDATA_START = /<!\[CDATA\[/y;
const LIST_MARKER = /(?:[-+*]|(\d{1,9})[.)])(?=[ \t]|$)/y;
// A code fence: 3 or more backticks that no backtick follows on the line, or
// 3 or more tildes.
const FENCE = /`{3,}(?=[^`]*$)|~{3,}/y;
const matchAt = (re, text, i) => {
  re.lastIndex = i;
  return re.exec(text);
};

// Where a thematic break may start on a line: it runs to the end of the
// line, so it starts in the run of one mark (*, - or _), spaces and tabs
// that ends the line, and nowhere when the line ends in another character.
// lineStart() tries THEMATIC_BREAK only from there: tried at each list
// marker of a line such as "- - - ... - x", it read to the end of the line
// before it failed, which took seconds on a line of 50,000 markers.
function breakStart(text) {
  let end = text.length;
  while (end > 0 && (text[end - 1] === ' ' || text[end - 1] === '\t')) end--;
  const mark = text[end - 1];
  if (mark !== '*' && mark !== '-' && mark !== '_') return text.length;
  let start = end - 1;
  while (start > 0 && (text[start - 1] === mark || text[start - 1] === ' ' || text[start - 1] === '\t')) start--;
  return start;
}

// A table's delimiter row, such as | - | :-: | or --- | ---, once the block
// quote markers and indentation before it and the spaces and tabs after it
// are removed.
const DELIMITER_ROW = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?$/;
// A line that holds only the characters of a delimiter row, block quote
// markers and indentation, which tableHeader() reads further only then.
const DELIMITER_CHARACTERS = /^[ \t>|:-]*\r?$/;

// How many cells a table row holds: its text split at each | that no \ comes
// right before, not counting the empty cell before a leading | or after a
// trailing one.
function cellCount(row) {
  const text = row.trim();
  const parts = text.split(/(?<!\\)\|/);
  if (text.startsWith('|')) parts.shift();
  if (parts.length > 0 && text.endsWith('|') && !text.endsWith('\\|')) parts.pop();
  return parts.length;
}

// Whether a line that lineStart() read as `start`, after a line that
// `containers` hold, is the header row of a table: in GitHub-flavored
// Markdown a table starts only at a line that holds a |, whether or not it
// starts with one, where the next line (`next`, from the reader's lines) goes
// on with the block quotes and list items that hold the header row, opens
// none, and is then a delimiter row with as many cells, after at most 3
// columns of indentation. The next line is read as one that goes on with a
// paragraph, so a line of - alone, of -- or of --- is a setext underline, as
// micromark 4 with its GFM table extension reads it (markdown-it 14.1.1
// reads -- and --- under a header row of one cell as a delimiter row).
// Without a delimiter row, the line is paragraph text.
function tableHeader(start, containers, next) {
  const { row } = start;
  if (row === undefined || next === undefined || !row.includes('|') || !DELIMITER_CHARACTERS.test(next.line)) return false;
  const held = [...containers.slice(0, start.matched), ...start.opened];
  const delimiter = lineStart(next.line, held, true);
  if (delimiter.matched < held.length || delimiter.opened.length > 0 || delimiter.row === undefined) return false;
  const cells = delimiter.row.trim();
  return DELIMITER_ROW.test(cells) && cellCount(cells) === cellCount(row);
}

// Columns as CommonMark counts them in the indentation of a line: a tab
// moves on to the next multiple of 4.
const nextColumn = (c, col) => (c === '\t' ? col + 4 - (col % 4) : col + 1);

// The start of one line, read as CommonMark reads it. `containers` are the
// block quotes ({ quote: true }) and list items ({ width, empty }) open after
// the line above, outermost first, and `paragraph` says whether that line
// was paragraph text. The line goes on with a block quote when its > follows
// at most 3 columns of indentation (the > takes one column of a space or tab
// after it), and with a list item when it is blank, unless the item holds
// nothing yet, or indented by the item's width: the columns from where the
// text of the block that holds the item starts to where the item's text
// starts, which is 1 to 4 columns after the marker, or 1 when more follow or
// no text does. Past those, the line may open block quotes and list items,
// and then start one of the blocks above or a table row (|), each after at
// most 3 columns of indentation. On a line that goes on with every
// container below a paragraph, a setext underline ends that paragraph, and
// a list item ends it only when it holds text and, if ordered, starts at 1.
// `stops` are the indices in `containers` of the block quotes and of the
// list items that hold nothing yet, in order: once the rest of a line is
// blank, it goes on with the containers before the next of them. A caller
// that does not keep them leaves them out, and they are then found by
// reading each of `containers`.
// Returns how many of `containers` the line goes on with, the containers it
// opens, and whether the rest of it is 'blank', 'code' (indented code), 'row'
// (text that starts with |, as a table row does), 'fence' (a code fence
// inside a block quote that the line goes on with or opens, which parse()
// does not read; `fence` is then its run of backticks or tildes, and `bare`
// says whether only spaces and tabs follow it), 'block' (one of the other
// blocks) or 'text', which a paragraph holds. A 'row' comes with `row`, the
// text from its |, and so does a 'text' that is not indented 4 or more
// columns, the text from where it starts, as a table row need not start
// with |. Whether either is a table row or paragraph text is the caller's
// to read, as a table starts only at a header row that a delimiter row
// follows, which one line does not show.
function lineStart(line, containers, paragraph, stops) {
  const text = line.endsWith('\r') ? line.slice(0, -1) : line; // \r\n ends a line too
  const breakFrom = breakStart(text);
  let i = 0;
  let col = 0;
  // The index and column of the first character from i that is not a space
  // or a tab. advance() moves i and col on inside one run of spaces and
  // tabs, where both stay the same (a tab ends on the same column from any
  // column inside it), so the run is read once, not once for each list item
  // that the line goes on with.
  let runEnd = -1;
  let runEndColumn = 0;
  const nonspace = () => {
    if (i > runEnd) {
      runEnd = i;
      runEndColumn = col;
      while (text[runEnd] === ' ' || text[runEnd] === '\t') runEndColumn = nextColumn(text[runEnd++], runEndColumn);
    }
    return [runEnd, runEndColumn];
  };
  // Moves on by n columns of spaces and tabs, into a tab that is wider.
  const advance = (n) => {
    const to = col + n;
    while (col < to) {
      const next = nextColumn(text[i], col);
      if (next > to) {
        col = to;
      } else {
        col = next;
        i++;
      }
    }
  };
  // Moves past the > at index j, in column c, and one column of a space or tab after it.
  const quoteMarker = (j, c) => {
    i = j + 1;
    col = c + 1;
    if (text[i] === ' ' || text[i] === '\t') advance(1);
  };

  let matched = 0;
  let quoted = false; // whether the line goes on with or opens a block quote
  for (const container of containers) {
    const [j, c] = nonspace();
    // The rest of the line is blank, so it goes on with the containers
    // before the next of `stops`, opens none, and its rest is blank. find()
    // passes only stops that the line has read a > or indentation for, so
    // the list items before the next one are not read one by one.
    if (j === text.length) {
      stops ??= [...containers.keys()].filter((s) => containers[s].quote || containers[s].empty);
      return { matched: stops.find((s) => s >= matched) ?? containers.length, opened: [], rest: 'blank' };
    }
    if (container.quote) {
      if (c - col > 3 || text[j] !== '>') break;
      quoteMarker(j, c);
      quoted = true;
    } else {
      if (c - col < container.width) break;
      advance(container.width);
    }
    matched++;
  }

  const opened = [];
  for (;;) {
    const [j, c] = nonspace();
    if (j === text.length) return { matched, opened, rest: 'blank' };
    // Indented code, unless it goes on with the paragraph above.
    if (c - col > 3) return { matched, opened, rest: paragraph && opened.length === 0 ? 'text' : 'code' };
    if (text[j] === '>') {
      opened.push({ quote: true });
      quoteMarker(j, c);
      quoted = true;
      continue;
    }
    // Whether a block that starts here would interrupt the paragraph above,
    // as the line goes on with every container that holds it.
    const interrupts = paragraph && matched === containers.length && opened.length === 0;
    if (text[j] === '|') return { matched, opened, rest: 'row', row: text.slice(j) };
    // A fence interrupts a paragraph. One outside a block quote is left to
    // parse(), which reads the fences that start a line.
    const fence = quoted && matchAt(FENCE, text, j);
    if (fence) return { matched, opened, rest: 'fence', fence: fence[0], bare: /^[ \t]*$/.test(text.slice(j + fence[0].length)) };
    if (
      matchAt(ATX_HEADING, text, j) ||
      matchAt(HTML_BLOCK_START, text, j) ||
      matchAt(CDATA_START, text, j) ||
      (interrupts && matchAt(SETEXT_UNDERLINE, text, j)) ||
      (j >= breakFrom && matchAt(THEMATIC_BREAK, text, j))
    ) {
      return { matched, opened, rest: 'block' };
    }
    const marker = matchAt(LIST_MARKER, text, j);
    if (!marker) return { matched, opened, rest: 'text', row: text.slice(j) };
    const width = c - col + marker[0].length;
    i = j + marker[0].length;
    col = c + marker[0].length;
    const [k, d] = nonspace();
    const empty = k === text.length;
    if (interrupts && (empty || (marker[1] !== undefined && Number(marker[1]) !== 1))) {
      return { matched, opened, rest: 'text', row: text.slice(j) };
    }
    if (empty || d - col > 4) {
      opened.push({ width: width + 1, empty });
      if (!empty) advance(1);
    } else {
      opened.push({ width: width + d - col, empty });
      i = k;
      col = d;
    }
  }
}

// Reads the link targets on the lines of one page, as linkTargets reads
// them, with link text and code spans that wrap. The reader is made with the
// page's lines and then called with each of them in order. The [ a
// paragraph's line leaves open is carried to the next line when lineStart()
// reads that line as text that goes on with the paragraph, which a line may
// do lazily, without the block quote markers or list item indentation of
// the line above. So is a code span that a run of backticks opens and a run
// of as many on a later line of the paragraph closes, as CommonMark reads
// it: on the first line of a paragraph the reader reads on, with
// lineStart(), to the paragraph's last line for those runs. Any other line
// starts a block, and link text or a code span opened on one that is not
// paragraph text, such as a heading or a table row, is not carried. A table
// starts at a header row as tableHeader() reads it, which a line that goes
// on with a paragraph lazily is not, and goes on with each line after it
// that goes on with the block quotes and list items that hold the table,
// opens none, and is not blank, indented code or another block; each of
// these lines is a table row, whether or not it starts with |. Any other
// line whose text starts with | is text, which link text and code spans
// wrap past as past any other line of their paragraph. A line inside a
// fence has no links,
// and a fence ends a paragraph. parse() reads the fences that start a line;
// a fence inside a block quote, which lineStart() reads, opens a block that
// the reader follows to the fence that closes it or to the end of the block
// quote or list item that holds it, and no line of that block, its opening
// fence included, has links. A line that lineStart() reads as indented code
// has no inline links or
// definitions, as its text is shown as written. lineStart() does not track
// HTML blocks, and such a line may be inside one instead: there it is raw
// HTML, whose inline links and definitions are text as well, but whose
// hrefs are links. So the hrefs on such a line are read. On the lines of
// indented code that follow a table row with no other line between, the
// inline links and definitions are read as well.
const noOpenLinkText = () => ({ brackets: [], aroundLink: 0 });
function linkReader(lines) {
  let open = noOpenLinkText();
  // The containers open after the line above and their stops, as
  // lineStart() takes them.
  const containers = [];
  let stops = [];
  let paragraph = false;
  let table = false; // whether the line read last was a table row
  let next = 0; // the index in lines of the line read next
  // The rest of lines[k] as the reader reads it, lineStart() having read the
  // line as `start` after a line that `containers` hold, which is paragraph
  // text when `paragraphAbove` is true and a table row when `rowAbove` is. A
  // 'row' or 'text' is a table row when the line above is one and the line
  // goes on with every container and opens none, or when it is a table's
  // header row as tableHeader() reads it and does not go on with the
  // paragraph above lazily. A 'row' is text otherwise.
  const restOf = (k, start, paragraphAbove, rowAbove) => {
    if (start.rest !== 'row' && start.rest !== 'text') return start.rest;
    const opensNone = start.opened.length === 0;
    if (rowAbove && opensNone && start.matched === containers.length) return 'row';
    const lazy = paragraphAbove && opensNone && start.matched < containers.length;
    return !lazy && tableHeader(start, containers, lines[k + 1]) ? 'row' : 'text';
  };
  // Whether lines[k] is text that goes on with the paragraph that
  // `containers` hold, as the reader reads it below. The line above it is
  // text of that paragraph, so it is not a table row.
  const goesOn = (k) => {
    const { line, inFence, fenceOpen, fenceClose } = lines[k];
    if (inFence || fenceOpen || fenceClose) return false;
    const start = lineStart(line, containers, true);
    return restOf(k, start, true, false) === 'text' && start.opened.length === 0;
  };
  // Whether the line above is a table row, or indented code that follows one.
  let afterRow = false;
  // The opening fence of the fenced code block inside a block quote that
  // the line above is in, or null.
  let fenced = null;
  return ({ line, inFence, fenceOpen, fenceClose }) => {
    const j = next++;
    if (inFence) {
      paragraph = false;
      table = false;
      afterRow = false;
      return [];
    }
    // A fence is a block, and the line that closes one goes on with the
    // containers that hold it.
    const start = fenceClose ? { matched: containers.length, opened: [] } : lineStart(line, containers, paragraph, stops);
    if (fenced) {
      // A line that goes on with the containers that hold the block is in
      // it, as is the fence that closes it: one of the same character, at
      // least as long, with only spaces and tabs after it. A line that does
      // not go on with them ends the block quote or list item that holds
      // the block, and so the block, as a fenced code block takes no line
      // lazily.
      if (start.matched === containers.length) {
        if (start.rest === 'fence' && start.opened.length === 0 && start.bare && start.fence[0] === fenced[0] && start.fence.length >= fenced.length) {
          fenced = null;
        }
        return [];
      }
      fenced = null;
    }
    const rest = fenceOpen || fenceClose ? 'block' : restOf(j, start, paragraph, table);
    table = rest === 'row';
    if (!(paragraph && rest === 'text' && start.opened.length === 0)) {
      // The line starts a block, and the containers it does not go on with
      // end; those it goes on with hold that block, unless it is blank. The
      // list is cut and added to in place: copied for each line, it took a
      // step for each container that a blank line goes on with.
      containers.length = start.matched;
      while (stops.length > 0 && stops.at(-1) >= start.matched) stops.pop();
      if (rest !== 'blank' || start.opened.length > 0) {
        for (const c of containers) c.empty = false;
        stops = stops.filter((s) => containers[s].quote);
      }
      for (const c of start.opened) {
        if (c.quote || c.empty) stops.push(containers.length);
        containers.push(c);
      }
      paragraph = rest === 'text';
      open = noOpenLinkText();
      // The code spans of the block: those of a paragraph may run on to the
      // lines that go on with it, and those of any other block are read on
      // its line alone.
      let last = j;
      if (paragraph) while (last + 1 < lines.length && goesOn(last + 1)) last += 1;
      open.code = paragraphCodeSpans(lines.slice(j, last + 1).map((l) => l.line));
    }
    const code = rest === 'code' && !afterRow;
    afterRow = rest === 'row' || (rest === 'code' && afterRow);
    // The opening fence of a block inside a block quote holds no link, as
    // what follows its run is an info string, not text.
    if (rest === 'fence') {
      fenced = start.fence;
      return [];
    }
    if (code) return hrefTargets(line);
    const targets = linkTargets(line, open);
    if (!paragraph) open = noOpenLinkText();
    return targets;
  };
}

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i; // http:, https:, mailto:

// Check 4 on the prose lines of one page. For each link that resolves to a
// .md page, linked(file, at, shown) is called with that page, the page and
// line that hold the link as a message names them, and the link's path as
// written.
function checkLinks({ file: doc, prefix, lines }, linked) {
  const read = linkReader(lines);
  for (const l of lines) {
    const { n } = l;
    for (const target of read(l)) {
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
        if (!isPage(file)) {
          fail(`${prefix}line ${n}: link target "${target}" is a directory, so its anchor names no heading; link the page in ${pathPart} that holds the heading.`);
        } else if (id === null) {
          fail(`${prefix}line ${n}: anchor "#${anchor}" has a malformed %-escape; ${malformedAnchorAdvice(anchor, anchorsOf(file), where)}`);
        } else if (anchorsOf(file) && !anchorsOf(file).has(id.toLowerCase())) {
          fail(`${prefix}line ${n}: anchor "#${anchor}" has no matching heading in ${where}.`);
        }
      }
      if (/\.md$/i.test(file) && isPage(file)) linked(file, `${prefix}line ${n}`, pathPart);
    }
  }
}

// The linked .md pages whose file name carries a date, each with the first
// line of the README, or else of a page that took its text, that links it.
// Read by check 9.
const DATE_IN_NAME = /\d{4}-\d{2}-\d{2}/;
const datedPages = new Map();

// The other .md pages a link leads to, from the README, from a page that took
// its text or from a page already on this list, each listed once. Check 4
// reads the links on each page it lists.
const linkedPages = [];
const reached = new Set([...documents.map((d) => d.file), ...unreadable]);
const follow = (file) => {
  if (reached.has(file)) return;
  reached.add(file);
  linkedPages.push(file);
};

for (const doc of documents) {
  checkLinks(doc, (file, at, shown) => {
    if (DATE_IN_NAME.test(basename(file)) && !datedPages.has(file)) datedPages.set(file, { at, shown });
    follow(file);
  });
}
// Reading a page can list more pages, so the length is read on each pass.
for (let i = 0; i < linkedPages.length; i++) {
  const file = linkedPages[i];
  const lines = readPage(file);
  if (!lines) continue; // readPage has reported it
  const path = relative(dirname(readmePath), file).split(sep).join('/');
  checkLinks({ file, prefix: `${path} `, lines }, follow);
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
        // The name vitest prints: its describe blocks and title, joined by " > ".
        name: typeof t.title === 'string' ? [...(Array.isArray(t.ancestorTitles) ? t.ancestorTitles : []), t.title].join(' > ') : undefined,
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
        tests.push({ file: repoPath(m.moduleId), name: t.fullName, state: t.result().state === 'skipped' ? 'skipped' : 'collected' });
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
  const read = linkReader(section);
  for (const l of section) {
    for (const target of read(l)) {
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      const pathPart = target.split('#')[0];
      if (!pathPart || !/\.md$/i.test(pathPart)) continue;
      const path = decoded(pathPart);
      if (path === null) continue; // a malformed %-escape is reported by the link check
      const file = resolve(dirname(readmePath), path);
      // A missing page is reported by the link check; a directory is not a page.
      if (seen.has(file) || !isPage(file)) continue;
      seen.add(file);
      const lines = readPage(file);
      if (!lines) continue; // readPage has reported it
      pages.push({ lines, prefix: `${pathPart} ` });
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

// 11. A capture of a vitest run: a code block holding a summary line such as
// "Tests  11 passed (11)". The line above it names the command, as
// What `npx vitest run AT-AI-001 --reporter=verbose` prints, trimmed:
const CAPTURE_INTRO = /^What `([^`]+)` prints\b/;
const SUMMARY = /^\s*(Test Files|Tests)\s+(\S.*?)\s+\((\d+)\)\s*$/;
const PASSED_TEST = /^\s*✓\s+(\S+)\s+>\s+(.+?)(?:\s+\d+(?:\.\d+)?m?s)?\s*$/;
const RESULT_STATES = ['passed', 'failed', 'skipped'];
// The full output the line above a capture may link, as in
// What `<command>` prints, trimmed ([full output](docs/captures/quick-start.txt)):
// A line that is only "..." marks lines left out.
const FULL_OUTPUT = /\[full output\]\(([^)\s#]+)\)/;
const ELISION = /^\s*\.\.\.\s*$/;
const SUMMARY_KINDS = ['Test Files', 'Tests'];

// The test file filters of a `vitest run` command: the words after `run`
// that are not options. An option is read as one word, so its value is
// written after "=" (--reporter=verbose). Null for another command.
function vitestFilters(command) {
  const words = command.trim().split(/\s+/);
  const at = words.indexOf('vitest');
  if (at < 0 || words[at + 1] !== 'run') return null;
  return words.slice(at + 2).filter((w) => !w.startsWith('-'));
}

// The ID an `npx @opena2a/oasb <ID>` command gives the package's oasb
// command, which runs that one scenario file. Null for another command.
function oasbScenarioId(command) {
  const words = command.trim().split(/\s+/);
  const isOasb = words.length === 3 && words[0] === 'npx' && words[1] === '@opena2a/oasb' && !words[2].startsWith('-');
  return isOasb ? words[2] : null;
}

// The verdict line the oasb command prints last, as in
// OASB AT-AI-001 against arp-guard 0.3.0: PASS (11 of 11 tests passed)
// The second group is the product the adapter declares.
const VERDICT_LINE = /^OASB (\S+) against (.+?): (?:PASS|FAIL|NOT MEASURED) \(.*\)$/;

function checkCaptures(tests) {
  const ran = Boolean(reportPath);
  const source = ran ? 'the test report' : 'the suite';
  const passing = (t) => (ran ? t.state === 'passed' : t.state !== 'skipped');
  const captures = [];
  for (const { file: doc, prefix, lines } of documents) {
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].fenceOpen) continue;
      let end = i + 1;
      while (end < lines.length && lines[end].inFence) end++;
      const body = lines.slice(i + 1, end);
      const at = `${prefix}line ${lines[i].n}`;
      const open = i;
      i = end;
      if (!body.some((l) => SUMMARY.test(l.line))) continue;

      let j = open - 1;
      while (j >= 0 && !lines[j].inFence && !lines[j].fenceClose && lines[j].line.trim() === '') j--;
      const intro = j >= 0 && !lines[j].inFence && !lines[j].fenceClose ? lines[j].line.trim().match(CAPTURE_INTRO) : null;
      if (!intro) {
        fail(
          `${at}: the code block shows what a vitest run prints, but the line above it does not name the command; ` +
            'introduce it with "What `<command>` prints", so the check can hold it to the suite.',
        );
        continue;
      }
      const command = intro[1].trim();
      const filters = vitestFilters(command);
      const oasbId = filters === null ? oasbScenarioId(command) : null;
      if (filters === null && oasbId === null) {
        fail(
          `${prefix}line ${lines[j].n}: the capture is of \`${command}\`; ` +
            'the check reads the capture of a `vitest run` or `npx @opena2a/oasb <ID>` command only.',
        );
        continue;
      }
      const shown = lines
        .slice(0, j)
        .some((l) => l.inFence && l.line.replace(/\s#.*$/, '').trim().replace(/^\$\s*/, '') === command);
      if (!shown) fail(`${prefix}line ${lines[j].n}: the capture names \`${command}\`, which no code block above it runs.`);

      let selected;
      // The scenario file the oasb command runs, as { id, file }; undefined
      // for a vitest run.
      let scenario;
      if (filters !== null) {
        // vitest runs the test files whose path contains a filter, ignoring case.
        const wanted = filters.map((f) => f.replace(/^\.\//, '').toLowerCase());
        selected = tests.filter((t) => wanted.length === 0 || wanted.some((f) => t.file.toLowerCase().includes(f)));
      } else {
        // The oasb command runs the scenario file whose ID is the one it is
        // given, found as the command finds it.
        const scenarioPaths = [...new Set(tests.map((t) => t.file))].filter((f) => SCENARIO_DIRS.some((dir) => f.startsWith(`${dir}/`)));
        scenario = findScenario(
          scenarioPaths.map((file) => ({ id: basename(file).slice(0, basename(file).indexOf('.')), file })),
          oasbId,
        );
        selected = tests.filter((t) => t.file === scenario?.file);
      }
      const files = [...new Set(selected.map((t) => t.file))];
      if (files.length === 0) {
        fail(`${at}: \`${command}\` selects no test file of ${source}, so its capture cannot be what it prints.`);
        continue;
      }
      const live = {
        Tests: {
          unit: 'tests',
          total: selected.length,
          passed: selected.filter(passing).length,
          failed: selected.filter((t) => t.state === 'failed').length,
          skipped: selected.filter((t) => t.state === 'skipped').length,
        },
        'Test Files': { unit: 'test files', total: files.length, passed: 0, failed: 0, skipped: 0 },
      };
      for (const file of files) {
        const states = selected.filter((t) => t.file === file).map((t) => t.state);
        const state = states.includes('failed') ? 'failed' : states.every((s) => s === 'skipped') ? 'skipped' : 'passed';
        live['Test Files'][state]++;
      }
      // The verdict line the oasb command prints for the selected tests,
      // naming `product` as the product the adapter declares.
      const expectedVerdict = (product) =>
        verdictLine(scenario.id, product, {
          ...live.Tests,
          result: live.Tests.failed > 0 ? 'FAIL' : live.Tests.passed > 0 ? 'PASS' : 'NOT MEASURED',
          outside: false,
        });

      // Hold each ✓ line, each summary line and, in the capture of the oasb
      // command, each verdict line of `text`, a list of { n, line } in the
      // document `where` names, to the run. Returns the tests the ✓ lines
      // show, as "<file> > <name>", the summary kinds and whether a verdict
      // line was seen.
      const hold = (where, text) => {
        const seen = { tests: new Set(), kinds: new Set(), verdict: false };
        for (const { n, line } of text) {
          if (scenario && line.trim().startsWith('OASB ')) {
            seen.verdict = true;
            const said = line.trim();
            const expected = expectedVerdict(said.match(VERDICT_LINE)?.[2] ?? '<product>');
            if (said !== expected) {
              fail(`${where}line ${n}: the capture's verdict line is "${said}"; for the tests \`${command}\` selects, ${source} gives "${expected}".`);
            }
            continue;
          }
          const test = line.match(PASSED_TEST);
          if (test) {
            const [, file, name] = test;
            seen.tests.add(`${file} > ${name}`);
            const named = selected.filter((t) => t.file === file && t.name === name);
            if (!files.includes(file)) {
              fail(`${where}line ${n}: the capture shows a test of ${file}, which \`${command}\` does not run.`);
            } else if (named.length === 0) {
              fail(`${where}line ${n}: the capture shows "${name}" passing in ${file}; ${source} has no test of that name there.`);
            } else if (!named.some(passing)) {
              fail(`${where}line ${n}: the capture shows "${name}" passing in ${file}; ${source} has it ${named[0].state}.`);
            }
            continue;
          }
          const summary = line.match(SUMMARY);
          if (!summary) continue;
          const [, kind, parts, total] = summary;
          seen.kinds.add(kind);
          const counts = live[kind];
          const stated = {};
          for (const part of parts.split('|').map((p) => p.trim())) {
            const m = part.match(/^(\d+) (passed|failed|skipped)$/);
            if (m) stated[m[2]] = Number(m[1]);
            else fail(`${where}line ${n}: the capture's "${kind}" line says "${part}"; the check reads passed, failed and skipped counts.`);
          }
          if (Number(total) !== counts.total) {
            const unit = counts.total === 1 ? counts.unit.slice(0, -1) : counts.unit;
            fail(`${where}line ${n}: the capture's "${kind}" line says ${total} in all; \`${command}\` selects ${counts.total} ${unit} of ${source}.`);
          }
          for (const state of RESULT_STATES) {
            const said = stated[state] ?? 0;
            if (said === counts[state]) continue;
            const label = state === 'passed' && !ran ? 'not skipped (collected, not run)' : state;
            fail(
              `${where}line ${n}: the capture's "${kind}" line says ${said} ${state}; ` +
                `of the ${counts.unit} \`${command}\` selects, ${source} has ${counts[state]} ${label}.`,
            );
          }
        }
        return seen;
      };
      hold(prefix, body);

      // The full output the intro links, if it links one: held to the run
      // as the capture is, it shows every test the run passes and both
      // summary lines, and the oasb command's verdict line, holds each line
      // of the capture other than "...", and has a .json file of the same
      // name beside it that names the command and the full output. A link
      // to a file that does not exist, or with a malformed %-escape, names
      // no file here and is reported by check 4.
      const link = lines[j].line.replace(/`[^`]*`/g, '').match(FULL_OUTPUT);
      const linked = link ? decoded(link[1]) : null;
      const fullFile = linked !== null ? resolve(dirname(doc), linked) : null;
      let full = null;
      if (fullFile && existsSync(fullFile)) {
        full = relative(dirname(readmePath), fullFile).split(sep).join('/');
        let text;
        try {
          text = readFileSync(fullFile, 'utf8');
        } catch (err) {
          fail(`${prefix}line ${lines[j].n}: cannot read the full output ${full}: ${readFailure(err)}`);
        }
        if (text !== undefined) {
          const fullLines = text.split('\n').map((line, k) => ({ n: k + 1, line }));
          const seen = hold(`${full} `, fullLines);
          for (const kind of SUMMARY_KINDS) {
            if (!seen.kinds.has(kind)) fail(`${full}: the full output of \`${command}\` has no "${kind}" line.`);
          }
          if (scenario && !seen.verdict) {
            fail(`${full}: the full output of \`${command}\` has no verdict line ("OASB ${scenario.id} against <product>: ..."), which the oasb command prints last.`);
          }
          for (const t of selected.filter(passing)) {
            if (seen.tests.has(`${t.file} > ${t.name}`)) continue;
            fail(`${full}: the full output of \`${command}\` does not show "${t.name}" in ${t.file}, which ${source} has ${ran ? 'passed' : 'not skipped'}.`);
          }
          const have = new Set(fullLines.map(({ line }) => line.trimEnd()));
          for (const { n, line } of body) {
            if (line.trim() === '' || ELISION.test(line) || have.has(line.trimEnd())) continue;
            fail(`${prefix}line ${n}: the capture shows a line that its full output ${full} does not have: "${line.trim()}".`);
          }
        }
        const metaFile = fullFile.replace(/(\.[^./\\]*)?$/, '.json');
        const metaName = relative(dirname(readmePath), metaFile).split(sep).join('/');
        if (!existsSync(metaFile)) {
          fail(`${prefix}line ${lines[j].n}: the full output ${full} has no ${metaName} beside it to record the command it is of.`);
        } else {
          let meta;
          try {
            meta = JSON.parse(readFileSync(metaFile, 'utf8'));
          } catch (err) {
            fail(`${metaName}: cannot read it as JSON: ${readFailure(err)}`);
          }
          if (meta !== undefined) {
            if (meta?.command !== command) {
              fail(`${metaName}: "command" is ${JSON.stringify(meta?.command)}; the capture it describes is of \`${command}\`.`);
            }
            if (meta?.outputs?.capture !== full) {
              fail(`${metaName}: "outputs.capture" is ${JSON.stringify(meta?.outputs?.capture)}; the full output it describes is ${full}.`);
            }
          }
        }
      }
      captures.push({ prefix, command, tests: live.Tests.total, files: files.length, full, shown: selected.filter(passing).length });
    }
  }
  return captures;
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
    if (inFence || fenceOpen || fenceClose || BLANK.test(line)) {
      open = null;
      continue;
    }
    if (OWN_BLOCK.test(line)) {
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
  const prose = withoutCodeSpans(text);
  if (NAMES_BENCHMARK.test(prose) && COMPARES_PRODUCTS.test(prose) && !RECALL_ONLY.test(prose)) {
    fail(
      `${prefix}line ${n}: the Scanner Benchmark is offered for comparing products without calling it a recall-only comparison. ` +
        'Its benign class was labeled by HackMyAgent, one of the scanners it compares, so false-positive rate, precision, ' +
        'F1, flag rate and tier favor that scanner; say "recall-only comparison".',
    );
  }
}

let counted = null;
let captures = [];
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
    captures = checkCaptures(tests);
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
  const page = readPage(file);
  if (!page) continue; // readPage has reported it
  const h2 = page.findIndex((l) => !l.inFence && /^##\s/.test(l.line));
  // A line of a fenced code block is read as a blank line, which ends a
  // paragraph. The note is read without code spans and > markers.
  const written = (h2 === -1 ? page : page.slice(0, h2)).map((l) => (l.inFence || l.fenceOpen || l.fenceClose ? '' : l.line));
  const intro = written.map((line) => line.replace(/`[^`]*`/g, '').replace(/^\s*(?:>\s?)+/, ''));
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
  // The links are read from the lines as written, as check 4 reads them:
  // without its code spans or > markers, a line could start 4 columns in
  // and be read as indented code.
  const writtenLines = written.map((line) => ({ line }));
  const read = linkReader(writtenLines);
  if (!writtenLines.some((l) => read(l).some(toReadme))) {
    missing.push('link to the README for the current figures');
  }
  if (missing.length) {
    fail(
      `${at}: "${shown}" is a dated page, so above its first H2 it must ${missing.join(' and ')}; ` +
        `its counts are those of ${date} and are not compared with the suite.`,
    );
  }
}

// 10. A badge that states a number typed into its URL. A static shields.io
// badge is /badge/<label>-<message>-<color> or /badge/<message>-<color>, with
// "--" for a dash in the text.
const STATIC_BADGE = /https?:\/\/img\.shields\.io\/badge\/([^/?#)\s"']+)/g;
const badgeText = (part) => {
  const text = part.replace(/\0/g, '-');
  try {
    return decodeURIComponent(text);
  } catch {
    return text; // a malformed %-escape: read the text as written
  }
};
for (const { n, line, inFence } of readme) {
  if (inFence) continue;
  for (const [, path] of line.matchAll(STATIC_BADGE)) {
    const parts = path.replace(/--/g, '\0').split('-');
    if (parts.length < 2) continue;
    const message = badgeText(parts[parts.length - 2]).trim();
    if (!/^\d/.test(message)) continue;
    const label = badgeText(parts.slice(0, -2).join('-')).trim();
    fail(
      `line ${n}: the badge "${label ? `${label}: ` : ''}${message}" states a number typed into its URL, which the count ` +
        'check does not read; state the count on a page the count check reads, such as docs/test-catalog.md, and ' +
        'show the CI status badge, which shows the result of the latest CI run of the suite.',
    );
  }
}

// 12. The levels a benchmark command's comment names. Both CLIs check the
// OASB-1 controls of the level given and of every level below it, L1 when no
// level is given; a comment that names other levels tells the reader the
// command checks controls it does not.
const OASB_LEVELS = ['L1', 'L2', 'L3'];
const BENCHMARK_COMMANDS = [
  { name: 'opena2a benchmark', re: /\bopena2a\s+benchmark\b/, level: /\s--level(?:\s+|=)(\S+)/ },
  {
    name: 'hackmyagent secure -b oasb-1',
    re: /\bhackmyagent\s+secure\b(?=.*\s(?:-b|--benchmark)(?:\s+|=)oasb-1(?:\s|$))/,
    level: /\s(?:--level|-l)(?:\s+|=)(\S+)/,
  },
];
const levelList = (levels) => `level${levels.length > 1 ? 's' : ''} ${levels.length > 1 ? `${levels.slice(0, -1).join(', ')} and ` : ''}${levels.at(-1)}`;
for (const { n, line, inFence, prefix } of documents.flatMap((d) => d.lines.map((l) => ({ ...l, prefix: d.prefix })))) {
  if (!inFence) continue;
  const hash = line.search(/(?:^|\s)#/);
  if (hash < 0) continue;
  const command = line.slice(0, hash);
  const cli = BENCHMARK_COMMANDS.find(({ re }) => re.test(command));
  if (!cli) continue;
  const given = command.match(cli.level)?.[1].toUpperCase();
  const level = given ?? 'L1';
  if (!OASB_LEVELS.includes(level)) continue;
  const named = OASB_LEVELS.filter((l) => new RegExp(`\\b${l}\\b`, 'i').test(line.slice(hash)));
  const checked = OASB_LEVELS.slice(0, OASB_LEVELS.indexOf(level) + 1);
  if (named.length === 0 || named.join() === checked.join()) continue;
  fail(
    `${prefix}line ${n}: the comment names ${levelList(named)}, but \`${cli.name}\` with level ${level}${given ? '' : ' (no --level)'} ` +
      `checks the OASB-1 controls of ${levelList(checked)}; a level adds its controls to those of the levels below it.`,
  );
}

if (failures.length) {
  for (const f of failures) console.error('README: ' + f);
  process.exit(1);
}
console.log(
  `   README: ${readme.length} lines, Quick Start at line ${firstH2.n}, first command at line ${commandLine}, links resolve, ` +
    `also on the ${documents.length - 1} pages that took its text and on ${linkedPages.length} other ` +
    `page${linkedPages.length === 1 ? '' : 's'} reached by following links.`,
);
if (counted) {
  console.log(
    `   README test counts match ${reportPath ? 'the test report' : 'the collected suite'}: ` +
      `${counted.total[0]} tests, ${counted.passed[0]} ${reportPath ? 'passing' : 'not skipped'}, ` +
      `${counted.skipped[0]} skipped, ${counted.scenarios[0]} attack scenarios, ` +
      `${counted.scoringEngine[0]} scoring-engine, ${counted.pinned[0]} pinned.`,
  );
  if (inconclusive > 0) console.log(`   ${inconclusive} skipped as inconclusive, counted with the passing tests.`);
}
for (const { prefix, command, tests, files, full, shown } of captures) {
  console.log(
    `   ${prefix || 'README '}capture of \`${command}\` matches ${reportPath ? 'the test report' : 'the collected suite'}: ` +
      `${tests} tests in ${files} test file${files === 1 ? '' : 's'}.`,
  );
  if (full) {
    console.log(
      `   Its full output ${full} shows the ${shown} test${shown === 1 ? '' : 's'} ${reportPath ? 'that passed' : 'not skipped'} ` +
        'and holds each line of the capture.',
    );
  }
}
