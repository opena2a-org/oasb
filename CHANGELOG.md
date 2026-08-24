# Changelog

Full history of the benchmark, its methodology changes, and its releases.
Metric revisions are never silently replaced: superseded or withdrawn figures
stay on record here with the reason they changed.

## 0.4.1 (unreleased)

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

## Comparative scanner scores withdrawn - 2026-08-09

**F1 82.9%, precision 83.2%, FPR 1.16% and flag rate 6.3% are withdrawn.** The
benign class of the v2 corpus was labeled by the scanner under test:
`scripts/export-registry-corpus.mjs` lines 9-11 assign `verdict=safe AND
score >= 80`, as reported by HackMyAgent itself, to the benign class, and
3,811 of the 3,881 benign samples came from that rule. Any artifact
HackMyAgent would have flagged was excluded from the benign class by
construction, so a near-zero false-positive rate was guaranteed before a
single scan ran. Those are labeling artifacts presented as measurements.

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
