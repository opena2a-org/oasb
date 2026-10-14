> **[OpenA2A](https://github.com/opena2a-org/opena2a)**: [CLI](https://github.com/opena2a-org/opena2a) · [HackMyAgent](https://github.com/opena2a-org/hackmyagent) · [Secretless](https://github.com/opena2a-org/secretless-ai) · [AIM](https://github.com/opena2a-org/agent-identity-management) · [Browser Guard](https://github.com/opena2a-org/AI-BrowserGuard) · [DVAA](https://github.com/opena2a-org/damn-vulnerable-ai-agent)

# OASB - Open Agent Security Benchmark

[![Status: stable](https://img.shields.io/badge/status-stable-green)](./STATUS.md)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Tests](https://img.shields.io/badge/tests-404%20passing-brightgreen)](https://github.com/opena2a-org/oasb)
[![MITRE ATLAS](https://img.shields.io/badge/MITRE%20ATLAS-15%20techniques-teal)](https://atlas.mitre.org/)

**MITRE ATT&CK Evaluations, but for AI agent security products.**

223 standardized attack scenarios that evaluate whether a runtime security product can detect and respond to threats against AI agents. 166 of them, in 33 files, map to MITRE ATLAS (15 techniques, including the AI-agent technique family); the other 57 test the product's defensive response and its own detection machinery, which no adversary technique describes, and are [tracked separately](#mitre-atlas-coverage). Each scenario is mapped to the [OWASP Top 10 for Agentic Applications (2026)](docs/owasp-agentic-mapping.md), and most also to the OWASP Top 10 for LLM Applications (2025). Plug in your product, run the suite, get a detection coverage scorecard.

[OASB Website](https://oasb.ai) | [MITRE ATLAS Coverage](#mitre-atlas-coverage) | [Contributing](#contributing)

## Quick Start

```bash
git clone https://github.com/opena2a-org/oasb.git
cd oasb && npm ci
npx vitest run AT-AI-001 --reporter=verbose   # one scenario file: prompt input scanning, against the reference adapter
```

What `npx vitest run AT-AI-001 --reporter=verbose` prints, trimmed:

```text
...
 ✓ src/atomic/ai-layer/AT-AI-001.prompt-input-scan.test.ts > AT-AI-001: Prompt Input Scanning > should detect instruction override (PI-001) 3ms
 ✓ src/atomic/ai-layer/AT-AI-001.prompt-input-scan.test.ts > AT-AI-001: Prompt Input Scanning > should detect delimiter escape (PI-002) 1ms
 ✓ src/atomic/ai-layer/AT-AI-001.prompt-input-scan.test.ts > AT-AI-001: Prompt Input Scanning > should detect tag injection (PI-003) 0ms
...
 ✓ src/atomic/ai-layer/AT-AI-001.prompt-input-scan.test.ts > AT-AI-001: Prompt Input Scanning > should not flag benign input 0ms
 ✓ src/atomic/ai-layer/AT-AI-001.prompt-input-scan.test.ts > AT-AI-001: Prompt Input Scanning > should not flag technical questions about security 0ms

 Test Files  1 passed (1)
      Tests  11 passed (11)
...
```

`npm test` runs the tests in `scripts/` and then the whole suite: every attack scenario, plus the scoring-engine, pinned benchmark harness and adapter tests. The [test catalog](docs/test-catalog.md#what-gets-tested) has the totals, which `npm run check:readme` holds to the suite, and a command for each group.

The suite runs against [ARP](https://www.npmjs.com/package/arp-guard) (`arp-guard`), the reference adapter. ARP is an optional peer dependency: it is installed for running the reference evaluation, and you do not need it if you implement your own adapter (see [Evaluating Other Products](#evaluating-other-products)).

## Evaluating Other Products

OASB is product-agnostic. The reference adapter wraps ARP, but the same suite runs against any product that implements `SecurityProductAdapter`. Select the product under test with the `OASB_ADAPTER` environment variable:

```bash
npm test                              # ARP (arp-guard), the reference adapter (default)
OASB_ADAPTER=llm-guard npm test       # the llm-guard npm package
OASB_ADAPTER=rebuff npm test          # the rebuff npm package
OASB_ADAPTER=./my-adapter.js npm test # your own adapter module
```

Each adapter declares its **capabilities** via `getCapabilities()`. Tests for a surface the product does not support are marked **N/A (skipped)**, not FAIL - a prompt-only scanner is not penalized for lacking filesystem monitoring. [docs/adapters.md](docs/adapters.md) lists the surfaces each adapter declares and what the rebuff adapter needs.

> **Where cross-product detection numbers come from.** The atomic AI-layer tests assert the reference adapter's own pattern taxonomy, so they verify *conformance to the OASB harness*, not neutral detection quality. Across products, the [Scanner Benchmark](docs/pinned-benchmark.md#skills-security-benchmark) gives a **recall-only comparison**: its benign class was labeled by HackMyAgent, one of the scanners it compares.

To evaluate your own product: implement `SecurityProductAdapter` from `src/harness/adapter.ts`, declare its capabilities, point `OASB_ADAPTER` at your module, and run the full suite. The interface defines event types, scanner interfaces, and enforcement contracts - no dependency on any specific product.

## Use as a library

The suite is also published as [`@opena2a/oasb`](https://www.npmjs.com/package/@opena2a/oasb) for building adapters and consuming the scoring engine programmatically:

```bash
npm install @opena2a/oasb
npm install arp-guard   # the default adapter's product; not needed if you set OASB_ADAPTER
```

```ts
import type { SecurityProductAdapter } from '@opena2a/oasb';
import { createAdapter, getCapabilityMatrix, benchmark } from '@opena2a/oasb';

// Implement SecurityProductAdapter for your product, or select one via
// the OASB_ADAPTER env var (see "Evaluating Other Products" above).
const adapter = createAdapter();
console.log(getCapabilityMatrix());

// Scoring engine + scanner-benchmark runner
const tier = benchmark.determineTier(/* aggregate metrics */);
```

The package exports the adapter contract (`SecurityProductAdapter`, event and enforcement types), capability helpers, the worked adapter examples (`ArpWrapper`, `LLMGuardWrapper`, `RebuffWrapper` - each lazy-loads its underlying product, so none are required to install), harness utilities (`EventCollector`, `MockLLMAdapter`, metrics), and the skills-security scoring engine under `benchmark`. Running the full attack-scenario suite still happens from a repo checkout with `npm test`.

## Usage via OpenA2A CLI

The [OpenA2A CLI](https://github.com/opena2a-org/opena2a) and [HackMyAgent](https://github.com/opena2a-org/hackmyagent) check an agent directory against the OASB-1 controls: how the agent is configured, not how a security product detects attacks. Neither runs the attack scenarios in this repository; those run from a checkout with `npm test` (see [Quick Start](#quick-start)).

```bash
opena2a benchmark ./my-agent                            # OASB-1 controls at level L1
opena2a benchmark ./my-agent --level L2                 # levels L1, L2 and L3
opena2a benchmark ./my-agent --format json              # rating, compliance and control coverage as JSON
hackmyagent secure ./my-agent -b oasb-1                 # the same controls from HackMyAgent
hackmyagent secure ./my-agent -b oasb-1 --fail-below 80 # also exit 1 below 80% compliance, for CI
```

Both score only the controls they could evaluate. The rest are listed as not evaluated (OpenA2A CLI) or unverified (HackMyAgent), not counted as passing.

## MITRE ATLAS Coverage

Each scenario that simulates an adversary maps to a [MITRE ATLAS](https://atlas.mitre.org/) technique. Defensive and capability tests, which validate the product's response and its own detection machinery, are tracked separately, because ATLAS is an adversary framework. The technique table and its counts are in [docs/mitre-atlas-mapping.md](docs/mitre-atlas-mapping.md#mitre-atlas-coverage).

## Documentation

- [How OASB works](docs/how-it-works.md): what OASB evaluates and how it differs from HackMyAgent.
- [Test catalog](docs/test-catalog.md): what each category tests, the test totals, a command for each group, and per-test detail.
- [MITRE ATLAS mapping](docs/mitre-atlas-mapping.md) and [OWASP Agentic mapping](docs/owasp-agentic-mapping.md).
- [Adapters](docs/adapters.md): the reference adapter, the worked examples and the surfaces each one declares.
- [Test harness](docs/test-harness.md): the harness files, the build and the type-check of the tests.
- [Skills Security Benchmark](docs/pinned-benchmark.md#skills-security-benchmark): the scoring engine, the corpus, the runners, pinned runs and the latest results. Recall is retained; F1, precision, false-positive rate and flag rate on its corpus are withdrawn, because a scanner under test labeled its benign class.
- [BENCHMARK-RESULTS.md](BENCHMARK-RESULTS.md): per-category counts, the verdict methodology and the DVAA breakdown.
- [Known detection gaps](docs/known-gaps.md) of the reference adapter.
- [Release smoke test](docs/testing/release-smoke.md): the checks that hold the documented counts and commands to the suite.
- [Recording of a run](docs/oasb-demo.gif).
- [Updates](docs/updates.md), [CHANGELOG.md](CHANGELOG.md) and [STATUS.md](STATUS.md).
- Related OpenA2A tools: [AIM](https://github.com/opena2a-org/agent-identity-management) (identity and access control for AI agents), [HackMyAgent](https://github.com/opena2a-org/hackmyagent) (security scanner), [ARP](https://www.npmjs.com/package/arp-guard) (agent runtime protection), [Secretless AI](https://github.com/opena2a-org/secretless-ai) (keeps credentials out of AI context windows) and [DVAA](https://github.com/opena2a-org/damn-vulnerable-ai-agent) (a deliberately vulnerable agent for security training and red-teaming).

## Contributing

We are looking for co-authors, an independent second implementation and new attack scenarios before the benchmark goes to an external standards body. Run your detector against the suite, contribute scenarios, or open an issue to be listed as an adopter: see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0
