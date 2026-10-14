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

`npm run build` compiles `src/` without its test files, and vitest does not check types. `npm run typecheck:tests` type-checks `src/` with them (`tsconfig.test.json`, no output). It reports type errors in scenario test files that are not fixed yet, and `npm test` does not run it.
