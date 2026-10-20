# Changelog

Full history of the benchmark, its methodology changes, and its releases.
Metric revisions are never silently replaced: superseded or withdrawn figures
stay on record here with the reason they changed.

## 0.4.2 (unreleased)

### Added

- `REPORT.generated.md` names the benchmark that wrote it, on a line after
  `Generated:` such as `Benchmark: @opena2a/oasb 0.4.1`: the name and
  version in the `package.json` of the checkout that holds
  `scripts/generate-report.ts`. It did not name the version of the
  benchmark. `docs/test-catalog.md` describes the line, and
  `scripts/scenario-report.test.mjs` checks it and that it comes before the
  Product under test line.
- `npx @opena2a/oasb <ID>` runs one scenario file, such as AT-AI-001, from
  the npm package against the adapter `OASB_ADAPTER` selects, with vitest
  and its verbose reporter, and prints its verdict on the last line:
  `OASB AT-AI-001 against arp-guard 0.3.0: PASS (11 of 11 tests passed)`.
  PASS exits 0, FAIL 1, and NOT MEASURED, when every test of the file was
  skipped, 2. A missing or unknown ID, a missing vitest and an adapter that
  cannot be loaded exit 1 with a line that says why; `--help` lists the
  scenario IDs. The README Quick Start opens with
  `npx @opena2a/oasb AT-AI-001`, and the clone moves below it, for running
  the whole suite. `scripts/oasb-bin.test.mjs` runs the command through the
  `node_modules/.bin` link of an install layout.

### Changed

- `pg` moved from `dependencies` to `devDependencies`, so `@opena2a/oasb`
  has no `dependencies`. Only `scripts/export-registry-corpus.mjs` imports
  it, and `scripts/` is not in the published package. `npm install` of the
  packed package in an empty project added 15 packages, `@opena2a/oasb`,
  `pg` and 13 packages `pg` pulls in, and now adds 1 with `--omit=optional`.
  A default install also adds the optional dependencies arp-guard and
  vitest, with what they pull in, as the next entry describes. `npm ci` in
  a clone still installs `pg` for that script.
- arp-guard and vitest are optional dependencies, which npm installs with
  the package, as `npx @opena2a/oasb` needs them. arp-guard was an optional
  peer dependency and vitest a devDependency, and npx installs neither kind.
  `npm install @opena2a/oasb` now also installs arp-guard, with hackmyagent,
  and vitest: 366 MB on disk on macOS arm64 on 2026-10-17, against 1.6 MB
  with `--omit=optional`, which leaves them out, and 341 MB for 0.4.0,
  which depended on hackmyagent. The package entry point loads without them.
- `npm run check:readme` holds a capture of `npx @opena2a/oasb <ID>` to the
  suite as it holds one of a `vitest run`: to the tests of the scenario file
  whose ID is `<ID>`, and its verdict line to the one the command prints for
  them.
- `npm run report` without an argument exits 1 and writes no report when
  `test-results.json` does not exist, as it does for a named results file
  that does not exist, and prints the same message: `Report not written:`,
  the path, and the command that writes the file,
  `npx vitest run --reporter=json --outputFile=<path>`. It wrote
  `REPORT.generated.md` with
  `Product under test: not recorded (no test results were read)` and every
  status N/A, and exited 0. `scripts/scenario-report.test.mjs` runs both
  cases.
- The README says where the vulnerabilities `npm ci` reports are: in
  vitest, the test runner, and in the products the adapters load. With this
  lockfile on 2026-10-17, `npm ci` reported 27 (1 low, 9 moderate, 13 high,
  4 critical): 14 in packages under `arp-guard`, 8 in `rebuff` and packages
  under it, and 6 in `vitest` and packages under it, `js-yaml` being under
  both `arp-guard` and `rebuff`. arp-guard and vitest are optional
  dependencies of the package, so `npm audit --omit=dev` reports their 20
  (1 low, 8 moderate, 8 high, 3 critical), and the README says so;
  `npm audit --omit=dev --omit=optional` reports none. The fixes
  `npm audit` names for the `rebuff` and `vitest` ones are `rebuff@0.0.2`,
  a lower version, and `vitest@5.0.5`, a major version.

### Fixed

- The package holds the files the README links by a relative path: `files`
  in `package.json` adds `docs/`, all but the recording of a run
  (`docs/oasb-demo.gif`, 2,676,739 bytes), and `REPORT.md`, 17 files. With
  them, `npm install` of the packed package with `--omit=optional` takes
  1.6 MB on disk, the figure the entry on arp-guard and vitest above states,
  against 1.4 MB without them, and a default install still takes 366 MB
  (`du -sh` and `du -sm` of `node_modules`, macOS arm64, npm 11.20.0,
  2026-10-17). The README in the package linked 13 files the package did
  not hold. The README links the recording by its address in the
  repository. A test in `scripts/check-readme.test.mjs` packs the package
  with `npm pack` and runs `scripts/check-readme.mjs` on the README in it,
  so a relative link the check reads there, on the README or on a page that
  took its text, must resolve to a file in the package.
- The scenarios link in `CONTRIBUTING.md` names `corpus/` by its address in
  the repository, `https://github.com/opena2a-org/oasb/tree/main/corpus`, as
  the README names the recording of a run. It linked `corpus/`, which the
  package does not hold. `scripts/check-readme.mjs` also reads the links on
  each `.md` page a link it reads leads to, and on the pages their links
  lead to, each page once, and names such a page by its path from the
  README's directory. On the README in the packed package it reads 8 more
  pages, `CONTRIBUTING.md` among them, and on a package packed before this
  fix it reported
  `README: CONTRIBUTING.md line 7: link target "corpus/" does not exist.`
  `scripts/check-readme.mjs` prints how many pages it reached this way.
- `npm run check:readme` names a `.md` page a link leads to that it cannot
  read, such as one with mode 000, with the reason on one line,
  `README: cannot read CONTRIBUTING.md, a page a link leads to: EACCES:
  permission denied`, also when the link carries an anchor, such as
  `[contributing](CONTRIBUTING.md#contributing)`; on such a link it ended
  with `Error: EACCES` and a stack trace. It ended with the same error on a
  link to such a page whose name carries a date (`docs/AUDIT-2026-06-03.md`)
  and, with the counts checked, on one in the README's MITRE ATLAS Coverage
  section.
- `npm run check:readme` names a page that took text from the README and
  that it cannot read, such as `docs/adapters.md` with mode 000, once:
  `README: cannot read docs/adapters.md, a page that took text from the
  README: EACCES: permission denied`. A link to such a page, such as
  `[adapters](docs/adapters.md)` or `[adapters](docs/adapters.md#adapters)`
  in the README, made it name the page a second time, as a page a link
  leads to; so did a link on another page that took the README's text, one
  on a page a link leads to and, with the counts checked, one in the
  README's MITRE ATLAS Coverage section.
- `npm run check:readme` reads more links that CommonMark renders, and
  reports one whose target does not exist. It skipped an inline link with
  spaces inside the parentheses (`[x]( docs/nowhere.md )`), before its
  closing parenthesis (`[x](docs/nowhere.md "T" )`) or an escaped quote in
  its title (`[x](docs/nowhere.md "a \" b")`); a reference definition whose
  label holds a code span (``[`x`]: docs/nowhere.md``) or an escaped bracket
  (`[a\]b]: docs/nowhere.md`); an `href` after an attribute value that holds
  `>` (`<a title="a>b" href="docs/nowhere.md">`); and a link or `href` after
  a code span of two backticks that holds one (``` ``code ` x`` ```), as it
  ended a code span at the next single backtick. It now ends a code span at
  the next run of as many backticks, as CommonMark does. With
  `docs/nowhere.md` absent, a README holding any one of these exited 0, and
  now exits 1 naming the line. The 0.4.1 entry, `scripts/check-readme.mjs`
  and `docs/testing/release-smoke.md` said a definition inside a list item
  is not checked; one on its own line inside a list item is checked, and
  they now name the shape that is not: a definition on the same line as a
  list marker (`- [label]: path`).
- `scripts/run-pinned-benchmark.ts` names a renamed file in the OASB
  checkout by its old and new paths when it refuses the checkout for
  uncommitted changes, as `git status --short` prints a rename: after
  `git mv old.json renamed.json`, the refusal reads `the OASB checkout has
  uncommitted changes (old.json -> renamed.json)`. It named only
  `renamed.json`, which does not say which tracked file moved. A copy that
  `git status` reports, when `status.renames` is set to `copies`, is named
  the same way. A test in `src/benchmark/pinned/pinned.test.ts` renames one
  file and copies another.
- `npm run check:readme` reads an inline link's target as CommonMark reads a
  link destination. It ended the target at the first `)` or space, so with
  `docs/guide.md` present `[x](<docs/guide.md>)` exited 1 with
  `link target "<docs/guide.md>" does not exist`, and with `docs/a(b).md`
  present `[x](docs/a(b).md)` exited 1 with
  `link target "docs/a(b" does not exist`; both now exit 0. A target in
  angle brackets runs to the closing `>` and may hold spaces
  (`[x](<docs/my guide.md>)`), a bare target may hold balanced parentheses,
  nested up to 32 deep, and a backslash escape such as `\(` stands for the
  character it escapes. A target in angle brackets or with parentheses that
  names no file exits 1 with the path, such as
  `link target "docs/a(b).md" does not exist`.
- `npm run check:readme` also ends a code span at the next run of as many
  backticks where it checks that a paragraph, table row or heading that
  offers the Scanner Benchmark for comparing products calls it a
  recall-only comparison. That check ended a code span at the next single
  backtick. A README line ``` Run ``a ` b``; the Scanner Benchmark
  compares results across scanners, see `y`. ``` exited 0, and now exits 1
  naming the line; a line whose offer is inside a code span, ``` Write
  ``Scanner Benchmark `x` across products`` in code. ```, exited 1 and now
  exits 0.
- `npm run check:readme` reads a link or `href` after a backslash-escaped
  backtick, which CommonMark renders as a backtick and not as the start of
  a code span. With `docs/nowhere.md` absent, a README line
  `` \`[x](docs/nowhere.md)\` ``, `` \`<a href="docs/nowhere.md">x</a>\` ``
  or ``` \``[x](docs/nowhere.md)`` ``` exited 0, and now exits 1 naming the
  line. After an escaped backtick, the rest of its run opens a code span,
  so ```` \```[x](docs/nowhere.md)`` ````, which CommonMark renders as a
  backtick and a code span, now exits 0; it exited 1.
- `npm run check:readme` reads a backslash in an inline link's target as an
  escape only before ASCII punctuation, as CommonMark does: before a space
  it is text, and the space ends the target. With `docs/a\ b.md` absent,
  `[x](docs/a\ b.md)`, which CommonMark renders as text, exited 1 with
  `link target "docs/a\ b.md" does not exist`, and now exits 0.
- `npm run check:readme` reads a line on from the `)` that closes an inline
  link, so a link's title is not read as text. With `docs/guide.md`
  present and `docs/nowhere.md` absent,
  `[x](docs/guide.md "](docs/nowhere.md) )")` and
  `[x](docs/guide.md "[y](docs/nowhere.md)")` exited 1 with
  `link target "docs/nowhere.md" does not exist`, and now exit 0.
- `npm run check:readme` reads `](target)` as the end of an inline link only
  after link text that a `[` no backslash escapes opens, on the same line
  or on an earlier line of its paragraph. With `docs/nowhere.md` absent,
  `foo](docs/nowhere.md)` and `[x\](docs/nowhere.md)` exited 1 with
  `link target "docs/nowhere.md" does not exist`, and now exit 0, while
  `[x\\](docs/nowhere.md)`, whose `]` is not escaped, still exits 1. Link
  text that holds a link is not a link's text, as links do not nest: with
  `docs/guide.md` present, `[a [b](docs/guide.md) c](docs/nowhere.md)`
  exited 1 and now exits 0. An image's text may hold a link, and link text
  may wrap onto the next line of its paragraph, but not past a blank line,
  a fence, a heading, a table row or a list item.
- `npm run check:readme` finds the run of backticks that closes a code span
  in a list of the line's runs by length, made in one pass, instead of
  reading the rest of the line again from each run. On macOS arm64, a 1 MB
  README line of backtick runs of lengths 1, 2, 3 and so on, each followed
  by `x` so that none closes, took 6.4 seconds to check and now takes 0.06
  to 0.07 seconds; a 4 MB line takes 0.10 to 0.11 seconds.
- `npm run check:readme` ends wrapped link text at a setext heading
  underline (`---`, `===`), a thematic break (`***`, `___`) and the first
  line of an HTML block that may interrupt a paragraph (`<div>`, `</p>`,
  `<pre>`, `<!-- note -->`), as it did at a heading. With
  `docs/nowhere.md` absent, a `[a` line, then one of those lines, then
  `b](docs/nowhere.md)` exited 1 with
  `link target "docs/nowhere.md" does not exist`, and now exits 0. With
  `<span>` as the middle line, which does not interrupt a paragraph, it
  still exits 1.
- `npm run check:readme` reads an autolink or raw HTML before the brackets
  of link text, as CommonMark does: a `[` or `]` inside an autolink, such as
  `<https://example.org/a]b>`, or inside an HTML tag, comment, processing
  instruction, declaration or CDATA section that opens and closes on the
  same line neither opens nor closes link text. With `docs/nowhere.md`
  absent, `[see <https://example.org/a]b> here](docs/nowhere.md)` and
  `[a <b title="]"> c](docs/nowhere.md)`, which CommonMark renders as links,
  exited 0, and now exit 1 with
  `link target "docs/nowhere.md" does not exist`, while
  `<b title="[">x](docs/nowhere.md)`, which it renders as text, exited 1 and
  now exits 0. Of a code span, an autolink and raw HTML, the one that starts
  first holds the others as text, so a backtick inside a tag opens no code
  span: `` [a <b title="`]"> c](docs/nowhere.md) `x` `` exited 0 and now
  exits 1. An inline link's target or title may hold a backtick:
  `` [x](`docs/nowhere.md`) `` exited 0 and now exits 1 with
  `` link target "`docs/nowhere.md`" does not exist ``, and with
  `docs/guide.md` present,
  `` [x](docs/guide.md "`") and [y](docs/nowhere.md "`") `` exited 0 and
  now exits 1.
- `npm run check:readme` reads where a paragraph ends as CommonMark does
  when link text wraps onto the next line. A setext underline, a thematic
  break, an HTML block start, an ATX heading or a list marker ends one
  only after at most 3 columns of indentation, counted from where the text
  of the list item or block quote that holds the line starts, with a tab
  moving on to the next multiple of 4 columns; it read them at any
  indentation. With `docs/nowhere.md` absent, a `[a` line, then
  `    ---` (or a tab and `---`, or 4 spaces and `***`, `===`, `<div>` or
  `# h`, or `<![cdata[`, which is not CDATA), then `b](docs/nowhere.md)`
  exited 0, and now exits 1 with
  `link target "docs/nowhere.md" does not exist`. So do `- [a`, then 6
  spaces and `---`, then `  b](docs/nowhere.md)`; `[a` then
  `    - b](docs/nowhere.md)`; and `[a` then `2. b](docs/nowhere.md)`, as
  an ordered list item ends a paragraph only when it starts at 1. A block
  quote now ends one: `[a` then `> b](docs/nowhere.md)` exited 1 and now
  exits 0, while `> [a` then `b](docs/nowhere.md)`, a line that continues
  the quoted paragraph without `>`, still exits 1. A `[a` line, then `#`
  (an empty heading), then `b](docs/nowhere.md)` exited 1 and now exits 0,
  as do the same lines with `---` in the middle and `\r\n` line endings,
  and `    code [a` then `    b](docs/nowhere.md)`, two lines of indented
  code.
