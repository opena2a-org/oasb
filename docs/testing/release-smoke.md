# Release smoke test

Run before every release (tag push), after the version bump commit:

```bash
npm run smoke
```

The script (`scripts/release-smoke.sh`) simulates a first-time user and guards
the claims this repository publishes:

1. **Fresh-clone install.** Clones the current HEAD into a temp directory with
   no sibling checkouts and runs `npm ci`. Catches dependencies that only
   resolve because of local state (a sibling `../arp` checkout, a stale
   `node_modules`, an unpinned range that drifted from the measured version).
   Before installing, `scripts/check-readme.mjs` (also `npm run check:readme`,
   which compares the test counts too, see step 3) checks the README layout:
   under 400 lines, "Quick Start" is the first H2
   and starts before line 25, a shell command appears before line 30, and
   the relative links it reads resolve, in the README and in the pages that
   took its text (`README_PAGES` in `scripts/readme-counts.mjs`), each link
   from the directory of the file it is in. It reads three link forms, each
   written within one line: inline links (`[text](path)`, with an optional
   double-quoted title), reference definitions at the start of a line
   (`[label]: path`) and quoted HTML `href` attributes. It checks a `#anchor`
   only in links to `.md` files. Other forms, such as an unquoted `href` or a
   definition inside a list item, are not checked. A linked `.md` page whose
   file name carries a date (`docs/AUDIT-2026-06-03.md`) must say "as of"
   that date and link to the README above its first H2: its counts are those
   of that day and nothing compares them with the suite. Reference detail
   belongs in `docs/` (for example `docs/test-catalog.md`), linked from the
   README.
   This step runs the checker with `--no-counts`: vitest is not installed
   yet, and step 3 compares the test counts with the suite's report. After
   `npm ci`, the tests in `scripts/` (`npm run test:scripts`) run; each file
   is listed under [The tests in `scripts/`](#the-tests-in-scripts).
2. **Build + full suite.** `npm run build` then the complete vitest run,
   including E2E. E2E-003 is skipped on every platform (`it.skip`); any
   failure fails the smoke.
3. **README count drift guard.** `scripts/check-test-counts.mjs` reads the
   per-file results of the JSON reporter and compares every test count the
   README in the clone and the pages of `README_PAGES` beside it state with
   them (the committed files, so an uncommitted edit is not what the smoke
   measures; most of the counts are in `docs/test-catalog.md`): the Quick Start
   comment, the Counts note (total, passing, skipped, attack scenarios,
   scoring-engine and pinned harness tests), the per-group
   `npm run test:*` comments, the scenario counts in the prose, the
   scenario-file count under MITRE ATLAS Coverage, and every row of the What
   Gets Tested table, whose source rows must add up to the suite total. An
   E2E-001 case skipped as inconclusive, because the host delivered no file
   event to the harness's own watcher, is counted with the passing tests, not
   the skipped ones, and listed in the guard's output: the test records the
   reason as `inconclusive` in its meta (`skipInconclusive` in
   `src/harness/filesystem-watch.ts`), and a test skipped without it still
   counts as skipped. A file in which a test was skipped so and no test
   passed with the product's own event fails the guard as `NOT MEASURED`,
   whatever the counts say: the run says nothing about that file, so run the
   smoke again when the host delivers file events. An E2E-001 detection case
   that gets the product's event records `detected` in its meta
   (`markDetected` in the same file); the case that expects no violation for
   a normal file passes without an event, so it does not stand for the file.
   Where Node.js has no recursive `fs.watch` (Linux before 19.1.0), the
   harness cannot open its watcher, every E2E-001 case is skipped so, and the
   guard fails that way on every run: run the smoke on a Node.js that has
   one. A statement it cannot find fails too, so a wording change has to
   update `STATEMENTS` in `scripts/readme-counts.mjs`, the one list both
   README checks read. Its own tests (`npm run test:scripts`) run after
   `npm ci`. Any mismatch fails the smoke. If you
   add or remove tests, update the counts in the same change or this gate
   blocks the release - that is the point. Committing a run under `results/`
   does not change the totals: the run-of-record checks are a fixed set of
   tests. `npm run check:readme` compares the README's test counts without
   a report, after `npm ci`: it collects the suite with vitest (no test
   runs) and compares each passing count with the tests that are not
   skipped, so it catches a stale count before a release without running the
   suite. It cannot tell a failing test from a passing one; this step can.
   With `--tests <report>` it reads a JSON report instead and compares the
   passing counts with the tests that passed, counting a case skipped as
   inconclusive with them as the drift guard does; a report written in
   another checkout is read by each file's path from its `src/` directory,
   as the drift guard reads it. It holds the capture under Quick Start to
   the same suite: the command named in "What `<command>` prints" must be a
   `vitest run` that a code block above it shows, each `✓` line must name a
   test of a file that command selects and that is not skipped, and the
   `Test Files` and `Tests` lines must state the passed, failed and skipped
   counts and the total of the files and tests it selects.
4. **Pack check.** `npm pack --dry-run` must include README.md, LICENSE,
   `dist/`, `src/harness/`, and `config/`, and must not include credential
   files or assistant config.
5. **Documented commands.** `scripts/check-documented-commands.mjs` runs
   three of the commands the README documents and holds each result to what
   the README says:
   - `OASB_ADAPTER=llm-guard` on a scenario file gated by capability
     (`AT-AI-002`, prompt output scanning) and an OS-level one
     (`AT-PROC-003`, process monitoring). llm-guard declares neither
     surface, and "Evaluating Other Products" says those tests are N/A
     (skipped), not FAIL, so every test in both files must be skipped. The
     reference adapter runs the gated file, so its skip shows that the name
     chose llm-guard.
   - `OASB_ADAPTER=./<dir>/my-adapter.js`, a relative path run from the
     checkout, with an adapter that declares no capabilities, on the gated
     file. Every test in it must be skipped.
   - The "Use as a library" example in a fresh install: it packs the
     checkout, runs the section's `npm install` lines in a new, empty
     project with `@opena2a/oasb` replaced by the tarball, and runs the
     section's TypeScript block there without `OASB_ADAPTER` set. A call
     whose argument list is only a comment, such as
     `benchmark.determineTier(/* aggregate metrics */)`, is a placeholder:
     the check asserts it names a function instead of calling it.

   It runs every command and lists every failure, naming the command, the
   file and what ran. When one fails, fix the code or correct the README in
   the same change. Run it on its own, after `npm ci` and `npm run build`,
   with `node scripts/check-documented-commands.mjs`. Its tests
   (`npm run test:scripts`) cover how it reads a report and the README, and
   that the smoke runs it after the build.

## The tests in `scripts/`

`npm run test:scripts` runs these files with `node --test`. The smoke runs
them after `npm ci` (step 1) and `npm test` runs them before the suite; the
README's test counts do not include them.

- `scripts/check-readme.test.mjs`: the README layout, link, test-count and
  capture check (`scripts/check-readme.mjs`). One of its tests runs
  `npm run check:readme` on this README, which collects the suite with
  vitest.
- `scripts/check-test-counts.test.mjs`: the drift guard
  (`scripts/check-test-counts.mjs`, step 3). It also fails when the smoke
  script would run the guard outside its clone, or when a `*.test.ts` file
  under `src/` calls `skip(` on anything but `it`, `test` or `describe`
  instead of calling `skipInconclusive`. That check reads the text of those
  files: a skip written another way, such as `ctx.skip (...)` or
  `ctx['skip'](...)`, or made by a helper outside those files is not
  detected. It fails as well when such a file names `markDetected` or
  writes a property named `detected`, which only `markDetected` writes, as
  the mark of a case that got the product's own event; and when E2E-001
  stops calling `detectWrite` or `openControlWatchOrSkip`, or passes a
  detection case a predicate other than `isSensitiveFileEvent` or
  `fileEventFor` of the name the case writes. That check reads the text as
  well: a mark written another way, such as with a key built at run time
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
  matcher call. A matcher call on a later line than its `expect`, as in a
  chained assertion that continues with `.toHaveProperty('detected', true)`
  on the next line, is not taken as a matcher call either, so that read of
  the mark fails the check: write the matcher call on the line of its
  `expect`. After `expect` on a line the check takes every `.toXxx(` call
  as a matcher call, chained to that `expect` or not.
- `scripts/check-owasp-mapping.test.mjs`: the OWASP mapping check
  (`scripts/check-owasp-mapping.mjs`), which holds every scenario file's
  `// OWASP Agentic:` header and `docs/owasp-agentic-mapping.md` to each
  other.
- `scripts/check-maturity-page.test.mjs`: the maturity page check
  (`scripts/check-maturity-page.mjs`), which holds
  `docs/shield-maturity-extension.md` to the ATLAS technique names of
  `docs/mitre-atlas-mapping.md` and to stating its Shield coverage as not
  measured while `src/maturity` has no test.
- `scripts/check-documented-commands.test.mjs`: the documented-command check
  (step 5).
- `scripts/changelog-width.test.mjs`: `CHANGELOG.md` and this guide stay
  wrapped at 80 characters.
- `scripts/adapter-gating.test.mjs`: the scenario tests' capability gating.
  It runs the scenario tests with vitest against an adapter that declares no
  capabilities and against the llm-guard and rebuff adapters, and checks
  that a suite runs only when the adapter has every capability it needs and
  that the tests failing under llm-guard and rebuff are the ones
  `docs/adapters.md` records, each on the assertion its row quotes.
- `scripts/scenario-report.test.mjs`: the report `npm run report` writes
  (`scripts/scenario-report.mjs`).
- `scripts/library-entry.test.mjs`: the package entry point as a library
  install sees it, built where arp-guard cannot be resolved, as after
  `npm install @opena2a/oasb` on its own.
- `scripts/doc-facts.test.mjs`: statements in `README.md`,
  `BENCHMARK-RESULTS.md` and `docs/pinned-benchmark.md` that must match the
  corpus and scripts they describe, and that `docs/demo.tape` states no test
  or scenario count.
- `scripts/placeholder-credentials.test.mjs`: the placeholder marking of
  API-key-shaped values in `src/`; fails when one does not spell FAKE.
- `scripts/secret-scan-workflow.test.mjs`: the secret-scan job of
  `.github/workflows/security.yml`. It runs the job's install and scan
  scripts with stub commands and checks that the workflow runs on pull
  requests and pushes to `main` and every Monday, that the job has no
  condition of its own and fails when gitleaks reports a leak, that its
  token can only read the repository, that gitleaks is downloaded from its
  GitHub release and unpacked only when its archive matches the pinned
  sha256, that a pull request is read from its base to its head and a push
  from its previous head to its new head, and that the scheduled run reads
  the full history. Its last test weakens a copy of the workflow in each of
  those ways and fails when no other test fails on the copy; the change to
  the checksum step is made only where `sha256sum` is installed, as the
  test that catches it runs only there. It does not check the workflow's
  concurrency settings, under which a later run can cancel one before its
  scan finishes, or which version of the checkout action the job uses.
- `scripts/typecheck-tests.test.mjs`: `npm run typecheck:tests`, which
  type-checks `src/` with its test files; fails on any type error it
  reports, or when `tsconfig.test.json` takes in no test file under
  `src/atomic`, `src/integration` or `src/e2e`.
- `scripts/hmaignore.test.mjs`: the rules of `.hmaignore` that each leave
  one `hackmyagent secure` check out of one file. Fails when such a rule
  names a file that does not exist or gives no reason, when
  `src/benchmark/pinned/inputs.ts` has no NEMO-002 rule, or when a negated
  tarball digest comparison in that file is not followed by
  `throw new PinError(`.

## The README checks on every pull request

`npm test` runs `npm run test:scripts` first (its `pretest` script), so the CI
job, which runs `npm test`, runs every file under
[The tests in `scripts/`](#the-tests-in-scripts) before the suite. The
documented commands themselves run only in the
smoke. One of them runs `npm run check:readme` on this README, so a pull
request that adds or removes a test without updating the counts the README
and its pages state fails CI, not only the next release smoke. Another runs
the OWASP mapping check on this repository, so a scenario file without an
`// OWASP Agentic:` header, or one the mapping page lists under another ID,
fails CI too. A third runs the maturity page check on this repository, so an
ATLAS technique ID on `docs/shield-maturity-extension.md` that
`docs/mitre-atlas-mapping.md` does not list, or lists under another name,
fails CI as well. To run the suite
without them, use `npx vitest run` or one of
the `npm run test:*` groups.

## Why these guards exist

- 2026-07-13: the README's "244 passing" claim and the published benchmark's
  "measured on hackmyagent 0.23.8" were both verified only by hand; the
  package.json range (`^0.17.9`) actually installed a year-old hackmyagent on
  fresh clones, so the canonical checkout could not reproduce the published
  scanner numbers. The exact pin plus this smoke keep the repo reproducible.
- The v0.3.2 release failed at publish time (Trusted Publishing not yet
  configured) after CI tests passed - the smoke does not replace the tag-push
  gate, it feeds it. Publishing is still: smoke -> version bump -> tag push
  (GHA publishes via OIDC) -> verify `npm view @opena2a/oasb
  dist.attestations`.

## Scanner benchmark numbers (separate from this smoke)

Scanner figures are measured with a pinned run
(`scripts/run-pinned-benchmark.ts`, see `docs/pinned-benchmark.md`), not by
this smoke. A pinned run records the hackmyagent version and tarball
integrity, the DVAA commit and the NanoMind manifest sha256 in
`results/<date>-<runid>/record.json`. When BENCHMARK-RESULTS.md or
docs/pinned-benchmark.md cites a re-measured figure, update both in the same
change and name the run directory it came from.
