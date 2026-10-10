> **[OpenA2A](https://github.com/opena2a-org/opena2a)**: [CLI](https://github.com/opena2a-org/opena2a) · [HackMyAgent](https://github.com/opena2a-org/hackmyagent) · [Secretless](https://github.com/opena2a-org/secretless-ai) · [AIM](https://github.com/opena2a-org/agent-identity-management) · [Browser Guard](https://github.com/opena2a-org/AI-BrowserGuard) · [DVAA](https://github.com/opena2a-org/damn-vulnerable-ai-agent)

# OASB - Open Agent Security Benchmark

[![Status: stable](https://img.shields.io/badge/status-stable-green)](./STATUS.md)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Tests](https://img.shields.io/badge/tests-244%20passing-brightgreen)](https://github.com/opena2a-org/oasb)
[![MITRE ATLAS](https://img.shields.io/badge/MITRE%20ATLAS-15%20techniques-teal)](https://atlas.mitre.org/)

**MITRE ATT&CK Evaluations, but for AI agent security products.**

222 standardized attack scenarios that evaluate whether a runtime security product can detect and respond to threats against AI agents. Each scenario is mapped to MITRE ATLAS (15 techniques, including the AI-agent technique family) and the OWASP LLM/Agentic Top 10. Plug in your product, run the suite, get a detection coverage scorecard.

[OASB Website](https://oasb.ai) | [MITRE ATLAS Coverage](#mitre-atlas-coverage) | [Contributing](#contributing)

## Quick Start

```bash
git clone https://github.com/opena2a-org/oasb.git
cd oasb && npm ci
npm test                    # Full suite: 245 tests (244 pass, 1 skip)
```

The suite runs against [ARP](https://www.npmjs.com/package/arp-guard) (`arp-guard`), the reference adapter. ARP is now part of HackMyAgent and is an optional peer dependency: it is installed for running the reference evaluation, and you do not need it if you implement your own adapter. To evaluate your own security product, implement the `SecurityProductAdapter` interface in `src/harness/adapter.ts` and run the same 222 attack scenarios - see [Evaluating Other Products](#evaluating-other-products).

> **Counts.** `npm test` runs **245 tests** (244 passing, 1 skipped on every platform: the live network-detection E2E is disabled pending a reliable cross-platform check - see `src/e2e/E2E-003`): **222 attack scenarios** (atomic, integration, baseline, E2E) plus **23 scoring-engine unit tests**. "222" is the scenario count; "244 passing" is the full `npm test` total. Both are reproducible from a clean checkout - see [What Gets Tested](#what-gets-tested).

Run one group at a time:

```bash
npm run test:atomic         # 144 atomic detection tests (no external deps)
npm run test:integration    # 43 tests across 8 integration scenarios
npm run test:baseline       # 12 false-positive / baseline tests
npm run test:e2e            # 23 E2E tests (real OS detection; E2E-003 currently skipped)
```

![OASB Demo](docs/oasb-demo.gif)

---

## What OASB Is (and Isn't)

OASB evaluates **security products**, not agents. It answers: "does your runtime protection actually catch these attacks?"

| | OASB | [HackMyAgent](https://github.com/opena2a-org/hackmyagent) |
|---|---|---|
| **Purpose** | Evaluate security *products* | Pentest AI *agents* |
| **Tests** | "Does your EDR catch this exfiltration?" | "Is your agent leaking credentials?" |
| **Audience** | Security product vendors, evaluators | Agent developers, red teams |
| **Analogous to** | [MITRE ATT&CK Evaluations](https://attackevals.mitre-engenuity.org/) | [OWASP ZAP](https://www.zaproxy.org/) / Burp Suite |
| **Method** | Controlled lab - inject attacks, measure detection | Active scanning + adversarial payloads against live targets |
| **Output** | Detection coverage scorecard | Vulnerability report + auto-fix |

Use both together: **HackMyAgent** finds vulnerabilities in your agent, **OASB** proves your security product catches real attacks.

---

## Evaluating Other Products

OASB is product-agnostic. The reference adapter wraps ARP, but the same suite runs against any product that implements `SecurityProductAdapter`. Select the product under test with the `OASB_ADAPTER` environment variable:

```bash
npm test                              # ARP (arp-guard), the reference adapter (default)
OASB_ADAPTER=llm-guard npm test       # the llm-guard npm package
OASB_ADAPTER=rebuff npm test          # the rebuff npm package
OASB_ADAPTER=./my-adapter.js npm test # your own adapter module
```

Each adapter declares its **capabilities** via `getCapabilities()`. Tests for a surface the product does not support are marked **N/A (skipped)**, not FAIL - a prompt-only scanner is not penalized for lacking filesystem monitoring. This keeps scorecards honest and comparable.

| Surface | ARP (reference) | llm-guard | rebuff |
|---------|:---:|:---:|:---:|
| Prompt input scanning | ✓ | ✓ | ✓ |
| Prompt output scanning | ✓ | N/A | N/A |
| MCP tool-call scanning | ✓ | N/A | N/A |
| A2A message scanning | ✓ | N/A | N/A |
| Pattern scanning | ✓ | ✓ | ✓ |
| Process / network / filesystem monitoring | ✓ | N/A | N/A |
| Anomaly detection, budget control, enforcement | ✓ | N/A | N/A |

> **Where cross-product detection numbers come from.** The atomic AI-layer tests assert the reference adapter's own pattern taxonomy (e.g. pattern id `PI-001`), so they verify *conformance to the OASB harness*, not neutral detection quality. For an apples-to-apples detection comparison across products, use the **verdict-based [Scanner Benchmark](#skills-security-benchmark)** below - it scores any adapter on the same labeled corpus using `malicious`/`benign` verdicts, independent of internal pattern names.

To evaluate your own product: implement `SecurityProductAdapter` from `src/harness/adapter.ts`, declare its capabilities, point `OASB_ADAPTER` at your module, and run the full suite. The interface defines event types, scanner interfaces, and enforcement contracts - no dependency on any specific product.

---

## Use as a library

The suite is also published as [`@opena2a/oasb`](https://www.npmjs.com/package/@opena2a/oasb) for building adapters and consuming the scoring engine programmatically:

```bash
npm install @opena2a/oasb
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

---

## Usage via OpenA2A CLI

OASB is available as a built-in adapter in the [OpenA2A CLI](https://github.com/opena2a-org/opena2a) via the `benchmark` command, and OASB controls are available in [HackMyAgent](https://github.com/opena2a-org/hackmyagent) v0.8.0+ the same way. The CLI delegates to the `oasb` package using an import adapter, so no separate installation is needed if you already have the CLI installed. This repository remains the canonical source for the full evaluation suite.

```bash
opena2a benchmark run                                 # all 222 scenarios, detection coverage scorecard
opena2a benchmark run --technique T0015               # one MITRE ATLAS technique (T0015 = Evasion)
opena2a benchmark run --format json                   # machine-readable output for CI
opena2a benchmark run --technique T0057 --format json # flags combine
```

`--format json` outputs the compliance score and per-technique detection rates as JSON. Integrate it into CI pipelines to enforce minimum detection thresholds on every build.

---

## What Gets Tested

Each test simulates a specific attack technique and checks whether the security product under evaluation detects it, classifies it correctly, and responds appropriately.

Counts below are the live test totals (`npm test`); each maps to a source directory so they are reproducible. Per-test detail for every category is in the [test catalog](docs/test-catalog.md).

| Category | Tests | Source | What It Evaluates |
|----------|-------|--------|-------------------|
| Process detection | 19 | `src/atomic/process` | Child process spawns, suspicious binaries, privilege escalation, CPU anomalies |
| Network detection | 18 | `src/atomic/network` | Outbound connections, suspicious hosts, exfiltration, subdomain bypass |
| Filesystem detection | 28 | `src/atomic/filesystem` | Sensitive path access, credential files, dotfile persistence, mass file DoS |
| Intelligence layers | 21 | `src/atomic/intelligence` | Rule matching, anomaly scoring, LLM escalation, budget exhaustion |
| Enforcement actions | 18 | `src/atomic/enforcement` | Logging, alerting, process pause (SIGSTOP), kill (SIGTERM/SIGKILL), resume |
| AI-layer scanning | 40 | `src/atomic/ai-layer` | Prompt injection/output, MCP tool call validation, A2A message scanning, pattern coverage |
| Multi-step attacks | 43 | `src/integration` | Data exfiltration chains, MCP tool abuse, prompt injection, A2A trust exploitation |
| Baseline behavior | 12 | `src/baseline` | False positive rates, anomaly injection, baseline persistence |
| Real OS detection | 9 | `src/e2e` (live monitors) | Live filesystem watches, process polling, network monitoring |
| Application-level hooks | 14 | `src/e2e` (interceptors) | Pre-execution interception of spawn, connect, read/write |
| **Attack scenarios** | **222** | atomic + integration + baseline + E2E | **15 MITRE ATLAS techniques** |
| Scoring-engine unit tests | 23 | `src/benchmark` | Pooled metrics, tier/compliance assignment, Cohen's Kappa, leaderboard |
| **`npm test` total** | **245** | (244 pass, 1 environment-skipped) | |

---

## MITRE ATLAS Coverage

15 unique techniques across 47 scenario files, mapped to [MITRE ATLAS](https://atlas.mitre.org/) as of the current matrix (which renamed the ML-attack techniques to AI and added the AI-agent technique family in 2025). Technique IDs and names are verified against MITRE's published [`ATLAS.yaml`](https://github.com/mitre-atlas/atlas-data). Per-technique detail: [docs/mitre-atlas-mapping.md](docs/mitre-atlas-mapping.md).

| Technique | ID | Tests |
|-----------|----|-------|
| Command and Scripting Interpreter | AML.T0050 | AT-PROC-001/002, E2E-002/004 |
| Escape to Host | AML.T0105 | AT-PROC-004 |
| Exfiltration via Cyber Means | AML.T0025 | AT-NET-001/002/004/005, E2E-003/005 |
| Agentic Resource Consumption | AML.T0034.002 | AT-PROC-003, AT-NET-003, AT-FS-004, AT-INT-004 |
| Unsecured Credentials | AML.T0055 | AT-FS-001/003, E2E-001/006 |
| Data from Local System | AML.T0037 | AT-FS-002 |
| Modify AI Agent Configuration | AML.T0081 | AT-FS-005, E2E-001/006 |
| LLM Prompt Injection | AML.T0051 | AT-AI-001/005, INT-003 |
| LLM Jailbreak | AML.T0054 | AT-AI-001/005 |
| LLM Data Leakage | AML.T0057 | AT-AI-002/005 |
| AI Agent Tool Invocation | AML.T0053 | AT-AI-003/005, INT-002 |
| Impersonation | AML.T0073 | AT-AI-004/005, INT-004 |
| Exfiltration via AI Agent Tool Invocation | AML.T0086 | INT-001 |
| Spamming AI System with Chaff Data | AML.T0046 | INT-007 |
| Evade AI Model | AML.T0015 | INT-005, AT-INT-002 |

**Defensive and capability tests are not mapped to adversary techniques.** Enforcement tests (AT-ENF-001–005, AT-PROC-005, INT-008) validate the product's *response* to the Impact tactic (AML.TA0011). Intelligence-layer tests (AT-INT-001/003/005), correlation (INT-006), and baseline tests (BL-001–003) validate the product's own detection machinery. Mapping a defensive test to an attack technique (the prior table mapped enforcement to "AML.TA0006") conflates the adversary matrix with the defender - ATLAS is an adversary framework, so those tests are tracked separately.

---

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
| `mock-llm-adapter.ts` | Deterministic LLM for intelligence layer testing (pattern-based responses) |
| `dvaa-client.ts` | HTTP client for DVAA vulnerable agent endpoints |
| `dvaa-manager.ts` | DVAA process lifecycle (spawn, health check, teardown) |
| `metrics.ts` | Detection rate, false positive rate, P95 latency computation |

---

## Skills Security Benchmark

A scoring engine for scanners that judge AI agent skills and configurations, in `src/benchmark/` and exported as `benchmark`. It defines:

- **9 attack categories** (`src/benchmark/types.ts`): `supply_chain`, `prompt_injection`, `credential_exfiltration`, `heartbeat_rce`, `unicode_stego`, `privilege_escalation`, `persistence`, `social_engineering`, `data_exfiltration`.
- **11 controls** (`src/benchmark/controls.ts`): SS-01 to SS-10 and SEC-021, each assigned to compliance level L1 (Basic), L2 (Standard) or L3 (Advanced).
- **Tiers** (`TIER_THRESHOLDS` in `src/benchmark/scoring.ts`): platinum, gold, silver or listed, assigned from F1, false-positive rate, category coverage and, for platinum, Cohen's kappa against HackMyAgent. No tier is published for the corpus below, because F1 and false-positive rate on it are withdrawn.

### Benchmark Corpus (v2.0)

4,245 ground-truth labeled samples for scanner evaluation:

| | Count | Description |
|---|---|---|
| Malicious | 270 | 30 per attack category (9 categories), all written by us: ARIA 89, DVAA 91, HackMyAgent test payloads 90 |
| Benign | 3,881 | 3,704 labeled benign from the scanner under test's own registry scan results (see below), 177 hand-authored |
| Edge cases | 94 | Security tools, defensive governance, broad-permission configs |

> The published results below were produced on this 4,245-sample categorized set. The corpus file (`corpus/v2.json`) has since grown additional uncategorized malicious samples; the `--categorized-only` flag used by the runner pins evaluation to the 270 categorized malicious samples (30 × 9) so the numbers are reproducible.

### Benchmark Runner

```bash
npx tsx scripts/run-benchmark-v2.ts --categorized-only            # Full corpus, all adapters
npx tsx scripts/run-benchmark-v2.ts --categorized-only --limit=100  # Quick test with 100 samples
npx tsx scripts/run-dvaa-benchmark.ts                              # DVAA ground-truth comparison (needs ../damn-vulnerable-ai-agent)
```

### Latest Results (2026-06-05, partially withdrawn 2026-08-09)

**F1, precision, false-positive rate and flag rate are withdrawn.** The benign class of this corpus
was labeled by the scanner under test: the labeling rule in `scripts/export-registry-corpus.mjs`
(`row.verdict === 'warning' && row.overall_score >= 70`, as reported by HackMyAgent itself) assigns
samples to the benign class, and 3,704 of the 3,881 benign samples came from that rule. Anything
HackMyAgent would have flagged was excluded from the benign class by construction, so a near-zero
false-positive rate was guaranteed before a single scan ran. Those figures are not restated here,
and no replacement figure is offered.

**Recall is retained**, because it reads only the malicious class, and the published run excludes the
225 registry samples labeled malicious by that same rule (`--categorized-only`). Measured on
hackmyagent 0.23.8 (the build under test on 2026-06-05; these figures have not been re-run against
later releases), full pipeline:

| Scanner | Recall | F1 / Precision / FPR / Flag rate |
|---------|--------|----------------------------------|
| HMA Full Pipeline | **82.6%** (223/270) | withdrawn |
| HMA Static (regex) | 51.1% | withdrawn |
| NanoMind TME v0.5.0 (ablation) | 93.0% | withdrawn |

Read that 82.6% with its denominator: all 270 attack fixtures are ones we wrote. Excluding
HackMyAgent's own payloads it is 82.2% (148/180). Scored over all 495 samples the corpus calls
malicious, including the 225 self-labeled ones, it is 47.3% (234/495). This is detection against a
fixed fixture set we authored, not a measure of detection in the wild, and not comparable to another
scanner's number on another corpus. On the full DVAA scenario repository, which includes behavioral
and natural-language attacks, the structural pipeline detects 25 of 86 scenarios.

[BENCHMARK-RESULTS.md](BENCHMARK-RESULTS.md) has the per-category counts, the posture-vs-attack verdict
methodology and its 2026-08-27 correction, the DVAA breakdown, and the comparison with Holzbauer et al.
(arXiv:2603.16572).

---

## Known Detection Gaps

OASB documents what the reference product (ARP) does and doesn't catch. Other products may have different gap profiles - that's the point of running the benchmark. For the methodology audit (counts, ATLAS mapping, scoring), see [docs/AUDIT-2026-06-03.md](docs/AUDIT-2026-06-03.md).

| Gap | Severity | Test | Notes |
|-----|----------|------|-------|
| Anomaly baselines not persisted across restarts | Medium | BL-003 | In-memory only; restarts lose learned behavior |
| No connection rate anomaly detection | Medium | AT-NET-003 | Network monitor tracks hosts, not burst rates |
| No HTTP response body monitoring | Low | INT-003 | AI-layer output scanning (PromptInterceptor.scanOutput) covers LLM responses; raw HTTP responses not inspected |
| No cross-monitor event correlation | Architectural | INT-006 | EventEngine is a flat bus; no attack-chain aggregation |

---

## Updates

| Date | Change |
|------|--------|
| 2026-08-09 | **Comparative scanner scores withdrawn.** The benign class of this corpus was labeled by the scanner under test, so F1, precision, FPR and flag rate were determined by the labeling rule rather than measured. Recall is retained with disclosure - see [BENCHMARK-RESULTS.md](BENCHMARK-RESULTS.md) § 1. |
| 2026-07-13 | **v0.4.0** - working package entry point (`import '@opena2a/oasb'`), reproducible installs, committed release smoke gate, [CONTRIBUTING.md](CONTRIBUTING.md). First release via npm Trusted Publishing (SLSA provenance). |
| 2026-06-05 | ~~Scanner benchmark re-measured with a posture-vs-attack verdict: **F1 82.9%, FPR 1.16%**.~~ **Withdrawn 2026-08-09** (see above); the row is kept so the record of what was published stays visible. Earlier 82.1% and 89.2% figures also withdrawn - see [BENCHMARK-RESULTS.md](BENCHMARK-RESULTS.md). |
| 2026-06-03 | Remapped to current MITRE ATLAS (15 techniques); capability gating reports N/A, not FAIL; pooled metrics. Audit: [docs/AUDIT-2026-06-03.md](docs/AUDIT-2026-06-03.md). |
| 2026-04-02 | Scanner Benchmark v2: 4,245-sample corpus, 3 HMA adapter tiers. Superseded by the 2026-06-05 re-measurement. |
| 2026-03-23 | v0.3.0 - `arp-guard` re-exports from HackMyAgent; simplified Quick Start. |
| 2026-02-19 | 40 AI-layer scenarios (AT-AI-001 to AT-AI-005) for prompt, MCP, and A2A scanning. |
| 2026-02-09 | Initial release: 182 attack scenarios across 10 MITRE ATLAS techniques. |

Full history with methodology detail: [CHANGELOG.md](CHANGELOG.md).

---

## Contributing

This benchmark is early and authored in the open. We are looking for co-authors, an independent second implementation, and new attack scenarios before it goes to an external standards body. Run your detector against the suite, contribute scenarios, or open an issue to be listed as an adopter. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

Apache-2.0

---

## OpenA2A Ecosystem

| Project | Description | Install |
|---------|-------------|---------|
| [**AIM**](https://github.com/opena2a-org/agent-identity-management) | Agent Identity Management -- identity and access control for AI agents | `npm install @opena2a/aim-core` |
| [**HackMyAgent**](https://github.com/opena2a-org/hackmyagent) | Security scanner -- static, NanoMind semantic, and adversarial checks, attack mode, auto-fix (current check counts: `npx hackmyagent check-metadata --json`) | `npx hackmyagent secure` |
| [**ARP**](https://www.npmjs.com/package/arp-guard) | Agent Runtime Protection -- process, network, filesystem, AI-layer monitoring | `npm install arp-guard` |
| [**Secretless AI**](https://github.com/opena2a-org/secretless-ai) | Keep credentials out of AI context windows | `npx secretless-ai init` |
| [**DVAA**](https://github.com/opena2a-org/damn-vulnerable-ai-agent) | Damn Vulnerable AI Agent -- security training and red-teaming | `docker pull opena2a/dvaa` |