- `npm run check:readme` checks a README line that starts with `***`,
  `---` or `___`, then spaces or tabs, then other text, such as `x`,
  without trying each split of the spaces and tabs between the marks and
  the pattern after them. On macOS arm64, `***`, 100,000 spaces and `x`
  took 3.9 seconds to check, and `---` or `___` with 100,000 tabs 4.4
  seconds; each now takes 0.05 seconds, and 0.07 seconds with 1,000,000.
- The methodology note `scripts/run-benchmark-v2.ts` puts in each results
  file, the `note` field of `benchmark-results-v6.json` and the comment on
  the checks `src/benchmark/hma-pipeline-adapter.ts` leaves out of the
  verdict gave a count of benign registry MCP servers said to declare
  `allowedTools:["*"]`, over 2,900, as a reason to leave `AST-SCOPE-001` out
  of the verdict. `BENCHMARK-RESULTS.md` § 3 withdrew that count on
  2026-08-27: it measured the corpus export script, not the servers. The
  three now give the argument § 3 keeps, that a wildcard grant is a
  least-privilege posture issue however many configs declare it, and the
  note of `benchmark-results-v6.json`, which § 7 names as the verdict
  methodology, says the count is withdrawn. Tests in
  `scripts/doc-facts.test.mjs` check each of the three for the count.
- `npm run check:readme` finds a code span that opens on one line and
  closes on a later line of its paragraph, as CommonMark does, and reads no
  link inside it: a `[` in it opens no link text, and no inline link,
  `href` or reference definition in it is read. It found the code spans of
  each line on that line alone, so with `docs/nowhere.md` absent a README
  paragraph of the two lines `` a `[x `` and `` y` ](docs/nowhere.md) ``
  exited 1 with `link target "docs/nowhere.md" does not exist`, naming the
  second line; it now exits 0. A dated page whose link to the README sits
  inside such a span, as in the two lines `` see `[the `` and
  `` README` ](../README.md) ``, now fails the check that it links to the
  README; it passed. A run of backticks that no run of as many closes in
  its paragraph is still text, and a code span runs on only over the lines
  that go on with its paragraph, as link text that wraps does: after the
  line `` a `x ``, the line `` 2. [y](docs/nowhere.md) z` `` goes on with
  the paragraph, as an ordered list item that starts at 2 does not end
  one, and exited 1 and now exits 0, while the line
  `` > [z](docs/nowhere.md) y` `` starts a block quote, which ends it, and
  still exits 1. A backtick inside an autolink, an HTML tag or a link
  title still opens no code span, so after the line `` a <b title="`"> ``
  the line `` [z](docs/nowhere.md) y` `` exits 1 as before, while after
  the line `` a `[x `` the line `` <b title="`"> ](docs/nowhere.md) ``,
  whose first backtick closes the span, exited 1 and now exits 0.
- `npm run check:readme` does not read an inline link on a line of
  indented code: a line that does not go on with a paragraph and starts 4
  or more columns past where the text of the block quote or list item that
  holds it starts, a tab moving on to the next multiple of 4. With
  `docs/nowhere.md` absent, `Text.`, a blank line and
  `    [x](docs/nowhere.md)`, which commonmark.js 0.31.2 and markdown-it
  14.1.1 render without a link, exited 1 with
  `link target "docs/nowhere.md" does not exist`, and now exits 0, as do
  the same lines with a tab before the link, and `- item`, a blank line
  and 6 or 8 spaces before the link. `Text.` then
  `    [x](docs/nowhere.md)`, a line that goes on with the paragraph, still
  exits 1. An href on a line of indented code is still read, as the check
  does not track HTML blocks, inside which such a line is raw HTML and an
  href on it a link: `<table>`, `  <tr>`, then
  `    <td><a href="docs/nowhere.md">x</a></td>` still exits 1. So are the
  links on indented code right after a line whose text starts with `|`,
  which may be a paragraph rather than a table row: `| a` then
  `    [x](docs/nowhere.md)` still exits 1. On a page whose file name
  carries a date, the link to the README above its first H2 is read from
  the lines as written, as the other links are, not with their code spans
  and `>` markers taken out as for the "as of" note. A link to the README
  there on a line of indented code, or inside a code span of two
  backticks, ``` ``[README](../README.md)`` ```, no longer counts, while
  one between two backticks that a backslash escapes,
  `` \`[README](../README.md)\` ``, now counts.
- `npm run check:readme` reads a line that starts with `|` as a table row
  when the line after it is a delimiter row with as many cells, such as
  `| - |`, or when the line above it is a table row, as GitHub-flavored
  Markdown starts a table only at a header row and a delimiter row. It read
  every such line as a table row; another such line is now paragraph text,
  and link text and code spans wrap past it. With `docs/nowhere.md` absent,
  `see [the` then `|guide| page](docs/nowhere.md)` exited 0 and now exits 1
  with `link target "docs/nowhere.md" does not exist`, while `[a`, `| t |`,
  `| - |`, `b](docs/nowhere.md)`, a table between the two parts, still
  exits 0. After the line `` a `x ``, the line
  `` | [y](docs/nowhere.md) z` `` exited 1 and now exits 0, as the code span
  from the first line holds the link, while with `| - |` as a third line,
  which makes the second a table's header row, it still exits 1. The links
  on indented code right after a table row are still read, as is a line
  indented 4 columns that goes on with such a paragraph line: `| a` then
  `    [x](docs/nowhere.md)` still exits 1. A line that opens a block quote
  or list item and then indented code does not go on with that paragraph,
  and the inline links on it are no longer read: `| a` then
  `>     [x](docs/nowhere.md)`, or `-     [x](docs/nowhere.md)`, exited 1
  and now exits 0.
- `npm run check:readme` reads the lines of a table as table rows whether
  or not they start with `|`: a header row such as `t | u`, a delimiter row
  such as `--- | ---`, `-|-` or `:-: | --:`, and a body row such as `bar`.
  The entry above holds only for rows that start with `|`: after a table
  line that did not, the check read the `|` lines as paragraph text, so
  link text and code spans ran on from one row to the next. A table now
  goes on until a blank line, indented code, another block, or a line that
  leaves the block quotes and list items that hold it or opens another. A
  delimiter row is read in the block quotes and list items of its header
  row, and a line that goes on with a paragraph lazily is not a header
  row. With `docs/nowhere.md` absent, `| t | u |`, `--- | ---`,
  `| [c | d |`, `e](docs/nowhere.md)` exited 1 with
  `link target "docs/nowhere.md" does not exist` and now exits 0, as do
  `t | u`, `|---|---|` and the same two rows, and `| bar | baz |`,
  `| - | - |`, `bar` and the same two rows. `| a | b |`, `--- | ---`,
  `` | `c | d | ``, `` | [e](docs/nowhere.md) | f` | `` exited 0 and now
  exits 1, as do `| a |`, `| - |`, `> | [b |`, `> c](docs/nowhere.md)`,
  where the block quote ends the table, and `| a | b |`, `- | -`,
  `| [c |`, `d](docs/nowhere.md)`, where `- | -` opens a list item and is
  not a delimiter row. markdown-it 14.1.1 and micromark 4.0.3 with
  micromark-extension-gfm-table 2.1.2 render each of these as the check
  now reads it.
- `npm run check:readme` reads a line that goes on with a list item's
  paragraph lazily, without the item's indentation, as the header row of a
  table when the next line is a delimiter row with as many cells in the
  list items that hold the paragraph. The entry above read no such line as
  a header row, so a code span or link text opened in a list item's
  paragraph ran on into the row. With `docs/nowhere.md` absent,
  `` - see `x ``, `` | [y](docs/nowhere.md) | z` | ``, `  |---|---|` exited
  0 and now exits 1 with `link target "docs/nowhere.md" does not exist`, as
  do the same lines with `1. see` and `   |---|---|`, with the delimiter
  row indented 3 or 4 columns, in a list item inside `> `, in a list item
  of another, with a body row after `| --- | --- |`, and with
  `` [y](docs/nowhere.md) | z` `` over `  ---|---`, a header row that does
  not start with `|`. `- see [the`, `| docs](docs/nowhere.md) | z |`,
  `  |---|---|` exited 1 and now exits 0. A delimiter row that leaves the
  list item, `|---|---|` after the first two lines, or holds fewer cells,
  `  |---|`, starts no table, and the code span runs on. markdown-it 14.1.0
  and micromark 4.0.2 with micromark-extension-gfm-table 2.1.1 render a
  link to `docs/nowhere.md` in each of these lines that exit 1 and in none
  that exit 0. A line that goes on with a paragraph lazily without a block
  quote marker of the line above is still paragraph text, as markdown-it
  14.1.0 reads it: `` > see `x ``, `` | [y](docs/nowhere.md) | z` | ``,
  `> |---|---|` still exits 0, as the code span holds the link; micromark
  4.0.2 renders a table inside the block quote there, with the link.
- `npm run check:readme` reads a fence inside a block quote as the start of
  a fenced code block, which ends the paragraph above it, and reads no link
  in that block. It read a line such as `` > ``` `` as paragraph text, so a
  code span could run on into the block and past it. With
  `docs/nowhere.md` absent, the lines `` > a `x [y](docs/nowhere.md) ``,
  `` > ``` ``, `` > z` `` and `` > ``` `` exited 0, and now exit 1 with
  `link target "docs/nowhere.md" does not exist`, naming the first line, as
  they did before the check found code spans that run on to a later line
  of their paragraph. So do the same lines with `~~~` for each fence; the
  first line followed by `` > ``` ``, `> z`, `` > ``` `` and `` > w` ``;
  and `` > - a `x [y](docs/nowhere.md) `` followed by the other three lines
  indented for that list item. The block runs from its opening fence to a
  fence of as many or more of the same character with only spaces or tabs
  after it, or to the end of the block quote or list item that holds it,
  and no line of it, the opening fence included, has a link the check
  reads: `> ~~~`, `> [y](docs/nowhere.md)` and `> ~~~` exited 1 and now
  exit 0, as do `` > ``` `` and `> [y](docs/nowhere.md)` with no fence to
  close the block. A dated page whose link to the README sits inside such
  a block now fails the check that it links to the README; it passed. One
  whose link sits on the quoted line before such a block, after a backtick
  that only a backtick inside the block would close, now passes it.
- `npm run check:readme` reads no "as of" note for a dated page inside a
  fenced code block in a block quote, as it reads no link there. It left
  out the lines of a fenced code block only where the fence starts a line,
  so a note that sat only in such a block passed the check. With a README
  that links `docs/AUDIT-2026-06-03.md`, and the lines `` > ``` ``,
  `> As of 2026-06-03.`, `` > ``` `` and
  `> See the [README](../README.md) for the current figures.` above that
  page's first H2, the check exited 0, and now exits 1 with
  `is a dated page, so above its first H2 it must say "as of 2026-06-03"`.
  So do the same lines with `~~~text` and `~~~` for the fences; the note in
  the info string of the opening fence, `` > ```As of 2026-06-03. ``; the
  note with no fence to close the block and the link after a blank line,
  which ends the block quote; the note after a shorter fence inside a
  block that `` > ```` `` opens; the note in such a block in a nested block
  quote or in a list item of a block quote; and the note in such a block
  below the link to the README. A note after the block, on a quoted line or
  after the end of the block quote, passes, as it did.
- `npm run check:readme` reads a fence where the text of a list item starts,
  on the line that opens the item, as the start of a fenced code block. It
  read a line such as `` - ``` `` or `1. ~~~` as paragraph text, and the
  fence that closed the block, which starts its line, as the start of
  another block that ran on to the next such fence. With `docs/nowhere.md`
  absent, `` - ``` ``, `  [y](docs/nowhere.md)` and `` ``` `` indented for
  the item exited 1 with `link target "docs/nowhere.md" does not exist`,
  and now exit 0. `` - ``` ``, `  a` and `` ``` `` indented for the item,
  then a blank line and `[y](docs/nowhere.md)`, exited 0, as the last line
  was read as code, and now exit 1 naming that line; a heading after such
  a block now holds the anchor that a link names. The block runs to a
  fence of the same character, at least as long, with only spaces or tabs
  after it, or to the first line that does not go on with the list items
  that hold it. An item that does not end the paragraph above it, such as
  `` 2. ``` `` right after a paragraph line, opens no block. The other
  checks read the block as fenced code too: `` 1. ```bash `` and
  `   npm test` in the Quick Start are now its first command, a comment on
  an `opena2a benchmark` line in such a block is now checked, and a dated
  page's "as of" note or link to the README inside such a block no longer
  counts, while one after it now does.
- `npm run check:readme` reads no "as of" note for a dated page inside an
  indented code block, as it reads no inline link there. With a README that
  links `docs/AUDIT-2026-06-03.md`, and the lines `    As of 2026-06-03.`,
  a blank line and `See the [README](../README.md) for the current figures.`
  after that page's H1 and a blank line, the check exited 0, and now exits 1
  with `is a dated page, so above its first H2 it must say "as of
  2026-06-03"`. So does the note 4 spaces past a block quote's `> `, after a
  tab, or 4 spaces past where a list item's text starts. A note on an
  indented line that goes on with a paragraph passes, as it did, and so
  does a note indented 4 spaces on the line after `<div>` or `<details>`:
  that line goes on with the HTML block the tag opens, so its text is raw
  HTML, not code. After the blank line that ends such a block, the note is
  code and fails the check.
