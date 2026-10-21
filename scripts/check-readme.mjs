#!/usr/bin/env node
// README layout and link check.
//
// Guards the first screen a visitor sees and the links that hold the README
// together after content moves into docs/:
//   1. the README stays under MAX_LINES lines;
//   2. the first H2 is "Quick Start" and starts before line QUICK_START_BY;
//      no ## line of a fenced code block or of an HTML block is an H2, as
//      check 4 reads no heading there;
//   3. a fenced code block with a runnable command starts before line COMMAND_BY;
//   4. each relative link the check reads resolves to a file in the
//      repository, and an #anchor in a link to a .md file resolves to a
//      heading in that file. No line of a fenced code block holds a
//      heading, nor does a line of an HTML block, which the check follows as
//      described below, as its text is raw HTML. The check reads three
//      forms: inline `[text](target)` with an optional title in "", '' or
//      (), whose target may be written `<target>` or hold balanced
//      parentheses, whose target and title may start on the next line of
//      its paragraph (`[x](target` and `"title")`), and whose text opens at
//      a `[` that no backslash escapes, on that line or on an earlier line
//      of its paragraph (`foo](target)` is text), and, each written within
//      one line, a reference definition `[label]: target` at the start of a
//      line (indented at most three spaces) and a quoted HTML
//      `href="target"` or `href='target'` attribute. An inline link or
//      definition on a line of
//      indented code is not read: a line that does not go on with a
//      paragraph and starts 4 or more columns past where the text of the
//      block quote or list item that holds it starts, a tab moving on to the
//      next multiple of 4. An href on such a line is read, as the line may
//      be raw HTML inside an HTML block, where an href is a link. A table
//      starts at a header row: a line followed, in the same block quotes
//      and list items, by a delimiter row (| - | or --- | ---) with as many
//      cells, where the line holds a |, or holds none and does not follow a
//      table row, and the delimiter row holds a | or a :. A line that goes
//      on with a paragraph lazily is paragraph text when it leaves out a
//      block quote marker or holds no |. One that leaves out only list item
//      indentation is a header row when a delimiter row in the list items
//      that hold the paragraph follows it and is at most 3 columns past the
//      block quotes and list items the line goes on with, which hold the
//      table; when that row is 4 or more columns past them, the line ends
//      the paragraph and the list items it leaves out, and starts a
//      paragraph. A table goes on until a blank line, indented code,
//      another block, or a line that leaves those block quotes and list
//      items or opens another, and its lines are table rows whether or not
//      they start with |. The cells of a row are read one at a time, so
//      link text and code spans do not run on from one cell to the next; a
//      row holds no definition, and a row's cells past the number of cells
//      of the header row are not read. A line whose text starts with | is
//      paragraph text otherwise.
//      A line whose first characters other than white space are 3 or more
//      backticks that no backtick follows on the line, or 3 or more tildes,
//      opens a fenced code block, and no link is read on it, on the next
//      such line of the same character, where the block ends, or on the
//      lines between them, only when that run starts at most 3 columns past
//      where the text of the list items that hold the line starts; a line
//      that starts further in goes on with the paragraph above it, as
//      indented code cannot interrupt a paragraph, or is indented code. As
//      CommonMark reads those two lines, text after the run is the block's
//      info string on the first, and on the last makes the line code, not a
//      closing fence, as do a run on the last that is shorter than the one
//      on the first and a run that starts 4 or more columns past where the
//      text of the list items that hold the block starts. CommonMark allows
//      no backtick in the info string of a backtick fence, so a line whose
//      run of backticks a backtick follows (```x`y) opens no block, and
//      inside one is code that ends none. A
//      block inside list items also ends at the first line that does not go
//      on with them, as a fenced code block takes no line lazily, and that
//      line is read as a line outside the block, which may open another one.
//      No link is read in a fenced code block inside a block quote, which
//      ends a paragraph: from a fence, 3 or more backticks that no backtick
//      follows on its line or 3 or more tildes, at most 3 columns past where
//      the text of the block quote or list item that holds it starts, to a
//      fence of as many or more of the same with only spaces or tabs after
//      it, or to the end of that block quote or list item. Nor is a link
//      read on such a fence where the text of a list item starts, on the
//      line that opens the item outside a block quote (- ``` or 1. ~~~), or
//      on the lines after it, up to a fence that closes it or to the end of
//      the list items that hold it; parse() tags those lines as it tags
//      those of a block whose fence starts its line. None of these fences
//      opens a block on a line of an HTML block, which is raw HTML: a block
//      that a block tag such as <div> opens runs to the line before the next
//      blank line, as does one that another open tag or closing tag alone on
//      a line but for spaces and tabs after it opens, such as <span> or
//      </span>, on a line that does not go on with a paragraph, also lazily,
//      which such a block cannot interrupt; one that <pre>, <script>,
//      <style>, <textarea>, a comment, a processing instruction, a
//      declaration or CDATA opens runs to the line that holds its end, and
//      each ends before a line that does not go on with the block quotes and
//      list items that hold it. Nor does a > or a list marker open a block
//      quote or list item on a line of such a block after its first, as the
//      line is raw HTML, so a line after the block is read with the block
//      quotes and list items that held it.
//      Links inside code spans are not read, a
//      code span ending at the next run of as many backticks, on its line or
//      on a later line of its paragraph, and a line that starts inside one,
//      or inside raw HTML that an earlier line of its paragraph opened,
//      holds no definition; a backtick after a backslash (\`) is text and
//      opens none. An href on a line of such an HTML block is read between
//      backticks too, as a backtick in raw HTML is text. A `[` or `]` inside
//      a code span, an autolink
//      (`<https://...>`) or raw HTML (a tag, comment, processing
//      instruction, declaration or CDATA section) neither opens nor closes
//      link text, and of these the one that starts first holds the others
//      as text: a backtick inside a tag opens no code span, so an href in a
//      tag whose other attribute holds a backtick is read. An autolink is
//      read when it opens and closes on the same line, and raw HTML when it
//      closes on its line or on a later line of its paragraph, such as a
//      tag whose quoted value holds the line break. In a paragraph, a
//      heading or a table cell, an href is read only in an open tag read so,
//      the first one outside the tag's quoted values, also when the tag
//      starts on an earlier line of its paragraph; one inside another tag's
//      quoted value, a comment, a processing instruction, a declaration, a
//      CDATA section or a link's title is not read, nor is one in text that
//      is not raw HTML, such as \<a href="target">. A browser may end a
//      comment, processing instruction or CDATA section before the end at
//      which CommonMark ends it: a comment at a --!> after its <!--, and
//      what <? or <![CDATA[ opens at the first > after it. It reads the
//      rest of it as raw HTML, so an href in an open tag there is read:
//      x <? > <a href="target">y</a> ?> links to target, and
//      x <? <a href="target"> ?> does not. Nor is an href read in the text
//      of an element whose text a browser reads as text, not as HTML:
//      <script>, <style>, <textarea>, <title>, <xmp>, <iframe>, <noembed>,
//      <noframes>, <noscript> or <plaintext>. That text runs from a start
//      tag of the element, in raw HTML read as above, to where a browser
//      ends the element: at the first </ and its name, in any case, before
//      white space, a / or a >, in that raw HTML or in later raw HTML of the
//      paragraph, heading or cell, also inside a comment or another tag's
//      quoted value, and in a <script> at the first that readScript() reads
//      as its end. With none there, as for a <plaintext>, which none ends,
//      it runs to the end of the paragraph, heading or cell, though a
//      browser reads on past that end, as text of the element. So
//      x <textarea> <a href="target">y</a> </textarea> does not link to
//      target, and x <textarea> </textarea> <a href="target">y</a> does.
//      An inline link in that text is read. The <svg> and <math> elements
//      are not followed here. Other forms,
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
//      "What Gets Tested" table, counted per source directory. The rows are
//      read below the "## What Gets Tested" H2 up to the next H2, each found
//      as check 2 finds one, so a ## line of a fenced code block or of an
//      HTML block neither starts nor ends the section, and a line of such
//      a block that starts with | is no row, as its text is code or raw
//      HTML. Without
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
//      page that section links to. The section runs from the
//      "## MITRE ATLAS Coverage" H2 up to the next H2, each found as check 2
//      finds one, so a ## line of a fenced code block or of an HTML block
//      neither starts nor ends it. A table lists a test by the ID its file
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
//      "as of <that date>" and links to the README above its first H2,
//      found as check 2 finds the README's. Its counts are those of that
//      day and are not compared with the suite, so the page itself sends
//      the reader to the README for the current ones.
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

// The patterns that lineStart(), further down, reads with. parse() reads each
// line with lineStart() as the README is read, so they are set before it.
// The blocks that lineStart() reads where a line's block quote markers, list
// markers and indentation end, each matched at lastIndex: an ATX heading, a
// setext heading underline (=== or ---), a thematic break (***, ___, - - -),
// the first line of an HTML block of the kinds that may interrupt a
// paragraph (CommonMark kinds 1 to 6: <script>, <pre>, <style>, <textarea>, a
// comment, a processing instruction, a declaration, CDATA, whose name is
// matched in capitals only, or a block tag such as <div> or </p>), the
// first line of an HTML block of kind 7, which cannot interrupt one (an
// open tag or a closing tag that starts none of the other kinds, such as
// <span> or </span>, with only spaces and tabs after it on the line), and a
// list marker. The spaces and tabs after a thematic break's last mark are
// matched by that mark's [ \t]* alone: with a second [ \t]* after the
// marks, the two could share them in every way, which took seconds on a
// line of 100,000 of them.
// HTML_BLOCK_START matches the first line of an HTML block of kind 1, 2, 3
// or 4 with the group of that number, and one of kind 6, a block tag, with
// none of them; CDATA_START matches one of kind 5, and htmlBlock7At(),
// below, reads one of kind 7.
const ATX_HEADING = /#{1,6}(?:[ \t]|$)/y;
const SETEXT_UNDERLINE = /(?:=+|-+)[ \t]*$/y;
const THEMATIC_BREAK = /(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/y;
const HTML_BLOCK_START = new RegExp(
  '(<(?:script|pre|style|textarea)(?:[\\s>]|$))|(<!--)|(<\\?)|(<![a-z])|' +
    '</?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|' +
    'fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|' +
    'menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|' +
    'track|ul)(?:\\s|/?>|$)',
  'iy',
);
const CDATA_START = /<!\[CDATA\[/y;
// What ends an HTML block of kinds 1 to 5, as CommonMark ends it: the first
// line of the block, its first line included, that holds the pattern after
// the block quote markers that hold the block. A block of kind 6 or 7 ends
// before the first line that is blank after those markers.
const HTML_BLOCK_END = { 1: /<\/(?:script|pre|style|textarea)>/i, 2: /-->/, 3: /\?>/, 4: />/, 5: /\]\]>/ };
// Whether an HTML block of `kind` ends before a blank line, as one of kind
// 6 or 7 does, rather than at a line that holds the end HTML_BLOCK_END gives.
const endsAtBlank = (kind) => kind >= 6;
const LIST_MARKER = /(?:[-+*]|(\d{1,9})[.)])(?=[ \t]|$)/y;
// A code fence: 3 or more backticks that no backtick follows on the line, or
// 3 or more tildes.
const FENCE = /`{3,}(?=[^`]*$)|~{3,}/y;
const matchAt = (re, text, i) => {
  re.lastIndex = i;
  return re.exec(text);
};

