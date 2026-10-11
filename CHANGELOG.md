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
  the path keeps its whole message instead of only its code. The statements both checks compare are one
  list, `STATEMENTS` in
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
- `npm test` runs the tests of both README checks (`npm run test:scripts`)
  before the suite, so the pull request CI job and the release workflow, which
  run `npm test`, run them too. They ran only in `npm run smoke` before, so a
  pull request could change a README check, or add a test without updating
  the README's counts, and pass CI. They are not vitest tests and do not
  change the totals the README states. `npx vitest run` and the
  `npm run test:*` groups run the suite without them.
- `src/benchmark/pinned/runs-of-record.test.ts` checks every committed run
  inside a fixed set of seven tests, so committing a run no longer changes the
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