- `npm run check:readme` opens a fenced code block on a line whose first
  characters other than white space are 3 or more backticks or tildes only
  when they start at most 3 columns past where the text of the list items
  that hold the line starts. It opened one however far in they started, so
  it read no link on the lines after such a line, up to the next one of the
  same character. A line further in goes on with the paragraph above it, as
  indented code cannot interrupt a paragraph, or is indented code. With
  `docs/nowhere.md` absent, the lines `a`, 4 spaces and `` ``` ``, and 4
  spaces and `[y](docs/nowhere.md)` exited 0, and now exit 1 with
  `link target "docs/nowhere.md" does not exist`, naming the third line.
  After a blank line in place of `a`, the other two lines are indented code
  and still exit 0. A heading after such a line is read: a link to it from
  above that line exited 1 with `has no matching heading`, and now passes.
  The other checks read the same blocks: a dated page's "as of" note or
  link to the README after such a line now counts, a comment on an
  `opena2a benchmark` line after it is no longer read as one in a code
  block, and it no longer opens the code block that holds the first command.
- `npm run check:readme` reads the cells of a table row one at a time, as
  markdown-it 14.1.0 and 14.1.1 and micromark 4.0.2 with
  micromark-extension-gfm-table 2.1.1 read them: link text and code spans
  do not run on from one cell to the next, a row holds no definition, and
  the cells of a row past the number of cells of the header row, which
  neither renderer shows, are not read. With `docs/nowhere.md` absent,
  `| a |`, `| - |`, `[x]: docs/nowhere.md` exited 1 with
  `link target "docs/nowhere.md" does not exist` and now exits 0, as do
  `| a |`, `| - |`, `| b | [c](docs/nowhere.md) |`. An inline link on a
  line of indented code after a table row is not read, as on indented code
  anywhere else: `| a |`, `| - |`, `    [x](docs/nowhere.md)` exited 1 and
  now exits 0, and the entry above that says the links on indented code
  right after a table row are still read no longer holds. A line that
  holds no `|` is a table's header row when the delimiter row holds a `|`
  or a `:`, as micromark reads it (markdown-it starts no table there),
  unless the line follows a table row or goes on with a paragraph lazily:
  `[a`, `|:-`, `| e](docs/nowhere.md) |`, `---`, which neither renderer
  renders with a link, exited 1 and now exits 0. A line that goes on with
  a list item's paragraph lazily over a delimiter row in the item that is
  4 or more columns past the block quotes and list items the line goes on
  with starts a paragraph there, as markdown-it reads it: `- see`,
  `` x | `y ``, `    |---|---|` and two lines indented 2 columns,
  `` z` | [m](docs/nowhere.md) | `` and `` | `c | d | ``, exited 0 and now
  exit 1, as both renderers render that link.
- `npm run check:readme` reads a dated page's "as of" note and link to the
  README with the list items and fenced code blocks that check 4 reads. It
  read the page a second time with each line of a fenced code block as a
  blank line, so the list items that a line such as `` 10. - ```bash ``
  opens were lost, and the line after the block was read as indented code.
  With `` 10. - ```bash ``, `      npm i` and
  `    See the [README](../README.md) for the current figures.` after
  `As of 2026-06-03.` above the page's first H2, the check exited 1 with
  `it must link to the README for the current figures`, and now exits 0. So
  do `` 10. ```bash ``, `    npm test`, `` ``` `` indented for the item and
  the same link line; and `- a`, `` ``` ``, `x`, `` ``` ``, `  b`,
  `` 2. ``` `` and the link indented 3 columns, where `` 2. ``` `` cannot
  interrupt the paragraph above and opens no block. With the note on the
  link's line instead, `As of 2026-06-03; see the [README](../README.md).`,
  the first and last of these exited 1 and now exit 0.
- `npm run check:readme` reads no link on the line of a fence. Outside a
  block quote, it read the links on the line of the fence that opens a
  fenced code block, which holds the block's info string, and on a line of
  `` ``` `` or `~~~` with text after its run that it reads as the fence
  that ends the block, which CommonMark reads as a line of code. With
  `` ```bash [x](docs/nowhere.md) ``, `npm i` and `` ``` `` in a README,
  and no `docs/nowhere.md`, the check exited 1 with
  `link target "docs/nowhere.md" does not exist`, and now exits 0, as it
  does with `` ``` ``, `npm i` and `` ``` [x](docs/nowhere.md) ``. A dated
  page whose link to the README sat on such a line, as in
  `` ```text [README](../README.md) `` below `As of 2026-06-03.`, passed
  check 9, and now fails it with
  `it must link to the README for the current figures`.
- `npm run check:readme` reads a dated page's "as of" note without the code
  spans that run on from one line of its paragraph to a later one, as
  check 4 reads the page's links. It took out the code spans of each line
  on its own, so a note inside a span that a backtick on an earlier line
  opens counted. With `` a ` ``, `As of 2026-06-03.`, `` d` ``, a blank
  line and `See the [README](../README.md) for the current figures.` after
  the H1 of `docs/AUDIT-2026-06-03.md`, which the README links, and a
  blank line, the check exited 0, and now exits 1 with
  `it must say "as of 2026-06-03"`. So do `` a `As of `` and
  `` 2026-06-03.` d `` on two lines, and the three lines in a block quote
  or in a list item whose paragraph goes on lazily. Inside a line, a
  backtick after a backslash is now text, and a span that a run of two
  backticks opens now ends at the next run of two, as check 4 reads them:
  with `` \`As of 2026-06-03.\` `` before that link, on its line, the
  check exited 1 and now exits 0, and with ``` `` As of 2026-06-03 ` `` ```
  there instead, it exited 0 and now exits 1.
- `npm run check:readme` ends a fenced code block whose fence starts a later
  line of a list item at the first line that does not go on with the list
  items that hold it, as a fenced code block takes no line lazily. It ran
  the block on to the next line that starts with 3 or more of the same
  character, however far in, past the end of the list item. With
  `docs/nowhere.md` absent, `- a`, a blank line, `` ``` `` and `x` indented
  for the item, a blank line and `[y](docs/nowhere.md)` exited 0, and now
  exit 1 with `link target "docs/nowhere.md" does not exist`, naming the
  last line. So do these lines with `~~~` in place of `` ``` `` and without
  the second blank line, and with `1. a` and the item's lines indented 3
  columns; so does `[y](docs/nowhere.md)` after the block in a list item of
  its own, or indented for the outer item of two when the block is in the
  inner one. A line of `` ``` `` that is not indented for the item now opens
  another block rather than closing this one. The other checks read the
  same blocks: a heading after the item now holds the anchor that a link
  names, a line after the item is no longer a command in the item's shell
  block, a comment on an `opena2a benchmark` line there is no longer read
  as one in a code block, and a dated page's "as of" note and link to the
  README there now count.
- `npm run check:readme` opens no fenced code block on a line of an HTML
  block. A line of 3 or more backticks or tildes there, also after a block
  quote's `>` or a list marker, opened one, and no "as of" note or link was
  read up to the fence that closed it, while CommonMark reads each line of
  the block as raw HTML: up to a blank line after a block tag such as
  `<div>`, and up to the line that holds the block's end after `<pre>`, a
  comment and the other kinds the check follows. With a README that links
  `docs/AUDIT-2026-06-03.md`, and the lines `<div>`, `` ``` ``,
  `    As of 2026-06-03.`, `` ``` ``, `</div>`, a blank line and
  `See the [README](../README.md) for the current figures.` after that
  page's H1 and a blank line, the check exited 1 with `is a dated page, so
  above its first H2 it must say "as of 2026-06-03"`, and now exits 0. So
  does the note between two `~~~` lines in `<details>`, between two
  `` ``` `` lines after `<pre>` and a blank line, in a comment, in a
  `<div>` in a block quote with `` > ``` `` lines, and after `` - ``` ``
  in a `<div>`. A fence after the blank line that ends a `<div>` block, on
  a line without the `>` of a block quote that holds one, or after a
  comment that ends on its first line still opens a code block, and the
  note in it still fails the check. The other checks read these lines the
  same way: `<div>`, `` ```bash ``, `npm test`, `` ``` `` and `</div>` as
  the Quick Start's only command exited 0 and now exit 1 with `no shell
  code block with a command starts before line 30`; a comment on an
  `opena2a benchmark` line there is no longer checked; and an `href` or an
  inline link to `docs/nowhere.md` between two such lines exited 0 and now
  exits 1 with `link target "docs/nowhere.md" does not exist`, as on the
  other lines of an HTML block. A list marker on a line of an HTML block
  still opens a list item for the check, so `<div>`, `` - ``` ``, a blank
  line and the note indented 4 spaces, which CommonMark reads as code, now
  pass, as the same lines with `- x` do. A block that `<span>` alone on a
  line opens (CommonMark kind 7) is not followed, so a fence there still
  opens a code block.
- `npm run check:readme` opens no fenced code block at a line whose run of
  backticks a backtick follows on the line, as CommonMark allows no
  backtick in the info string of a backtick fence. It opened one there, so
  it read no link on that line or on the lines after it, up to the next
  line that starts with 3 or more backticks, however far in, or to the end
  of the page. With `docs/nowhere.md` absent,
  `` ```x`y [x](docs/nowhere.md) `` exited 0, and now exits 1 with
  `link target "docs/nowhere.md" does not exist`, naming that line, as
  markdown-it 14.1.1 and micromark 4.0.2 render it as a paragraph with the
  link. So do `` ``` `y` `` and `[x](docs/nowhere.md)` on the line after
  it, naming the second line. Inside a block of backticks, such a line is
  code and no longer ends the block: with `` ``` ``, `` ```x`y ``,
  `[x](docs/nowhere.md)`, `` ``` `` and `[y](docs/nowhere.md)`, the check
  named the third line and now names the fifth, as both renderers show the
  third as code and the link on the fifth. A heading after such a line is
  read: a link to it from above that line exited 1 with
  `has no matching heading`, and now passes.

## 0.4.1 - 2026-10-17

### Added

- `scripts/run-pinned-benchmark.ts` runs the corpus and DVAA benchmarks on
  pinned inputs: hackmyagent by npm version and tarball integrity, the DVAA
  checkout by commit and the NanoMind model directory by manifest sha256. It
  exits 2 before scanning anything when an input is unpinned, does not match
  its pin or is dirty: an installed hackmyagent file that differs from the
  tarball, a DVAA checkout with local changes or a file the scenario loader
  reads that is not committed, a changed model file, a model or tokenizer file
  that the scanner's classifier would load from outside the verified model
  directory, an OASB checkout with uncommitted changes or with tracked files
  marked skip-worktree or assume-unchanged, a corpus file whose bytes are not
  the committed file, a DVAA commit without `scenarios/` or with an
  `expected-checks.json` that is not valid JSON, or one of the scanner's
  unpinned model sources present (`nanomind-tme.bin` and `tokenizer.json` in
  `~/.opena2a/nanomind/models` or in `models-tme-v3`, `models-tme-v2` or
  `models-tme` under `node_modules/nanomind/training` in the `--hma`
  directory, or anything accepting a connection at `127.0.0.1:47200`). It
  also exits 2 when `package-lock.json` is missing from the `--hma` directory,
  or when a file under its `node_modules` is not the file in the tarball
  whose integrity that lockfile names (read from the npm cache) or is in none
  of those tarballs. Each
  run writes a
  new `results/<date>-<runid>/` holding
  per-sample predictions, a summary of detection over the malicious class and
  a run record naming the versions and hashes of the inputs it checked, and
  never writes to an existing file. A run writes nothing and exits 3 when the
  hackmyagent install, the model directory, the DVAA checkout, the other
  model sources or the installed dependencies check fails again after the
  scan. `--observe` prints the pin
  values of a set of inputs on stdout and, on stderr, the `npm view` command
  whose output must equal the printed integrity; it reports a tarball whose
  name does not carry an exact version (`hackmyagent-<x.y.z>.tgz`) as a
  problem (exit 2) and prints no command for it, and it reports an installed
  dependency file that differs from its tarball as a problem.
  `docs/pinned-benchmark.md` lists what a run checks and what it does not.
- `results/2026-10-10-d8306ef8/` is the first pinned run of record:
  hackmyagent 0.33.2, the npm release current on 2026-10-10, on the v2 corpus
  and DVAA commit `57918267d8d5`, with the classifier files that release
  expects. It is a first pinned measurement. Earlier figures came from
  unpinned runs, so it does not revise them and a difference from them is not
  a regression. `src/benchmark/pinned/runs-of-record.test.ts` checks that
  every committed run names its pinned inputs and that its summary is the one
  its per-sample predictions give.
- A pinned run records what scored each sample. hackmyagent scores a sample
  with a word list instead of its classifier model when the model did not load
  or an inference failed, and sends a sample it is unsure about to a NanoMind
  daemon, so a recorded model manifest did not show that the model produced
  the verdicts. Each prediction line now counts the classifier inferences that
  ran the model, the word-list scorings, the neural classifier inferences and
  the requests sent to the daemon address; `summary.json` sums them per adapter
  and for DVAA, and `record.json` holds the run totals (record schema
  `oasb-pinned-run/v2`). A run exits 2 before scanning when the classifier
  model does not load, and exits 3, writing nothing, when the daemon address
  answers a request during the scan, including a daemon that came up after the
  checks before the scan and was gone before the checks after it. On 0.33.2
  with the run of record's inputs, the verdicts are unchanged and one sample
  was scored by the word list in each of the two adapters that use NanoMind.
- `results/2026-10-10-2a89ce5d/` is a pinned run of record that says what
  scored each sample (record schema `oasb-pinned-run/v2`): hackmyagent 0.33.2,
  DVAA commit `57918267d8d5` and the classifier files that release expects,
  the inputs of `results/2026-10-10-d8306ef8/`. Every verdict is the one the
  earlier run gave. In each of the two corpus adapters that use NanoMind, the
  classifier model scored 4244 of the 4245 samples and the word list scored
  one benign sample; the model scored every DVAA scenario that has a file to
  scan (84 of 86). No daemon answered any of the 56 requests the scanner sent
  to the daemon address.
  `src/benchmark/pinned/runs-of-record.test.ts` now fails when no committed
  run says what scored its samples.
- Each of the 47 scenario files now names its OWASP Top 10 for Agentic
  Applications (2026) risk in an `// OWASP Agentic:` header line, and
  `docs/owasp-agentic-mapping.md` lists the scenarios under each ID. The
  package description and the README said each scenario was mapped to the
  OWASP Agentic Top 10, but the headers named only OWASP Top 10 for LLM
  Applications (2025) IDs, ten files named no OWASP ID, and the mapping page
  covered only the LLM list. Seven of the ten Agentic risks have scenarios;
  the page lists ASI04, ASI06 and ASI09 as gaps. The LLM Top 10 IDs are
  unchanged, and the package description names both lists.
  `scripts/check-owasp-mapping.mjs`, run by `npm run test:scripts`, fails when
  a scenario file names no published Agentic ID or when the page disagrees
  with the headers. The report `npm run report` writes listed four IDs (A01,
  A04, A06, A07) under "OWASP Agentic Top 10 Coverage" that are on neither
  list; it now lists the Agentic IDs the scenarios name, from the map in
  `scripts/scenario-report.mjs`, which `scripts/generate-report.ts` builds
  the report through.
- `npm run smoke` runs three of the commands the README documents, with
  `scripts/check-documented-commands.mjs`: `OASB_ADAPTER=llm-guard` on a
  scenario file gated by capability and on an OS-level one, which must both
  report N/A (skipped); `OASB_ADAPTER` set to a relative path, run from the
  checkout, with an adapter that declares no capabilities; and the "Use as a
  library" example in a new project, after running the section's `npm install`
  lines there with `@opena2a/oasb` replaced by the packed tarball.
  In 0.4.0 the smoke ran none of these commands, and all three failed: the
  OS-level file ran its 4 tests under llm-guard, a relative path was not
  found, and the library example stopped on `Cannot find module 'arp-guard'`.
  The entries under Changed below correct them, and the smoke now fails if
  any of them fails again. Its tests run with `npm run test:scripts`.
