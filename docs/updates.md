# OASB updates

Dated changes to the benchmark, its results and its releases.
[CHANGELOG.md](../CHANGELOG.md) has the full history; the
[README](../README.md) has the first run.

## Updates

| Date | Change |
|------|--------|
| 2026-10-17 | **v0.4.1** - `OASB_ADAPTER` selects the product for every scenario test, and a run that evaluated no scenario says so and exits 2. Pinned benchmark runs of record ([docs/pinned-benchmark.md](pinned-benchmark.md)), an OWASP Top 10 for Agentic Applications risk named in each scenario file, `hackmyagent` removed from the dependencies, a shorter README whose test counts and links `npm run check:readme` holds to the suite, the canonical Apache-2.0 text restored in `LICENSE`. |
| 2026-10-10 | **Pinned run of record**, `results/2026-10-10-2a89ce5d/`: hackmyagent 0.33.2 on recorded inputs detects 192/270 attack fixtures with the full pipeline and 17 of 86 DVAA scenarios. Reported beside the 2026-06-05 figures under Latest Results. |
| 2026-08-09 | **Comparative scanner scores withdrawn.** The benign class of this corpus was labeled by the scanner under test, so F1, precision, FPR and flag rate were determined by the labeling rule rather than measured. Recall is retained with disclosure - see [BENCHMARK-RESULTS.md](../BENCHMARK-RESULTS.md) § 1. |
| 2026-07-13 | **v0.4.0** - working package entry point (`import '@opena2a/oasb'`), reproducible installs, committed release smoke gate, [CONTRIBUTING.md](../CONTRIBUTING.md). First release via npm Trusted Publishing (SLSA provenance). |
| 2026-06-05 | ~~Scanner benchmark re-measured with a posture-vs-attack verdict: **F1 82.9%, FPR 1.16%**.~~ **Withdrawn 2026-08-09** (see above); the row is kept so the record of what was published stays visible. Earlier 82.1% and 89.2% figures also withdrawn - see [BENCHMARK-RESULTS.md](../BENCHMARK-RESULTS.md). |
| 2026-06-03 | Remapped to current MITRE ATLAS (15 techniques); capability gating reports N/A, not FAIL; pooled metrics. Audit: [docs/AUDIT-2026-06-03.md](AUDIT-2026-06-03.md). |
| 2026-04-02 | Scanner Benchmark v2: 4,245-sample corpus, 3 HMA adapter tiers. Superseded by the 2026-06-05 re-measurement. |
| 2026-03-23 | v0.3.0 - `arp-guard` re-exports from HackMyAgent; simplified Quick Start. |
| 2026-02-19 | 40 AI-layer scenarios (AT-AI-001 to AT-AI-005) for prompt, MCP, and A2A scanning. |
| 2026-02-09 | Initial release: 182 attack scenarios across 10 MITRE ATLAS techniques. |

Full history with methodology detail: [CHANGELOG.md](../CHANGELOG.md).
