# Test harness

The files in `src/harness/` that run the suite against a security product,
and how the sources are built and type-checked. The [README](../README.md) has
the first run; [adapters.md](adapters.md) describes the adapters.

## Test Harness

The harness wraps a security product via an adapter interface and provides event collection, injection, and metrics.

| File | Purpose |
|------|---------|
| `adapter.ts` | **Product-agnostic adapter interface** - implement `SecurityProductAdapter` for your product |
| `create-adapter.ts` | Adapter factory - selects the product under test from the `OASB_ADAPTER` env var |
| `capabilities.ts` | Capability matrix + `describeWithCapability()` - unsupported surfaces report N/A, not FAIL |
| `arp-wrapper.ts` | Reference adapter - wraps ARP (`arp-guard`) with event collection, injection helpers |
| `llm-guard-wrapper.ts` | Worked example: adapter for `llm-guard` (declares prompt-input + pattern scanning) |
| `rebuff-wrapper.ts` | Worked example: adapter for `rebuff` (declares prompt-input + pattern scanning) |
| `event-collector.ts` | Captures events with async `waitForEvent(predicate, timeout)` |
| `filesystem-watch.ts` | Before each E2E-001 case, writes `oasb-watch-probe-N` files into the watched directory until the product reports one, for at most 5 s, cut to what is left before the last 1 s of the hook's 10 s timeout, and for at least 200 ms. E2E-001 leaves the probe events out of its checks. Also opens the harness's own `fs.watch` of the directory before the product starts and closes it after the product stops: a case whose product reported no probe still makes its write when that watcher saw a probe file, and is skipped as inconclusive without its write when it saw none; a product miss within the 5 s window, read when the window ends, fails when that watcher saw the path in the window and is skipped as inconclusive when it saw nothing; no detection case passes without the product's own event, and one that gets it records `detected` in its meta, which the release smoke's drift guard reads. A product whose `start()` returns 8.8 s or more into the hook leaves the probe wait at its 200 ms minimum, so when it also reports no probe file (it reports only sensitive paths), its cases are measured only if that watcher saw a probe file within those 200 ms, and are skipped as inconclusive otherwise. That watcher is a recursive `fs.watch`, which Node.js has on Linux from 19.1.0: where it is unavailable, each E2E-001 case is skipped as inconclusive, before the product is created, with a message that says so. An error that watcher reports is named in the skip message of a case it recorded no event for. A detection case passes over a filesystem event that has no `data`, which the adapter interface makes optional, and goes on waiting for the report of its write |
| `mock-llm-adapter.ts` | Deterministic LLM for intelligence layer testing (pattern-based responses) |
| `dvaa-client.ts` | HTTP client for DVAA vulnerable agent endpoints |
| `dvaa-manager.ts` | DVAA process lifecycle (spawn, health check, teardown) |
| `metrics.ts` | Detection rate, false positive rate, P95 latency computation |

`npm run build` compiles `src/` without its test files, and vitest does not check types. `npm run typecheck:tests` type-checks `src/` with them (`tsconfig.test.json`, no output). `npm test` runs it through `scripts/typecheck-tests.test.mjs`, one of the tests its `pretest` script runs, which fails on any type error it reports.

## Raw network classification: suspicious hosts

`AT-NET-002` supplies `NetworkObservation` facts through optional
`observeNetwork()`: remote address/port, protocol, outbound direction, and
optional PID. Category, severity, descriptions, arbitrary context and expected
labels are forbidden. `validateNetworkObservation()` rejects extra fields at
runtime, including for JavaScript callers. An adapter must reject them before
processing and resolve only after its product's resulting events are collected.
The scenario never calls `injectEvent()` and retains its expected labels only
in assertions. Three suspicious-host fixtures are paired with three allowed
benign hosts, keeping port, direction and protocol the same. A benign case
requires an actual normal event, rather than passing on silence.

The suite requires both `network-monitoring` and `raw-network-observation`.
The new method and capability are additive: legacy and prompt-only adapters
are N/A for this family without implementing network logic. Declaring the raw
capability without implementing the method fails, rather than skipping.
Scanner and prompt interfaces are unchanged.

The reference adapter reuses the installed ARP `NetworkMonitor.poll()`.
ARP currently has no public raw-record classifier method, so the adapter uses
an explicit guarded private acquisition seam: temporarily replace
`getConnections()` with factual records and restore it immediately after the
product poll. It forwards the product's emissions to the real EventEngine and
awaits them; no host list, severity rule or classifier is copied into OASB.
This component monitor has no timer and makes no real connection. Live OS
acquisition is disabled deliberately and is **not measured** by this slice.
The adapter advertises the raw capability only when the installed methods
exist. Method signature/behavior changes still require compatibility review;
the regression tests exercise the locked installed product, not a classifier
mock. A public upstream product API would remove this private-seam dependency.

### Measurement interpretation

Previously the scenario injected `threat/critical` and read those labels back,
so a passing run could measure event transport without measuring detection.
Now it measures the product's classification of raw host observations on these
policy fixtures. This removes direct target/label leakage from this family and
improves construct validity: the operational test exercises the claimed
classification capability.

Ground truth is evaluator-held fixture/policy truth specified before running
the detector; product output does not decide its own correctness. Nevertheless,
public suspicious services are not inherently malicious, and these fixtures
are not an independent threat-intelligence corpus. This remains reference
policy conformance, not neutral general-purpose detection quality.
Sensitivity is TP/(TP+FN); specificity is TN/(TN+FP). Paired benign controls
reject a constant alarm, while malicious controls reject a silent/echo-only
adapter. Small fixed fixtures do not establish deployment FPR or statistical
population generalization.

Other atomic network/process/filesystem families and integration chains still
inject pre-labelled events. Those steps measure event handling and rule response,
not independent classification. Their migration needs separate raw schemas,
product entry points and controls, so is separate follow-up work. The scanner
benchmark and existing scanner interfaces are unchanged.

Methodology sources (principles applied here, not prior studies of OASB):

- [Kapoor and Narayanan, Patterns 2023](https://doi.org/10.1016/j.patter.2023.100804):
  leakage and invalid performance interpretation.
- [Arp et al., USENIX Security 2022](https://www.usenix.org/conference/usenixsecurity22/presentation/arp):
  pitfalls in security evaluation and experimental design.
- [Bean et al., NeurIPS 2025 Datasets and Benchmarks](https://arxiv.org/abs/2511.04703):
  construct validity and alignment of claims, tasks and metrics.