- `docs/adapters.md` lists the tests that fail with `OASB_ADAPTER=llm-guard`
  and with `OASB_ADAPTER=rebuff`, each with the assertion it fails on: 9 in
  AT-AI-001 and 3 in AT-AI-005, the two scenario suites those adapters run.
  Both suites assert the reference adapter's pattern catalog: under each
  adapter, 6 of the AT-AI-001 tests detect the input and fail on its
  reference pattern id, and 3 do not detect the input. INT-007 reports N/A
  under both adapters. `scripts/adapter-gating.test.mjs` fails when the tests
  that fail under either adapter are not the ones the page lists, or when one
  fails on an assertion that does not hold the code its row quotes.
- The README's Evaluating Other Products section and `docs/test-catalog.md`
  name the commands that write the scorecard: `npx vitest run
  --reporter=json --outputFile=test-results.json`, then `npm run report --
  test-results.json`, which writes `REPORT.generated.md`.
  `docs/test-catalog.md` says what that file holds, under Run the suite; the
  README says that `REPORT.md` is a recorded run, not its output, and links
  to that section. Before, the README promised a scorecard and only the
  header of `scripts/generate-report.ts` named the command.
  `scripts/doc-facts.test.mjs` fails when either page no longer runs the two
  Usage lines of that header in one code block, and when either of the two
  0.4.1 entries that name the page describing `REPORT.generated.md` does
  not name it exactly once in the wording the test matches, or names a
  page with no paragraph that starts with `REPORT.generated.md`.

### Removed

- `hackmyagent` is removed from `dependencies`. It was pinned at 0.23.8 (now
  deprecated, and inside two published critical advisories,
  GHSA-jmq8-2mfr-49mh and GHSA-44f3-xgp9-pvp2), but nothing in the shipped
  package ever imported it by name: the real-adapter and telemetry-bridge load
  the scanner from a monorepo sibling path (`../../../hackmyagent/dist/...`),
  which resolves only inside this repo's development checkout and never in a
  consumer install. Removing the pin drops that whole advisory-affected
  subtree from every consumer's install closure and changes no behavior. If
  you were relying on `@opena2a/oasb` to pull `hackmyagent` transitively,
  install it directly at 0.32.0 or later.
- The benchmark runner no longer carries `telemetry-bridge`, an unused module
  that `runBenchmark` called after each submission and that tried to load a
  module which does not exist. The library's exports are unchanged.

### Changed

- `OASB_ADAPTER` selects the product for all 222 scenario tests, the count
  at the time of this change (223 since the INT-005 entry below). 37 atomic,
  integration, baseline and E2E test files (159 tests) built the reference
  adapter directly, and 5 more (23 tests) ran on the selected adapter without
  a capability gate, so a scorecard for llm-guard, rebuff or your own adapter
  counted the reference adapter's passes, and stub results, as that
  product's own. Each scenario file now builds its adapter with
  `createAdapter()`, reads events and enforcements through the
  `SecurityProductAdapter` contract and wraps its suite in
  `describeWithCapability`, which now also takes a list: a suite that spans
  several surfaces runs only when the adapter declares every one. With
  llm-guard or rebuff selected, 16 tests run (AT-AI-001 and AT-AI-005) and
  206 are N/A, where 197 ran and 25 were skipped before; with the reference
  adapter every result is unchanged. Two checks read reference-adapter state
  that the contract does not expose and run only on the reference adapter:
  the process monitor's status in AT-PROC-001 (N/A on any other adapter) and
  the instance's running state in INT-008. AT-AI-005 builds its pattern
  scanner before its tests run instead of while the suite is collected, so
  it no longer calls an adapter that lacks pattern scanning.
  `scripts/adapter-gating.test.mjs`, run by `npm run test:scripts`, runs the
  scenario tests against an adapter that declares no capabilities and
  against llm-guard and rebuff, and fails when a suite runs without every
  capability it needs.

- The README offers the Scanner Benchmark as a recall-only comparison across
  products. It recommended the benchmark "for an apples-to-apples detection
  comparison across products", but HackMyAgent labeled 3,704 of the 3,881
  benign samples, so false-positive rate, precision, F1, flag rate and tier on
  the corpus favor that scanner by construction; only recall on the 270
  malicious samples is comparable. `npm run check:readme` now fails when a
  paragraph, table row or heading of the README offers the Scanner Benchmark
  for comparing products without calling it a recall-only comparison.
- The MITRE ATLAS coverage tables mark E2E-003 as skipped. Its one test is
  skipped on every platform, but the README's MITRE ATLAS Coverage table and
  `docs/mitre-atlas-mapping.md` listed it under AML.T0025 as if it ran.
  `npm run check:readme` now fails when a scenario test whose tests are all
  skipped is listed, without "(skipped)" after its ID, in a table of the
  README's MITRE ATLAS Coverage section or of a page that section links to.
- INT-005 checks anomaly detection, as `docs/test-catalog.md` said it did. It
  injected 30 normal events back to back and then 5 events already labelled
  violation/high, and checked the rule alert, the event buffer and the
  severities; no anomaly scorer was called. A new test spreads normal process
  events over 60 simulated minutes, 1 to 5 a minute, then sends a burst of 20
  events labelled normal in one minute. It checks that the scorer learns one
  baseline bucket per minute, scores no baseline event above a z-score of 2
  and scores the burst above 2. The catalog said "5 minutes normal traffic";
  5 minutes was only the window of an event buffer query, and the entry now
  describes the 60-minute baseline. The suite has 223 attack scenarios, 166
  of them mapped to MITRE ATLAS.
- The README no longer says that every scenario maps to MITRE ATLAS. At the
  time of this change, 165 of the 222 tests, in 33 of the 47 scenario files,
  cited one of 15 ATLAS techniques (166 of 223 since the INT-005 entry
  above); the other 57, in 14 files, test the product's defensive response
  and its own detection machinery and cite none. The introduction,
  the MITRE ATLAS Coverage section, `docs/mitre-atlas-mapping.md` and the
  package description now say so. `npm run check:readme` and the release
  smoke's drift guard compare each of these README counts with the scenario
  files, where a file maps to ATLAS when it cites a technique ID such as
  `AML.T0050`.
- BL-003 checks that a product keeps its anomaly baselines across a restart.
  It passed only when the baselines were lost, so a product that persists
  them failed it. The `AnomalyScorer` contract gains optional `save(dataDir)`
  and `load(dataDir)`, and an adapter whose scorer has them declares the new
  `baseline-persistence` capability; BL-003 reports N/A for a product without
  it. The ARP adapter declares it when the installed hackmyagent's
  `AnomalyDetector` has `save` and `load`, and passes BL-003. The llm-guard
  and rebuff adapters keep baselines in memory only and now report BL-003 as
  N/A where they passed it.
- A pinned run's `summary.json` names the NanoMind model of the two adapters
  that use it by the `version` in `nanomind-version.json` of the verified
  model directory, or by the directory's manifest sha256 when it has no
  version. It read the version from `~/.nanomind/models` whichever directory
  was verified, and wrote `vunknown` and `"version": "unknown"` when there was
  no version file; `results/2026-10-10-d8306ef8/` and
  `results/2026-10-10-2a89ce5d/`, both written before this change, keep the
  labels they were written with. The same change renames the two adapters in
  `scripts/run-benchmark-v2.ts`, which verifies no model directory and still
  reads `~/.nanomind/models`: without a version file there they are now
  `NanoMind TME (model only)` and `HMA Full Pipeline (AST + NanoMind)`, where
  they were `NanoMind TME vunknown (model only)` and
  `HMA Full Pipeline (AST + NanoMind vunknown)`; the model-only adapter's
  version is still `unknown` (`src/benchmark/hma-pipeline-adapter.test.ts`
  checks these names). The package exports the same classes as
  `benchmark.HMATMEOnlyAdapter` and `benchmark.HMAPipelineAdapter`, and they
  also read `~/.nanomind/models` there, so code that constructs them from
  `@opena2a/oasb` gets the same new names.
  `src/benchmark/pinned/runs-of-record.test.ts` now checks, in a checkout
  with full history, that each run's `oasb.commit` is an ancestor of
  `HEAD`. `docs/pinned-benchmark.md` and `--help` describe two more refusals:
  a scanner whose classifier the harness cannot trace (exit 2), and a
  classifier whose model session after the scan is not the one it loaded
  (exit 3). The docs also say that the recorded lockfile sha256 depends on the
  name of the `--hma` directory, which npm writes into the lockfile.
- `scripts/run-benchmark-v2.ts` and `scripts/run-dvaa-benchmark.ts` load the
  sibling hackmyagent and DVAA checkouts unpinned, so they now refuse to run
  (exit 2) without `--unpinned`. They no longer overwrite
  `benchmark-results-v6.json` or `dvaa-benchmark-results.json`: they print
  their results and write a file only to a new path given with
  `--out=<file>`. The deprecated `scripts/run-benchmark.ts` now points to the
  pinned harness and to `run-benchmark-v2.ts --unpinned`; it printed a
  `run-benchmark-v2.ts` command without `--unpinned`, which is refused.
- `npm run check:readme` compares every test count the README states with
  the suite, each for equality: the badge, the Quick Start comment, the Counts
  note, the `npm run test:*` comments, the scenario counts, including the one
  in the `opena2a benchmark run` comment, and each row of the
  "What Gets Tested" table, per source directory. It read none of them, so a
  README with stale counts passed it. It collects the suite with vitest
  (no test runs), so it needs `npm ci` and compares each passing count with
  the tests that are not skipped; `--tests <report.json>` compares with a
  vitest JSON report instead, and `--no-counts` skips the comparison, which
  the first step of `npm run smoke` uses before it installs. A report written
  in another checkout is read by each file's path from its `src/` directory,
  as the drift guard reads it; it was read relative to the checkout running
  the check, so every count taken from a test file's directory mismatched
  (the total, passing and skipped counts did not). In both README checks, a
  report without `testResults`, a `testResults` entry without a `name` or an
  `assertionResults` list, and a test result that is not an object with a
  string `status` are each reported by that field or entry instead of a
  JavaScript error, a README path that does not exist is reported by its path
  instead of a stack trace, and `--help` prints the usage on stdout and exits
  0. A README or test report that cannot be read is named once, followed by
  the reason (`ENOENT: no such file or directory`); the line repeated the path
  in Node's error message after it. An error whose message does not end with
  the path keeps its whole message instead of only its code. The statements
  both checks compare are one list, `STATEMENTS` in
  `scripts/readme-counts.mjs`; each check kept its own copy before, and a
  reworded sentence had to be updated in both. The tests of both checks run
  after `npm ci` in `npm run smoke`, and include one that changes each count
  of a README in turn, one that runs `npm run check:readme` on this README,
  and one that collects the suite with the llm-guard and rebuff adapters; the
  last two fail when collecting leaves an adapter data directory.
- Constructing an adapter no longer creates its data directory: the ARP
  adapter creates its ARP instance and the directory on first use, and the
  llm-guard and rebuff adapters create the directory when `dataDir` is first
  read. Collecting the suite (`npm run check:readme`, `vitest list`) left ten
  empty `arp-lab-*` directories in the temp directory on every run, and
  `npm test` left one for each adapter it constructed and never stopped.
- The README's Skills Security Benchmark section now matches the scoring code:
  the nine attack categories in `src/benchmark/types.ts`, controls SS-01 to
  SS-10 and SEC-021 with their compliance levels in
  `src/benchmark/controls.ts`, and tiers assigned from F1, false-positive
  rate, category coverage and kappa in `src/benchmark/scoring.ts`. The
  previous tables listed categories, level requirements and tier criteria the
  code does not use. No tier is published for the v2 corpus, because its F1
  and false-positive rate are withdrawn.
- The README no longer repeats two claims corrected elsewhere: that over 2,900
  benign registry MCP servers declare wildcard tool access (corrected in
  BENCHMARK-RESULTS.md § 3 on 2026-08-27), and the "lines 9-11" location of
  the corpus labeling rule, which now points at the rule's code. The DVAA
  runner comment names its sibling-checkout prerequisite instead of a stale
  "70 scenarios" count.
- The release smoke's drift guard (`scripts/check-test-counts.mjs`, run by
  `npm run smoke`) compares every test count the README states with the
  suite: the badge, the Quick Start comment, the Counts note, the per-group
  comments, the scenario counts in the prose, the scenario-file count and
  every row of the What Gets Tested table. It read three of them before, and
  passed a badge lower than the passing count. Its tests run with
  `npm run test:scripts`.
- `npm test` runs the tests in `scripts/` (`npm run test:scripts`) before the
  suite, so the pull request CI job and the release workflow, which run
  `npm test`, run them too: the tests of both README checks, and
  `scripts/changelog-width.test.mjs`, which fails when a line of this file is
  wider than 80 characters. The README check tests ran only in
  `npm run smoke` before, so a pull request could change a README check, or
  add a test without updating the README's counts, and pass CI. They are not
  vitest tests and do not change the totals the README states.
  `npx vitest run` and the `npm run test:*` groups run the suite without
  them.
- The changelog width test does not count the carriage return of a CRLF line
  ending, so an 80-character line passes in a checkout that converts line
  endings; it was reported as 81 wide. The test exempts one line, the
  2026-08-27 correction recorded as a single paragraph, and now matches that
  line whole: any line that starts the same way was exempt before, at any
  width.
- `npm run smoke` runs `npm run test:scripts` instead of a list of its own,
  which named two of the three test files in `scripts/` and left the
  changelog width test out.
- The drift guard in `npm run smoke` compares the test counts of the README in
  the fresh clone, the committed one. It read the README of the working tree
  the smoke was started from, so an uncommitted edit to it was what the smoke
  measured. The test of this in `scripts/check-test-counts.test.mjs` fails
  when the last line before the drift guard that changes directory is not
  `cd "$TMP/oasb"`, so a `cd "$ROOT"` between the clone and the guard no
  longer passes it, and it accepts `./README.md` as the README's path. It
  counts a line that is not a comment as a change of directory when one of
  its commands is `cd`, `pushd` or `popd`, also written `\cd`. A line that
  ends in a backslash is read as one line with the next, unless the
  backslash is escaped or in a comment. A command starts the line or follows
  `;`, `&`, `|`, a `(` left open on the line or the `)` of a `case` pattern,
  and its name comes after any `NAME=value` or `NAME+=value` assignments, any
  `function NAME` and any of `!`, `{`, `if`, `elif`, `while`, `until`,
  `then`, `do`, `else`, `eval`, `time`, `builtin` and `command`; a `{` inside
  a word, as in `x{cd`, or after the command's name starts no command. Text
  in a quoted string, a `$'...'` string (in which `\'` does not end the
  string), a `${...}` expansion, a command substitution, a comment or a
  `(...)` subshell that closes on the line is not a command of the script's
  shell and is not counted. Some lines count that leave the script's shell
  where it is: a `cd` in a pipeline, in a background job or in the body of a
  shell function, called or not, and, as each line is read on its own unless
  a backslash joins it to the next, a `cd` on a line of a subshell, string or
  here-document that spans lines. A change of directory written another way
  (`"cd"`, `eval "cd ..."`, a variable or an alias), or made by a sourced
  file or by a call of a shell function defined before the clone, is not
  detected.