// Whether `text`, from text[j], is the first line of an HTML block of kind
// 7: an open tag or a closing tag, then only spaces and tabs. The tag is
// read as inlineTagEnd(), further down, reads one inline, but with
// only spaces and tabs as its white space, as CommonMark allows no other in
// a tag on one line, and one attribute at a time: TAG_7_START reads its <
// or </ and its name, TAG_7_ATTRIBUTE an attribute of an open tag with the
// spaces and tabs before it, and OPEN_TAG_7_END or CLOSING_TAG_7_END the
// rest of the line. A pattern of the whole tag with \s, which matches a
// no-break space, as an unquoted attribute value does, tried every way a
// line of attributes that hold one splits into attributes: in a code block,
// a line of 26 of them, 160 characters, took 5.4 seconds to check, and one
// of 28 of them 15.5 seconds. It also threw a RangeError on a line of
// 1,000,000 attributes, which are read here one at a time.
const TAG_7_START = /<(\/?)[A-Za-z][A-Za-z0-9-]*/y;
const TAG_7_ATTRIBUTE = /[ \t]+[A-Za-z_:][\w.:-]*(?:[ \t]*=[ \t]*(?:[^"'=<>`\x00-\x20]+|'[^']*'|"[^"]*"))?/y;
const OPEN_TAG_7_END = /[ \t]*\/?>[ \t]*$/y;
const CLOSING_TAG_7_END = /[ \t]*>[ \t]*$/y;
const htmlBlock7At = (text, j) => {
  const start = matchAt(TAG_7_START, text, j);
  if (!start) return false;
  let i = j + start[0].length;
  if (start[1] === '/') return matchAt(CLOSING_TAG_7_END, text, i) !== null;
  for (let attribute; (attribute = matchAt(TAG_7_ATTRIBUTE, text, i)); ) i += attribute[0].length;
  return matchAt(OPEN_TAG_7_END, text, i) !== null;
};

// A table's delimiter row, such as | - | :-: | or --- | ---, once the block
// quote markers and indentation before it and the spaces and tabs after it
// are removed.
const DELIMITER_ROW = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?$/;
// A line that holds only the characters of a delimiter row, block quote
// markers and indentation, which tableHeader() reads further only then.
const DELIMITER_CHARACTERS = /^[ \t>|:-]*\r?$/;

// Columns as CommonMark counts them in the indentation of a line: a tab
// moves on to the next multiple of 4.
const nextColumn = (c, col) => (c === '\t' ? col + 4 - (col % 4) : col + 1);

// Split a markdown file into lines, tagging each with whether it sits inside a
// fenced code block, so headings and links are only read from prose, and
// whether it is a line of an HTML block that blockReader() follows (`html`),
// whose text is raw HTML, so no heading is read on it either. A block
// opens at a line whose first characters other than white space are a fence
// as FENCE reads one, 3 or more backticks that no backtick follows on the
// line or 3 or more tildes, when they start at most 3 columns past where the
// text of the list items that hold the line starts, as lineStart() reads
// that line with the block quotes and list items that blockReader() keeps
// open after the line above. A line that starts further in opens none: it
// goes on with the paragraph above it, as indented code cannot interrupt a
// paragraph, or is indented code. The block runs to the next line whose
// first characters other than white space are a fence of the same
// character, at least as long as the one that opened it, with only spaces
// and tabs after the run, when the run starts at most 3 columns past where
// the text of the list items that hold the block starts, as closes() reads
// that line: a fence further in is code. Or it runs to the first line that
// does not go on with the list items that hold it, as a fenced code block
// takes no line lazily: that line ends the list items it does not go on
// with, and so the block, and is read as a line outside the block, which
// may open another one. A block also opens at a fence where
// the text of a list item starts, on the line that opens the item outside a
// block quote (- ``` or 1. ~~~), as lineStart() reads that line with those
// block quotes and list items. That block runs to the fence that closes it,
// as closes() reads one, or to the first line that does not go on with the
// list items that hold it. A fence inside a block quote is left to
// blockReader(), as no line of that block starts with its fence.
// No such block opens on a line of the HTML block that the line above is
// in, as blockReader() follows it: the line is raw HTML.
function parse(text) {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const parsed = lines.map((line, i) => ({ n: i + 1, line, inFence: false }));
  const read = blockReader(parsed);
  let fence = null; // the fence that opened a block that starts its line
  let listFence = null; // the opening fence of the block in a list item that the line above is in
  for (const l of parsed) {
    // How lineStart() reads the line, once it has been read so: the reader
    // is given it, so that it reads the line once.
    let start;
    if (listFence) {
      start = read.start(l.line);
      if (start.matched === read.containers.length) {
        if (closes(start, listFence)) {
          listFence = null;
          l.fenceClose = true;
        } else {
          l.inFence = true;
        }
        read(l, start);
        continue;
      }
      listFence = null;
    }
    // A block whose fence starts its line ends at a line that does not go
    // on with the list items that hold it, the reader's containers from
    // that fence on, as a line inside the block leaves them as they are.
    // That line is then read as a line outside the block. Each line of the
    // block is read so, also with no list item, as closes() reads the
    // closing fence from how lineStart() reads it.
    if (fence !== null) {
      start = read.start(l.line);
      if (start.matched < read.containers.length) fence = null;
    }
    // The fence that the line starts with past white space, as FENCE reads
    // one, which may open a block. A run of backticks that a backtick
    // follows on its line is none, as CommonMark allows no backtick in the
    // info string of a backtick fence, so that line opens no block; and as
    // lineStart() reads a fence with FENCE too, it closes none.
    const marker = matchAt(FENCE, l.line, l.line.match(/^\s*/)[0].length);
    if (fence === null) start ??= read.start(l.line);
    // A line of the HTML block that the line above is in opens no fence, as
    // its text is raw HTML.
    const html = fence === null && read.inHtml(l.line, start);
    // Read as if no paragraph were open, a line that starts 4 or more
    // columns past where the text of the list items that hold it starts is
    // indented code, and opens no fence.
    if (marker && fence === null && !html && lineStart(l.line, read.containers, false).rest !== 'code') {
      fence = marker[0];
      l.fenceOpen = true;
    } else if (fence !== null && closes(start, fence)) {
      // A fence 4 or more columns past where the text of the list items
      // that hold the block starts is code, as lineStart() reads it, and
      // closes no block.
      fence = null;
      l.fenceClose = true;
    } else if (fence !== null) {
      l.inFence = true;
    } else if (start.rest === 'fence' && !start.quoted && !html) {
      listFence = start.fence;
      l.fenceOpen = true;
    }
    if (read(l, start)?.html) l.html = true;
  }
  return parsed;
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

// The anchors of the headings on a page's lines, as parse() tags them. A line
// of an HTML block is raw HTML, so a # that starts it starts no heading.
function anchors(lines) {
  const seen = new Map();
  const out = new Set();
  for (const { line, inFence, html } of lines) {
    if (inFence || html) continue;
    const h = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!h) continue;
    const base = slug(h[1]);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    out.add(count === 0 ? base : `${base}-${count}`);
  }
  return out;
}

// Whether a line, as parse() tags it, is an H2: a line that starts with ##
// and white space. A ## line of a fenced code block or of an HTML block is
// none, as its text is code or raw HTML. Checks 2 and 9 find the first H2
// with it, and checks 5 and 7 the H2 that starts a section and the H2 that
// ends it.
function isH2({ line, inFence, html }) {
  return !inFence && !html && /^##\s/.test(line);
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

// 2. Quick Start is the first H2 and sits near the top. A ## line of a
// fenced code block or of an HTML block, as parse() tags them, is no H2, as
// its text is code or raw HTML.
const firstH2 = readme.find(isH2);
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
  // The info string: what follows the fence's run, past the list markers
  // before it on a line that opens a list item.
  const lang = readme[i].line.replace(/^[^`~]*(?:`{3,}|~{3,})/, '').trim().toLowerCase();
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

// Reads the code spans, the raw HTML and the inline links in the lines of
// one paragraph, given in order, as codeSpans, inlineHtml and inlineLink
// find them in the lines joined by line breaks: a run of backticks that no
// run on its line closes opens a span when a run of as many on a later line
// of the paragraph closes it, and the lines between are inside that span;
// raw HTML, such as a tag whose quoted value holds a line break, may run on
// to a later line of the paragraph in the same way, and so may the
// destination and title of an inline link, as CommonMark reads a line break
// in the white space around them and in a title. `texts` gives, for each
// line after the first, where its text starts, after the > markers and
// indentation that CommonMark leaves out of the paragraph's text; those are
// read as spaces, so a block quote's > there ends no tag. Each call reads
// the next line and returns `from`, the index on it after a code span that
// an earlier line opened (0 when none holds the start of the line, and its
// length or more when one holds all of it), `start`, the index on it after
// a code span, raw HTML or inline link that an earlier line opened, where a
// reader of the line starts, codeSpanAt(i), which answers as codeSpans does
// for the run of backticks at line[i], with an index on the line, past its
// end when the span closes on a later line, `to`, the index of that run
// when there is one, and otherwise the length of the line, htmlAt(i), which
// answers as inlineHtml does for the < at line[i], with an index on the
// line, past its end when the raw HTML ends on a later line, linkAt(i),
// which answers as inlineLink does for the ( at line[i], with an index on
// the line, past its end when the link closes on a later line, and
// hrefs(), the targets on the line of the hrefs that tagHref() reads in
// the open tags htmlAt() has read, and of those that rawHtmlHrefs() reads
// in each comment, processing instruction, CDATA section and declaration
// htmlAt() has read, as a browser may end one before the end at which
// CommonMark ends it and read the rest as raw HTML: those whose target
// opens on the line, also those of a tag that starts on an earlier line,
// but none inside an image that a destination follows, from its ![ to the
// ) that closes its destination and title, as linkSyntax() finds the
// images in the lines joined, so an image whose ] is on a later line holds
// the hrefs before it on its earlier lines too. markdown-it 14.1.0 writes
// the description of an image, a tag in it as well, as escaped text in the
// alt attribute of the <img>, so the tag makes no link.
// The elements whose text a browser reads as text (RAW_TEXT_ENDS) are
// followed over that raw HTML with one tracker that rawTextElements()
// makes of the lines: an open tag read while none of them is open is read
// with tagHref() and then opens the one it starts, if any, and a tag read
// while one is open is read with rawHtmlHrefs(), as raw HTML is, which
// reads no href in it before the end tag that ends that element. A
// reader asks about the runs, the < and the ( it meets from left to right,
// and asks for hrefs() once it has read the line.
function paragraphCodeSpans(lines, texts = []) {
  const text = lines.map((line, k) => (texts[k] > 0 ? ' '.repeat(texts[k]) + line.slice(texts[k]) : line)).join('\n');
  const codeSpanAt = codeSpans(text);
  const htmlAt = inlineHtml(text);
  // The images that a destination follows, the parts of linkSyntax() that
  // are sure and start at a ! (a link's part starts at the ( of its
  // destination), found the first time hrefs() has an href to give.
  let images;
  const inImage = (at) => partHolding((images ??= linkSyntax(text, ([start, , sure]) => sure && text[start] === '!')), at) !== undefined;
  const elements = rawTextElements(text);
  const hrefs = []; // the hrefs of the tags read, as tagHref() gives them, in order
  let given = 0; // how many of them hrefs() has given
  let k = 0; // the line read next
  let lineAt = 0; // the index in the joined lines where that line starts
  let after = 0; // the index in the joined lines after the code span read last
  let past = 0; // the index in the joined lines after the code span, raw HTML or inline link read last
  return () => {
    const at = lineAt;
    const { length } = lines[k++];
    lineAt += length + 1;
    const spans = {
      from: Math.max(0, after - at),
      start: Math.max(0, past - at),
      to: length,
      codeSpanAt: (i) => {
        const span = codeSpanAt(at + i);
        if (span.opens) after = past = span.end;
        if (span.opens && span.end - at > length) spans.to = i;
        return { opens: span.opens, end: span.end - at };
      },
      htmlAt: (i) => {
        const html = htmlAt(at + i);
        past = html.end;
        if (html.tag && !elements.open()) {
          const href = tagHref(text, at + i, html.end);
          if (href) hrefs.push(href);
          elements.start(at + i);
        } else if (html.tag || (html.unshown && html.end > at + i + 1)) {
          for (const href of rawHtmlHrefs(text, at + i, html.end, elements)) hrefs.push(href);
        }
        return { ...html, end: html.end - at };
      },
      linkAt: (i) => {
        const link = inlineLink(text, at + i);
        if (!link) return null;
        past = link.end;
        return { target: link.target, end: link.end - at };
      },
      hrefs: () => {
        const targets = [];
        while (given < hrefs.length && hrefs[given].at < at + length) {
          const href = hrefs[given++];
          if (!inImage(href.at)) targets.push(href.target);
        }
        return targets;
      },
    };
    return spans;
  };
}

// The parts of a line outside its code spans, as [start, end) pairs in
// order. Outside a code span a backslash escapes the character after it, so
// \` is a literal backtick and \`` opens a span with the one backtick left
// of its run, while \\` is a literal backslash and then a run that may open
// one.
function outsideCodeSpans(line) {
  const codeSpanAt = codeSpans(line);
  const parts = [];
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
      parts.push([from, i]);
      from = span.end;
    }
    i = span.end;
  }
  parts.push([from, line.length]);
  return parts;
}

// A line with its code spans removed, as outsideCodeSpans() finds them.
function withoutCodeSpans(line) {
  return outsideCodeSpans(line).map(([start, end]) => line.slice(start, end)).join('');
}

// Where the open tag or closing tag that starts at text[i] ends, as
// commonmark.js and markdown-it read one inline with a pattern of the whole
// tag: the index after its >, or -1 when none starts there. An open tag is
// < and a name, then attributes, each white space and a name, then
// optionally white space, =, white space and a value, unquoted or in double
// or single quotes, and then white space, an optional / and >. A closing
// tag is </, a name, white space and >. White space is what \s matches, a
// line break too, and a quoted value may hold one, so a tag may run on from
// one line of a paragraph to the next. \s also matches a no-break space, as
// an unquoted value does, so that c, a no-break space and d may be one
// value or the value c and the attribute d: the tag is read one character
// at a time, in each of the states below that the characters read so far
// may leave it in. Such a pattern, which tries those splits in turn, threw
// a RangeError (Maximum call stack size exceeded) on a line that is <a and
// 987,000 attributes b=c. The tag ends at the first > outside a quoted
// value or not at all, and a quote outside a quoted value opens one only
// after an =.
const INLINE_TAG_START = /<(\/?)[A-Za-z][A-Za-z0-9-]*/y;
const CLOSING_TAG_END = /\s*>/y;
// The characters of a tag, as such a pattern reads them: white space, \s,
// the first character of an attribute's name, [A-Za-z_:], the others,
// [\w.:-], and those of an unquoted value, [^"'=<>`\x00-\x20].
const isTagSpace = (c) => c === ' ' || (c >= '\t' && c <= '\r') || (c > '\x7f' && /\s/.test(c));
const isNameStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === ':';
const isNameChar = (c) => isNameStart(c) || (c >= '0' && c <= '9') || c === '.' || c === '-';
const isValueChar = (c) => c > ' ' && c !== '"' && c !== "'" && c !== '=' && c !== '<' && c !== '>' && c !== '`';
const TAG_PAST_VALUE = 1; // after the tag's name or an attribute's quoted value
const TAG_IN_SPACE = 2; // in white space after one of those or after an unquoted value
const TAG_IN_NAME = 4; // in an attribute's name
const TAG_PAST_NAME = 8; // in white space after an attribute's name
const TAG_PAST_EQUALS = 16; // after an attribute's = and the white space after it
const TAG_IN_VALUE = 32; // in an unquoted value
const TAG_PAST_SLASH = 64; // after a / that a > may follow
function inlineTagEnd(text, i) {
  const start = matchAt(INLINE_TAG_START, text, i);
  if (!start) return -1;
  i += start[0].length;
  if (start[1] === '/') return matchAt(CLOSING_TAG_END, text, i) ? CLOSING_TAG_END.lastIndex : -1;
  for (let states = TAG_PAST_VALUE; states !== 0 && i < text.length; i++) {
    const c = text[i];
    if (c === '>') return states & ~TAG_PAST_EQUALS ? i + 1 : -1;
    if (c === '"' || c === "'") {
      if (!(states & TAG_PAST_EQUALS)) return -1;
      i = text.indexOf(c, i + 1);
      if (i === -1) return -1;
      states = TAG_PAST_VALUE;
      continue;
    }
    let next = 0;
    if (isTagSpace(c)) {
      if (states & (TAG_PAST_VALUE | TAG_IN_SPACE | TAG_IN_VALUE)) next |= TAG_IN_SPACE;
      if (states & (TAG_IN_NAME | TAG_PAST_NAME)) next |= TAG_PAST_NAME;
      if (states & TAG_PAST_EQUALS) next |= TAG_PAST_EQUALS;
    }
    if (states & (TAG_IN_SPACE | TAG_PAST_NAME) && isNameStart(c)) next |= TAG_IN_NAME;
    if (states & TAG_IN_NAME && isNameChar(c)) next |= TAG_IN_NAME;
    if (states & (TAG_IN_NAME | TAG_PAST_NAME) && c === '=') next |= TAG_PAST_EQUALS;
    if (states & (TAG_PAST_EQUALS | TAG_IN_VALUE) && isValueChar(c)) next |= TAG_IN_VALUE;
    if (states & (TAG_PAST_VALUE | TAG_IN_SPACE | TAG_IN_NAME | TAG_PAST_NAME) && c === '/') next |= TAG_PAST_SLASH;
    states = next;
  }
  return -1;
}

// The autolinks and raw HTML of `text`, one line or the lines of a
// paragraph joined by line breaks, as CommonMark reads them: an autolink
// <scheme:target> or <name@host>, which ends on its line, an open tag with
// its attributes or a closing tag, as inlineTagEnd() reads one, a comment
// from <!-- to the first --> after its <!, so that <!--> is one, a
// processing instruction from <? to the first ?> after it, a CDATA section
// from <![CDATA[ to the first ]]> after it, and a declaration from <! and a
// letter to the first > after it. A backslash inside one is text. For the <
// at text[i], htmlAt(i).end is the index after the autolink or raw HTML
// that starts there, or i + 1 when none does, htmlAt(i).tag is whether an
// open tag or a closing tag starts there, and htmlAt(i).unshown is the end
// that closes a comment, processing instruction, CDATA section or
// declaration whose start is there, -->, ?>, ]]> or >, whether or not the
// text holds that end, and null otherwise; an autolink such as <!a@b.c>
// starts no declaration. A reader asks about each < it meets from left to
// right, and the text is searched for the end of a comment, processing
// instruction, CDATA section or declaration on from where that end was last
// found, so a line of many <!-- that no --> follows is not read again from
// each one.
const AUTOLINK = /<[A-Za-z][A-Za-z0-9.+-]{1,31}:[^<>\x00-\x20]*>/;
const EMAIL_AUTOLINK = /<[\w.!#$%&'*+\/=?^`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*>/;
const ANY_AUTOLINK = new RegExp(`${AUTOLINK.source}|${EMAIL_AUTOLINK.source}`, 'y');
function inlineHtml(text) {
  const found = new Map(); // end -> where it was last found, or -1 when nowhere after
  const after = (end, from) => {
    let at = found.get(end);
    if (at === undefined || (at !== -1 && at < from)) {
      at = text.indexOf(end, from);
      found.set(end, at);
    }
    return at === -1 ? -1 : at + end.length;
  };
  return (i) => {
    const autolink = matchAt(ANY_AUTOLINK, text, i);
    if (autolink) return { end: i + autolink[0].length, unshown: null, tag: false };
    const tag = inlineTagEnd(text, i);
    if (tag !== -1) return { end: tag, unshown: null, tag: true };
    // The end that closes the raw HTML that starts there, and how many
    // characters after the < the search for it starts.
    let unshown = null;
    let skip = 0;
    if (text.startsWith('<!--', i)) [unshown, skip] = ['-->', 2];
    else if (text.startsWith('<?', i)) [unshown, skip] = ['?>', 2];
    else if (text.startsWith('<![CDATA[', i)) [unshown, skip] = [']]>', 9];
    else if (text[i + 1] === '!' && /[A-Za-z]/.test(text[i + 2] ?? '')) [unshown, skip] = ['>', 3];
    const end = unshown ? after(unshown, i + skip) : -1;
    return { end: end === -1 ? i + 1 : end, unshown, tag: false };
  };
}

// As in CommonMark, a backslash escapes the character after it when that is
// ASCII punctuation, which then stands for itself; before any other
// character, such as a space, a backslash is text.
const PUNCTUATION = /[!-/:-@[-`{-~]/;
const ESCAPE = /\\([!-/:-@[-`{-~])/g;
const escapes = (line, i) => line[i] === '\\' && PUNCTUATION.test(line[i + 1] ?? '');

// The inline link or image whose destination opens at the ( at text[paren],
// read as CommonMark reads it, in `text`, a line, a table cell or the lines
// of a paragraph joined by line breaks, also over a line break: white space,
// a destination, white space and a title, then white space and the ) that
// closes it. <target> runs to the closing > and may hold spaces but no line
// break and no unescaped < or >; a bare target ends at a space, a line
// break, a control character or the ) that closes the link, and may hold
// balanced parentheses, nested up to 32 deep as markdown-it allows. The
// title is optional and in "", in '' or in () with no ( inside that no
// backslash escapes, in which a backslash escapes the character after it,
// and may hold a line break. Returns the target, with each escape read as
// the character it escapes, and the index after the ) that closes the
// link, or null when no ) closes it there.
const MAX_PAREN_DEPTH = 32;
const LINK_TITLE_AND_CLOSE = /(?:[ \t\n]+(?:"(?:[^"\\]|\\[^])*"|'(?:[^'\\]|\\[^])*'|\((?:[^()\\]|\\[^])*\)))?[ \t\n]*\)/y;
function inlineLink(text, paren) {
  let i = paren + 1;
  while (text[i] === ' ' || text[i] === '\t' || text[i] === '\n') i++;
  let raw = null;
  if (text[i] === '<') {
    let j = i + 1;
    while (j < text.length && text[j] !== '>' && text[j] !== '<' && text[j] !== '\n') j += escapes(text, j) ? 2 : 1;
    if (text[j] !== '>') return null;
    raw = text.slice(i + 1, j);
    i = j + 1;
  } else {
    let j = i;
    let depth = 0;
    for (; j < text.length; j++) {
      const c = text[j];
      if (escapes(text, j)) j++;
      else if (c <= ' ' || c === '\x7f') break;
      else if (c === '(') {
        if (++depth > MAX_PAREN_DEPTH) break;
      } else if (c === ')') {
        if (depth === 0) break;
        depth--;
      }
    }
    if (depth !== 0) return null;
    raw = text.slice(i, j);
    i = j;
  }
  LINK_TITLE_AND_CLOSE.lastIndex = i;
  if (!LINK_TITLE_AND_CLOSE.test(text)) return null;
  return { target: raw.replace(ESCAPE, '$1'), end: LINK_TITLE_AND_CLOSE.lastIndex };
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
// a code span opens no tag. `spans` reads the line's code spans, raw HTML and
// inline links as paragraphCodeSpans reads those of a line of a paragraph,
// so a code span, raw HTML or the destination and title of a link may run
// on to a later line, and the line is read from spans.start, after a code
// span, raw HTML or link that an earlier line opened: after the lines
// [a <b title="] and "> b](target), as after the line
// [a <b title="]"> b](target), the link is read, and so is the link of the
// lines [x](target and "title"). The line is read on from
// the ) that closes a link, so its destination and title, which may hold a
// backtick, are not read as text. open.brackets is the stack of the [ that
// no ] has closed yet, true for one that opens an image, and open.aroundLink
// how many of them, from the bottom, were open when a link was read, so text
// that one of them opens holds that link. `open` starts with what an earlier
// line of the paragraph left open and keeps what this line leaves open.
function inlineDestinations(line, open, spans) {
  const targets = [];
  const { brackets } = open;
  const { codeSpanAt, htmlAt, linkAt } = spans;
  for (let i = spans.start; i < line.length; i++) {
    const c = line[i];
    if (escapes(line, i)) {
      i++;
    } else if (c === '`') {
      i = codeSpanAt(i).end - 1;
    } else if (c === '<') {
      i = htmlAt(i).end - 1;
    } else if (c === '[' || (c === '!' && line[i + 1] === '[')) {
      brackets.push(c === '!');
      if (c === '!') i++;
    } else if (c === ']' && brackets.length > 0) {
      const image = brackets.pop();
      const holdsLink = !image && brackets.length < open.aroundLink;
      open.aroundLink = Math.min(open.aroundLink, brackets.length);
      if (holdsLink || line[i + 1] !== '(') continue;
      const link = linkAt(i + 1);
      if (!link) continue;
      targets.push(link.target);
      if (!image) open.aroundLink = brackets.length;
      i = link.end - 1;
    }
  }
  return targets;
}

// The targets of the HTML href="target" / href='target' attributes in
// `text`, one line, after attribute values that may hold >, read on the
// text as it is given: whole on a line of raw HTML, such as a line of an
// HTML block, where a backtick is text and opens no code span, and without
// its code spans on a line of indented code. A tag that starts at a < and
// a letter is read on to the first > outside its quoted values, or to a
// quote that no later quote of its kind closes, and its first href there
// is a target; the text is read on after that href, or from the character
// after the < when the tag holds none. From each index a tag meets an href
// that starts there, or else the first href it meets from the next
// character, or from after the quoted value that starts there, and none at
// a >: that first href is noted for each index in one pass from the end of
// the text, so a line of many < that no > follows is not read again from
// each one. The hrefs of a paragraph, a heading or a table cell are read
// with tagHref() and rawHtmlHrefs() instead.
const HREF = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/iy;
function hrefTargets(text) {
  // reach[i] is the index of the first href a tag meets from text[i] on, or
  // -1 when it meets none; next[q] is the index of the next quote q after
  // text[i], or -1 when there is none.
  const reach = new Int32Array(text.length + 1).fill(-1);
  const next = { '"': -1, "'": -1 };
  for (let i = text.length - 1; i >= 0; i--) {
    const c = text[i];
    HREF.lastIndex = i;
    if (HREF.test(text)) reach[i] = i;
    else if (c === '"' || c === "'") reach[i] = next[c] === -1 ? -1 : reach[next[c] + 1];
    else if (c !== '>') reach[i] = reach[i + 1];
    if (c === '"' || c === "'") next[c] = i;
  }
  const targets = [];
  for (let i = 0; i + 1 < text.length; i++) {
    if (text[i] !== '<' || !/[a-z]/i.test(text[i + 1]) || reach[i + 2] === -1) continue;
    HREF.lastIndex = reach[i + 2];
    const [, double, single] = HREF.exec(text);
    targets.push(double ?? single);
    i = HREF.lastIndex - 1;
  }
  return targets;
}

// The href of the tag that starts at text[start] and ends before
// text[end], as inlineTagEnd() reads an open tag or a closing tag in
// `text`, one line or the lines of a paragraph joined by line breaks: the
// first href="target" or href='target' attribute, as HREF matches one,
// outside the tag's quoted values, as { target, at }, `at` being the index
// in `text` of the quote that opens the target. It is null when the tag
// holds none, as a closing tag does, and when that attribute holds a line
// break, as check 4 reads a quoted href written within one line. In an
// open tag a quote outside a quoted value opens one, as neither its name,
// an attribute's name nor an unquoted value holds a quote, so
// <b title="<a href='target'>"> holds no href: the <a> is inside the
// quoted value.
function tagHref(text, start, end) {
  for (let i = start; i < end; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i = text.indexOf(c, i + 1);
      if (i === -1) break;
      continue;
    }
    if (text[i + 1] !== 'h' && text[i + 1] !== 'H') continue;
    HREF.lastIndex = i;
    const href = HREF.exec(text);
    if (!href) continue;
    if (text.slice(i + 1, HREF.lastIndex).includes('\n')) return null;
    const target = href[1] ?? href[2];
    return { target, at: HREF.lastIndex - target.length - 2 };
  }
  return null;
}

// What a browser's tokenizer reads as white space in a tag: a tab, a line
// break, a form feed, a carriage return or a space, and no other
// character, such as a no-break space.
const isHtmlSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';
const isLetter = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

// The open tag or closing tag that starts at the < at text[i], before a
// letter or before / and a letter, read as a browser's tokenizer reads a
// tag: its name runs to white space, a / or a >, and each attribute after
// it has a name, whose first character may be an = and which runs to white
// space, a /, a > or an =, and may have, after any white space, an = and
// any white space, a value in double or single quotes, or an unquoted one
// that white space or a > ends. A / that no > follows is read as white
// space, and a quoted value needs no white space after it, so
// <a b="c"href="d"> holds two attributes. The tag ends at the first >
// outside a quoted value, so <a ="x>" href="y"> ends after the x: its
// first attribute is named ="x. Returns `end`, the index after that >, or
// -1 when the text ends first, and `href`: for an open tag, the value of
// its first attribute named href, whatever the case of its letters, as a
// browser drops a later one, when that value is in quotes and holds no
// line break, as { target, at }, `at` being the index of the quote that
// opens it, as tagHref() gives one, and otherwise null.
const HREF_NAME = /^href$/i;
function readTag(text, i) {
  const closing = text[i + 1] === '/';
  let href = null;
  let named = false; // whether an attribute named href has been read
  i += closing ? 2 : 1;
  while (i < text.length && !isHtmlSpace(text[i]) && text[i] !== '/' && text[i] !== '>') i++;
  for (;;) {
    while (i < text.length && (isHtmlSpace(text[i]) || text[i] === '/')) i++;
    if (i === text.length) return { end: -1, href: null };
    if (text[i] === '>') return { end: i + 1, href: closing ? null : href };
    const name = i++;
    while (i < text.length && !isHtmlSpace(text[i]) && text[i] !== '/' && text[i] !== '>' && text[i] !== '=') i++;
    const isHref = !named && i - name === 4 && HREF_NAME.test(text.slice(name, i));
    if (isHref) named = true;
    while (i < text.length && isHtmlSpace(text[i])) i++;
    if (text[i] !== '=') continue;
    i++;
    while (i < text.length && isHtmlSpace(text[i])) i++;
    const quote = text[i];
    if (quote === '"' || quote === "'") {
      const close = text.indexOf(quote, i + 1);
      if (close === -1) return { end: -1, href: null };
      if (isHref) {
        const target = text.slice(i + 1, close);
        if (!target.includes('\n')) href = { target, at: i };
      }
      i = close + 1;
    } else {
      while (i < text.length && !isHtmlSpace(text[i]) && text[i] !== '>') i++;
    }
  }
}

// A search of `text` for the first match of a global regular expression at
// or after an index: find(re, at) returns it, or null. The match found last
// for each expression is kept, and `text` is searched again, from `at`,
// only when that match starts before `at`; once a search finds none, none
// is made. A searcher is asked about indexes that do not go down, so each
// expression is read over the text about once.
const searcher = (text) => {
  const found = new Map();
  return (re, at) => {
    let match = found.has(re) ? found.get(re) : { index: -1 };
    if (match && match.index < at) {
      re.lastIndex = at;
      match = re.exec(text);
      found.set(re, match);
    }
    return match;
  };
};

// In the text of a <script> element, what puts a browser's tokenizer in
// the script data escaped state (COMMENT_START), what returns it from that
// state or the double escaped state to the script data state
// (ESCAPE_END), and what puts it in the double escaped state from the
// escaped state (SCRIPT_START): <script before white space, a /, a > or the
// end of the line. Unlike a comment, the escaped state does not end at --!>.
const COMMENT_START = /<!--/g;
const ESCAPE_END = /-->/g;
const SCRIPT_START = /<script(?=[\t\n\f\r />]|$)/gi;

// The elements whose text a browser reads as text, not as HTML, from the
// end of a start tag of one of them: <script>; <style>, <xmp>, <iframe>,
// <noembed>, <noframes> and <noscript>, whose text is raw text, that of
// <noscript> where a browser runs scripts; <textarea> and <title>, whose
// text is escapable raw text; and <plaintext>. RAW_TEXT_START matches the
// < and the name of a start tag of one of them, in any case, before white
// space, a / or a >, where a browser's tokenizer ends a tag's name. The
// entry of RAW_TEXT_ENDS for each name finds the start of the end tag at
// which a browser ends the element, </ and that name, in any case, before
// white space, a /, a > or the end of the line, for a <script> as
// readScript() reads its text; that of <plaintext> is null, as no end tag
// ends that element. Check 4 runs at the top level of this file, above
// check 9, so these patterns, searcher() and those that readScript() reads
// are defined here, before check 4 runs; check 9 reads searcher(),
// readScript(), SCRIPT_END, STYLE_END and TEXTAREA_END too.
const SCRIPT_END = /<\/script(?=[\t\n\f\r />]|$)/gi;
const STYLE_END = /<\/style(?=[\t\n\f\r />]|$)/gi;
const TEXTAREA_END = /<\/textarea(?=[\t\n\f\r />]|$)/gi;
const RAW_TEXT_START = /<(script|style|xmp|iframe|noembed|noframes|noscript|textarea|title|plaintext)(?=[\t\n\f\r />])/iy;
const RAW_TEXT_ENDS = new Map([
  ['script', SCRIPT_END],
  ['style', STYLE_END],
  ['xmp', /<\/xmp(?=[\t\n\f\r />]|$)/gi],
  ['iframe', /<\/iframe(?=[\t\n\f\r />]|$)/gi],
  ['noembed', /<\/noembed(?=[\t\n\f\r />]|$)/gi],
  ['noframes', /<\/noframes(?=[\t\n\f\r />]|$)/gi],
  ['noscript', /<\/noscript(?=[\t\n\f\r />]|$)/gi],
  ['textarea', TEXTAREA_END],
  ['title', /<\/title(?=[\t\n\f\r />]|$)/gi],
  ['plaintext', null],
]);

// The </script that ends the <script> element whose text is text[from] to
// text[to], read as a browser's tokenizer reads the text of a <script>
// element from `state`: 0 in the script data state, 1 in the script data
// escaped state, 2 in the script data double escaped state. In the script
// data state, <!-- puts it in the escaped state, where --> returns it to
// the script data state and <script before white space, a /, a > or the
// end of the line (SCRIPT_START) puts it in the double escaped state, where
// --> returns it to the script data state and </script before one of these
// (SCRIPT_END) returns it to the escaped state; in the script data state
// and in the escaped state such a </script ends the element. The -- of <!--
// are read as the dashes before a > that ends the escaped state, so <!-->
// ends it at once. `find` is a searcher() of the text. Returns the match of
// that </script, or null, as `end`, and the state at `to`, or at that
// </script, as `state`.
function readScript(find, from, to, state) {
  for (;;) {
    const end = find(SCRIPT_END, from);
    const endAt = end && end.index + end[0].length <= to ? end.index : to;
    if (state === 0) {
      const comment = find(COMMENT_START, from);
      if (!comment || comment.index + 4 > to || comment.index > endAt) return { end: endAt < to ? end : null, state };
      state = 1;
      from = comment.index + 2;
      continue;
    }
    const close = find(ESCAPE_END, from);
    const closeAt = close && close.index + 3 <= to ? close.index : to;
    const tag = state === 1 ? find(SCRIPT_START, from) : null;
    const tagAt = tag && tag.index + 7 <= to ? tag.index : to;
    const next = Math.min(closeAt, tagAt, endAt);
    if (next === to) return { end: null, state };
    if (next === closeAt) {
      state = 0;
      from = closeAt + 3;
    } else if (next === tagAt) {
      state = 2;
      from = tagAt + 7;
    } else if (state === 2) {
      state = 1;
      from = endAt + end[0].length;
    } else {
      return { end, state };
    }
  }
}

// Follows the elements of RAW_TEXT_ENDS over the raw HTML of `text`, one
// line, a table cell or the lines of a paragraph joined by line breaks, as
// the reader of that raw HTML gives it each piece of it from left to right.
// start(at) opens the element whose start tag RAW_TEXT_START matches at
// text[at], and says whether one does; open() says whether an element is
// open; and end(from, to), while one is, gives the index in `text` of the
// start of the end tag that ends it in text[from] to text[to], as its entry
// of RAW_TEXT_ENDS finds that start, and ends it there, or -1 when none
// ends it there. The state of the tokenizer in the text of a <script> is
// kept from one call to the next, as readScript() takes it. The text is
// searched with one searcher(), so a line of many tags inside an element
// that no end tag ends is not read again from each one.
function rawTextElements(text) {
  const find = searcher(text);
  let open = null; // the name of the element open, or null
  let escape = 0; // the state of the tokenizer in the text of a <script>
  return {
    open: () => open !== null,
    start: (at) => {
      const start = matchAt(RAW_TEXT_START, text, at);
      if (start) [open, escape] = [start[1].toLowerCase(), 0];
      return start !== null;
    },
    end: (from, to) => {
      let end = null;
      if (open === 'script') ({ end, state: escape } = readScript(find, from, to, escape));
      else if (RAW_TEXT_ENDS.get(open)) end = find(RAW_TEXT_ENDS.get(open), from);
      if (!end || end.index >= to) return -1;
      open = null;
      return end.index;
    },
  };
}

// The hrefs of the open tags that a browser reads in text[from] to
// text[to], raw HTML that a renderer passes on as written, such as a
// comment, processing instruction, CDATA section or declaration that
// CommonMark reads inline, in order, as readTag() gives them but with `at`
// an index in `text`. The text is read as a browser's tokenizer reads raw
// HTML from its data state: a comment runs from <!-- to the first --> or
// --!> after its <!, but not to a --!> that takes its dashes from the
// <!--, so <!--!> and <!---!> open one that runs on; a bogus comment runs
// from <?, from <! before anything but --, or from </ before anything but
// a letter or a >, to the first > after its start, and a browser drops
// </>; and an open tag or a closing tag, from < or </ and a letter, is
// read with readTag(). A <![CDATA[ is such a <!, as a browser reads it
// outside an <svg> or <math> element; inside one, it opens a CDATA section
// that ends at ]]>, but those elements are not followed here. So
// x <? > <a href="target">y</a> ?>
// holds a link to target, where CommonMark reads one processing
// instruction from <? to ?>, and x <? <a href="target"> ?> holds none. A
// browser reads a comment, bogus comment or tag whose end is past `to` on
// into what follows, so no href is read after its start. Each search for
// the end of one of these starts at or just after the < that opens it, and
// the search for the next < at that end. A start tag of an element of
// RAW_TEXT_ENDS opens it in `elements`, a tracker that rawTextElements()
// makes of `text`, and what follows that tag is the element's text, in
// which a browser reads no tag, up to the start of the end tag that
// elements.end() finds, from which the text is read as above. When none is
// there, no href is read after the start tag, and the element stays open
// in `elements`, as a browser reads what follows text[to] as its text too.
// When one is open at text[from], the text is read so from there. So
// x <? > <textarea> <a href="target">y</a> </textarea> ?> holds no link,
// and x <? > <textarea> </textarea> <a href="target">y</a> ?> holds one.
const COMMENT_CLOSE = /--!?>/g;
function rawHtmlHrefs(text, from, to, elements) {
  const hrefs = [];
  const start = elements.open() ? elements.end(from, to) : from;
  if (start === -1) return hrefs;
  const html = text.slice(from, to);
  for (let i = html.indexOf('<', start - from); i !== -1; i = html.indexOf('<', i)) {
    const c = html[i + 1];
    let end = i + 1;
    if (html.startsWith('<!--', i)) {
      COMMENT_CLOSE.lastIndex = i + 2;
      let close = COMMENT_CLOSE.exec(html);
      while (close && close[0].length === 4 && close.index < i + 4) close = COMMENT_CLOSE.exec(html);
      end = close ? close.index + close[0].length : -1;
    } else if (c === '?' || c === '!' || (c === '/' && !isLetter(html[i + 2]))) {
      const close = html.indexOf('>', i + 2);
      end = close === -1 ? -1 : close + 1;
    } else if (isLetter(c) || c === '/') {
      const tag = readTag(html, i);
      if (tag.href) hrefs.push({ target: tag.href.target, at: from + tag.href.at });
      end = tag.end;
      if (end !== -1 && c !== '/' && elements.start(from + i)) {
        const close = elements.end(from + end, to);
        end = close === -1 ? -1 : close - from;
      }
    }
    if (end === -1) break;
    i = end;
  }
  return hrefs;
}

// Link targets on one prose line: inline [text](target), whose destination
// inlineDestinations reads, with spaces inside the parentheses, a
// reference definition [label]: target (footnotes [^1]: are not links),
// whose label may hold a code span or \], and the hrefs on the line that
// spans.hrefs() gives, those of the open tags that inlineDestinations reads
// as raw HTML and of those that a browser reads inside the comments,
// processing instructions, CDATA sections and declarations it reads so,
// but for those in the text of an element of RAW_TEXT_ENDS, which a
// browser reads as text.
// Links inside code spans are not read: inlineDestinations
// reads past each code span, and so past the tags inside it. A definition
// is matched on the whole line, as a code span in its label does not make
// it text, but not on a line that starts inside a code span or raw HTML
// that an earlier line of the paragraph opened. `open` carries what an
// earlier line of the paragraph left open: link text, as
// inlineDestinations reads it, and a code span or raw HTML. `spans`, which
// open.code gives for the line, reads the code spans and raw HTML of the
// paragraph's lines, as paragraphCodeSpans does, for inlineDestinations,
// which meets each run of backticks after the autolinks, raw HTML and link
// destinations that start before it. The targets are added one at a time:
// push(...targets) passes one argument per target, and on a line of
// 150,000 inline links that call threw a RangeError (Maximum call stack
// size exceeded).
function linkTargets(line, open, spans) {
  const targets = [];
  const def = spans.start === 0 && line.match(/^ {0,3}\[(?!\^)(?:[^\]\\]|\\.)+\]:\s*(?:<([^>\s]+)>|(\S+))/);
  if (def) targets.push(def[1] || def[2]);
  // One at a time: given as the arguments of one push(), the targets of a
  // line of 200,000 tags with an href threw a RangeError (Maximum call
  // stack size exceeded) on Node.js 26.12.0.
  for (const target of inlineDestinations(line, open, spans)) targets.push(target);
  for (const target of spans.hrefs()) targets.push(target);
  return targets;
}

// Link targets in the first `count` cells of a table row, `row` being its
// text from where it starts, the cells as rowCells() splits it. Each cell
// is read on its own, with no link text, code span or raw HTML open before
// it, as linkTargets reads a line; a cell holds no definition.
function rowTargets(row, count) {
  return rowCells(row)
    .slice(0, count)
    .flatMap((cell) => {
      const spans = paragraphCodeSpans([cell])();
      const targets = inlineDestinations(cell, noOpenLinkText(), spans);
      return [...targets, ...spans.hrefs()];
    });
}

// A line that ends a paragraph (a blank line, or a blank ">" line) and one
// that is a block of its own (a table row or a heading), as blocks() reads
// them.
const BLANK = /^[\s>]*$/;
const OWN_BLOCK = /^[\s>]*(?:\||#{1,6}\s)/;

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

// The cells of a table row: its text split at each | that no \ comes right
// before, without the empty cell before a leading | or after a trailing one.
function rowCells(row) {
  const text = row.trim();
  const parts = text.split(/(?<!\\)\|/);
  if (text.startsWith('|')) parts.shift();
  if (parts.length > 0 && text.endsWith('|') && !text.endsWith('\\|')) parts.pop();
  return parts;
}

// How many cells a table row holds, as rowCells() splits it. A function
// declaration and not a constant: parse() reads the README above this line,
// with blockReader(), which reads it.
function cellCount(row) {
  return rowCells(row).length;
}

// Whether a line that lineStart() read as `start`, after a line that
// `containers` hold, is the header row of a table: in GitHub-flavored
// Markdown a table starts at a line, whether or not it starts with |, where
// the next line (`next`, from the reader's lines) goes on with the block
// quotes and list items that hold the header row, opens none, and is then a
// delimiter row with as many cells, after at most 3 columns of indentation.
// The next line is read as one that goes on with a paragraph, so a line of -
// alone, of -- or of --- is a setext underline, as micromark 4 with its GFM
// table extension reads it (markdown-it 14.1.1 reads -- and --- under a
// header row of one cell as a delimiter row). A header row that holds a |
// starts a table in both. One that holds none, a row of one cell, starts a
// table in micromark 4 when the delimiter row holds a | or a :, and in
// markdown-it 14 never; the check reads it as micromark does when
// `pipeless` is true. Without a delimiter row, the line is paragraph text.
function tableHeader(start, containers, next, pipeless) {
  const { row } = start;
  if (row === undefined || next === undefined || !(pipeless || row.includes('|')) || !DELIMITER_CHARACTERS.test(next.line)) return false;
  // The block quotes and list items that hold the header row: `containers`
  // itself when the row goes on with them all and opens none, as
  // lineStart() does not change the list, and a copy otherwise. Copied for
  // each line that goes on with a paragraph lazily and holds a |, over a
  // line of delimiter characters, it took a step for each container on
  // each such line.
  const held = start.matched === containers.length && start.opened.length === 0 ? containers : [...containers.slice(0, start.matched), ...start.opened];
  const delimiter = lineStart(next.line, held, true);
  if (delimiter.matched < held.length || delimiter.opened.length > 0 || delimiter.row === undefined) return false;
  const cells = delimiter.row.trim();
  return DELIMITER_ROW.test(cells) && cellCount(cells) === cellCount(row) && (row.includes('|') || /[|:]/.test(cells));
}

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
// and then start one of the blocks listed above ATX_HEADING or a table row
// (|), each after at most 3 columns of indentation. On a line that goes on
// with every container below a paragraph, a setext underline ends that
// paragraph, and a list item ends it only when it holds text and, if
// ordered, starts at 1. An HTML block of kind 7 starts only on a line that
// does not go on with a paragraph, also lazily, as it cannot interrupt one.
// `stops` are the indices in `containers` of the block quotes and of the
// list items that hold nothing yet, in order: once the rest of a line is
// blank, it goes on with the containers before the next of them. A caller
// that does not keep them leaves them out, and they are then found by
// reading each of `containers`.
// Returns how many of `containers` the line goes on with, the containers it
// opens, and whether the rest of it is 'blank', 'code' (indented code), 'row'
// (text that starts with |, as a table row does), 'fence' (a code fence;
// `fence` is then its run of backticks or tildes, `bare` says whether only
// spaces and tabs follow it, and `quoted` whether the line goes on with or
// opens a block quote), 'block' (one of the other blocks; when it is an HTML
// block, `html` is its kind, 1 to 7) or 'text', which a paragraph holds. A
// 'row' comes with `row`, the text from its |, and so does a 'text' that is
// not indented 4 or more columns, the text from where it starts, as a table
// row need not start with |. Whether either is a table row or paragraph
// text is the caller's to read, as a table starts only at a header row that
// a delimiter row follows, which one line does not show.
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
    // A fence interrupts a paragraph.
    const fence = matchAt(FENCE, text, j);
    if (fence) return { matched, opened, rest: 'fence', fence: fence[0], bare: /^[ \t]*$/.test(text.slice(j + fence[0].length)), quoted };
    if (
      matchAt(ATX_HEADING, text, j) ||
      (interrupts && matchAt(SETEXT_UNDERLINE, text, j)) ||
      (j >= breakFrom && matchAt(THEMATIC_BREAK, text, j))
    ) {
      return { matched, opened, rest: 'block' };
    }
    const html = matchAt(HTML_BLOCK_START, text, j);
    if (html) return { matched, opened, rest: 'block', html: [1, 2, 3, 4].find((k) => html[k] !== undefined) ?? 6 };
    if (matchAt(CDATA_START, text, j)) return { matched, opened, rest: 'block', html: 5 };
    // A block of kind 7 cannot interrupt a paragraph, so it starts on no
    // line that goes on with the paragraph above, lazily or not: only on a
    // line whose line above is no paragraph text, or that opens a block
    // quote or list item first.
    if (!(paragraph && opened.length === 0) && htmlBlock7At(text, j)) return { matched, opened, rest: 'block', html: 7 };
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

// Whether a line that lineStart() reads as `start`, and that goes on with
// the block quotes and list items that hold a fenced code block, closes the
// block that the fence `open` opened: with a fence of the same character, at
// least as long, with only spaces and tabs after it.
function closes(start, open) {
  return start.rest === 'fence' && start.opened.length === 0 && start.bare && start.fence[0] === open[0] && start.fence.length >= open.length;
}

// The text of a line after its first `quotes` > markers. Before its text, a
// line that goes on with block quotes and list items holds only their >
// markers, spaces and tabs, and one that opens them their > markers, list
// markers, spaces and tabs, so the markers of the first `quotes` block
// quotes among them end at the `quotes`th >.
function afterQuotes(line, quotes) {
  let k = 0;
  for (let q = 0; q < quotes; q++) k = line.indexOf('>', k) + 1;
  return line.slice(k);
}

// Reads where the blocks of one page start, as lineStart() reads each line
// with the block quotes and list items that the lines above it leave open.
// The reader is made with the page's lines and then called with each of
// them in order, tagged as parse() tags them, and with how lineStart()
// reads the line when the caller has read it so; `start(line)` reads the
// next line so without reading it into the reader. restOf() below reads
// whether a line is a table row, as linkReader() describes. A line inside a
// fenced code block that parse() tags starts no block, and the line that
// closes one goes on with the containers that hold it. A fence that parse()
// does not tag, one inside a block quote, opens a block that the reader
// follows to the fence that closes it, or to the first line that does not
// go on with the block quotes and list items that hold it, as a fenced code
// block takes no line lazily. The reader also follows an HTML block, of
// kind 1 to 7, from a line outside one that lineStart() reads as its first
// line: to the line before the first line that does not go on with the
// block quotes and list items that hold it, as an HTML block takes no line
// lazily; a block of kind 6 or 7 also to the line before the first line
// that is blank after their markers, and one of kind 1 to 5 to the first
// line that holds its end, as HTML_BLOCK_END gives it. The lines of such a
// block are read as any other line is, so lineStart() may read one as
// indented code, but a fence on one opens no fenced code block: the reader
// reads it as a block of its own, as its text is raw HTML. Nor does a > or
// a list marker open a block quote or list item on a line of the block
// after its first, so the line after the block is read with the block
// quotes and list items that held the block, and a line after the blank
// line that ends a block that <div> opens, indented 4 or more columns past
// them, is indented code.
// Nor is a line of the block paragraph text, so no line goes on with it
// lazily: the line after it starts a block, and when that line does not go
// on with the list items that hold the block, they end there.
// `inHtml(line, start)` says whether a line that lineStart() reads as
// `start` is a line of the HTML block that the line above is in, for
// parse(), which opens no fence there either. The reader returns null for
// a line that parse() tags as inside a fenced code block, and for each line
// after the opening fence of a fenced code block that the reader follows,
// its closing fence included. For any
// other line it returns `rest`, the rest of the line as lineStart() reads
// it, with a 'row' or 'text' read as 'row' when it is a table row, as
// 'paragraph' when it is a lazy line that starts a paragraph, as restOf()
// reads it, and as 'text' otherwise, and a fence that parse() tags, or one
// on a line of an HTML block, read as 'block'; `starts`, whether the line
// starts a block rather than going on with the paragraph above; `html`,
// whether the line is a line of an HTML block that the reader follows,
// whose text is raw HTML; `j`, its index in the lines; and for a table row,
// `row`, its text from where it starts, and `columns`, how many cells the
// header row of its table holds. Given a set as `quotedFences`, the reader
// adds to it the index in `lines` of each line of a fenced code block that
// it follows, its fences included. Given a map as `htmlLines`, the reader
// sets in it the index in `lines` of each line of an HTML block that it
// follows to that block: one object for all the lines of the block, whose
// `quotes` is how many block quotes hold it. The reader's `containers` and
// `restOf` are those it reads the next line with, for a caller that reads
// the lines after it ahead.
function blockReader(lines, quotedFences, htmlLines) {
  // The containers open after the line above and their stops, as
  // lineStart() takes them.
  const containers = [];
  let stops = [];
  let paragraph = false;
  let table = false; // whether the line read last was a table row
  let columns = 0; // how many cells the header row of that row's table holds
  // The opening fence of the fenced code block inside a block quote that
  // the line above is in, or null.
  let fenced = null;
  // The HTML block that the line above is in, or null: its kind, as
  // lineStart() gives it, how many of `containers` hold it, and how many of
  // those are block quotes.
  let htmlBlock = null;
  // Whether `line`, which lineStart() reads as `start`, is a line of that
  // HTML block: it goes on with the containers that hold the block, as an
  // HTML block takes no line lazily, and, in a block of kind 6 or 7, is not
  // blank after their markers.
  const inHtml = (line, start) =>
    htmlBlock !== null &&
    start.matched >= htmlBlock.depth &&
    !(endsAtBlank(htmlBlock.kind) && /^[ \t]*\r?$/.test(afterQuotes(line, htmlBlock.quotes)));
  let next = 0; // the index in lines of the line read next
  // The rest of lines[k] as the reader reads it, lineStart() having read the
  // line as `start` after a line that `containers` hold, which is paragraph
  // text when `paragraphAbove` is true and a table row when `rowAbove` is. A
  // 'row' or 'text' is a table row when the line above is one and the line
  // goes on with every container and opens none, or when it is a table's
  // header row as tableHeader() reads it, which reads one that holds no |
  // as micromark 4 does unless the line follows a table row: micromark
  // starts no table at a line that follows one and leaves the block quotes
  // or list items that hold it, and markdown-it 14 none at such a header
  // row. A line that goes on with the paragraph above lazily, without the
  // list item indentation of some of `containers`, and holds a | ends the
  // paragraph when its delimiter row is one in all of them, as markdown-it
  // 14 reads it, and the list items it left out end with the paragraph. It
  // is then a header row when its delimiter row is one in the containers it
  // goes on with too, which hold its table, and otherwise, when the
  // delimiter row is indented 4 or more columns past them, the first line
  // of a paragraph there, 'paragraph', as markdown-it 14 reads it. A lazy
  // line that holds no |, or leaves out a block quote marker, is text, as
  // markdown-it 14 reads it; after a line of paragraph text, `stops` holds
  // the block quotes of `containers` and no list item, so the last of them
  // says whether the line leaves one out, without a step for each
  // container. A 'row' is text otherwise.
  const restOf = (k, start, paragraphAbove, rowAbove) => {
    if (start.rest !== 'row' && start.rest !== 'text') return start.rest;
    const opensNone = start.opened.length === 0;
    if (rowAbove && opensNone && start.matched === containers.length) return 'row';
    const next = lines[k + 1];
    if (!(paragraphAbove && opensNone && start.matched < containers.length)) return tableHeader(start, containers, next, !rowAbove) ? 'row' : 'text';
    if (stops.length > 0 && stops.at(-1) >= start.matched) return 'text';
    if (!tableHeader({ ...start, matched: containers.length }, containers, next, false)) return 'text';
    return tableHeader(start, containers, next, false) ? 'row' : 'paragraph';
  };
  const read = ({ line, inFence, fenceOpen, fenceClose }, given) => {
    const j = next++;
    if (inFence) {
      paragraph = false;
      table = false;
      htmlBlock = null;
      return null;
    }
    // A fence is a block, and the line that closes one goes on with the
    // containers that hold it.
    const start = fenceClose ? { matched: containers.length, opened: [] } : given ?? lineStart(line, containers, paragraph, stops);
    if (fenced) {
      // A line that goes on with the containers that hold the block is in
      // it, as is the fence that closes it: one of the same character, at
      // least as long, with only spaces and tabs after it. A line that does
      // not go on with them ends the block quote or list item that holds
      // the block, and so the block, as a fenced code block takes no line
      // lazily.
      if (start.matched === containers.length) {
        if (closes(start, fenced)) fenced = null;
        quotedFences?.add(j);
        return null;
      }
      fenced = null;
    }
    // Whether the line is a line of the HTML block that the line above is
    // in, as inHtml() reads it. A fence there is raw HTML too: the reader
    // reads it as a block of its own, which opens no fenced code block, as
    // parse() opens none there. In a block of kind 1 to 5, the line that
    // holds the block's end is its last.
    let html = inHtml(line, start);
    if (html) htmlLines?.set(j, htmlBlock);
    if (htmlBlock && (!html || (!endsAtBlank(htmlBlock.kind) && HTML_BLOCK_END[htmlBlock.kind].test(afterQuotes(line, htmlBlock.quotes))))) htmlBlock = null;
    const rest = fenceOpen || fenceClose || (html && start.rest === 'fence') ? 'block' : restOf(j, start, paragraph, table);
    // A row that no row comes before is a header row.
    if (rest === 'row' && !table) columns = cellCount(start.row);
    table = rest === 'row';
    const starts = !(paragraph && rest === 'text' && start.opened.length === 0);
    if (starts) {
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
      // A line of the HTML block that the line above is in is raw HTML, so
      // a > or a list marker on it opens no block quote or list item, as
      // CommonMark reads the whole line as HTML.
      if (!html) {
        for (const c of start.opened) {
          if (c.quote || c.empty) stops.push(containers.length);
          containers.push(c);
        }
      }
      // A line of an HTML block is no paragraph text, so no line goes on
      // with it lazily: a line after it that does not go on with the list
      // items that hold the block ends them.
      paragraph = !html && (rest === 'text' || rest === 'paragraph');
    }
    // Any other line that lineStart() reads as the first line of an HTML
    // block opens one, which the containers that hold the line hold. A block
    // of kind 1 to 5 whose end that line holds is that line alone.
    if (!html && start.html) {
      htmlBlock = { kind: start.html, depth: containers.length, quotes: containers.filter((c) => c.quote).length };
      html = true;
      htmlLines?.set(j, htmlBlock);
      if (!endsAtBlank(htmlBlock.kind) && HTML_BLOCK_END[htmlBlock.kind].test(afterQuotes(line, htmlBlock.quotes))) htmlBlock = null;
    }
    if (rest === 'fence') {
      fenced = start.fence;
      quotedFences?.add(j);
    }
    return rest === 'row' ? { j, rest, starts, html, row: start.row, columns } : { j, rest, starts, html };
  };
  read.start = (line) => lineStart(line, containers, paragraph, stops);
  read.inHtml = inHtml;
  read.containers = containers;
  read.restOf = restOf;
  return read;
}

// Reads the link targets on the lines of one page, as linkTargets reads
// them, with link text and code spans that wrap. The reader is made with the
// page's lines and then called with each of them in order. The [ a
// paragraph's line leaves open is carried to the next line when lineStart()
// reads that line as text that goes on with the paragraph, which a line may
// do lazily, without the block quote markers or list item indentation of
// the line above. So is a code span that a run of backticks opens and a run
// of as many on a later line of the paragraph closes, as CommonMark reads
// it, and raw HTML that ends on a later line of the paragraph, such as a
// tag whose quoted value holds the line break: on the first line of a
// paragraph the reader reads on, with lineStart(), to the paragraph's last
// line for those runs and ends, and reads each line after the first from
// where its text starts, after the > markers and indentation that
// CommonMark leaves out of the paragraph's text. Any other line starts a
// block, and link text, a code span or raw HTML opened on one that is not
// paragraph text, such as a heading or a table row, is not carried. A table
// starts at a header row as tableHeader() reads it, one that holds no |
// only on a line that does not follow a table row or go on with a
// paragraph lazily. A line that goes on with a list item's paragraph
// lazily, without the item's indentation, and holds a | ends the paragraph
// when its delimiter row is in the list items that hold the paragraph, as
// markdown-it 14 reads it, and the list items the lazy line left out end
// too. It is then the header row of a table held by the block quotes and
// list items its own indentation goes on with, as markdown-it 14 places
// it, after the list (micromark 4 holds it in the item), or, when the
// delimiter row is indented 4 or more columns past those, the first line
// of a paragraph that they hold, as markdown-it 14 reads it (micromark 4
// starts a table in the item). A line that goes on with a paragraph
// lazily without a block quote marker of the line above is paragraph
// text, as markdown-it 14 reads it: no table starts at it, whatever the
// next line (micromark 4 starts one in the block quote). A table goes on
// with each line after its header row that goes on with the block quotes
// and list items that hold the table, opens none, and is not blank,
// indented code or another block; each of these lines is a table row,
// whether or not it starts with |. The cells of a row are read one at a
// time, as both renderers read them, so link text and code spans do not
// run on from one cell to the next, a row holds no definition, and the
// cells of a row past the number of cells of the table's header row, which
// neither renderer shows, are not read. Any other line whose text starts
// with | is text, which link text and code spans wrap past as past any
// other line of their paragraph. No line of a fenced code block has links,
// its fences included, and a fence ends a paragraph. parse() reads the
// fences that start a line at most 3 columns past where the text of the
// list items that hold it starts, and those where the text of a list item
// that a line opens starts, outside a block quote; a fence inside a block
// quote, which lineStart() reads, opens a block that blockReader() follows
// to the fence that closes it or to the end of the block quote or list item
// that holds it, and no line of that block, its opening fence included, has
// links. No fence opens a block on a line of an HTML block that
// blockReader() follows: the links on such a line, and on the lines after
// it in that block, are read as on the other lines of the block. A line
// that lineStart() reads as indented code, a table row above
// it or not, has no inline links or definitions, as its text is shown as
// written. lineStart() does not track HTML blocks, and such a line may be
// inside one instead: there it is raw HTML, whose inline links and
// definitions are text as well, but whose hrefs are links. So the hrefs on
// such a line are read. On a line that blockReader() reads as a line of an
// HTML block, the line that opens it included, only the hrefs are read,
// whatever lineStart() reads it as, as its inline links, definitions and
// table cells are raw HTML too, and link text that opens on it holds no
// link on a later line. A backtick in raw HTML is text, so those hrefs are
// read on the whole line, and the line holds no paragraph text, so no code
// span runs on from it to a later line. Given a set as `codeLines`, the
// reader adds to it the index in `lines` of each line of a fenced code block
// inside a block quote, its fences included, and of each line of indented
// code on which it reads no inline link or definition, unless blockReader()
// reads that line as a line of an HTML block: its text is then raw HTML, not
// code. Given a map as `outside`, the reader sets in it, for the index in
// `lines` of each line other than a table row that it reads inline links
// on, where the line outside the code spans that run on to it from an
// earlier line of its paragraph or from it on to a later one starts and
// ends, as a [start, end) pair, followed by the index in `lines` of the
// line that starts the block, such as a paragraph, that the line is a line
// of. Given a map as `htmlLines`, blockReader() sets in it the lines
// of each HTML block, as it describes.
const noOpenLinkText = () => ({ brackets: [], aroundLink: 0 });
function linkReader(lines, codeLines, outside, htmlLines) {
  let open = noOpenLinkText();
  let first = 0; // the index in `lines` of the line that starts the block read last
  const read = blockReader(lines, codeLines, htmlLines);
  // Where the text of lines[k] starts when it is text that goes on with the
  // paragraph that the reader's `containers` hold, as the reader reads it
  // below, and -1 when it is not: past the > markers of the block quotes of
  // `containers` that it goes on with, and the spaces and tabs after them.
  // The line above it is text of that paragraph, so it is not a table row.
  const textStart = (k) => {
    const { line, inFence, fenceOpen, fenceClose } = lines[k];
    if (inFence || fenceOpen || fenceClose) return -1;
    const start = lineStart(line, read.containers, true);
    if (read.restOf(k, start, true, false) !== 'text' || start.opened.length > 0) return -1;
    let quotes = 0;
    for (let c = 0; c < start.matched; c++) if (read.containers[c].quote) quotes++;
    const text = afterQuotes(line, quotes);
    return line.length - text.length + text.match(/^[ \t]*/)[0].length;
  };
  return (l) => {
    const block = read(l);
    if (block === null) return [];
    const { j, rest, starts, html } = block;
    // A line of an HTML block starts no paragraph, so the code spans and raw
    // HTML read on it are those of the line alone.
    const paragraph = !html && (rest === 'text' || rest === 'paragraph');
    if (starts) {
      open = noOpenLinkText();
      first = j;
      // The code spans and raw HTML of the block: those of a paragraph may
      // run on to the lines that go on with it, and those of any other
      // block are read on its line alone.
      const texts = [0];
      if (paragraph) for (let at; j + texts.length < lines.length && (at = textStart(j + texts.length)) !== -1; ) texts.push(at);
      open.code = paragraphCodeSpans(lines.slice(j, j + texts.length).map(({ line }) => line), texts);
    }
    // A fence holds no link, whether parse() tags it or not: what follows the
    // run of an opening fence is an info string, not text, and a line that
    // parse() reads as a closing fence and that holds more than spaces and
    // tabs after its run closes no block as CommonMark reads it, so it is
    // code.
    if (rest === 'fence' || l.fenceOpen || l.fenceClose) return [];
    if (rest === 'code') {
      if (!html) codeLines?.add(j);
      return hrefTargets(html ? l.line : withoutCodeSpans(l.line));
    }
    // The cells of a table row of an HTML block are raw HTML as well.
    if (rest === 'row') return html ? hrefTargets(l.line) : rowTargets(block.row, block.columns);
    const spans = open.code();
    // A line of an HTML block is raw HTML, whatever lineStart() reads it
    // as: its inline links and definitions are text, link text that opens
    // on it holds no link on a later line, and only its hrefs are links. A
    // backtick in it is text, so they are read on the whole line. It is no
    // paragraph text, and the line after it starts a block, so no code span
    // or raw HTML runs on from it to the lines after the block.
    const targets = linkTargets(l.line, html ? noOpenLinkText() : open, spans);
    outside?.set(j, [spans.from, spans.to, first]);
    if (html) return hrefTargets(l.line);
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
  // statements, compared above. Every copy of the table is checked. Its rows
  // are read below the "## What Gets Tested" H2 up to the next H2, each as
  // isH2() reads one: a ## line of a fenced code block or of an HTML block
  // neither starts nor ends the section. A row is a line there
  // that starts with |, other than one whose first cell starts with - or :-,
  // as a delimiter row's does; a line of a fenced code block or of an HTML
  // block, as parse() tags them, is none, as its text is code or raw HTML.
  const tables = [];
  for (const { prefix, lines } of documents) {
    const start = lines.findIndex((l) => isH2(l) && /^##\s+What Gets Tested\s*$/.test(l.line));
    const rows = [];
    for (let i = start + 1; start >= 0 && i < lines.length && !isH2(lines[i]); i++) {
      const { n, line, inFence, html } = lines[i];
      if (inFence || html || !line.startsWith('|') || /^\|\s*:?-/.test(line)) continue;
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

  // The README's MITRE ATLAS Coverage section, from its H2 up to the next H2,
  // each as isH2() reads one, so a ## line of a fenced code block or of an
  // HTML block neither starts nor ends it, and the .md pages it links to.
  const start = readme.findIndex((l) => isH2(l) && /^##\s+MITRE ATLAS Coverage\s*$/.test(l.line));
  if (start < 0) return;
  let end = start + 1;
  while (end < readme.length && !isH2(readme[end])) end++;
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
// sit in a blockquote, or in an HTML block of kind 1 to 7, such as one that
// <div> or <details open> opens, or <span> alone on a line, also on a line
// there that is indented 4 or more columns or that follows a line of 3 or
// more backticks or tildes, which opens no code block there, and between
// backticks there, which open no inline code, as the text of an HTML block
// is raw HTML; text in a code block or inline code is not the note. Nor, in
// an HTML block, is text inside a comment, a processing instruction, a
// declaration, a CDATA section, or a <script>, <style> or HTML <title>
// element, as shownHtml() finds them, as none of these holds text for the
// reader, nor
// the text of a tag, such as the quoted value of an attribute, also one
// that runs on to a later line of the block, as a browser shows no part of
// a tag: the line
// <div title="As of 2026-06-03.">x</div> holds no note, and the words on
// either side of a tag, or of a line break inside one, are read as one
// word when no space parts them, as <div>A<span class="x">s of</span> is
// read as "As of", but for a <br> or a start tag or an end tag of a block,
// a list item or a table cell, such as <p>, <li> or <td> (BREAK_TAGS),
// which parts them, as a browser shows the words on either side on lines
// or in cells of their own: <p>Report</p><p>As of 2026-06-03.</p> holds
// the note. A block that one of the others opens, such as
// <!-- As of 2026-06-03. -->, holds the note only after the end of it,
// which a browser may meet before the end at which CommonMark ends the
// block: it ends a comment at the first --> or --!> after its <!--, but not
// at a --!> that takes its dashes from the <!--, so
// <div><!-- x --!> As of 2026-06-03.</div> holds the note and
// <div><!--!> As of 2026-06-03. --></div> holds none, and what <? or
// <![CDATA[ opens at the first > after it, so
// <div><?x> As of 2026-06-03.</div> and
// <div><![CDATA[ x > As of 2026-06-03. ]]></div> hold the note. None of
// these starts inside a <textarea>
// element, whose text, escapable raw text, a browser shows as written, so
// the line <textarea><!-- As of 2026-06-03. --></textarea> holds the note,
// and <textarea>As <b>of</b> 2026-06-03.</textarea> holds none. A browser
// ends that element at an end tag with an attribute too, so
// <textarea></textarea title="As of 2026-06-03."> holds no note, and it
// ends a <script> or <style> element at an end tag with white space or a /
// after its name, so <div><script>x</script >As of 2026-06-03.</div> holds
// the note. It reads the start tag of a <script> or <style>, also
// <script/>, on to its >, so
// <div><script title="</script>">As of 2026-06-03.</div> holds no note,
// and it ends a <script> only at a </script> that its tokenizer does not
// read in the script data double escaped state, as readScript() reads the
// element's text, so
// <div><script><!-- <script></script> --> As of 2026-06-03.</div> holds
// none. A comment, <script>, <style> or <title> that an HTML block leaves
// open stays open after the block, up to its end in later raw HTML, so the
// paragraph As of 2026-06-03. after the lines <div> and <!-- x and a blank
// line holds no note. Nor, in a paragraph, a heading or a cell of a table
// row, where the target of an autolink is text, as a browser shows it as
// the link's, is text inside a comment, a processing instruction, a
// declaration or a CDATA section, as shownInline() finds them, such as
// <!-- As of 2026-06-03. --> after a word, also one that runs on from one
// line of a paragraph to a later one, up to where a browser ends it, as in
// an HTML block, after which a browser reads the rest of it as raw HTML,
// so Hello <?x> As of 2026-06-03. ?> and
// Hello <![CDATA[ x > As of 2026-06-03. ]]> world. hold the note, nor the
// text of an
// open tag or a closing tag, such as <span title="As of 2026-06-03.">, as
// in an HTML block, also one that runs on from one line of a paragraph to
// a later one, as CommonMark reads a line break inside a tag, but for one
// between a <textarea> start tag and its end tag on the same line, as a
// browser shows it as the element's text. That end tag may sit inside one
// of these, as in x <textarea><!-- </textarea><!-- As of 2026-06-03. -->,
// where a browser ends the element at it and reads the second <!-- as the
// start of a comment that hides the note, as shownHtml() reads the line in
// an HTML block; what the raw HTML after that end tag leaves open, such as
// the quoted value of an attribute of that tag, hides the rest of the
// paragraph, heading or cell, but a comment, <script>, <style> or <title>
// hides the text after it up to its end inside later raw HTML, on its
// line, on a line below or in a later block, as a browser keeps it open
// past the end of the paragraph, so x </script> As of 2026-06-03. on the
// line below x <textarea><!-- </textarea><script> --> holds the note, and
// the paragraph As of 2026-06-03. after the blank line below that line
// holds none. A <script>, <style> or <title> start tag in a paragraph, a
// heading or a cell opens such an element too, so the lines
// Hello <script> As of 2026-06-03. and Hello <title> As of 2026-06-03.
// hold no note. A <title> start tag that shownElements() reads in an <svg>
// or <math> element, outside the elements of INTEGRATION_POINTS there,
// opens none, as a browser reads it as the start of an SVG or MathML
// element, so <svg><title>x</title></svg> As of 2026-06-03. holds the
// note. Nor, wherever
// it sits, is text that a browser hides until the reader opens the element
// that holds it: the text of a <details> element without the open
// attribute, but for that of its first <summary>, and of a <dialog>
// element without that attribute, as shownElements() follows them over the
// lines and blocks of the page, so
// <details><summary>Report</summary>As of 2026-06-03.</details> holds no
// note, nor is text in an <svg> or <math> element outside the elements in
// which a browser shows text, as shownElements() follows these too, so
// <svg>As of 2026-06-03.</svg> holds no note, and
// <svg><text>As of 2026-06-03.</text></svg> holds it. The page's first H2
// is found as check 2 finds the README's: a ##
// line of a fenced code block or of an HTML block is none.

// The raw HTML that shownHtml() leaves out of the text of an HTML block,
// each matched in any case: a <script> or a <style> element, from <script
// or <style before white space, a /, a > or the end of the line, a
// comment, from <!--, a processing instruction, from <?, a CDATA section,
// from <![CDATA[, a declaration, from <! and a letter, and, with its last
// two groups, a tag: a <textarea> start tag, from <textarea and white
// space, a /, a > or the end of the line, and any other tag, from < or </
// and a letter. shownHtml() reads a tag on to its end (tagEnd()), so that
// a <!-- or a <textarea inside the quoted value of an attribute starts
// nothing, and shows no part of it, such as that value; it reads the start
// tag of a <script>, <style> or <textarea> element so too, and the
// element's text from the end of that tag. The text of a <textarea>
// element it shows: it is escapable raw text, which runs from the end of
// the start tag to the start of its end tag, and in which the start of
// each of the others is literal text. That end tag starts with </textarea
// before white space, a /, a > or the end of the line (TEXTAREA_END), as a
// browser ends the element there, also at an end tag with an attribute,
// such as </textarea title="x">, and shownHtml() reads the rest of it as it
// reads any other tag. Each group of HIDDEN_HTML_START before the
// <textarea> group (TEXTAREA_GROUP) matches one of the others, and the
// entry of HIDDEN_HTML_END with its number is what ends it: for a <script>
// or <style> element, the start of its end tag, </script or </style before
// white space, a /, a > or the end of the line, as a browser ends the
// element there as it ends a <textarea>, also at </script > or
// </style title="x">, the rest of which shownHtml() reads as a tag too
// (END_TAG_STARTS), and for a <script> the first such </script that
// readScript() reads as its end; for a comment, --> or --!>, as a browser
// ends one at either, but not a --!> that takes its dashes from the <!--
// of the comment; for a processing instruction and a CDATA section, >, as
// a browser reads <? as the start of a bogus comment, which ends at the
// first >, and <![CDATA[ too, but in the content of an <svg> or <math>
// element, where <![CDATA[, in that case only, opens a CDATA section that
// ends at ]]>: shownHtml() reads it so where the tracker that it is given
// says that such content is open (elements.foreign(), as shownElements()
// follows it), as text that a browser shows where the tracker says it
// shows text there (elements.showsForeignText()), such as in an SVG <text>
// element, up to CDATA_TEXT_END, and as text that a browser does not show
// elsewhere, such as in the <svg> element itself, up to
// CDATA_SECTION_END. A declaration ends at > too. So a comment, processing
// instruction, CDATA section or declaration that opens an HTML block
// (HTML_BLOCK_START, CDATA_START) ends at or before the first match of the
// end that HTML_BLOCK_END gives that block.
const HIDDEN_HTML_START =/(<script(?=[\t\n\f\r />]|$))|(<style(?=[\t\n\f\r />]|$))|(<!--)|(<\?)|(<!\[CDATA\[)|(<![a-z])|(<textarea(?:[\s/>]|$))|(<\/?[a-z])/gi;
const CDATA_GROUP = 5;
const CDATA_START_LENGTH = '<![CDATA['.length;
const CDATA_SECTION_END = /\]\]>/g;
const CDATA_TEXT_END = /\]\]>/g;
const TEXTAREA_GROUP = 7;
const HIDDEN_HTML_END = [null, SCRIPT_END, STYLE_END, /--!?>/g, />/g, />/g, />/g];
// A <title> start tag that a browser reads as HTML, as rawTextEnd() finds
// one, opens an element whose text, escapable raw text as in a <textarea>,
// a browser does not show, as the text of a <script> or <style> element:
// it runs from the end of that tag to the start of its end tag, </title
// before white space, a /, a > or the end of the line (TITLE_END), the rest
// of which shownHtml() reads as a tag too.
const TITLE_END = /<\/title(?=[\t\n\f\r />]|$)/gi;
const END_TAG_STARTS = new Set([HIDDEN_HTML_END[1], HIDDEN_HTML_END[2], TEXTAREA_END, TITLE_END]);
const COMMENT_END = HIDDEN_HTML_END[3];

// The states of a tag that tagEnd() reads, as the HTML tokenizer reads a
// tag: in its name, an attribute name or an unquoted value (IN_TAG), after
// the = of an attribute and the white space after it (AFTER_EQUALS), or in
// a value in double or in single quotes, '"' or "'", where a > is part of
// the value.
const IN_TAG = 'tag';
const AFTER_EQUALS = '=';

// Where the tag that `text` holds from text[i] on in state `state`, one of
// the states above, ends: returns the index after its > as `end`, or -1
// when the text ends first, with the state the tag is in there as `state`.
function tagEnd(text, i, state) {
  while (i < text.length) {
    if (state === '"' || state === "'") {
      const close = text.indexOf(state, i);
      if (close === -1) return { end: -1, state };
      i = close + 1;
      state = IN_TAG;
      continue;
    }
    const c = text[i++];
    if (c === '>') return { end: i, state: null };
    if (state === AFTER_EQUALS) {
      if (c === '"' || c === "'") state = c;
      else if (!/[\t\n\f\r ]/.test(c)) state = IN_TAG;
    } else if (c === '=') {
      state = AFTER_EQUALS;
    }
  }
  return { end: -1, state };
}

// The names of the elements that shownElements() follows: <details>,
// <summary> and <dialog>, for the text they hide, and <svg> and <math>,
// whose start tag opens foreign content (FOREIGN_ROOTS).
const FOREIGN_ROOTS = new Set(['svg', 'math']);
const TRACKED = new Set(['details', 'summary', 'dialog', ...FOREIGN_ROOTS]);

// What shownHtml() returns as `open` for a tag that a line leaves open: the
// state that tagEnd() reads it in, what the tag opens when it ends,
// TEXTAREA_END for a <textarea> start tag, what rawTextEnd() gives for
// another start tag that the tracker is given at its start, such as
// TITLE_END for <title>, or null, and, for a start tag or an end tag of one
// of TRACKED, or a tag in foreign content, `element`: its name, whether it
// is an end tag, and its text from its < to the end of the line, for the
// tracker that shownHtml() gives the tag to at its end, after which such a
// start tag opens what rawTextEnd() gives.
const inTag = (state, then, element = null) => ({ state, then, element });

// Whether shownHtml() shows the text of what `open`, which it returns,
// leaves open: a <textarea> element and a CDATA section in foreign content
// whose text a browser shows (CDATA_TEXT_END), as it shows no part of a
// tag.
const showsOpen = (open) => open === TEXTAREA_END || open === CDATA_TEXT_END;

// The elements that the rendering rules of the HTML standard show as a
// block, a list item, a table, or a caption, row or cell of a table, and
// <br>, a line break. A browser shows the words on either side of a start
// tag or an end tag of one of these apart, on lines or in cells of their
// own, and those on either side of any other tag, such as one of <span>,
// <b>, <a>, <img> and <wbr>, as one word when no space parts them. Not
// among them are <dialog>, which a browser shows as a block with the open
// attribute and does not show without it, so shownElements() reads that
// attribute to decide, and <html> and <body>, of which a tag in the text of
// a page starts no element. A tag of one of these that a browser drops,
// such as a <td> outside a table or an end tag with no element to end, is
// read as a break too.
const BREAK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'caption', 'center', 'dd', 'details', 'dir', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr',
  'legend', 'li', 'listing', 'main', 'menu', 'nav', 'ol', 'optgroup', 'option', 'p', 'plaintext', 'pre', 'search',
  'section', 'summary', 'table', 'td', 'th', 'tr', 'ul', 'xmp',
]);

// The name of the tag that starts at text[at] with < or </ and a letter, up
// to white space, a / or a >, as a browser reads it, in any case
// (TAG_NAME), which tagName() gives in lower case.
const TAG_NAME = /<\/?([a-z][^\t\n\f\r />]*)/iy;
const tagName = (text, at) => {
  TAG_NAME.lastIndex = at;
  return TAG_NAME.exec(text)?.[1].toLowerCase();
};

// An attribute of a start tag as a browser reads one after the tag's name
// or the attribute before it: the white space and the / before it, its
// name, in group 1, which runs to white space, a / or a >, or to an = after
// its first character, and the white space, the = and the value after the
// name, in double or single quotes or up to white space or a >. At the >
// that ends the tag it matches nothing.
const ATTRIBUTE = /[\t\n\f\r /]*([^\t\n\f\r />][^\t\n\f\r />=]*)[\t\n\f\r ]*(?:=[\t\n\f\r ]*(?:"[^"]*"|'[^']*'|[^\t\n\f\r >]*))?/y;

// Whether `tag`, a start tag from its < to its >, has an attribute whose
// name, which a browser reads in any case, `name` matches: <details open>
// and <details OPEN=""> have the open attribute (OPEN), also with a line
// break before open, and <details title="open"> does not.
const OPEN = /^open$/i;
const hasAttribute = (tag, name) => {
  TAG_NAME.lastIndex = 0;
  ATTRIBUTE.lastIndex = TAG_NAME.exec(tag)[0].length;
  for (let attribute; (attribute = ATTRIBUTE.exec(tag)); ) if (name.test(attribute[1])) return true;
  return false;
};

// Whether `tag`, a start tag from its < to its >, is self-closing: a / is
// right before its >, after the tag's name or an attribute, as in <svg/>
// and <svg x="1" />, and not in <svg x=1/>, whose value is 1/, or in
// <svg/ >. A browser ends an <svg> or <math> element, and an element in
// foreign content, at a start tag of it that is self-closing.
const selfClosing = (tag) => {
  TAG_NAME.lastIndex = 0;
  let after = TAG_NAME.exec(tag)[0].length;
  ATTRIBUTE.lastIndex = after;
  while (ATTRIBUTE.exec(tag)) after = ATTRIBUTE.lastIndex;
  return tag.slice(after).endsWith('/>');
};

// The start tags that end foreign content, as the HTML standard reads a
// start tag in it outside an element of INTEGRATION_POINTS: a browser ends
// the elements open in it, the <svg> or <math> element that opens it
// included, and reads the tag as HTML. So it does at a <font> start tag
// with a color, face or size attribute (FONT_BREAKS_OUT) and at the end
// tags </br> and </p>.
const BREAK_OUT = new Set([
  'b', 'big', 'blockquote', 'body', 'br', 'center', 'code', 'dd', 'div', 'dl', 'dt', 'em', 'embed', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'head', 'hr', 'i', 'img', 'li', 'listing', 'menu', 'meta', 'nobr', 'ol', 'p', 'pre', 'ruby', 's',
  'small', 'span', 'strong', 'strike', 'sub', 'sup', 'table', 'tt', 'u', 'ul', 'var',
]);
const FONT_BREAKS_OUT = /^(?:color|face|size)$/i;

// The elements of foreign content in which a browser reads a start tag as
// HTML, which then opens an HTML element inside that element: the HTML
// integration points <foreignObject>, <desc> and <title> of SVG, and
// <annotation-xml> of MathML with an encoding attribute of text/html or
// application/xhtml+xml, and the MathML text integration points <mi>, <mo>,
// <mn>, <ms> and <mtext>, in which <mglyph> and <malignmark> are not read
// so. shownElements() reads each of these names as one in any foreign
// content, and any start tag in one as HTML.
const INTEGRATION_POINTS = new Set(['foreignobject', 'desc', 'title', 'annotation-xml', 'mi', 'mo', 'mn', 'ms', 'mtext']);

// The elements of foreign content in which a browser shows text, the text
// of a CDATA section too: an SVG <text> element, also through the <tspan>,
// <textPath> and <a> elements in it (TEXT_CHILDREN), a <foreignObject>
// element, and the MathML token elements <mi>, <mo>, <mn>, <ms> and
// <mtext>. It shows none directly in an <svg> or <math> element, nor in
// <desc>, <title> or <annotation-xml>, nor in a <tspan>, <textPath> or <a>
// element that no <text> element holds.
const SHOWS_TEXT = new Set(['text', 'foreignobject', 'mi', 'mo', 'mn', 'ms', 'mtext']);
const TEXT_CHILDREN = new Set(['tspan', 'textpath', 'a']);

// Follows the <details>, <summary> and <dialog> elements of a dated page's
// intro, for the text a browser hides until the reader opens the element
// that holds it: a <details> element without the open attribute shows only
// its first <summary>, which the reader clicks to see the rest, and a
// <dialog> element without it shows nothing. The tracker is given each
// start tag and end tag that the intro shows to a browser, in order, as
// tag(name, end, text): the tag's name in lower case, whether it is an end
// tag, and, for a start tag of <details>, <dialog>, <svg> or <math> and a
// start tag in foreign content, the tag from its < to its >. A start tag of
// <details>, <summary> or <dialog> opens an element, and an end tag ends the
// element of its name that was opened last and is not ended, with those
// opened after it, or none when there is none, as a browser nests them in
// the HTML that a renderer makes of the page, over its lines and blocks: a
// <details> start tag in one HTML block, a paragraph and a </details> end
// tag in a later block hold the paragraph in the element. The first
// <summary> of a <details> element is the first
// <summary> start tag given while that element is the last of these opened
// and not ended. Other elements are not followed, so a <summary> that a
// <div> in the <details> holds is read as its summary too, and an element
// that a browser ends with an element that holds it, such as a <details>
// in a <div> at the </div>, stays open to the tracker. A cell of a table
// row is read with the tracker that cell() makes: an end tag there ends
// only an element opened in the cell, and those elements end with the
// cell, as a browser ends them at the end of the cell and ends no element
// outside it from there. hidden() says whether a browser hides the text
// after the tags given so far: it does while a <details> without the open
// attribute is open, but in the text of its first <summary>, and while a
// <dialog> without that attribute is open, and in a cell also while the
// tracker that made the cell's hides the text. tag() returns a space when
// the tag parts the words on either side of it and a browser shows the
// text on one side of it at least, and '' otherwise: a start tag or an end
// tag of one of BREAK_TAGS, such as <details> or <summary>, parts them, and
// so do a start tag of <dialog> with the open attribute and the end tag
// that ends such an element, but no other tag of <dialog>.
//
// The tracker also follows foreign content, in which shownHtml() reads a
// <![CDATA[ as the start of a CDATA section that ends at ]]>: foreign()
// says whether it is open. An <svg> or <math> start tag that is not
// self-closing (selfClosing()) opens it, and the tracker keeps the name of
// that element and of each element that a start tag in it, not
// self-closing, opens there, as a browser opens one. An end tag ends the
// element of its name opened last there, with those opened after it, so
// </svg> ends the <svg> element that opened it, and one of a name that no
// element open there has ends foreign content, the elements open in it
// included, but for </svg> and </math>, which a browser then ignores, as
// no HTML element has either name; so do a start tag of BREAK_OUT, a <font> start tag with a
// color, face or size attribute, and any start tag in an element of
// INTEGRATION_POINTS but <svg> or <math>, which then opens foreign content
// again, as above, and endForeign(). A browser ends foreign content at
// such an end tag only where an element of that name holds it, such as a
// </div> after a <div> that holds the <svg> element, and keeps it open in
// an element of INTEGRATION_POINTS, in which it reads the start tag as
// HTML, so after the end of that HTML element it reads a <![CDATA[ as the
// start of a CDATA section and the tracker does not. showsForeignText()
// says whether a browser shows text where foreign content is now: in an
// element of SHOWS_TEXT opened last, or in an element of TEXT_CHILDREN
// that a <text> element holds through more of these. Where it does not,
// such as directly in an <svg> element, hidden() says that a browser hides
// the text after the tags given so far, as a browser reads the characters
// there as it reads the text of a CDATA section there. A cell starts
// outside foreign content. The tracker counts the elements open of each
// name, in foreign content too, so an end tag that ends no element reads
// no name, and keeps for each element open in foreign content whether it
// is a <text> element or one of TEXT_CHILDREN that a <text> element holds
// through more of these, so showsForeignText() reads only the element
// opened last. Each element is opened once and ended at most once, and an
// end tag reads only the names of the elements it ends, so the time the
// tracker takes grows in proportion to the number of tags it is given and
// the length of the start tags among them whose attributes it reads.
function shownElements(outer = null) {
  const elements = []; // the elements open, the one opened last at the end
  const counts = new Map(); // element name -> how many of `elements` have it
  let hiding = 0; // how many of `elements` hide the text after them
  const inForeign = []; // the names of the elements open in foreign content, the <svg> or <math> element that opened it first
  const foreignCounts = new Map(); // element name -> how many of `inForeign` have it
  const inText = []; // for each of `inForeign`, whether it is a <text> element or one of TEXT_CHILDREN that a <text> element holds
  const foreign = () => inForeign.length > 0;
  const showsForeignText = () => SHOWS_TEXT.has(inForeign.at(-1)) || inText.at(-1) === true;
  const hidden = () => hiding > 0 || (foreign() && !showsForeignText()) || (outer !== null && outer.hidden());
  const open = (element) => {
    elements.push(element);
    counts.set(element.name, (counts.get(element.name) ?? 0) + 1);
    if (element.hides) hiding += 1;
  };
  // Ends the element opened last. The <details> whose first <summary> it
  // is hides the text after it again.
  const end = () => {
    const element = elements.pop();
    counts.set(element.name, counts.get(element.name) - 1);
    if (element.hides) hiding -= 1;
    if (element.of) {
      element.of.hides = true;
      hiding += 1;
    }
    return element;
  };
  // Ends the element opened last in foreign content and returns its name.
  const endInForeign = () => {
    const name = inForeign.pop();
    inText.pop();
    foreignCounts.set(name, foreignCounts.get(name) - 1);
    return name;
  };
  const endForeign = () => {
    while (foreign()) endInForeign();
  };
  // Follows foreign content over the tag, as described above.
  const followForeign = (name, isEnd, text) => {
    if (isEnd) {
      if (foreignCounts.get(name) > 0) {
        let ended;
        do ended = endInForeign();
        while (ended !== name);
      } else if (!FOREIGN_ROOTS.has(name)) {
        endForeign();
      }
      return;
    }
    const top = inForeign.at(-1);
    if (top !== undefined && (INTEGRATION_POINTS.has(top) || BREAK_OUT.has(name) || (name === 'font' && hasAttribute(text, FONT_BREAKS_OUT)))) {
      endForeign();
    }
    if ((foreign() || FOREIGN_ROOTS.has(name)) && !selfClosing(text)) {
      inText.push(name === 'text' || (TEXT_CHILDREN.has(name) && inText.at(-1) === true));
      inForeign.push(name);
      foreignCounts.set(name, (foreignCounts.get(name) ?? 0) + 1);
    }
  };
  const tag = (name, isEnd, text) => {
    const before = !hidden();
    let breaks = BREAK_TAGS.has(name);
    followForeign(name, isEnd, text);
    if (isEnd) {
      if (counts.get(name) > 0) {
        let element;
        do element = end();
        while (element.name !== name);
        if (name === 'dialog') breaks = element.opened;
      }
    } else if (name === 'details' || name === 'dialog') {
      const opened = hasAttribute(text, OPEN);
      if (name === 'dialog') breaks = opened;
      open({ name, opened, hides: !opened, summary: false });
    } else if (name === 'summary') {
      const details = elements.at(-1);
      let of = null;
      if (details?.name === 'details' && !details.summary) {
        details.summary = true;
        // While its first <summary> is open, a <details> hides nothing.
        if (details.hides) {
          details.hides = false;
          hiding -= 1;
          of = details;
        }
      }
      open({ name, hides: false, of });
    }
    return breaks && (before || !hidden()) ? ' ' : '';
  };
  return { hidden, tag, foreign, showsForeignText, endForeign, cell: () => shownElements({ hidden }) };
}

// The parts of the text of one line of an HTML block that a browser shows:
// those outside the raw HTML that HIDDEN_HTML_START matches, and the text
// of a <textarea> element, given `open`, what the line above in the block
// leaves open: the entry of HIDDEN_HTML_END that ends a comment, processing
// instruction, CDATA section, declaration, <script> or <style> element,
// CDATA_SECTION_END for a CDATA section in foreign content, as
// elements.foreign() says where its <![CDATA[ starts, TEXTAREA_END for a
// <textarea> element, TITLE_END for an HTML <title> element, as
// rawTextEnd() finds its start tag, inTag() for a tag, the start tag
// of one of these elements included, or null, and, where `open` is
// SCRIPT_END, `escape`, the state of the tokenizer in the element's text,
// as readScript() takes it. The end of each is the first match of its
// entry after the < that starts it, as HIDDEN_HTML_END describes it, or
// for a tag the end that tagEnd() finds, on its line or on a later line of
// the block; the text of a <textarea>, <script>, <style> or <title>
// element starts at the end of its start tag and ends where its entry
// finds the start of its end tag (END_TAG_STARTS), for a <script> as
// readScript() reads that text, and the rest of that end tag is read as a
// tag. `elements`, a
// tracker that shownElements() makes, is given each tag, at its end when
// it is a start tag or an end tag of one of TRACKED or a tag in foreign
// content, as elements.foreign() says where the tag starts, and at its
// start otherwise, and a part that it says a browser hides is left out. Returns
// the text of those parts in order, with the space that the tracker
// returns for a tag in place of that tag, as `shown`, what the line leaves
// open, in the same form, or null, as `open`, and, where that is
// SCRIPT_END, the state of the tokenizer at the end of the line as
// `escape`, which is 0 otherwise. Each search for the start of raw HTML
// starts at most 9 characters before the end of the match before it, each
// search for an end is one of a searcher() of the line, and a tag is read
// once, and its name once more, so the time a line takes grows in
// proportion to its length and to what the tracker takes for its tags.
function shownHtml(text, open, elements, escape = 0) {
  let shown = '';
  const show = (part) => {
    if (!elements.hidden()) shown += part;
  };
  const find = searcher(text);
  let i = 0;
  let from = 0; // where the shown text that runs on to i starts
  let tagFrom = 0; // where the tag that runs on to i starts on the line
  let at = -1; // where the raw HTML that is open at i starts on the line
  for (;;) {
    if (open?.state) {
      const tag = tagEnd(text, i, open.state);
      const { element } = open;
      if (tag.end === -1) {
        return { shown, open: inTag(tag.state, open.then, element && { ...element, text: `${element.text}${text.slice(tagFrom)}\n` }), escape: 0 };
      }
      if (element) shown += elements.tag(element.name, element.end, element.text + text.slice(tagFrom, tag.end));
      i = from = tag.end;
      open = element && !element.end ? rawTextEnd(element.name, elements) : open.then;
      escape = 0;
      continue;
    }
    if (open) {
      let end;
      if (open === SCRIPT_END) {
        ({ end, state: escape } = readScript(find, i, text.length, escape));
      } else {
        end = find(open, i);
        // A --!> that takes its dashes from the <!-- that opens the comment
        // ends nothing, so <!--!> and <!---!> open one.
        while (end && open === COMMENT_END && at !== -1 && end[0].length === 4 && end.index < at + 4) end = find(open, end.index + 1);
      }
      if (!end) {
        if (showsOpen(open)) show(text.slice(from));
        return { shown, open, escape };
      }
      i = end.index + end[0].length;
      if (showsOpen(open)) show(text.slice(from, end.index));
      if (END_TAG_STARTS.has(open)) {
        open = inTag(IN_TAG, null);
        continue;
      }
      from = i;
    }
    HIDDEN_HTML_START.lastIndex = i;
    const start = HIDDEN_HTML_START.exec(text);
    if (!start) {
      show(text.slice(from));
      return { shown, open: null, escape: 0 };
    }
    show(text.slice(from, start.index));
    const group = start.findIndex((g, k) => k > 0 && g !== undefined);
    let element = null;
    let opens = null; // what the tag opens at its end, as rawTextEnd() says once the tracker is given it
    if (group > TEXTAREA_GROUP) {
      const name = tagName(text, start.index);
      const end = text[start.index + 1] === '/';
      if (TRACKED.has(name) || elements.foreign()) {
        element = { name, end, text: '' };
        tagFrom = start.index;
      } else {
        shown += elements.tag(name, end);
        if (!end) opens = rawTextEnd(name, elements);
      }
    }
    // In foreign content, <![CDATA[, in that case, opens a CDATA section,
    // which ends at ]]>, and whose text starts after the <![CDATA[.
    if (group === CDATA_GROUP && start[0] === '<![CDATA[' && elements.foreign()) {
      open = elements.showsForeignText() ? CDATA_TEXT_END : CDATA_SECTION_END;
      at = start.index;
      i = from = start.index + CDATA_START_LENGTH;
      continue;
    }
    // A <script>, <style>, <textarea> or <title> start tag is read on to its
    // end, and the element's text starts after it.
    if (group > 2 && group < TEXTAREA_GROUP) open = HIDDEN_HTML_END[group];
    else open = inTag(IN_TAG, group === TEXTAREA_GROUP ? TEXTAREA_END : group <= 2 ? HIDDEN_HTML_END[group] : opens, element);
    at = start.index;
    i = start.index + 1;
  }
}

// The ends of the raw HTML whose text shownInline() leaves out, as
// inlineHtml() gives them, where CommonMark ends a comment, a processing
// instruction, a CDATA section and a declaration, and so the piece of raw
// HTML that a renderer passes on as written; a browser may end a comment,
// a processing instruction or a CDATA section before it.
const UNSHOWN_ENDS = ['-->', '?>', ']]>', '>'];
const NO_ENDS = new Set();

// The indentation and block quote markers that start a line: a > and the
// up to 4 spaces or tabs after it, its optional space and the indentation
// of up to 3 before the next marker, are a marker when a > follows them, so
// the inner > of `>   > x` is one, and the > of `>     > x`, after 5, is text.
const QUOTE_MARKERS = /^\s*(?:>[ \t]{0,4}(?=>))*>?[ \t]?/;

// The text of `line`, a line of a paragraph or a heading or a cell of a
// table row, that check 9 reads the note on: the line without its code
// spans, as outsideCodeSpans() finds them, and without each comment,
// processing instruction, CDATA section and declaration in it, as
// inlineHtml() reads them inline, up to where a browser ends it, as none
// of these holds text for the reader, nor each open tag and closing tag,
// as a browser shows no part of a tag, such as the quoted value of an
// attribute; an autolink is kept, as a browser shows its target as its
// text. The line is read from left to right, and whichever of a code span
// and an autolink or raw HTML starts first holds the other: a backtick
// inside an autolink or raw HTML, such as a comment or a tag, opens no
// code span, and a <!-- inside a code span opens no comment. A comment,
// processing instruction, CDATA section or declaration whose end the line
// does not hold runs on to the first line below that holds that end when
// `below`, the ends that the lines after this one in its paragraph hold,
// has it, as CommonMark reads raw HTML on past a line break in a
// paragraph. Otherwise its < is text. A renderer passes each of these on
// as written, so it is read from its <, on its line or, as below, on each
// line of a piece that runs on, as shownHtml() reads a line of an HTML
// block, which ends a comment at its first --> or --!> and a processing
// instruction or a CDATA section at its first >, where a browser ends
// them, before the end that CommonMark reads in some pieces; the rest of
// the piece after that
// is raw HTML, read as below for the rest of a piece after a </textarea>.
// So is the < of a tag whose > the line does not hold, but for a tag that
// runs on to a later line of the paragraph, as CommonMark reads a line
// break inside a tag. `paragraph`, given for a line of a paragraph or a
// heading, holds `text`, the lines of the paragraph as they are given
// here, each from its `start` on, joined by line breaks, `at`, where this
// line's text, from line[start] on, starts in it, `ends`, a map, one for
// the lines of the paragraph, of where the end of a comment, processing
// instruction, CDATA section or declaration that runs on was last found in
// `text`, or -1 where none was, and `link`, which returns the link syntax
// in `text`, as linkSyntax() finds it. A tag runs on when an open tag or
// a closing tag, as inlineTagEnd() reads one, starts there at the < and ends past the line:
// the rest of the line is left out, and { through, opens, escape } is
// returned as `open`: the index in paragraph.text after the tag's >, what
// the tag opens, TEXTAREA_END for a <textarea> start tag, what
// rawTextEnd() gives for a <script>, <style> or <title> start tag, or null,
// and 0. Given
// { through, opens, escape }, the line is read from where `through` falls
// on it, with `opens` open there in state `escape`; when `through` falls
// past the line, the line is left out whole and `open` is returned again.
// After a <textarea> start tag (TEXTAREA_START_TAG), also <textarea/>,
// which a browser reads as one, raw HTML, such as a comment or a tag, is
// text, as the element's text is escapable raw text, up to a </textarea>
// end tag on the line, which is left out, as it is a tag. A renderer
// passes raw HTML on as written, so that end tag may also sit inside what
// is read here as one piece of raw HTML: a comment, processing
// instruction, CDATA section or declaration, or the quoted value of an
// attribute of a tag. A browser ends the element at the first such end
// tag, also one with an attribute, such as </textarea title="x">, where
// TEXTAREA_END finds its start, as shownHtml() does on a line of an HTML
// block, and reads the rest of that tag and of that piece as raw HTML, so
// the rest is read as shownHtml() reads a line of an HTML block: a
// <textarea> that it opens and does not end is open after it, and when it
// leaves a tag, a processing instruction, CDATA section or declaration
// open, the rest of the line is left out, as no part of any of these is
// shown, and so are the lines after it in its paragraph, as a browser
// reads what is open on past the line: `open` is then
// { through, opens, escape } with the end of paragraph.text as `through`
// and null as `opens`, unless the paragraph ends on the line, and nothing
// is open after the paragraph. Raw HTML on those lines that a browser
// would read as the end of what is open is not looked for. A comment,
// <script> or <style> that the rest leaves open (RUNS_ON) hides the text
// after it as well, on the line, on the lines below in its paragraph and
// past its end, as a browser reads on in it, and so does a <script>,
// <style> or HTML <title> element that a start tag opens (rawTextEnd()),
// wherever the start tag sits, also <script/> and <title/>, which a
// browser reads as one, and one that `open`
// carries in from a block above, but only up to the first match of its
// end, the entry of HIDDEN_HTML_END or TITLE_END that shownHtml() returns,
// inside a later tag, comment, processing instruction, CDATA section or
// declaration, also one that runs on to a later line of the paragraph, as
// a renderer passes these on as written and a browser ends a comment, a
// <style> or a <title> there, and a <script> at the first </script there
// that ends it for its tokenizer, which the element's text may put in the
// script data
// escaped state or the double escaped state, as scriptEnd() reads it;
// where the first </script in a piece that runs on is not that one, the
// rest of the paragraph is hidden, and the <script> is open after it. A
// renderer writes the > of text and of a code span as &gt;, and an
// autolink as a link, so a match in one of these ends nothing. It also
// writes the destination and title of an inline link, and an image with
// its description, as text, as linkSyntax() finds them in the paragraph or
// the heading, or in a table cell, so what is open reads on over them, and
// raw HTML after them ends it. It writes the description of an image that
// no destination follows as text only where the page defines the image's
// reference, which is not read here, so a < met there ends nothing that
// hides text, and what is open hides the rest of the paragraph, as above,
// and is open after it.
// The rest of that piece after the match is read as shownHtml() reads a
// line of an HTML block, from inside the end tag of a <script> or <style>
// (END_TAG_STARTS), and what it leaves open is read as above; a piece that
// runs on is read so on each of its lines, from its < to its end, with the
// comment, <script> or <style> open at its <. When the line ends with one
// of these open, { hides, escape } is returned as `open`, the entry of its
// end and the state of the tokenizer in the text of a <script>, also where
// the paragraph, heading or cell ends on the line, and inside a piece that
// runs on, { through, html, escape }: the index in paragraph.text after
// the end of the piece, what shownHtml() leaves open in the piece at the
// end of the line, and that state. Where one of these hides the rest of
// the paragraph, `open` is { through, opens, escape } with the end of
// paragraph.text as `through`, that entry as `opens` and that state as
// `escape`, unless the paragraph ends on the line, where it is
// { hides, escape }. Given { hides, escape }, the line is read from
// `start` with it open; given { through, html, escape }, the line's text
// up to where `through` falls is read with shownHtml() first, as above.
// Each open tag and closing tag that is not text is given to `elements`, a
// tracker that shownElements() makes, and is read as the space that the
// tracker returns, and a part of the line that the tracker says a browser
// hides is left out. Returns the text as `text`.
const TEXTAREA_START_TAG = /<textarea[\s/>]/iy;
// The ends of the raw HTML whose text shownInline() leaves out past the end
// of the piece that opens it, the entries of HIDDEN_HTML_END of a <script>
// element, of a <style> element and of a comment, the end of an HTML
// <title> element (TITLE_END), and the end of a CDATA section in foreign
// content (CDATA_SECTION_END), which a browser reads on in, as in a
// comment, to its ]]>.
const RUNS_ON = new Set([...HIDDEN_HTML_END.slice(1, 4), TITLE_END, CDATA_SECTION_END]);
// The entry of HIDDEN_HTML_END that ends the element that a start tag of
// each of these names opens, whose text a browser reads as raw text, not
// as HTML: <script> and <style>, also <script/>, as a browser opens the
// element at a start tag that ends with />.
const RAW_TEXT = new Map([
  ['script', SCRIPT_END],
  ['style', STYLE_END],
]);
// What ends the text, which a browser does not show, of the element that a
// start tag of `name` opens, given `elements`, the tracker that
// shownElements() makes, once it is given the tag: the entry of RAW_TEXT
// for <script> and <style>, and TITLE_END for <title>, also <title/>, when
// the tracker is outside foreign content after the tag, as a browser then
// reads the tag as HTML and opens an HTML <title> element, whose text it
// reads up to </title>. Where the tracker is in foreign content after a
// <title> start tag, as after <svg><title>, a browser reads the tag as the
// start of an SVG or MathML element, so rawTextEnd() gives null there, as
// it does for a name other than these three.
const rawTextEnd = (name, elements) => (name === 'title' ? (elements.foreign() ? null : TITLE_END) : (RAW_TEXT.get(name) ?? null));
// Whether what shownHtml() leaves open at the end of raw HTML that
// shownInline() reads with it hides the rest of the paragraph: a tag, a
// processing instruction, a CDATA section outside foreign content or a
// declaration, unlike a <textarea> element (TEXTAREA_END), whose text is
// shown, and the raw HTML that an entry of RUNS_ON ends.
const hidesParagraph = (left) => left !== null && !showsOpen(left) && !RUNS_ON.has(left);

// The index after the label of a reference that starts at the [ at
// text[at], right after the ] of an image's description: up to the first ]
// that no backslash escapes, with no [ before it that none escapes; `at`
// when no such label starts there.
function referenceLabelEnd(text, at) {
  if (text[at] !== '[') return at;
  for (let i = at + 1; i < text.length; i++) {
    if (escapes(text, i)) i++;
    else if (text[i] === ']') return i + 1;
    else if (text[i] === '[') return at;
  }
  return at;
}

// The link syntax in `text`, the lines of a paragraph joined by line breaks
// or the text of a heading or a table cell, that a renderer writes as text,
// so that no part of it is raw HTML or a code span, as [start, end, sure],
// in order: the destination and title of each inline link, from the ( after
// its ] to the ) that closes them, as inlineLink() reads them, and each
// image, from its ![ to that ), as a renderer writes the description of an
// image as text as well, with `sure` true; and the description of an image
// that no destination follows, from its ![ to its ] and on over the label
// of a reference right after that ], with `sure` false, as a renderer
// writes it as text only where a definition of that reference is on the
// page, which is not read here. The brackets are paired as
// inlineDestinations() pairs them on a line, also over line breaks: a code
// span, an autolink or raw HTML is read whole where it starts, so a [ or ]
// inside one is text, link text that holds a link is not a link's text, and
// a ![ that no ] closes, such as that of a <![CDATA[ that no ]]> or ]
// follows, opens no image. A link or an image inside the description of an
// image is part of that image. Given `keep`, a test of a part, only the
// parts it passes are returned, in the same way: one inside another that
// it passes is part of that one, and one inside a part that it does not
// pass is returned.
function linkSyntax(text, keep = () => true) {
  const parts = [];
  const brackets = []; // each [ that no ] has closed yet, as [where it starts, whether it opens an image]
  let aroundLink = 0; // how many of them, from the bottom, were open when a link was read
  const codeSpanAt = codeSpans(text);
  const htmlAt = inlineHtml(text);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (escapes(text, i)) {
      i++;
    } else if (c === '`') {
      i = codeSpanAt(i).end - 1;
    } else if (c === '<') {
      i = htmlAt(i).end - 1;
    } else if (c === '[' || (c === '!' && text[i + 1] === '[')) {
      brackets.push([i, c === '!']);
      if (c === '!') i++;
    } else if (c === ']' && brackets.length > 0) {
      const [at, image] = brackets.pop();
      const holdsLink = !image && brackets.length < aroundLink;
      aroundLink = Math.min(aroundLink, brackets.length);
      if (holdsLink) continue;
      const end = text[i + 1] === '(' ? (inlineLink(text, i + 1)?.end ?? -1) : -1;
      if (end === -1) {
        if (image) parts.push([at, referenceLabelEnd(text, i + 1), false]);
        continue;
      }
      parts.push([image ? at : i + 1, end, true]);
      if (!image) aroundLink = brackets.length;
      i = end - 1;
    }
  }
  // The parts nest as the brackets do, so one that starts inside the one
  // kept before it is inside that one.
  const outer = [];
  for (const part of parts.filter(keep).sort((a, b) => a[0] - b[0])) {
    if (outer.length === 0 || part[0] >= outer[outer.length - 1][1]) outer.push(part);
  }
  return outer;
}

// The part of `parts`, as linkSyntax() returns them, that holds the index
// `at`, or undefined.
function partHolding(parts, at) {
  let lo = 0;
  let hi = parts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (parts[mid][0] <= at) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && at < parts[lo - 1][1] ? parts[lo - 1] : undefined;
}
function shownInline(line, elements, open = null, start = 0, below = NO_ENDS, paragraph = null) {
  let i = 0;
  let text = '';
  // What is open at i that a piece of raw HTML before i, such as a start
  // tag, or `open` opened: TEXTAREA_END for a <textarea> element,
  // CDATA_TEXT_END for a CDATA section whose text is shown, an entry of
  // RUNS_ON for raw HTML whose text is left out, or null.
  let raw = null;
  // The state of a browser's tokenizer in the text of the <script> element
  // that is open when `raw` is SCRIPT_END, as scriptEnd() reads it: 0 in
  // the script data state, 1 in the script data escaped state, 2 in the
  // script data double escaped state.
  let escape = 0;
  const lineEnd = paragraph && paragraph.at + line.length - start; // where the line's text ends in paragraph.text
  // `open` when the rest of the line and the lines after it in its
  // paragraph are left out, with `hides`, { hides, escape } or null, open
  // after them.
  const restLeftOut = (hides = null) => {
    const through = paragraph?.text.length;
    return through > lineEnd ? { through, opens: hides?.hides ?? null, escape: hides?.escape ?? 0 } : hides;
  };
  // A searcher() of the line, for TEXTAREA_END, the entries of RUNS_ON and
  // what readScript() looks for.
  const matchFrom = searcher(line);
  // The </script that ends the <script> element whose text line[from] to
  // line[to] is, as readScript() reads it from the state in `escape`.
  // Returns the match of that </script, or null, and keeps the state at
  // `to`, or at that </script, in `escape`.
  const scriptEnd = (from, to) => {
    const read = readScript(matchFrom, from, to, escape);
    escape = read.state;
    return read.end;
  };
  // Whether the first </script in line[from] to line[to] is the one that
  // ends the <script> element there for a browser, as scriptEnd() finds
  // it, or neither is there; when it is not, the rest of the paragraph is
  // hidden.
  const endsScript = (from, to) => {
    const first = matchFrom(SCRIPT_END, from);
    const end = scriptEnd(from, to);
    return (first && first.index + first[0].length <= to ? first.index : -1) === (end ? end.index : -1);
  };
  if (open?.html !== undefined) {
    const to = start + open.through - paragraph.at;
    const stop = Math.min(to, line.length);
    if (open.html === SCRIPT_END) {
      escape = open.escape;
      if (!endsScript(start, stop)) return { text, open: restLeftOut({ hides: SCRIPT_END, escape }) };
    }
    const { shown, open: left, escape: state } = shownHtml(line.slice(start, to), open.html, elements, open.escape);
    if (to > line.length) return { text: shown, open: { through: open.through, html: left, escape: state } };
    text = shown;
    if (hidesParagraph(left)) return { text, open: restLeftOut() };
    raw = left;
    escape = state;
    i = to;
  } else if (open?.through !== undefined) {
    i = start + open.through - paragraph.at;
    if (i > line.length) return { text: '', open };
    raw = open.opens;
    escape = open.escape;
  } else if (open?.hides) {
    raw = open.hides;
    escape = open.escape;
    i = start;
  }
  const hidden = () => raw !== null && !showsOpen(raw);
  // The link syntax that holds line[at], as linkSyntax() reads it in the
  // paragraph, or on a line read without one: { end, sure }, with `end` the
  // index on the line after it, or null when none holds it.
  let links; // the link syntax of a line read without a paragraph
  const linkSyntaxAt = (at) => {
    const shift = paragraph ? paragraph.at - start : 0;
    const part = partHolding(paragraph ? paragraph.link() : (links ??= linkSyntax(line)), at + shift);
    return part ? { end: part[1] - shift, sure: part[2] } : null;
  };
  const codeSpanAt = codeSpans(line);
  const htmlAt = inlineHtml(line);
  const show = (part) => {
    if (!elements.hidden()) text += part;
  };
  let from = i; // where the text not yet added starts
  const tagAt = (re, at, end) => {
    re.lastIndex = at;
    return end > at + 1 && re.test(line);
  };
  // Where the raw HTML that starts at line[at] and runs on to a later line
  // of the paragraph ends in paragraph.text: after the first match of
  // `unshown`, the end of a comment, processing instruction, CDATA section
  // or declaration, on the lines below, or after the > of a tag that
  // inlineTagEnd() reads there; -1 when it runs on to no later line. The match
  // of `unshown` found last is kept in paragraph.ends, by the lines of the
  // paragraph in turn, and the lines below are searched again, from this
  // line's end, only when that match starts before it; once a search finds
  // none, none is made, so a line of many starts that nothing below ends is
  // not read again from each one.
  const runsOnThrough = (at, unshown) => {
    if (unshown) {
      let end = paragraph.ends.get(unshown);
      if (end === undefined || (end !== -1 && end < lineEnd)) {
        end = paragraph.text.indexOf(unshown, lineEnd);
        paragraph.ends.set(unshown, end);
      }
      return end === -1 ? -1 : end + unshown.length;
    }
    const end = inlineTagEnd(paragraph.text, paragraph.at + at - start);
    return end > lineEnd ? end : -1;
  };
  while (i < line.length) {
    const c = line[i];
    // Link syntax that a renderer writes as text holds no code span and no
    // raw HTML, so a backtick or a < in it opens nothing, and what hides
    // text reads on over it.
    const link = c === '`' || c === '<' ? linkSyntaxAt(i) : null;
    if (link?.sure) {
      i = link.end;
    } else if (c === '\\') {
      i += 2;
    } else if (c === '`') {
      const span = codeSpanAt(i);
      if (span.opens && !hidden()) {
        show(line.slice(from, i));
        from = span.end;
      }
      i = span.end;
    } else if (c === '<') {
      const { end, unshown, tag } = htmlAt(i);
      if (raw) {
        // What is open ends at the first match of its end inside the tag,
        // comment, processing instruction, CDATA section or declaration from
        // i to end, which a renderer passes on as written, and not inside an
        // autolink, which is none of these, and what follows that match up
        // to end is raw HTML. For a <textarea>, <script> or <style> the
        // match is the start of its end tag, and the rest is read from
        // inside that end tag, which is a tag, so no part of it is shown.
        // Raw HTML whose text is left out is read on, with shownHtml(), in
        // raw HTML that runs on from i to a later line of the paragraph.
        // In the description of an image that no destination follows, raw
        // HTML ends nothing whose text is left out, which then hides the
        // rest of the paragraph and is open after it.
        // A <script> ends at the </script that ends it for a browser, as
        // scriptEnd() finds it, which reads the rest of the piece, and the
        // rest of the line in a piece that runs on, as the element's text.
        if (link && hidden()) return { text, open: restLeftOut({ hides: raw, escape }) };
        const piece = end > i + 1 && (tag || unshown);
        const close = piece ? (raw === SCRIPT_END ? scriptEnd(i, end) : matchFrom(raw, i)) : null;
        const after = close ? close.index + close[0].length : -1;
        if (close && after <= end) {
          if (!hidden()) show(line.slice(from, close.index));
          const rest = line.slice(after, end);
          const { shown, open: left, escape: state } = shownHtml(rest, END_TAG_STARTS.has(raw) ? inTag(IN_TAG, null) : null, elements);
          text += shown;
          if (hidesParagraph(left)) return { text, open: restLeftOut() };
          raw = left;
          escape = state;
          from = end;
        } else if (hidden() && end === i + 1 && paragraph) {
          const through = runsOnThrough(i, unshown);
          if (through !== -1) {
            const state = escape;
            if (raw === SCRIPT_END && !endsScript(i, line.length)) return { text, open: restLeftOut({ hides: raw, escape }) };
            const { shown, open: left, escape: last } = shownHtml(line.slice(i), raw, elements, state);
            return { text: text + shown, open: { through, html: left, escape: last } };
          }
        }
      } else if (unshown && (end > i + 1 || below.has(unshown))) {
        // A comment, processing instruction, CDATA section or declaration,
        // which a renderer passes on as written, is read as shownHtml()
        // reads a line of an HTML block, from its <, as a browser may end
        // it before the end that CommonMark reads, and read on in a piece
        // that runs on to a later line of the paragraph.
        show(line.slice(from, i));
        if (end === i + 1) {
          const { shown, open: left, escape: state } = shownHtml(line.slice(i), null, elements);
          return { text: text + shown, open: { through: runsOnThrough(i, unshown), html: left, escape: state } };
        }
        const { shown, open: left, escape: state } = shownHtml(line.slice(i, end), null, elements);
        text += shown;
        if (hidesParagraph(left)) return { text, open: restLeftOut() };
        raw = left;
        escape = state;
        from = end;
      } else if (tag) {
        show(line.slice(from, i));
        const isEnd = line[i + 1] === '/';
        const name = tagName(line, i);
        text += elements.tag(name, isEnd, line.slice(i, end));
        from = end;
        if (!isEnd) raw = tagAt(TEXTAREA_START_TAG, i, end) ? TEXTAREA_END : rawTextEnd(name, elements);
        escape = 0;
      } else if (end === i + 1 && !unshown && paragraph) {
        // A tag that runs on to a later line of the paragraph.
        const through = runsOnThrough(i, null);
        if (through !== -1) {
          const at = paragraph.at + i - start;
          show(line.slice(from, i));
          const isEnd = line[i + 1] === '/';
          const name = tagName(line, i);
          text += elements.tag(name, isEnd, paragraph.text.slice(at, through));
          TEXTAREA_START_TAG.lastIndex = at;
          const opens = isEnd ? null : TEXTAREA_START_TAG.test(paragraph.text) ? TEXTAREA_END : rawTextEnd(name, elements);
          return { text, open: { through, opens, escape: 0 } };
        }
      }
      i = end;
    } else {
      i += 1;
    }
  }
  if (hidden()) return { text, open: { hides: raw, escape } };
  show(line.slice(from));
  return { text, open: null };
}

// Whether the line break after a line of a paragraph that shownInline()
// leaves `open` is shown, and so read as a space: when nothing is open, and
// inside a piece of raw HTML that runs on, { through, html }, when what
// shownHtml() leaves open in the piece shows its text.
const breakShown = (open) => !open || (open.html !== undefined && (!open.html || showsOpen(open.html)));

for (const [file, { at, shown }] of datedPages) {
  const date = basename(file).match(DATE_IN_NAME)[0];
  const page = readPage(file);
  if (!page) continue; // readPage has reported it
  const h2 = page.findIndex(isH2);
  const above = h2 === -1 ? page : page.slice(0, h2);
  const toReadme = (target) => {
    const pathPart = target.split('#')[0];
    if (!pathPart || ABSOLUTE.test(target)) return false;
    const path = decoded(pathPart);
    return path !== null && resolve(dirname(file), path) === readmePath;
  };
  // The links are read from the lines as written and as parse() tags them,
  // as check 4 reads them: without its code spans or > markers, a line
  // could start 4 columns in and be read as indented code, and a line of a
  // fenced code block read as a blank line would keep open, or end, a list
  // item that the block's lines do not. parse() tags the blocks whose fence
  // starts a line or the text of a list item outside a block quote; the
  // link reader reads those inside a block quote. Each line is read, also
  // those after a link to the README, so that `codeLines` names each line
  // of a fenced code block inside a block quote and each line of indented
  // code outside an HTML block on which the reader reads no inline link.
  const codeLines = new Set();
  const outside = new Map();
  const htmlLines = new Map();
  const read = linkReader(above, codeLines, outside, htmlLines);
  const linksReadme = above.map((l) => read(l).some(toReadme)).includes(true);
  // The note is read without > markers, and without the lines of a fenced
  // code block or in `codeLines`. A line of an HTML block that
  // blockReader() follows is not among them, also where lineStart() reads
  // it as indented code or as a fence, as its text is raw HTML. On a line
  // outside an HTML block, the note is read without code spans: a code span
  // may run on from one line of a paragraph to a later one, so the note is
  // read on the part of each line in `outside`, and on each cell of a table
  // row, as rowCells() splits it, on the text that shownInline() gives.
  // A comment, processing instruction,
  // CDATA section or declaration may run on to a later line of a paragraph
  // as well, to the first line whose part, after the > markers, spaces and
  // tabs that start it, holds its end, and so may a tag, to the line that
  // holds its >, as CommonMark reads it on those parts of the paragraph's
  // lines joined by line breaks, and so may a comment, <script>, <style> or
  // <title> that the raw HTML after a </textarea> end tag inside one of
  // these, or a <script>, <style> or <title> start tag, leaves open, and a
  // CDATA section in
  // foreign content that raw HTML leaves open, to the first match of its
  // end inside later raw HTML outside the link syntax that a renderer
  // writes as text, as shownInline() reads it, and on past the paragraph.
  // The lines of a paragraph here are those
  // that `outside` gives the same first line, up to a line of an HTML
  // block. A line of an HTML block is raw HTML, in which a backtick is text
  // and opens no code span, so the note is read there, as an href there is,
  // on the whole line: on the characters that shownHtml() shows of the
  // line's text after the > markers of the block quotes that hold the block,
  // so that such a > ends no declaration. A renderer passes the text of an
  // HTML block on as written, so a backtick there also keeps no <!-- or -->
  // from starting or ending a comment. A line break inside the raw HTML that
  // shownHtml() or shownInline() leaves out, also one inside a tag, is left
  // out with it, so it does not join the words around it with a space; one
  // inside a <textarea> element, after its start tag, is shown, as the
  // element's text is, and is read as a space. A tag, a processing
  // instruction, a CDATA section outside foreign content, a declaration or
  // a <textarea> that a block leaves open at its last line is not carried
  // to the line after the block. A comment, <script>, <style>, <title> or
  // CDATA section in foreign content is, as a browser reads on in it past
  // the end of the block, with the state of the tokenizer in the
  // text of a <script>: it hides the lines after it, in blank lines, code
  // blocks, paragraphs, headings, the cells of table rows in turn and HTML
  // blocks, up to the first match of its end that shownHtml() or
  // shownInline() finds there; a code block holds none, as a renderer
  // writes its > as &gt;. The <details>, <summary> and <dialog> elements that the
  // lines open are followed over all of them, from one block to a later one
  // too, as a browser reads the HTML that a renderer makes of the page as
  // one document, with one tracker that shownElements() makes, and each
  // cell of a table row with a tracker that its cell() makes: the text that
  // the tracker says a browser hides is not the note, and a line break
  // there is not read as a space. The tracker follows foreign content as
  // well, which it ends at the first line of each block, a blank line and
  // an HTML block included: a renderer writes a start tag, such as <p>,
  // <h3>, <table>, <pre>, <ul> or <blockquote>, before a paragraph, a
  // heading, a table, a code block, a list or a block quote, and an end tag
  // after it, and a browser ends foreign content at each, unless raw HTML
  // that runs on, as above, holds that point, as a browser reads those tags
  // there as its text, and so the tracker does not end it there. A browser
  // keeps foreign content open from an HTML block on to the next one where
  // the same block quotes and list items hold both, and the tracker does
  // not.
  //
  // `inline` holds, for each line read with shownInline() but a table row,
  // its part in `outside`, where its text starts after the > markers,
  // spaces and tabs that start that part when the part starts the line, the
  // first line of its paragraph, and `paragraph`, the text of the
  // paragraph, where the line's text starts in it, a map, one for the
  // paragraph, of where the end of raw HTML that runs on was last found in
  // that text, and a function, one for the paragraph, that returns the link
  // syntax in that text, read the first time it is asked for, as
  // shownInline() takes them; `below`, for each line, the ends in
  // UNSHOWN_ENDS that the lines after it in its paragraph hold there.
  const inline = above.map((l, k) => {
    const at = outside.get(k);
    if (!at || htmlLines.has(k) || l.inFence || l.fenceOpen || l.fenceClose || codeLines.has(k)) return null;
    const [from, to, first] = at;
    const part = l.line.slice(from, to);
    return { part, start: from === 0 ? part.match(QUOTE_MARKERS)[0].length : 0, first };
  });
  const below = [];
  for (let k = above.length - 1, ends = NO_ENDS; k >= 0; k--) {
    below[k] = ends;
    const line = inline[k];
    if (!line || inline[k - 1]?.first !== line.first) {
      ends = NO_ENDS;
    } else {
      const text = line.part.slice(line.start);
      ends = new Set([...ends, ...UNSHOWN_ENDS.filter((end) => text.includes(end))]);
    }
  }
  for (let k = 0, lines = []; k <= above.length; k++) {
    const line = inline[k];
    if (lines.length > 0 && line?.first !== lines[0].first) {
      const text = lines.map(({ part, start }) => part.slice(start)).join('\n');
      const ends = new Map();
      let syntax; // the link syntax in `text`, read the first time it is asked for
      const link = () => (syntax ??= linkSyntax(text));
      let at = 0;
      for (const l of lines) {
        l.paragraph = { text, at, ends, link };
        at += l.part.length - l.start + 1;
      }
      lines = [];
    }
    if (line) lines.push(line);
  }
  const elements = shownElements();
  let intro = '';
  let block; // the HTML block that the line above is a line of, if any
  let open = null; // what the line above leaves open in that block, as shownHtml() returns it
  let escape = 0; // the state of the tokenizer in the <script> that `open` may be the end of, as shownHtml() returns it
  // What the line above leaves open in its paragraph, or a table row in its
  // last cell, as shownInline() returns it, and what a block above leaves
  // open past its end as { hides, escape }, or null.
  let unshown = null;
  above.forEach((l, k) => {
    const html = htmlLines.get(k);
    // Whether the line starts a block, rather than going on with the HTML
    // block or the paragraph of the line above.
    const starts = html ? html !== block : !inline[k] || inline[k].first === k;
    if (html !== block) {
      // A comment, <script>, <style>, <title> or CDATA section in foreign
      // content that the HTML block above leaves open stays open after it,
      // and an HTML block starts with what the blocks above leave open so.
      if (block) unshown = RUNS_ON.has(open) ? { hides: open, escape } : null;
      [open, escape] = html && unshown?.hides ? [unshown.hides, unshown.escape] : [null, 0];
      if (html) unshown = null;
    }
    // Foreign content ends at the start of each block, unless raw HTML that
    // runs on holds it there.
    if (starts && !(html ? RUNS_ON.has(open) : unshown?.hides)) elements.endForeign();
    block = html;
    let text = '';
    if (inline[k]) {
      const { part, start, paragraph } = inline[k];
      ({ text, open: unshown } = shownInline(part, elements, unshown, start, below[k], paragraph));
    } else if (!(l.inFence || l.fenceOpen || l.fenceClose || codeLines.has(k))) {
      // A line outside an HTML block that `outside` does not hold is a table
      // row, whose cells are read in turn, each from what the one before it,
      // or the blocks above the first, leave open.
      if (!html) {
        let left = unshown?.hides ? unshown : null;
        text = rowCells(l.line)
          .map((cell) => {
            const read = shownInline(cell, elements.cell(), left);
            left = read.open;
            return read.text;
          })
          .join('|');
        unshown = left;
      } else {
        // The line's text after the block's > markers.
        const raw = afterQuotes(l.line, html.quotes);
        ({ shown: text, open, escape } = shownHtml(raw, open, elements, escape));
      }
    }
    intro += text.replace(/^\s*(?:>\s?)+/, '') + ((open && !showsOpen(open)) || !breakShown(unshown) || elements.hidden() ? '' : ' ');
  });
  const missing = [];
  if (!new RegExp(`\\bas of ${date}\\b`, 'i').test(intro.replace(/\s+/g, ' '))) {
    missing.push(`say "as of ${date}"`);
  }
  if (!linksReadme) missing.push('link to the README for the current figures');
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
