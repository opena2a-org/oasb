# Adapters

The adapters the suite runs against, the surfaces each one declares, the
tests that fail under llm-guard and rebuff, and where cross-product detection
numbers come from. The
[README](../README.md#evaluating-other-products) shows how to select an adapter
with `OASB_ADAPTER`; the [test harness](test-harness.md) page lists the adapter
files.

## The adapters

The suite runs against [ARP](https://www.npmjs.com/package/arp-guard) (`arp-guard`), the reference adapter. ARP is now part of HackMyAgent. It is an optional dependency of the package: npm installs it, and `npx @opena2a/oasb <ID>` runs against it, unless optional dependencies are omitted (`npm install @opena2a/oasb --omit=optional`). You do not need it if you implement your own adapter. To evaluate your own security product, implement the `SecurityProductAdapter` interface in `src/harness/adapter.ts` and run the same 223 attack scenarios - see [Evaluating Other Products](../README.md#evaluating-other-products). Point `OASB_ADAPTER` at a module that exports the class as its default export, as a named export `Adapter`, or as `module.exports = Class`.

The interface defines event types, scanner interfaces, and enforcement contracts - no dependency on any specific product.

The rebuff adapter runs the package's heuristic detection. rebuff publishes TypeScript sources only, so the adapter compiles them with the `typescript` dev dependency. When the rebuff package is missing, each scenario file fails while vitest collects it, before any of its tests runs, with an error that names the rebuff package: `getCapabilities()` reads rebuff's version from its `package.json`, and each scenario file checks the adapter's capabilities while it is collected. When `typescript` is missing, the scenario files are collected and each scan fails with an error that names `typescript`.

## Capabilities

Each adapter declares its **capabilities** via `getCapabilities()`. Tests for a surface the product does not support are marked **N/A (skipped)**, not FAIL - a prompt-only scanner is not penalized for lacking filesystem monitoring. This keeps scorecards honest and comparable. A suite that spans several surfaces, such as an integration chain that injects process and network events and expects a kill, runs only when the product declares every one of them. A run in which every selected attack scenario is N/A, such as one under an adapter that declares no capabilities, measured nothing: it ends with `OASB: not measured (0 of <selected> attack scenarios evaluated)` on stderr and exits 2, while a run that evaluated at least one ends with `OASB: <evaluated> of <selected> attack scenarios evaluated` and keeps vitest's exit code.

| Surface | ARP (reference) | llm-guard | rebuff |
|---------|:---:|:---:|:---:|
| Prompt input scanning | ✓ | ✓ | ✓ |
| Prompt output scanning | ✓ | N/A | N/A |
| MCP tool-call scanning | ✓ | N/A | N/A |
| A2A message scanning | ✓ | N/A | N/A |
| Pattern scanning | ✓ | ✓ | ✓ |
| Process / network / filesystem monitoring | ✓ | N/A | N/A |
| Anomaly detection, budget control, enforcement | ✓ | N/A | N/A |

## Tests that fail under llm-guard and rebuff

llm-guard and rebuff declare prompt input scanning and pattern scanning, so the prompt input scanning suite (AT-AI-001) and the pattern coverage suite (AT-AI-005) run against them. Those suites assert the reference adapter's pattern catalog: AT-AI-001 expects the reference pattern id for each attack input, such as `PI-001`, and AT-AI-005 expects the reference adapter's patterns and a payload for each. The two adapters name their patterns `LLMG-...` and `RBUF-...`, and the tests below fail under each of them. They are recorded here instead of marked N/A, because the adapter declares the surface they test. A row whose failing assertion is a pattern id is not a detection miss: the test's assertion before it, `result.detected`, passed. `scripts/adapter-gating.test.mjs` runs the scenario tests under each of the two adapters and fails when the tests that fail are not the ones below, or when one of them fails on an assertion that does not hold the code its row quotes.

| Suite | Test | Failing assertion | What it shows |
|-------|------|-------------------|---------------|
| AT-AI-001 | should detect instruction override (PI-001) | `m.pattern.id === 'PI-001'` | The adapter detects the input under its own pattern id |
| AT-AI-001 | should detect delimiter escape (PI-002) | `m.pattern.id === 'PI-002'` | The adapter detects the input under its own pattern id |
| AT-AI-001 | should detect tag injection (PI-003) | `m.pattern.id === 'PI-003'` | The adapter detects the input under its own pattern id |
| AT-AI-001 | should detect DAN mode jailbreak (JB-001) | `m.pattern.id === 'JB-001'` | The adapter detects the input under its own pattern id |
| AT-AI-001 | should detect roleplay bypass (JB-002) | `m.pattern.id === 'JB-002'` | The adapter detects the input under its own pattern id |
| AT-AI-001 | should detect system prompt extraction (DE-001) | `m.pattern.id === 'DE-001'` | The adapter detects the input under its own pattern id |
| AT-AI-001 | should detect credential extraction (DE-002) | `result.detected` | The adapter does not detect the input |
| AT-AI-001 | should detect false memory injection (CM-001) | `result.detected` | The adapter does not detect the input |
| AT-AI-001 | should detect context reset (CM-002) | `result.detected` | The adapter does not detect the input |
| AT-AI-005 | every pattern the scanner exposes should have a known payload | `uncovered` | The test holds no payload for the adapter's pattern ids |
| AT-AI-005 | should have patterns in all scanning categories | `PATTERN_SETS.outputPatterns.length` | The adapter's output pattern set is empty, as are its MCP and A2A sets |
| AT-AI-005 | each pattern should detect its known payload | `matched` | The adapter's matches for the first payload do not hold its reference pattern id, `PI-001` |

## Comparing products

> **Where cross-product detection numbers come from.** The atomic AI-layer tests assert the reference adapter's own pattern taxonomy (e.g. pattern id `PI-001`), so they verify *conformance to the OASB harness*, not neutral detection quality. Across products, the **verdict-based [Scanner Benchmark](pinned-benchmark.md#skills-security-benchmark)** gives a **recall-only comparison**: it scores any adapter on the same 270 malicious samples using `malicious`/`benign` verdicts, independent of internal pattern names. Its benign class was labeled by HackMyAgent, one of the scanners it compares, so false-positive rate, precision, F1, flag rate and tier on it favor that scanner by construction and are not comparable across products (see [Latest Results](pinned-benchmark.md#latest-results-pinned-run-2026-10-10-2026-06-05-run-partially-withdrawn-2026-08-09)).