- The drift guard in `npm run smoke` counts an E2E-001 case skipped as
  inconclusive with the passing tests, not with the skipped ones, and lists
  each such case in its output. A case is skipped so only when the host
  delivered no file event to the harness's own watcher, which is not a change
  to the suite, but the guard read the passing and skipped counts of the run
  as they were, so on a loaded host the smoke failed with the README's
  passing and skipped counts reported as drift. E2E-001 now skips such a case
  with `skipInconclusive` (`src/harness/filesystem-watch.ts`), which records
  the reason as `inconclusive` in the test's meta, where vitest's JSON
  reporter writes it. A test skipped without it, such as a new `it.skip`,
  still changes the skipped count the guard compares. A file in which a test
  was skipped so and no test passed with the product's own event fails the
  guard as `NOT MEASURED`, whatever the counts say: when the host delivers no
  file event for them, the E2E-001 detection cases are skipped and the run
  says nothing about the file, although its case that expects no violation
  for a normal file still passes. A detection case that gets the product's
  event records `detected` in its meta (`markDetected` in
  `src/harness/filesystem-watch.ts`), and the guard takes a file with a case
  skipped as inconclusive as measured only when a test that passed carries
  that mark. The same holds where Node.js has no recursive `fs.watch`, since
  the entry below that starts "Two E2E-001 verdicts change": every case is
  skipped so there, and the guard fails the file that way on every run.
  `node scripts/check-readme.mjs --tests <report>` counts a case
  skipped as inconclusive with the passing tests too and prints how many
  there were: it compared the README's passing counts with the tests that
  passed only, so it failed on a report the guard accepted.
  `scripts/check-test-counts.test.mjs` fails when a `*.test.ts` file under
  `src/` calls `skip(`, written so, on anything but `it`, `test` or
  `describe`, so a test that skips at run time has to call
  `skipInconclusive`. It reads the text of those files: a skip written
  another way (`ctx.skip (...)`, `ctx['skip'](...)`) or made by a helper
  outside those files is not detected. It runs its skip fixture with vitest's
  cache off and fails when the run adds or removes an entry of the fixture
  directory, so the run writes nothing under `scripts/`; an entry that was
  there before the run, such as a `.DS_Store`, does not fail it.
- `src/benchmark/pinned/runs-of-record.test.ts` checks every committed run
  inside a fixed set of eight tests, so committing a run no longer changes the
  `npm test` total. Its check that at least one
  committed run says what scored its samples no longer needs a run of the
  current record schema: a run of any schema but v1 that records what scored
  its samples is enough, so raising the schema does not fail that check
  before a run of the new schema exists.
- `npm test` on Node 24 under load on macOS no longer fails now and then with
  an unhandled `setTypeOfService EINVAL` error while every test passes.
  Node 24's `fetch` sets the type-of-service option on a new connection just
  before it writes the request and lets the error escape when the connection
  was reset first, which the stand-in NanoMind daemons in
  `src/benchmark/pinned/pinned.test.ts` do on purpose. That file now treats
  the option as best effort, as Node 26's `fetch` does, so a reset connection
  fails only its own request, and a new test resets a connection at that
  point.
- `src/benchmark/pinned/pinned.test.ts` now ignores every error the
  type-of-service option raises, as Node 26's `fetch` does, instead of only
  EINVAL. A platform that reports another errno for a torn-down socket no
  longer fails `npm test` with an unhandled error, and a new test checks the
  option for EINVAL, ECONNRESET, ENOTCONN, EBADF, ENOPROTOOPT and an error
  with no errno. Two more tests check that the option is called once, with
  its return value passed through, when it succeeds, and that the file
  installs the wrapper; on Node 26.7.0, no test failed before when the
  wrapper, or its call to the original option, was removed.
- The pinned harness tests check at the end of every test that the
  type-of-service option is still the wrapper the file installed, so a test
  that replaces the option and leaves the replacement in place fails; the
  check was made once before, when one test ran. That test now also calls
  the option through `Socket.prototype` on a socket that is not connected:
  the value it sets reads back, and a value the original option refuses
  raises no error. On Node 26.7.0 every test passed before when the
  installed wrapper was a function that never calls the original option, or
  when a later test replaced the wrapper with one.
- The README's What Gets Tested table calls the one skipped test "skipped on
  every platform", as its Counts note does. The table said
  "environment-skipped", but the test is skipped unconditionally.
- A relative `OASB_ADAPTER` path, such as `OASB_ADAPTER=./my-adapter.js npm
  test` from the README, resolves from the directory the command runs in. It
  resolved from `src/harness/`, so the module was not found; an absolute path
  or a package name loads as before. Three tests in
  `src/harness/create-adapter.test.ts` load an adapter from a temporary
  directory by a `./` path, a `../` path and an absolute path, and the README
  counts them in a new Adapter loading row of What Gets Tested.
- An `OASB_ADAPTER` value that is not `arp`, `llm-guard`, `rebuff`, a path
  or a module that resolves stops the run with one line that names those
  values and the class shapes a module may export, with no stack. It died
  with Node's `Cannot find module` and its require stack. A case variant of
  a built-in name, such as `ARP` or `Llm-Guard`, gets the same line with the
  name it differs from (`did you mean "llm-guard"?`) and is never loaded as
  a package: on a case-insensitive filesystem `Llm-Guard` loaded the
  llm-guard npm package as a custom module, and the run failed with
  `adapter.getCapabilities is not a function`.
- A custom adapter module that assigns its class to `module.exports` loads.
  It was refused as "does not export an adapter class", while the same class
  as a default or named export loaded. A module that exports no class now
  gets the accepted shapes in its message: the default export, a named
  export `Adapter`, or `module.exports = Class`, which `docs/adapters.md`
  states under The adapters. `scripts/doc-facts.test.mjs` reads each page
  this entry names after `module.exports = Class` and fails when it does not
  state all three shapes. Four tests in `src/harness/create-adapter.test.ts`
  hold both entries, and `npm test` runs 428 tests (427 passing, 1 skipped).
- `OASB_ADAPTER=rebuff` now runs the heuristic detection of the rebuff npm
  package, as the README says. rebuff was not a dev dependency, so `npm ci`
  did not install it, and its published package holds TypeScript sources
  only, which Node cannot require: the adapter caught the failed load, scored
  every input 0 and scanned with its own `RBUF-*` patterns alone, with no
  message. rebuff 0.1.0 is now a dev dependency, and
  `src/harness/rebuff-loader.ts` compiles the sources the heuristic needs in
  memory with the `typescript` dev dependency. An input that only the
  heuristic catches ("Pay no attention to prior messages") is reported as
  `RBUF-HEUR-001`; it was not detected before. When rebuff or typescript is
  not installed, each scan throws an error that names the package and how to
  install it, instead of returning a result; when the install does not hold
  the heuristic, the error names the source file and the reason. Constructing
  the adapter still needs neither package. Five tests in
  `src/harness/rebuff-wrapper.test.ts` cover the loading, a missing or
  incomplete rebuff install and the failed scan; none covers a missing
  typescript. The rebuff figures in `REPORT.md` were measured before this
  change and have not been re-measured.
- The README's Usage via OpenA2A CLI section shows the commands the CLIs
  have: `opena2a benchmark <dir>` (with `--level` and `--format json`) and
  `hackmyagent secure <dir> -b oasb-1` (with `--fail-below`), which check an
  agent directory against the OASB-1 controls. It showed
  `opena2a benchmark run` running all 222 scenarios, a `--technique` filter
  and per-technique detection rates in the JSON output; the OpenA2A CLI has
  no `benchmark run` subcommand or `--technique` option, and runs none of
  the scenarios, which still run with `npm test`. `npm run check:readme`
  fails when a README line shows `opena2a benchmark run` or an `opena2a`
  command with `--technique`, and no longer looks for the
  `# all <n> scenarios` comment.
- The README and BENCHMARK-RESULTS.md report the pinned run of record in
  `results/2026-10-10-2a89ce5d/` beside the 2026-06-05 figures:
  hackmyagent 0.33.2 detects 192/270 (71.1%) with the full pipeline,
  138/270 (51.1%) with static patterns and 251/270 (93.0%) with the model
  alone, and 17 of 86 DVAA scenarios (19.8%). Both pages said the 2026-06-05
  figures of hackmyagent 0.23.8 had not been re-measured and led with them,
  82.6% (223/270) and 25 of 86, although two pinned runs of record were
  committed. The inputs of the 2026-06-05 run were not recorded, so it is not
  a baseline for the pinned run and the difference is not traced to a cause.
  `src/benchmark/pinned/runs-of-record.test.ts` now fails when either page
  does not name the newest run of record or does not state its count for
  each corpus adapter and for the DVAA scenarios.
- `npm run report` (`scripts/generate-report.ts`) reads the MITRE ATLAS
  mapping from the `// ATLAS:` header of each scenario file and reports 15
  techniques. It printed a fixed table of the mapping withdrawn on
  2026-06-03, 10 techniques, with AT-PROC-001 under AML.T0046 (now
  "Spamming AI System with Chaff Data") and INT-002 under AML.T0056 (now
  "Extract LLM System Prompt"), and it left out the E2E scenarios. Given a
  vitest JSON report it takes each file's status from its tests, so a file
  whose tests were all skipped shows SKIP where vitest marks the file passed,
  and it exits 1 on a file that is not a vitest JSON report.
  AT-INT-002 and AT-INT-004 gain the `// ATLAS:` header their mapping in
  `docs/mitre-atlas-mapping.md` already gave them, and
  `scripts/scenario-report.test.mjs` fails when the headers and that page's
  Coverage Summary disagree. REPORT.md is marked as the 2026-03-23 snapshot it
  is: its mapping, its integration and E2E counts, its "all 16 capability
  categories" for arp-guard and its llm-guard results no longer hold. The
  demo GIF in the README still shows the 222-test run and is not re-recorded.
- When arp-guard is not installed, `getCapabilityMatrix()` and the default
  adapter's methods throw an error that names `npm install arp-guard` and the
  `OASB_ADAPTER` alternative. They threw `Cannot find module 'arp-guard'`,
  which is what the README's library example did after
  `npm install @opena2a/oasb`: arp-guard is an optional peer dependency and
  npm does not install it. The example now installs arp-guard too.
  `scripts/library-entry.test.mjs` builds the package and loads it where
  arp-guard cannot be resolved.
- `docs/AUDIT-2026-06-03.md` is marked as of 2026-06-03 and sends the reader
  to the README for the current test counts. Its table gives 23
  scoring-engine tests and an `npm test` total of 245, the counts of that
  day, under a first paragraph that said every count is measured from
  `npm test`. Two statements that did not hold when it was written are
  corrected and dated. The one skipped E2E test is disabled on every
  platform; the page said it is skipped when `lsof` or `ss` is unavailable.
  On 2026-06-03, under `OASB_ADAPTER=llm-guard`, the process, network,
  filesystem and enforcement suites passed, because they then constructed
  the arp-guard adapter directly whichever adapter was selected; follow-up 1
  said they report failures. They are gated now and report N/A (see the
  first entry under Changed, on `OASB_ADAPTER` selecting the product for
  every scenario test). `npm run check:readme` now fails when a page
  the README links under a dated file name does not say "as of" that date
  and link to the README above its first H2.
- Four statements in the README and `BENCHMARK-RESULTS.md` are corrected to
  match the data. The ATLAS sentence said the AI-agent technique family was
  added in 2025; of the agent techniques mapped here, AML.T0081 and
  AML.T0086 were created on 2025-09-30, AML.T0105 on 2026-01-30 and
  AML.T0034.002 on 2026-03-30 (also corrected in
  `docs/mitre-atlas-mapping.md`). The README said `corpus/v2.json` has since
  grown uncategorized malicious samples; the file last changed on 2026-03-27
  and already held its 225 when both published runs excluded them. Of the
  177 hand-authored benign samples, 107 declare `source: 'registry'` and 70
  declare `source: 'enterprise'`; all 177 were said to declare `registry`.
  The `allowedTools: ['*']` line in `scripts/export-registry-corpus.mjs` is
  243, not 233. `scripts/doc-facts.test.mjs` reads the corpus and the script
  and fails when the last three statements no longer match them.
- AT-AI-005 now fails when a pattern the scanner exposes has no known
  payload, and it has payloads for JB-003 (hypothetical bypass) and MCP-004
  (runtime MCP tool registration or override), the two of the reference
  build's 20 patterns it never exercised. Its first test checked only that
  there were at least 18 patterns. The test count is unchanged.
  `docs/test-catalog.md` and REPORT.md's AT-AI-005 row no longer say the test
  covers 19 patterns. REPORT.md's scan throughput row says it was measured on
  2026-03-23 on the 19-pattern build and not re-measured on the 20-pattern
  one.
- `docs/shield-maturity-extension.md` no longer maps its eight SM categories
  to MITRE ATLAS techniques, and says that it is a proposal. Its mapping
  table gave eight technique IDs names that `docs/mitre-atlas-mapping.md`,
  the page whose IDs and names are verified against MITRE's `ATLAS.yaml`,
  does not give them: AML.T0015 is Evade AI Model there, not "Automated
  Triage", AML.T0025 is Exfiltration via Cyber Means, not "Credential Theft",
  and the other six IDs are not on that page. The SM categories check the
  security product's own machinery, not an attack, so the page leaves them
  unmapped, as the mapping page leaves the defensive-response and capability
  tests. The page also said that 48 of its 52 SM tests "pass today", but no
  SM test exists in this repository and there is no `src/maturity/`. It now
  opens with a proposal status, states each category's Shield coverage as
  expected and not measured, and drops the 92% figure.
  `scripts/check-maturity-page.mjs`, run by `npm run test:scripts`, fails
  when the page writes an ATLAS technique ID that the mapping page does not
  list or lists under another name, and, while `src/maturity` has no test
  file, when the page is not marked as a proposal or states Shield coverage
  without "not measured".
- The Known Gaps table of `npm run report` words each gap and its severity
  as the README's Known Detection Gaps table does. It said that anomaly
  baselines are not persisted across restarts while the same report listed
  BL-003, which checks that they are saved and loaded, as passing; the gap
  is that the runtime does not reload them when it restarts.
  `scripts/scenario-report.test.mjs` fails when the two tables differ.
- `npm run check:readme` names a key of `STATEMENTS` in
  `scripts/readme-counts.mjs` that is not one of its counts. It threw a
  TypeError instead.
- The OpenAI-shaped and AWS-shaped keys in AT-AI-002's output-leak payloads
  spell FAKE and are joined at run time, so a credential scan of a push that
  touches them does not refuse it; OL-001 still matches both.
  `scripts/placeholder-credentials.test.mjs` fails when an API-key-shaped
  value in `src/` does not spell FAKE.
- STATUS.md says that no agent trust certificate work is planned in this
  repository. The planning memo that recorded it, `briefs/`, is removed.
- `npm run check:readme` also names a key of `STATEMENTS` that every object
  inherits, such as `constructor` or `toString`. It threw a TypeError for
  those.
- `scripts/placeholder-credentials.test.mjs` no longer reports a hyphenated
  word that has "sk" before a hyphen, such as a `risk-` compound with twenty
  or more letters and hyphens after the hyphen, as an OpenAI-shaped key.
