# Changelog

Full history of the benchmark, its methodology changes, and its releases.
Metric revisions are never silently replaced: superseded or withdrawn figures
stay on record here with the reason they changed.

## 0.4.1 (unreleased)

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
  directory, or anything accepting a connection at `127.0.0.1:47200`). Each
  run writes a
  new `results/<date>-<runid>/` holding
  per-sample predictions, a summary of detection over the malicious class and
  a run record naming the versions and hashes of the inputs it checked, and
  never writes to an existing file. A run writes nothing and exits 3 when the
  hackmyagent install, the model directory, the DVAA checkout or the other
  model sources check fails again after the scan. `--observe` prints the pin
  values of a set of inputs on stdout and, on stderr, the `npm view` command
  whose output must equal the printed integrity; it reports a tarball whose
  name does not carry an exact version (`hackmyagent-<x.y.z>.tgz`) as a
  problem (exit 2) and prints no command for it. A pinned run does not verify
  the scanner's dependencies (it records the sha256 of their lockfile);
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
- The README opens with Quick Start (clone, `npm ci`, `npm test`) and is under
  400 lines. The per-test tables moved to `docs/test-catalog.md`; Contributing
  and Updates moved below the reference sections. `npm run check:readme` checks
  that layout and that the relative links it reads resolve, and `npm run smoke`
  runs it. It reads three link forms, each written within one line: inline
  links (`[text](path)`, with an optional double-quoted title), reference
  definitions at the start of a line (`[label]: path`) and quoted HTML `href`
  attributes. It checks a `#anchor` only in links to `.md` files. Other forms,
  such as an unquoted `href` or a definition inside a list item, are not
  checked.
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
- E2E-001 still times out against the reference adapter (`arp-guard`
  0.3.0) under full-suite load: in one `npx vitest run --maxWorkers=4` on
  a 16-core macOS host at a 1-minute load of 7.9 to 8.1, the `.bashrc` and
  `.npmrc` cases timed out after 5 seconds. The file run alone, with four
  workers, passed at a load of 9.1 and had one such timeout at a load of
  10.4 while other test runs shared the host.

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
