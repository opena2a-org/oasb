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
   the relative links it reads resolve. It reads three link forms, each
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
   `npm ci`, the tests in `scripts/` (`npm run test:scripts`) run: the tests
   of both README checks, of the OWASP mapping check
   (`scripts/check-owasp-mapping.mjs`, which holds every scenario file's
   `// OWASP Agentic:` header and `docs/owasp-agentic-mapping.md` to each
   other), of the changelog's line width and of the scenario tests'
   capability gating. One of them runs `npm run check:readme` on this
   README, which collects the suite with vitest. The gating tests run the
   scenario tests with vitest against an adapter that declares no
   capabilities and against the llm-guard and rebuff adapters, and check that
   a suite runs only when the adapter has every capability it needs.
2. **Build + full suite.** `npm run build` then the complete vitest run,
   including E2E. E2E-003 is skipped on every platform (`it.skip`); any
   failure fails the smoke.
3. **README count drift guard.** `scripts/check-test-counts.mjs` reads the
   per-file results of the JSON reporter and compares every test count the
   README states with them: the tests badge, the Quick Start comment, the
   Counts note (total, passing, skipped, attack scenarios, scoring-engine and
   pinned harness tests), the per-group `npm run test:*` comments, the
   scenario counts in the prose, the scenario-file count under MITRE ATLAS
   Coverage, and every row of the What Gets Tested table, whose source rows
   must add up to the suite total. A statement it cannot find fails too, so a
   wording change has to update `STATEMENTS` in `scripts/readme-counts.mjs`,
   the one list both README checks read. Its own tests
   (`npm run test:scripts`) run after `npm ci`. Any mismatch fails the smoke. If you
   add or remove tests, update the README in the same change or this gate
   blocks the release - that is the point. Committing a run under `results/`
   does not change the totals: the run-of-record checks are a fixed set of
   tests. `npm run check:readme` compares the README's test counts without
   a report, after `npm ci`: it collects the suite with vitest (no test
   runs) and compares each passing count with the tests that are not
   skipped, so it catches a stale count before a release without running the
   suite. It cannot tell a failing test from a passing one; this step can.
   With `--tests <report>` it reads a JSON report instead and compares the
   passing counts with the tests that passed; a report written in another
   checkout is read by each file's path from its `src/` directory, as the
   drift guard reads it.
4. **Pack check.** `npm pack --dry-run` must include README.md, LICENSE,
   `dist/`, `src/harness/`, and `config/`, and must not include credential
   files or assistant config.

## The README checks on every pull request

`npm test` runs `npm run test:scripts` first (its `pretest` script), so the CI
job, which runs `npm test`, runs the tests of both README checks, of the
OWASP mapping check, of the changelog's line width and of the scenario tests'
capability gating before the suite. One of them runs
`npm run check:readme` on this README, so a pull request that adds or removes
a test without updating the README's counts fails CI, not only the next
release smoke. Another runs the OWASP mapping check on this repository, so a
scenario file without an `// OWASP Agentic:` header, or one the mapping page
lists under another ID, fails CI too. To run the suite without them, use
`npx vitest run` or one of
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
`results/<date>-<runid>/record.json`. When BENCHMARK-RESULTS.md or the README
cites a re-measured figure, update both in the same change and name the run
directory it came from.