- AT-AI-002's AWS output-leak test is named for the access key ID, the part
  of the payload OL-001 matches, and checks that OL-001 is the pattern that
  matched. It was named for a secret key, which OL-001 does not detect.
- `npm run report` writes `REPORT.generated.md`, which git ignores. It wrote
  `REPORT.md` and so replaced the 2026-03-23 run kept there as recorded.
- The Summary of `npm run report` counts the attack scenarios only, the
  tests under `src/atomic`, `src/integration`, `src/baseline` and `src/e2e`.
  It counted every test of the run: the scoring-engine, pinned benchmark
  harness and adapter tests were in "Passed" and the skipped scenarios in
  the denominator of the pass rate, so a run of AT-AI-001 and
  `src/benchmark/scoring.test.ts` with an adapter that declares no
  capabilities read 17 passed and a 60.7% pass rate with every scenario
  skipped. The table now gives the scenarios, the passed, the failed, the
  not applicable (in a suite skipped by the product's capability
  declaration) and the skipped for another reason, and a pass rate over the
  passed and failed scenarios; with none of those it reads "not measured (0
  scenarios evaluated)". The other tests are on a "Harness self-tests" line
  outside the pass rate. A scenario file that vitest marks failed with no
  failed test, such as one whose adapter threw while it was collected, is
  FAIL instead of SKIP and is counted in the table. "Unique ATLAS techniques
  covered" gave the 15 techniques the scenario headers map, whatever the
  status of their files; that count is now "techniques mapped", and a report
  with results also gives the techniques covered by a passing scenario.
- The report `npm run report` writes names the product under test. A vitest
  run with a JSON report file writes `<report>.adapter.json` beside it
  (`scripts/record-adapter.mjs`, a global setup in `vitest.config.ts`): the
  `OASB_ADAPTER` value, `arp` when it is unset, and the product, version and
  capabilities the adapter's `getCapabilities()` declares. The record holds
  the SHA-256 of the report it was written for, so a record left beside a
  report from another run is not read. Without a record the report reads
  "Product under test: not recorded" and names the command that writes both.
- The secret scan in the security workflow reads every commit a push to
  `main` adds, from the push's previous head to its new head; it read only
  the head commit, so a push of several commits left all but the last
  unscanned. A push with no previous head in the history, such as a force
  push, is read in full. The weekly scheduled run reads the full history,
  not only the last commit. gitleaks is pinned to 8.30.1 and its archive is
  checked against the release's sha256 before it is unpacked; it was the
  latest release, unchecked. The job's token can only read the repository.
  `scripts/secret-scan-workflow.test.mjs` checks these: the workflow's
  triggers, that the job has no condition of its own and fails when
  gitleaks reports a leak, the read-only token, the pinned version, the
  checksum's value and the step that checks it, the download host, the pull
  request range, the push range and its fallback, and the scheduled run's
  full history. Its last test weakens a copy of the workflow in each of
  those ways and fails when no other test fails on the copy; the change to
  the step that checks the checksum is made only where `sha256sum` is
  installed, as the test that catches it runs only there. It does not check
  the workflow's concurrency settings, under which a later run can cancel
  one before its scan finishes, or which version of the checkout action the
  job uses.
- `scripts/placeholder-credentials.test.mjs` reports an OpenAI-shaped key
  written right after an escape sequence, such as `\n` or `\x3D`, or after a
  percent-encoded byte, such as `%3D`. A key after the letter or digit that
  ends one was read as the middle of a word, so the test passed such a value.
- `scripts/scenario-report.test.mjs` reads `.gitignore` to check that it
  ignores `REPORT.generated.md`. It asked git, and so failed in a source
  archive without git metadata or where git is not installed. It decides as
  git does: the last line that matches the file decides, a glob such as
  `REPORT.*.md` or `!*.md` included. It read only lines that name the file,
  so a later `!*.md` passed the test although git then does not ignore it.
- `npm run report` exits 1, writing no report, when the results file named
  as its argument does not exist, and names the `npx vitest run` command
  that writes it. It wrote a report with every status N/A and exited 0, as
  it still does when no argument is given and `test-results.json` does not
  exist.
- `npm run report` runs tsx 4.23.15, pinned as a devDependency. It ran
  `npx tsx`, which downloaded the registry's current tsx when none was
  installed.
- `docs/demo.tape` states no test or scenario count. It said 222 tests and
  222 attack scenarios; the README states the counts.
- `docs/demo.tape` runs from the root of any clone. Its hidden setup changed
  into one checkout path under the home directory.
- Before each case, the E2E-001 live filesystem tests write files named
  `oasb-watch-probe-N` into the watched directory, one every 250 ms, until
  the product reports one. They paused a fixed 200 ms after starting the
  product. The wait is at most 5 seconds, and it ends 1 second before the
  10-second timeout of the hook it runs in, so a product that is slow to
  start gets the time the fixed pause left it: the wait lasts at least
  200 ms. The `.env` case and the normal-file case leave the probe events
  out. Each detection still waits 5 seconds, and `vitest.config.ts` is not
  changed. A `waitForEvent` that throws, or that does not settle when its
  timeout passes, counts as no report. The 8 tests in
  `src/harness/filesystem-watch.test.ts` cover the wait and its budget.
- Of six test adapters written for the comparison, not in this
  repository, the E2E-001 result changed for one: an adapter whose watcher
  misses the writes made in the first second after `start()` went from
  4 failed and 1 passed to 5 passed. Adapters that report each write
  7 seconds late (4 failed, 1 passed), that report only sensitive paths
  with a `start()` of 5.2, 6 or 9 seconds (5 passed), whose `waitForEvent`
  never settles (5 passed) or throws (4 failed, 1 passed), and that report
  every write as a violation (1 failed, 4 passed) kept their results.
  `llm-guard` and `rebuff` skip E2E-001 with and without the change.
- With the probe wait alone, E2E-001 detection cases still reached their
  5-second timeout under full-suite load: in one
  `npx vitest run --maxWorkers=4` on a 16-core macOS host at a 1-minute
  load of 7.9 to 8.1, the `.bashrc` and `.npmrc` cases timed out. The file
  run alone, with four workers, passed at a load of 9.1 and had one such
  timeout at a load of 10.4 while other test runs shared the host. The
  entry below reads such a case against the harness's own watcher.
- An E2E-001 detection case the product reported nothing for within its
  5-second window is read against a control: the harness's own `fs.watch`
  of the watched directory, opened before the product starts and closed
  after it stops, which records every file event the host delivers to the
  process. The control is read when the window has ended, also when the
  product's wait fails sooner. When it saw the path within the window, the
  case fails as before, with the control's time added to the message; when
  it saw nothing, the case is skipped from inside the test as inconclusive,
  naming the path, the window, the measured load and the product's own
  error. A case whose product reported no probe file within the readiness
  wait goes on to its write, as before, when the control saw one of the
  probe files; when the control saw none, the case is skipped as
  inconclusive without its write, naming the wait, how many of the probe
  files the control saw and the measured load. A case is skipped only when
  the control saw no file event for what decides it: none for the case's
  file within its 5-second window, or none for any probe file during the
  readiness wait of a product that reported none. A case that is not
  skipped passes or fails as it did before, so the adapters compared above
  keep their results in every case that is not skipped. The window, the
  single write per case, the five cases and their assertions do not
  change. No detection case passes without the product's own event. The
  entry below that starts "Two E2E-001 verdicts change" changes two of
  these verdicts: it adds a skip where the control cannot be opened, and a
  filesystem event without `data` no longer fails a case. On a
  16-core macOS host at a 1-minute load of 14.8 to 28.3, with `fseventsd`
  at 85% to 106% of a core, the file run alone five times gave 0 failed and
  4 or 5 skipped per run; each readiness skip stated that the control saw
  0 of the 20 probe files written. One `npx vitest run --maxWorkers=4` of
  the whole suite, at a load of 21.4 with `fseventsd` at 112%, gave 370
  passed, 3 skipped (2 E2E-001 cases and E2E-003) and 0 failed. Against a
  scratch adapter outside the repository that polls the directory, each
  mode run once with the file alone: reporting only sensitive paths, 5
  passed; the same with a `waitForEvent` that never times out, 3 passed and
  2 skipped before their write; reporting nothing, with a `waitForEvent`
  that throws, or reporting each write 7 seconds late, it failed each case
  whose write the control saw (3, 3 and 2 of the 4) and skipped the others;
  with a `waitForEvent` that fails at once for the case's file, it failed
  the 1 case whose write the control saw, 2939 ms after the write, and
  skipped the 3 others. The normal-file case passed in each of those runs.
  With the control replaced by a watcher that delivers nothing, reporting
  only files that are not sensitive skipped all 4 detection cases and
  passed none, and reporting nothing skipped all 5 before their write.
  `src/harness/filesystem-watch.test.ts` has 11 more tests, 19 in the file,
  for the control and the rules; the suite was then 373 tests, 372 not
  skipped. `docs/test-catalog.md` states the 5000 ms window for E2E-001
  instead of a latency of about 200 ms, which no measurement supported.
- `scripts/changelog-width.test.mjs` also fails when a line of
  `docs/testing/release-smoke.md` is wider than 80 characters. Two lines of
  the guide's drift guard step were wider, 104 and 84 characters; they are
  rewrapped at 78 or less, with the text unchanged.
- Two E2E-001 verdicts change. First, where Node.js has no recursive
  `fs.watch`, every E2E-001 case is skipped as inconclusive; each one
  failed there. The control is a recursive `fs.watch`, which Node.js has
  on Linux from 19.1.0, while `package.json` allows Node.js 18. Before
  19.1.0 on Linux, opening it throws `ERR_FEATURE_UNAVAILABLE_ON_PLATFORM`
  in the hook that runs before each case, so all five cases, the
  normal-file case among them, failed with that error whatever the product
  did. Now each case is skipped there, before the product is created or
  any file is written, with a message that says the case was not measured
  and names the Node.js version, the platform and the error; any other
  error on opening the control still fails the case. The skip is made
  with `skipInconclusive`, as every run-time skip of a test under `src/`
  is, so the release smoke's drift guard counts these cases with the
  passing tests and, as no test of the file passed, fails the file as
  `NOT MEASURED` on every run on such a Node.js;
  `docs/testing/release-smoke.md` says so. Not run on Node.js 18: with
  `fs.watch` replaced by one that throws that error for a recursive watch,
  the file gave 5 failed before this change and 5 skipped with it, each
  recorded as inconclusive, and the drift guard read the report of that
  run as the file not measured; a unit test replaces the watch function
  the same way. Second, a filesystem
  event that has no `data`, which the adapter interface allows, no longer
  fails a detection case. The four detection predicates read `data`
  without a check and threw a `TypeError` on such an event; they now read
  it with `?.` and pass over the event. With such an event collected
  before a case's wait, the wait failed at once, so the case failed when
  the control saw the path and was skipped as inconclusive when it saw
  nothing, also when the product then reported the write; now the case
  waits for that report and is read by it. With such an event arriving
  during the wait, the `TypeError` was thrown into the adapter's call of
  its event handler; now nothing is thrown. A product whose only report of
  the write has no `data` is read as a miss, as before. Measured with the
  harness's event collector, a stubbed control and the predicates as
  written before and after. The reference adapter's filesystem monitor
  puts `data` on every event it reports (hackmyagent 0.23.8, the locked
  version), so its results do not change. Nothing else in this entry
  changes a verdict. An error the control's watcher reports was ignored, so
  its silence afterwards read as the host delivering nothing. The first
  such error is kept and named in the inconclusive message of a case the
  control recorded no event for, in the 5-second window or in the readiness
  wait; a case whose path the control recorded before the error still
  fails as a product miss. The inconclusive messages gave `loadavg 0.00` on
  Windows, where Node.js measures no load; there they say `loadavg
  unavailable on Windows`. After a case, the control is closed and the
  watched directory removed also when the product's `stop()` rejects; both
  were left behind. The rules a case is read by stay where they were:
  `awaitDetection` and `readinessSkip` decide in
  `src/harness/filesystem-watch.ts`, and the test file fails the case or
  skips it with `skipInconclusive`, where
  `scripts/check-test-counts.test.mjs` checks each skip.
  `src/harness/filesystem-watch.test.ts` has 12 more tests, 31 in the
  file: for the message where Node.js has no recursive `fs.watch`, the
  control's error, the load on Windows, the end of a case, a case the
  control saw only other files for, and an upper bound on the wait that
  follows a product miss. The README states a limit of the readiness
  wait: a product whose `start()` returns 8.8 seconds or more into the hook
  leaves that wait at its 200 ms minimum, so when it also reports no probe
  file, its cases are measured only if the control saw a probe file within
  those 200 ms. On a 16-core macOS host at a 1-minute load of 16.3 to
  24.3, the file run alone three times gave 0 failed in each run: 4
  skipped and the normal-file case passed; 5 skipped; 5 skipped. Each skip
  named a wait in which the control saw no event, so no detection case was
  measured in those runs.
- The git commands of `src/benchmark/pinned/pinned.test.ts` are stopped
  after 8 seconds and fail with a message that names the command. They had
  no time limit, and the calls are synchronous: a stalled git blocked the
  test worker, so the 10-second test timeout could not fire. One more test
  covers it, 99 in `src/benchmark/pinned`; the suite is 386 tests, 385 not
  skipped.
- `npm run typecheck:tests` type-checks `src/` with its test files
  (`tsconfig.test.json`, no output). `npm run build` excludes the test
  files and vitest does not check types, so a type error in a test was
  never reported. The 8 in E2E-001 are fixed, each by reading an event's
  optional `data` with `?.`. The assertions do not change; one verdict
  does, as the E2E-001 entry above states: a filesystem event without
  `data` no longer fails a detection case. On 2026-10-12 the command
  reports 259 errors in 34 other scenario test files, which this entry
  does not fix, and `npm test` does not run it.
- Those 259 errors are fixed, and `npm test` runs the check: its
  `pretest` script runs `scripts/typecheck-tests.test.mjs`, which fails
  when `npm run typecheck:tests` reports a type error or when
  `tsconfig.test.json` takes in no scenario test file. The adapter
  interface gains, as optional additions, what the reference adapter
  implements and the tests use: the `anomaly` event category,
  `requireLlmConfirmation` on `AlertRule`, `threshold` on `AlertCondition`,
  and `targetPid` as a third argument of `EnforcementEngine.execute()` and
  as a field of `EnforcementResult`; `activity` stays. The tests read an
  event's optional `data` with `!`, which leaves what they run unchanged.
  Events the tests inject with the `connection` category or the `warning`
  severity, which neither the interface nor the reference adapter defines,
  now use `normal`, the category the reference adapter gives a connection
  to an allowed host and a file write it does not flag, and `medium`, the
  severity it gives a connection to a host that is not allowed. With the
  reference adapter, the 148 tests in those 34 files have the same results
  before and after: 147 pass, 1 is skipped.
