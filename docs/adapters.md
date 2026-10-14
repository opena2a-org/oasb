# Adapters

The adapters the suite runs against, the surfaces each one declares, and
where cross-product detection numbers come from. The
[README](../README.md#evaluating-other-products) shows how to select an adapter
with `OASB_ADAPTER`; the [test harness](test-harness.md) page lists the adapter
files.

## The adapters

The suite runs against [ARP](https://www.npmjs.com/package/arp-guard) (`arp-guard`), the reference adapter. ARP is now part of HackMyAgent and is an optional peer dependency: it is installed for running the reference evaluation, and you do not need it if you implement your own adapter. To evaluate your own security product, implement the `SecurityProductAdapter` interface in `src/harness/adapter.ts` and run the same 223 attack scenarios - see [Evaluating Other Products](../README.md#evaluating-other-products).

The rebuff adapter runs the package's heuristic detection. rebuff publishes TypeScript sources only, so the adapter compiles them with the `typescript` dev dependency; when either package is missing, each scan fails with an error that names it.

## Capabilities

Each adapter declares its **capabilities** via `getCapabilities()`. Tests for a surface the product does not support are marked **N/A (skipped)**, not FAIL - a prompt-only scanner is not penalized for lacking filesystem monitoring. This keeps scorecards honest and comparable. A suite that spans several surfaces, such as an integration chain that injects process and network events and expects a kill, runs only when the product declares every one of them.

| Surface | ARP (reference) | llm-guard | rebuff |
|---------|:---:|:---:|:---:|
| Prompt input scanning | ✓ | ✓ | ✓ |
| Prompt output scanning | ✓ | N/A | N/A |
| MCP tool-call scanning | ✓ | N/A | N/A |
| A2A message scanning | ✓ | N/A | N/A |
| Pattern scanning | ✓ | ✓ | ✓ |
| Process / network / filesystem monitoring | ✓ | N/A | N/A |
| Anomaly detection, budget control, enforcement | ✓ | N/A | N/A |

## Comparing products

> **Where cross-product detection numbers come from.** The atomic AI-layer tests assert the reference adapter's own pattern taxonomy (e.g. pattern id `PI-001`), so they verify *conformance to the OASB harness*, not neutral detection quality. Across products, the **verdict-based [Scanner Benchmark](pinned-benchmark.md#skills-security-benchmark)** gives a **recall-only comparison**: it scores any adapter on the same 270 malicious samples using `malicious`/`benign` verdicts, independent of internal pattern names. Its benign class was labeled by HackMyAgent, one of the scanners it compares, so false-positive rate, precision, F1, flag rate and tier on it favor that scanner by construction and are not comparable across products (see [Latest Results](pinned-benchmark.md#latest-results-pinned-run-2026-10-10-2026-06-05-run-partially-withdrawn-2026-08-09)).