- The code that reads an E2E-001 case moves from the test file to
  `src/harness/filesystem-watch.ts`, where unit tests cover it:
  `detectWrite` awaits the product's event for a write, fails the case on
  a product miss, skips it as inconclusive when the host delivered no
  event and marks it detected only when the product reported the write;
  `openControlWatchOrSkip` opens the control and skips the case as
  inconclusive where Node.js has no recursive `fs.watch`; and
  `isSensitiveFileEvent` and `fileEventFor` are the four detection
  predicates. In the test file, deleting the mark, that skip or the
  rethrow of any other error on opening the control, or reading an
  event's `data` without `?.`, left `npm test` and `npm run test:scripts`
  passing. The code is the same, so no verdict changes.
  `scripts/check-test-counts.test.mjs` fails when a `*.test.ts` file under
  `src/` names `markDetected` or writes a property named `detected`, which
  on a task's meta only `markDetected` writes, and when E2E-001 stops
  calling `detectWrite` or `openControlWatchOrSkip`, or passes a detection
  case a predicate other than `isSensitiveFileEvent` or `fileEventFor` of
  the name the case writes. It reads the text of those files: a mark
  written another way, such as with a key built at run time
  (`meta[key] = true`), with an object whose `detected` key is on another
  line than `meta`, with an object whose `detected` key follows a matcher
  (`.toBe(`) on its line or with an object whose `detected` key follows
  another `.toXxx(` call (`.toString(`) after `expect` on its line, or made
  by a helper outside those files, is not detected. From a matcher call
  after `expect` on its line, such as `.toEqual(`, to the end of the line
  the check takes only an assignment as a write, so an assertion that reads
  the mark there (`.toEqual({ detected: true })`,
  `.toHaveProperty('detected', true)`) does not fail it. A call such as
  `.toString(` before `expect`, or on a line without `expect`, is not a
  matcher call; the check took one as a matcher, so a line such as
  `String(1).toString(); Object.assign(ctx.task.meta, { detected: true });`
  did not fail it. A matcher call on a later line than its `expect`, as in a
  chained assertion that continues with `.toHaveProperty('detected', true)`
  on the next line, is not taken as a matcher call either, so that read of
  the mark fails the check: write the matcher call on the line of its
  `expect`. After `expect` on a line the check takes every `.toXxx(` call
  as a matcher call, chained to that `expect` or not, so after
  `expect.assertions(0);` on the same line the write in
  `String(1).toString(); Object.assign(ctx.task.meta, { detected: true });`
  still does not fail it. No file under `src/` has either form. The check
  finds the first `expect` on a line once and looks for a matcher call
  after it, and finds the first `meta` word once and looks for a
  `detected` key after it, so its time grows with the length of the line.
  Its patterns took time that grew with the square of that length: the
  matcher pattern looked back for `expect` from every `.`, over 3 seconds
  on a line of 80,000 `.` characters, and the key pattern ran on from every
  `meta` word to the end of the line, over 1 second on a line of 120,000
  characters of `meta` words, and tried every split of a run of spaces
  after `detected` between the spaces it allows before and after a `]`,
  over 7 seconds on a run of 120,000 spaces.
  `fileEventFor` read an event without a path as the text
  `undefined`, so a name that is part of it (`def`, `fine`, an empty name)
  matched such an event; it now matches only an event whose path contains
  the name. E2E-001's names (`.ssh`, `.bashrc`, `.npmrc`) are not part of
  that text, so no verdict changes. After a
  case whose product's `stop()` rejects and whose control's `close()`
  throws, `endWatchCase` passes on the rejection of `stop()`, as its
  description says; it passed on the error of `close()`. The README says
  an inconclusive E2E-001 skip prints the measured load where the
  platform measures one: on Windows the message says `loadavg unavailable
  on Windows`. `src/harness/filesystem-watch.test.ts` has 10 more tests,
  41 in the file; the suite is 396 tests, 395 not skipped.
- The deprecated AST adapter (`HMARealASTAdapter` in
  `src/benchmark/hma-real-adapter.ts`) now calls `analyzeCredentials`,
  `analyzeGovernance`, `analyzeScope` and `analyzePrompt` with the sample
  content, like the pipeline adapter. It called them with the AST alone, a
  route the shipped scanner never takes. No committed result changes: this
  adapter produced none, and its only runner, `scripts/run-benchmark.ts`,
  stays deprecated. The adapter now loads hackmyagent from the root
  `configureHmaRoot()` names, as the pipeline adapters do; without that
  call it is the sibling checkout, as before. Three more tests cover the
  calls and the root, 28 in `src/benchmark` outside
  `src/benchmark/pinned`; the suite is 399 tests, 398 not skipped.
- An AST adapter that has scanned once now compiles on the
  `SemanticCompiler` of the root `configureHmaRoot()` names next. It kept
  the compiler of the first root, so a second scan built its AST on that
  build and ran the analyzers of the new one. One more test scans twice
  on one adapter across a root change, 29 in `src/benchmark` outside
  `src/benchmark/pinned`; the suite is 400 tests, 399 not skipped.
- The deprecated AST adapter (`HMARealASTAdapter`) and the full adapter
  built on it (`HMARealFullAdapter`) report as their version the version in
  the package.json of the hackmyagent root they load, as the pipeline
  adapters do. Both reported the fixed string `0.12.3` whichever build
  `configureHmaRoot()` named. The static adapter (`HMARealStaticAdapter`)
  loads no build and keeps its fixed version. No committed result changes:
  these adapters produced none. One more test covers the version, 30 in
  `src/benchmark` outside `src/benchmark/pinned`; the suite is 401 tests,
  400 not skipped.
- A benchmark adapter that has scanned reports the version of the
  hackmyagent root configured at its last scan. `HMARealASTAdapter`,
  `HMARealFullAdapter`, `HMAPipelineAdapter` and `HMAPipelineStaticAdapter`
  read the version when they are created and again at each scan. They read
  it only when they were created, so an adapter that scanned again after
  `configureHmaRoot()` named another root still reported the version of the
  first root, while the AST, full and pipeline adapters loaded the new one
  for that scan. Until its first scan an adapter reports the version of the
  root configured when it was created.
  `HMAPipelineAdapter` and `HMATMEOnlyAdapter` now scan on the
  `SemanticCompiler` or the classifier of the root `configureHmaRoot()`
  names next, as `HMARealASTAdapter` does. Each kept the one of the first
  root it scanned with: after a root change the pipeline adapter built its
  AST on that build and ran the analyzers of the new one, and the
  model-only adapter classified on that build. No committed result changes:
  only the pinned harness calls `configureHmaRoot()`, once, before it
  creates its adapters, and the other runners scan on the sibling checkout
  throughout. Four more tests cover the version after a root change, the
  root the pipeline and model-only adapters scan on after one, and that an
  adapter builds one `SemanticCompiler` for its scans on one root, 34 in
  `src/benchmark` outside `src/benchmark/pinned`; the suite is 405 tests,
  404 not skipped.
- The README is shorter. Its first screen runs one scenario file and shows
  what that prints, and its reference text moved, as written, to the pages
  it links: what OASB is and is not to `docs/how-it-works.md`; the What Gets
  Tested table, the Counts note and the command for each group to
  `docs/test-catalog.md`; the MITRE ATLAS Coverage table to
  `docs/mitre-atlas-mapping.md`; the harness files to
  `docs/test-harness.md`; the adapter details and the note on cross-product
  numbers to `docs/adapters.md`; the Skills Security Benchmark, its corpus,
  runners and latest results to `docs/pinned-benchmark.md`; the Known
  Detection Gaps to `docs/known-gaps.md`; and the Updates table to
  `docs/updates.md`. `npm run check:readme` and the release smoke's drift
  guard read the test counts, the What Gets Tested table and the links on
  those pages as they read the README's (`README_PAGES` in
  `scripts/readme-counts.mjs`), and a message about a page names it. The
  per-test tables moved to `docs/test-catalog.md` as well, and the
  Contributing section became a line of the Documentation list.
  `npm run check:readme` fails when the README has 400 lines or more, when
  its first H2 heading is not `## Quick Start` or is at line 25 or later,
  when no shell code block with a command starts before line 30, and when a
  relative link it reads does not resolve; `npm run smoke` runs these layout
  and link checks. It reads three link forms, each written within one line:
  inline links (`[text](path)`, with an optional double-quoted title),
  reference definitions at the start of a line (`[label]: path`) and quoted
  HTML `href` attributes. It checks a `#anchor` only in links to `.md`
  files. Other forms, such as an unquoted `href` or a definition on the
  same line as a list marker (`- [label]: path`), are not checked.
- `src/benchmark/pinned/runs-of-record.test.ts` looks for the newest run's
  counts on `docs/pinned-benchmark.md` and `BENCHMARK-RESULTS.md` outside
  code spans and code blocks. The page's description of that test writes
  the form of a count as code, `192/270`, which is the full-pipeline count
  of `results/2026-10-10-2a89ce5d/`, so with the HMA Full Pipeline row
  deleted from the page's Latest Results table the test still passed (8 of
  8); it now fails on that edit. The page says a count written only as code
  does not count. The file still holds 8 tests.
- `npm run check:readme` reports a link whose path, or whose anchor in a
  link to a `.md` file, has a malformed %-escape, such as
  `[the plan](100%.md)`, by its page and line and says to write a literal %
  as `%25`; on such a link it ended with an uncaught `URIError` and a stack
  trace. This holds in the README, on the pages that took its text and, with
  the counts checked, in the README's MITRE ATLAS Coverage section.
- `src/benchmark/pinned/runs-of-record.test.ts` also leaves out indented code
  blocks when it looks for the newest run's counts on
  `docs/pinned-benchmark.md` and `BENCHMARK-RESULTS.md`: text that starts
  four or more columns past the margin, or past the content of the list item
  or block quote it is in, and does not continue paragraph text. With the HMA
  Full Pipeline row deleted from the page's Latest Results table and
  `hma-pipeline 192/270` added at the end of the page as an indented code
  block, the test passed (8 of 8); it now fails on that edit. The page says a
  count written only in a code block does not count. The file still holds 8
  tests.
- `src/benchmark/pinned/runs-of-record.test.ts` checks that a count in a
  fenced code block holding a blank line, a `text` block of `hma-pipeline`,
  a blank line and `192/270`, is not a stated count. Its one fenced-block
  case had no blank line, so the code-span pattern of `outsideCode` removed
  that block too, and with the fenced-block pattern deleted the file still
  passed (8 of 8). The code-span pattern does not cross a blank line, so
  the new case fails on that edit (1 failed, 7 passed). The file still
  holds 8 tests.
- For an anchor with a malformed %-escape, `npm run check:readme` now says
  to drop the %, since a heading's anchor has none, and names the anchor to
  write when dropping it matches a heading: `[x](#100%-coverage)` under the
  heading `## 100% coverage` is told to write `#100-coverage`, which passes.
  It said to write the % as `%25`, and `[x](#100%25-coverage)` then failed
  with `anchor "#100%25-coverage" has no matching heading in README.md`. A
  link path with a malformed %-escape is still told to write `%25`.
- The README header shows the CI status badge in place of the tests badge
  and the MITRE ATLAS badge, whose counts were typed into their URLs. The
  two sentences of the description that stated the scenario and MITRE ATLAS
  counts moved, as written, to the What Gets Tested section of
  `docs/test-catalog.md`, a page both count checks read; the README keeps
  the first of them without its count. The line
  "MITRE ATT&CK Evaluations, but for AI agent security products." moved to
  `docs/how-it-works.md`. The count list both checks read
  (`scripts/readme-counts.mjs`) has no tests badge entry, and
  `npm run check:readme` fails on a static shields.io badge in the README's
  prose whose message starts with a digit, such as `tests-404%20passing`.
- `npm run check:readme` reports a link with an anchor to a directory whose
  name ends in `.md`, such as `[a](x.md#setup)` or `[a](x.md#100%)`, by its
  line and says to link the page in that directory that holds the heading;
  on such a link it ended with `Error: EISDIR` and a stack trace. It ended
  with the same error on a link without an anchor to such a directory whose
  name carries a date (`docs/AUDIT-2026-06-03.md`) and, with the counts
  checked, on one in the README's MITRE ATLAS Coverage section; it does not
  read such a directory as a page.
- `src/benchmark/pinned/runs-of-record.test.ts` leaves out a fenced code
  block inside a list item or block quote when it looks for the newest run's
  counts. It found fences with a pattern that matched only a fence starting
  a line after at most three spaces, so with the HMA Full Pipeline row
  deleted from the Latest Results table of `docs/pinned-benchmark.md` and a
  numbered list item appended whose fenced block, indented four spaces,
  holds `hma-pipeline`, a blank line and `192/270`, the test passed (8 of
  8); it now fails on that edit (1 failed, 7 passed). It now finds fenced
  blocks while it follows block quotes and list items, as it does for
  indented code, and a fenced block ends with the list item or block quote
  that holds it. A line that starts with three backticks and holds another
  backtick is read as text with a code span; it opened a fenced block that
  ran to a closing fence or to the end of the page. The file still holds 8
  tests.
- `npm run check:readme` holds the README's first-run capture to the suite.
  The capture under Quick Start, of
  `npx vitest run AT-AI-001 --reporter=verbose`, states 11 tests in 1 file
  and names tests by their full names, and no check read it, so a renamed
  test or a changed count left it stale. The check now fails when the
  command the capture names is not a `vitest run` that a code block above it
  shows, when a `✓` line names a test that the command does not select or
  that is skipped, or when a `Test Files` or `Tests` line states a passed,
  failed, skipped or total count other than that of the files and tests the
  command selects. On this README it prints
  "capture of `npx vitest run AT-AI-001 --reporter=verbose` matches the
  collected suite: 11 tests in 1 test file".
- The README's OpenA2A CLI example said that
  `opena2a benchmark ./my-agent --level L2` checks levels L1, L2 and L3.
  opena2a-cli 0.10.13 checks the OASB-1 controls of levels L1 and L2 for
  `--level L2`: it reads them with hackmyagent's `getCheckIdsForLevel`, which
  takes the controls of the level given and of the levels below it. The
  comment now says "OASB-1 controls of levels L1 and L2". hackmyagent 0.33.2
  `secure -b oasb-1` selects levels the same way: on a directory holding a
  `package.json` and an `index.js` it reports 26 controls, verified and
  unverified, at L1, 44 at L2 and 46 at L3. `npm run check:readme` now fails
  when a shell comment in a code block, on an `opena2a benchmark` line or on
  a `hackmyagent secure` line with `-b oasb-1`, names OASB-1 levels other
  than those up to the level the line gives with `--level` (or `-l` for
  hackmyagent), or than L1 when it gives none.
- The README's capture under Quick Start links its full output,
  `docs/captures/quick-start.txt`, and `docs/captures/quick-start.json`
  beside it records the command, the environment (`CI=true`, `NO_COLOR=1`),
  the exit code, the vitest and Node.js versions and the date of the run.
  The full output is what that run printed, with the RUN banner, which names
  the vitest version and the absolute path of the checkout, replaced by
  `...` and without the trailing blank line. The two timings in the
  README's capture that differed from it were re-taken from that run.
  `npm run check:readme` now holds a full output that the line above a
  capture links as `[full output](<file>)` to the suite as it holds the
  capture, and fails when the full output leaves out a test the command
  selects that is not skipped (with `--tests`: that passed) or a
  `Test Files` or `Tests` line, when the capture shows a line, other than a
  blank or `...` line, that the full output does not have, or when the
  `.json` file beside it is missing or names another command or another
  full output. On this README it prints "Its full output
  docs/captures/quick-start.txt shows the 11 tests not skipped and holds
  each line of the capture".
- With the counts checked, `npm run check:readme` reports a
  `[full output](<file>)` link above a capture whose path has a malformed
  %-escape, such as `[full output](docs/captures/100%.txt)`, by its line
  and says to write a literal % as `%25`, and reads the capture as linking
  no full output; on such a link it ended with an uncaught `URIError` and a
  stack trace.
- `getCapabilityMatrix()` and the `getCapabilities()` of the reference,
  llm-guard and rebuff adapters report as `version` the `version` field of
  the installed package's own `package.json`. The reference adapter
  reported the `VERSION` export of arp-guard, which arp-guard 0.3.0
  re-exports from `hackmyagent/arp`: a constant of the installed
  hackmyagent, not arp-guard's version (`0.2.0` with the arp-guard 0.3.0
  and hackmyagent 0.23.8 that this checkout's lockfile installs), or
  `0.3.0` when that export was missing. The llm-guard and rebuff adapters
  reported `0.1.8` and `0.1.0` whichever version was installed. When an
  `exports` map hides `package.json`, the reference and llm-guard adapters
  report the `VERSION` export followed by
  ` (VERSION export; package.json not resolvable)`. When the package is
  not installed, `getCapabilities()` throws the error a scan with that
  adapter throws; for arp-guard that is the message naming
  `npm install arp-guard` and `OASB_ADAPTER`, as before.
  `scripts/library-entry.test.mjs` holds each case.
- The README's "Use as a library" example scores a two-sample submission
  with `benchmark.scoreSubmission` and prints its recall, and says that F1,
  precision, false-positive rate and tier on the bundled corpus are
  withdrawn. It ended on `benchmark.determineTier(/* aggregate metrics */)`.
  Run as written, that line threw
  `TypeError: Cannot read properties of undefined (reading 'f1')`, and given
  metrics, `determineTier` assigns a tier from the withdrawn F1 and
  false-positive rate. It stays exported, and `docs/pinned-benchmark.md`
  describes it. The documented-command check in `npm run smoke` runs the
  block as written. It read a call whose argument list is only a comment as
  a placeholder and checked only that the call named a function, so it
  passed on that block. `scripts/check-documented-commands.test.mjs` fails
  when the block has such a call.
- The README's Usage via OpenA2A CLI section no longer says that
  `hackmyagent secure -b oasb-1` checks "the same controls" as
  `opena2a benchmark`. The two report different figures: opena2a-cli 0.10.13
  scores the check IDs of the level's controls, passing over evaluated, and
  at L1 counts 39 of them, from the catalogue of the hackmyagent 0.25.2 it
  installs; hackmyagent 0.33.2 scores controls, passed over verified, with
  unverified and not applicable controls left out, and at L1 counts 26. On
  the same agent directory the first printed
  `L1:         13% (8 of 39 controls evaluated)` and the second
  `Compliance: 5% (1/19 verified controls)`. The section now says the two
  percentages are not comparable with each other, only each with its own
  earlier runs, and that neither tool's help text states how its percentage
  is computed.
  `scripts/doc-facts.test.mjs` fails when the section says
  "the same controls".
- The development runner `scripts/run-benchmark-v2.ts` prints, for each
  adapter, its recall and the malicious samples it detected and missed, and
  a comparison summary of recall whose `%` signs share one column. It names
  precision, F1, FPR and flag rate as withdrawn instead of printing their
  values: each reads the benign class, which its own warning says makes them
  circular. It printed them in each adapter's block and in summary rows such
  as `67.5  % | 99.3  % | 51.1  % | 0.03  % | 3.6%`. The results file it
  writes with `--out` is unchanged.
- `npm run report` lists, in each row of its OWASP Agentic table, the
  scenarios whose `// OWASP Agentic:` header names that ID, each with its
  status in the results file (N/A without one), and names the IDs no
  scenario covers, ASI04, ASI06 and ASI09 on this tree; each row read "See
  mapping docs". Its Known Gaps table, headed "Known Gaps (Documented)", is
  now headed as the reference adapter's (ARP) and says that in a report on
  another product those gaps describe ARP.
- `docs/test-catalog.md` gives the test counts in one paragraph and the
  E2E-001 skips in a note of their own; the first sentence of the counts
  held the whole E2E-001 skip rule in a parenthetical.
- `docs/test-catalog.md` describes the Summary `npm run report` writes, in
  the paragraph under Run the suite that the README's Evaluating Other
  Products section links: the Product under test line, the attack-scenario
  rows (Scenarios, Passed, Failed, Not applicable, Skipped for another
  reason, and a Pass rate over the scenarios that passed or failed), the
  separate Harness self-tests line and the Known Gaps of the Reference
  Adapter (ARP). The README said the file held "a summary of the run (total,
  passed, failed and skipped tests, and the pass rate)", but the Summary
  counts the attack scenarios only. `scripts/doc-facts.test.mjs` generates a
  report from a sample run and fails when the test catalog paragraph does
  not name the product line, the scenario directories, a Summary row, what
  the pass rate is over, the harness line or the known gaps heading as the
  report words them.
- `docs/adapters.md` says that a missing rebuff package fails each scenario
  file while vitest collects it, before any of its tests runs, with the
  error that names the package, and that a missing `typescript` fails each
  scan. It said each scan fails when either package is missing.
  `getCapabilities()` of the rebuff adapter reads rebuff's version from its
  `package.json`, and each scenario file calls it while it is collected:
  with rebuff moved out of `node_modules`,
  `OASB_ADAPTER=rebuff npx vitest run src/atomic/ai-layer/AT-AI-001`
  reported the file failed and no tests; with `typescript` moved out, its
  11 tests failed with the error that names `typescript`.
  `scripts/doc-facts.test.mjs` fails when the paragraph says "when either
  package is missing" or does not state the two cases, and
  `src/harness/rebuff-wrapper.test.ts` checks both cases against the
  capability check and the scans, with the loader replaced by a stub.

### Fixed

- A vitest run that selects attack scenarios now ends with one line on
  stderr: `OASB: <evaluated> of <selected> attack scenarios evaluated`,
  counting the scenario tests that passed or failed. When it evaluated none,
  as under an adapter that declares no capabilities, the line is
  `OASB: not measured (0 of <selected> attack scenarios evaluated)` and the
  run exits 2; it exited 0 with every scenario skipped and said nothing.
  When the run's results cannot be read, the line is
  `OASB: not measured (the run's test results could not be read)` and the
  run exits 2. A run that selects no scenario, such as
  `npx vitest run src/benchmark/`, and collecting the suite without running
  it print no line and keep their exit. The JSON report of
  `--reporter=json --outputFile` is still written. No variable or flag
  lowers the floor. `scripts/check-documented-commands.mjs` now expects
  exit 2 from its two runs whose every test must be skipped.
- `LICENSE` holds the full canonical Apache License 2.0 text, 202 lines, in
  place of the 98-line abridgement that 0.4.0 shipped, which shortened or
  dropped clauses.

## Behavioral governance draft withdrawn on 2026-09-09

`docs/oasb-v2-behavioral-governance.md` (2.0.0-draft, 2026-03-03) is withdrawn
and retained for history with a notice at its top. Its figures, 68 behavioral
controls in 8 domains numbered 7 to 14 and 114 total controls, are superseded:
the behavioral domains are published as OASB-2 in the agent-governance-spec
repository with 72 controls in nine domains numbered 11 to 19, machine checked
there against the domain files. The OASB-1 count, 46, is published at oasb.ai
and is not carried in this repository. The unified total, 118, is the sum
72 + 46 and is not measured on its own. The 222 Eval scenario count is
unchanged. No control content, scenario, or test changes; the README counts
are untouched.

## Comparative scanner scores withdrawn - 2026-08-09

**F1 82.9%, precision 83.2%, FPR 1.16% and flag rate 6.3% are withdrawn.** The
benign class of the v2 corpus was labeled by the scanner under test:
`scripts/export-registry-corpus.mjs` lines 146-164 assign `verdict=safe AND
score >= 80`, as reported by HackMyAgent itself, to the benign class, and
3,704 of the 3,881 benign samples came from that rule. Any artifact
HackMyAgent would have flagged was excluded from the benign class by
construction, so a near-zero false-positive rate was guaranteed before a
single scan ran. Those are labeling artifacts presented as measurements.

**Corrected 2026-08-27.** The entry above originally cited the docstring at `export-registry-corpus.mjs:9` (`verdict=safe AND score >= 80`) rather than the rule the code applies at `:146-164`. The shipped corpus settles it: `metadata.scanVerdict` is warning 3,746 / blocked 205 / passed 23, and `safe` appears zero times. The benign class is artifacts the scanner emitted a WARNING on and kept for scoring >= 70, which is worse than the published account, not better. The scanner-labeled count is 3,704, not 3,811; the remaining 177 benign are hand-authored fixtures. Separately, the posture-vs-attack methodology retained in BENCHMARK-RESULTS.md was justified by a wildcard-frequency claim that the corpus builder itself wrote in; see the correction there.

No replacement figure is offered. The two prior withdrawals on this page each
replaced one number with a better number drawn from the same self-labeled
corpus, which carried the defect forward; this one does not.

**Recall is not withdrawn.** It reads only the malicious class, and the
published run already excluded the 225 registry samples labeled malicious by
the same rule. It remains 82.6% (223/270) on fixtures we authored, and
BENCHMARK-RESULTS.md § 1a now discloses the denominator, the per-source
split, and the 47.3% (234/495) figure that results if the self-labeled
samples are scored too.

Also corrected: `--categorized-only` printed "Filtered to N samples with
content-derived labels". That filter applies to the malicious class only, and
the sentence asserted of the benign class exactly the property it lacked. It
now names the benign class as scanner-labeled.

The corpus, taxonomy, methodology, DVAA results and the third-party paper
comparison are unaffected and remain published.

## 0.4.0 - 2026-07-13

First release published through npm Trusted Publishing (GitHub Actions OIDC,
SLSA v1 provenance attestations).

- The package entry point now exists: `require('@opena2a/oasb')` /
  `import ... from '@opena2a/oasb'` exposes the `SecurityProductAdapter`
  contract, capability helpers, `createAdapter` and the worked adapter
  examples (each lazy-loads its underlying product), harness utilities, and
  the scoring engine under the `benchmark` namespace. Previous versions
  declared `main: dist/index.js` without shipping it, so requiring the
  package threw `MODULE_NOT_FOUND`.
- Reproducible installs: `hackmyagent` is pinned exactly to 0.23.8, the
  version the published benchmark numbers were measured on. The previous
  `^0.17.9` range installed a year-old scanner on fresh clones.
- Committed release smoke gate (`npm run smoke`): fresh-clone install with no
  sibling checkouts, build, full suite, README count drift guard, and an
  `npm pack` file-list check. Documented in `docs/testing/release-smoke.md`.
- Release workflow: publish step skips when the version is already on npm
  (safe re-runs); ARP dependency cloned by its current repository name.
- `CONTRIBUTING.md`: invitation for co-authors, an independent second
  implementation, new attack scenarios, and adopter listings ahead of taking
  the benchmark to an external standards body.
- README: use-as-a-library section; corrected the E2E-003 skip note (the
  live network-detection E2E is unconditionally skipped pending a reliable
  cross-platform check - it was previously described as skipping only when
  `lsof`/`ss` is unavailable).
- Tarball now ships `CONTRIBUTING.md`, `STATUS.md`, and
  `BENCHMARK-RESULTS.md` so packaged README links resolve.
- Dev-dependency audit: 14 advisories to 0 (vitest 3.2.7 chain).

## 0.3.2 - 2026-04-22 (tag only; never reached npm)

Added the SEC-021 policy-enforcement fail-closed control and NanoMind
classifier telemetry to the scanner benchmark. The release workflow moved to
npm Trusted Publishing, but the publish failed because Trusted Publishing was
not yet configured for the package on npmjs.com - the v0.3.2 tag exists in
git, and npm stayed on 0.3.1 until 0.4.0. The first successful Trusted
Publishing release is 0.4.0.

## Benchmark re-measurement - 2026-06-05

Re-ran the scanner benchmark faithfully: each sample routed through its real
artifact-type analyzer path; verdict = high/critical attack findings. Adopted
a posture-vs-attack verdict: missing-defense and over-permissive-posture
findings (prompt/governance defenses, and wildcard tool access
`allowedTools:["*"]` that 2,900+ benign registry MCP servers also declare)
are excluded from the malicious verdict but still surfaced by the scanner.

Result as published at the time: **F1 82.9%, recall 82.6%, precision 83.2%,
FPR 1.16%**; privilege_escalation recall 9/30 -> 19/30 (routing + the new
`AST-SCOPE-004` config-directive check).

**F1, precision and FPR from this run were withdrawn on 2026-08-09** — see
the entry at the top of this file. Recall (82.6%) stands, with the
disclosure in [BENCHMARK-RESULTS.md](BENCHMARK-RESULTS.md) § 1a.

**Withdrawn figures:** the earlier 82.1% F1 / 1.26% FPR (a skill-routing
artifact that compiled every sample as a skill and bypassed the MCP
analyzers) and the older 89.2% figure. See
[BENCHMARK-RESULTS.md](BENCHMARK-RESULTS.md) for the full methodology and
per-category breakdown.

## Methodology audit - 2026-06-03

Remapped all scenarios to current MITRE ATLAS (15 techniques, including the
2025 AI-agent technique family); corrected four legacy mappings. Capability
gating now produces N/A (not FAIL) for surfaces a product does not declare.
Pooled scoring-engine metrics (FPR no longer macro-averaged;
category-agnostic detectors credited on recall). Counts reconciled to
`npm test`. Full audit: [docs/AUDIT-2026-06-03.md](docs/AUDIT-2026-06-03.md).

## Scanner Benchmark v2 - 2026-04-02

4,245-sample corpus, 3 HMA adapter tiers (static/TME/pipeline), DVAA
ground-truth comparison, and a comparison with Holzbauer et al.
(arXiv:2603.16572). Numbers superseded by the 2026-06-05 re-measurement.

## 0.3.0 - 2026-03-23

`arp-guard` v0.3.0 - ARP now re-exports from HackMyAgent. All 222 tests
pass. Simplified Quick Start (no standalone ARP clone).

## Eval v0.2.0 - 2026-02-19

Added 40 AI-layer test scenarios (AT-AI-001 through AT-AI-005) for prompt,
MCP, and A2A scanning via ARP v0.2.0. Total scenarios: 222.

## 2026-02-18

Added integration tests for DVAA v0.4.0 MCP JSON-RPC and A2A endpoints.

## 0.1.0 - 2026-02-09

Initial release: 182 attack scenarios across 10 MITRE ATLAS techniques.
