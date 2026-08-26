> **[OpenA2A](https://github.com/opena2a-org/opena2a)**: [CLI](https://github.com/opena2a-org/opena2a) · [HackMyAgent](https://github.com/opena2a-org/hackmyagent) · [Secretless](https://github.com/opena2a-org/secretless-ai) · [AIM](https://github.com/opena2a-org/agent-identity-management) · [Browser Guard](https://github.com/opena2a-org/AI-BrowserGuard) · [DVAA](https://github.com/opena2a-org/damn-vulnerable-ai-agent)

# OASB - Open Agent Security Benchmark

[![Status: stable](https://img.shields.io/badge/status-stable-green)](./STATUS.md)

> **Note:** OASB controls are also available in [HackMyAgent](https://github.com/opena2a-org/hackmyagent) v0.8.0+ via `opena2a benchmark`. This repository is the canonical source for the full evaluation suite and is actively maintained. ARP (the reference adapter) is now part of HackMyAgent - install via `npm install arp-guard`.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Tests](https://img.shields.io/badge/tests-244%20passing-brightgreen)](https://github.com/opena2a-org/oasb)
[![MITRE ATLAS](https://img.shields.io/badge/MITRE%20ATLAS-15%20techniques-teal)](https://atlas.mitre.org/)

**MITRE ATT&CK Evaluations, but for AI agent security products.**

222 standardized attack scenarios that evaluate whether a runtime security product can detect and respond to threats against AI agents. Each scenario is mapped to MITRE ATLAS (15 techniques, including the AI-agent technique family) and the OWASP LLM/Agentic Top 10. Plug in your product, run the suite, get a detection coverage scorecard.

> **Counts.** `npm test` runs **245 tests** (244 passing, 1 skipped on every platform: the live network-detection E2E is disabled pending a reliable cross-platform check - see `src/e2e/E2E-003`): **222 attack scenarios** (atomic, integration, baseline, E2E) plus **23 scoring-engine unit tests**. "222" is the scenario count; "244 passing" is the full `npm test` total. Both are reproducible from a clean checkout - see [What Gets Tested](#what-gets-tested).

[OASB Website](https://oasb.ai) | [MITRE ATLAS Coverage](#mitre-atlas-coverage)

---

## Contributing

This benchmark is early and authored in the open. We are looking for co-authors, an independent second implementation, and new attack scenarios before it goes to an external standards body. Run your detector against the suite, contribute scenarios, or open an issue to be listed as an adopter. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Updates

| Date | Change |
|------|--------|
| 2026-07-13 | **v0.4.0** - working package entry point (`import '@opena2a/oasb'`), reproducible installs, committed release smoke gate, [CONTRIBUTING.md](CONTRIBUTING.md). First release via npm Trusted Publishing (SLSA provenance). |
| 2026-08-09 | **Comparative scanner scores withdrawn.** The benign class of this corpus was labeled by the scanner under test, so F1, precision, FPR and flag rate were determined by the labeling rule rather than measured. Recall is retained with disclosure - see [BENCHMARK-RESULTS.md](BENCHMARK-RESULTS.md) § 1. |
| 2026-06-05 | ~~Scanner benchmark re-measured with a posture-vs-attack verdict: **F1 82.9%, FPR 1.16%**.~~ **Withdrawn 2026-08-09** (see above); the row is kept so the record of what was published stays visible. Earlier 82.1% and 89.2% figures also withdrawn - see [BENCHMARK-RESULTS.md](BENCHMARK-RESULTS.md). |
| 2026-06-03 | Remapped to current MITRE ATLAS (15 techniques); capability gating reports N/A, not FAIL; pooled metrics. Audit: [docs/AUDIT-2026-06-03.md](docs/AUDIT-2026-06-03.md). |
| 2026-04-02 | Scanner Benchmark v2: 4,245-sample corpus, 3 HMA adapter tiers. Superseded by the 2026-06-05 re-measurement. |
| 2026-03-23 | v0.3.0 - `arp-guard` re-exports from HackMyAgent; simplified Quick Start. |
| 2026-02-19 | 40 AI-layer scenarios (AT-AI-001 to AT-AI-005) for prompt, MCP, and A2A scanning. |
| 2026-02-09 | Initial release: 182 attack scenarios across 10 MITRE ATLAS techniques. |

Full history with methodology detail: [CHANGELOG.md](CHANGELOG.md).

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

## Table of Contents

- [Quick Start](#quick-start)
- [Usage via OpenA2A CLI](#usage-via-opena2a-cli)
- [What Gets Tested](#what-gets-tested)
- [Test Categories](#test-categories)
  - [Atomic Tests](#atomic-tests-srcatomic) - 144 discrete detection tests across 30 files (OS-level + AI-layer)
  - [Integration Tests](#integration-tests-srcintegration) - 43 tests across 8 multi-step attack chains
  - [Baseline Tests](#baseline-tests-srcbaseline) - 12 false-positive validations across 3 files
  - [E2E Tests](#e2e-tests-srce2e) - 23 real OS-level detection tests across 6 files
- [MITRE ATLAS Coverage](#mitre-atlas-coverage)
- [Test Harness](#test-harness)
- [Evaluating Other Products](#evaluating-other-products)
- [Skills Security Benchmark](#skills-security-benchmark)
- [Known Detection Gaps](#known-detection-gaps)
- [License](#license)

---

## Quick Start

Ships with [ARP](https://www.npmjs.com/package/arp-guard) (`arp-guard`) as the reference adapter. To evaluate your own security product, implement the `SecurityProductAdapter` interface in `src/harness/adapter.ts` and run the same 222 attack scenarios.

```bash
git clone https://github.com/opena2a-org/oasb.git
cd oasb && npm install
```

> `arp-guard` is an optional peer dependency. It is installed automatically for running the reference ARP evaluation. If you are implementing your own adapter, you do not need it.

### Run the Evaluation

```bash
npm test                    # Full suite: 245 tests (244 pass, 1 skip)
npm run test:atomic         # 144 atomic detection tests (no external deps)
npm run test:integration    # 43 tests across 8 integration scenarios
npm run test:baseline       # 12 false-positive / baseline tests
npm run test:e2e            # 23 E2E tests (real OS detection; E2E-003 currently skipped)
```

![OASB Demo](docs/oasb-demo.gif)

### Use as a library

The suite is also published as [`@opena2a/oasb`](https://www.npmjs.com/package/@opena2a/oasb) for building adapters and consuming the scoring engine programmatically:

```bash
npm install @opena2a/oasb
```

```ts
import type { SecurityProductAdapter } from '@opena2a/oasb';
import { createAdapter, getCapabilityMatrix, benchmark } from '@opena2a/oasb';

// Implement SecurityProductAdapter for your product, or select one via
// the OASB_ADAPTER env var (see "Evaluating Other Products" below).
const adapter = createAdapter();
console.log(getCapabilityMatrix());

// Scoring engine + scanner-benchmark runner
const tier = benchmark.determineTier(/* aggregate metrics */);
```

The package exports the adapter contract (`SecurityProductAdapter`, event and enforcement types), capability helpers, the worked adapter examples (`ArpWrapper`, `LLMGuardWrapper`, `RebuffWrapper` - each lazy-loads its underlying product, so none are required to install), harness utilities (`EventCollector`, `MockLLMAdapter`, metrics), and the skills-security scoring engine under `benchmark`. Running the full attack-scenario suite still happens from a repo checkout with `npm test`.

---

## Usage via OpenA2A CLI

OASB is available as a built-in adapter in the [OpenA2A CLI](https://github.com/opena2a-org/opena2a) via the `benchmark` command. The CLI delegates to the `oasb` package using an import adapter, so no separate installation is needed if you already have the CLI installed.

### Run the full benchmark suite

```bash
opena2a benchmark run
```

Executes all 222 test scenarios (atomic, integration, baseline, and E2E) and produces a detection coverage scorecard.

### Run a specific MITRE ATLAS technique

```bash
opena2a benchmark run --technique T0015
```

Filters the benchmark to a single MITRE ATLAS technique ID (e.g., `T0015` for Evasion). Useful for targeted evaluation of a specific detection capability.

### Generate machine-readable output for CI

```bash
opena2a benchmark run --format json
```

Outputs the compliance score and per-technique detection rates as JSON. Integrate this into CI pipelines to enforce minimum detection thresholds on every build.

### Combining flags

```bash
opena2a benchmark run --technique T0057 --format json
```

Flags can be combined to run a single technique and produce JSON output for automated processing.

---

## What Gets Tested

Each test simulates a specific attack technique and checks whether the security product under evaluation detects it, classifies it correctly, and responds appropriately.

Counts below are the live test totals (`npm test`); each maps to a source directory so they are reproducible.

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

## Test Categories

### Atomic Tests (`src/atomic/`)

Discrete tests that exercise individual detection capabilities. Each test injects a single attack event and verifies the product detects it with the correct classification and severity.

<details>
<summary><strong>AI-Layer Scanning</strong> - 5 files (40 tests)</summary>

| Test | What the Product Should Detect |
|------|-------------------------------|
| AT-AI-001 | Prompt input scanning - PI, JB, DE, CM pattern detection (11 tests) |
| AT-AI-002 | Prompt output scanning - OL pattern detection, data leak prevention (6 tests) |
| AT-AI-003 | MCP tool call scanning - path traversal, command injection, SSRF, allowlist (11 tests) |
| AT-AI-004 | A2A message scanning - identity spoofing, delegation abuse, trust validation (7 tests) |
| AT-AI-005 | Pattern coverage - all 19 patterns detect known payloads, no false positives (5 tests) |

</details>

<details>
<summary><strong>Process Detection</strong> - 5 files</summary>

| Test | ATLAS | What the Product Should Detect |
|------|-------|-------------------------------|
| AT-PROC-001 | AML.T0050 | Child process spawn |
| AT-PROC-002 | AML.T0050 | Suspicious binary execution (curl, wget, nc) |
| AT-PROC-003 | AML.T0034.002 | High CPU anomaly |
| AT-PROC-004 | AML.T0105 | Privilege escalation (root user) |
| AT-PROC-005 | response | Process termination (defensive response, not an adversary technique) |

</details>

<details>
<summary><strong>Network Detection</strong> - 5 files</summary>

| Test | ATLAS | What the Product Should Detect |
|------|-------|-------------------------------|
| AT-NET-001 | AML.T0025 | New outbound connection |
| AT-NET-002 | AML.T0025 | Connection to suspicious host (webhook.site, ngrok) |
| AT-NET-003 | AML.T0034.002 | Connection burst |
| AT-NET-004 | AML.T0025 | Subdomain bypass of allowlist |
| AT-NET-005 | AML.T0025 | Exfiltration destination |

</details>

<details>
<summary><strong>Filesystem Detection</strong> - 5 files</summary>

| Test | ATLAS | What the Product Should Detect |
|------|-------|-------------------------------|
| AT-FS-001 | AML.T0055 | Sensitive path access (.ssh, .aws, .gnupg) |
| AT-FS-002 | AML.T0037 | Access outside allowed paths |
| AT-FS-003 | AML.T0055 | Credential file access (.npmrc, .pypirc, .netrc) |
| AT-FS-004 | AML.T0034.002 | Mass file creation (DoS) |
| AT-FS-005 | AML.T0081 | Shell config modification (.bashrc, .zshrc) |

</details>

<details>
<summary><strong>Intelligence</strong> - 5 files</summary>

These validate the product's own detection machinery (capability tests), not adversary techniques.

| Test | Capability | What the Product Should Do |
|------|-----------|---------------------------|
| AT-INT-001 | Rule engine | Match rules and trigger enforcement |
| AT-INT-002 | Anomaly scoring | Score statistical anomalies (z-score) - surfaces AML.T0015 |
| AT-INT-003 | LLM escalation | Escalate to LLM-assisted assessment |
| AT-INT-004 | Budget control | Handle budget exhaustion (AML.T0034.002) gracefully |
| AT-INT-005 | Baseline learning | Learn and reset behavioral baselines |

</details>

<details>
<summary><strong>Enforcement</strong> - 5 files</summary>

These validate the product's defensive response (countering the Impact tactic, AML.TA0011), not adversary techniques.

| Test | Response | What the Product Should Do |
|------|----------|---------------------------|
| AT-ENF-001 | Log | Execute log action |
| AT-ENF-002 | Alert | Fire alert callback |
| AT-ENF-003 | Pause | Pause process (SIGSTOP) |
| AT-ENF-004 | Kill | Kill process (SIGTERM/SIGKILL) |
| AT-ENF-005 | Resume | Resume paused process (SIGCONT) |

</details>

---

### Integration Tests (`src/integration/`)

Multi-step attack chains that combine multiple techniques. Tests whether the product can detect coordinated attacks, not just isolated events. Optionally validates against live [DVAA](https://github.com/opena2a-org/damn-vulnerable-ai-agent) agents.

| Test | ATLAS | Attack Chain |
|------|-------|-------------|
| INT-001 | AML.T0086 | Data exfiltration: internal contact lookup → credential harvest → webhook.site POST |
| INT-002 | AML.T0053 | MCP tool abuse: path traversal + command injection via tool arguments |
| INT-003 | AML.T0051 | Prompt injection: establish baseline → inject malicious prompt → measure detection |
| INT-004 | AML.T0073 | A2A trust exploitation: spoofed agent identity → unauthorized data access |
| INT-005 | AML.T0015 | Evasion: 5 minutes normal traffic → sudden attack burst → verify anomaly detection |
| INT-006 | capability | Multi-monitor correlation: single attack triggers process + network + filesystem events |
| INT-007 | AML.T0046 | Budget exhaustion: noise flood (chaff) drains LLM budget → real attack goes unanalyzed |
| INT-008 | response | Kill switch: critical threat → product kills agent → verify death → recovery |

---

### Baseline Tests (`src/baseline/`)

Every security product must avoid false positives. These tests verify the product stays quiet during normal operations.

| Test | What It Proves |
|------|----------------|
| BL-001 | Zero false positives from normal agent activity |
| BL-002 | Controlled anomaly injection triggers detection (not silent) |
| BL-003 | Baseline persistence across product restarts |

---

### E2E Tests (`src/e2e/`)

Real OS-level detection - no mocks, no event injection. These tests spawn real processes, open real connections, and write real files, then verify the product detects them.

<details>
<summary><strong>Live Monitors</strong> - OS-level polling</summary>

| Test | Latency | What the Product Should Detect |
|------|---------|-------------------------------|
| E2E-001 | ~200ms | fs.watch detects .env, .ssh, .bashrc, .npmrc writes |
| E2E-002 | ~1000ms | ps polling detects child processes, suspicious binaries |
| E2E-003 | ~1000ms | Outbound TCP detection (currently skipped pending a reliable cross-platform check) |

</details>

<details>
<summary><strong>Interceptors</strong> - application-level hooks</summary>

| Test | Latency | What the Product Should Intercept |
|------|---------|----------------------------------|
| E2E-004 | <1ms | child_process.spawn/exec intercepted before execution |
| E2E-005 | <1ms | net.Socket.connect intercepted before connection |
| E2E-006 | <1ms | fs.writeFileSync/readFileSync intercepted before I/O |

</details>

---

## MITRE ATLAS Coverage

15 unique techniques across 47 scenario files, mapped to [MITRE ATLAS](https://atlas.mitre.org/) as of the current matrix (which renamed the ML-attack techniques to AI and added the AI-agent technique family in 2025). Technique IDs and names are verified against MITRE's published [`ATLAS.yaml`](https://github.com/mitre-atlas/atlas-data).

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

## Skills Security Benchmark

A dedicated scoring engine for evaluating the security posture of AI agent skills (tool-use capabilities). Covers 9 attack categories targeting skill invocation, parameter validation, output handling, and inter-skill trust boundaries.

### Attack Categories

| Category | Focus |
|----------|-------|
| Parameter injection | Malicious input via skill arguments |
| Output manipulation | Tampered or poisoned skill outputs |
| Privilege escalation | Skills accessing resources beyond their scope |
| Cross-skill trust abuse | One skill exploiting trust granted to another |
| Data exfiltration via skills | Skills used as exfiltration channels |
| Denial of service | Resource exhaustion through skill invocation |
| Skill impersonation | Spoofed skill identity in multi-agent flows |
| Configuration tampering | Modified skill manifests or permissions |
| Supply chain compromise | Malicious skill packages or dependencies |

### Skills Security Controls (SS-01 to SS-10)

| Control | Requirement |
|---------|-------------|
| SS-01 | Skill argument validation and sanitization |
| SS-02 | Output integrity verification |
| SS-03 | Least-privilege scope enforcement |
| SS-04 | Inter-skill authentication |
| SS-05 | Invocation rate limiting |
| SS-06 | Skill manifest integrity (signed, versioned) |
| SS-07 | Runtime permission boundary enforcement |
| SS-08 | Audit logging of all skill invocations |
| SS-09 | Dependency provenance verification |
| SS-10 | Graceful degradation on skill failure |

### Compliance Levels

| Level | Name | Requirements |
|-------|------|-------------|
| L1 | Basic | SS-01 through SS-04 pass |
| L2 | Standard | L1 + SS-05 through SS-08 pass |
| L3 | Advanced | L2 + SS-09 and SS-10 pass, all 9 attack categories covered |

### Tiered Scoring

Products achieving full coverage receive a tier designation:

| Tier | Criteria |
|------|----------|
| Platinum | L3 compliance, all 9 attack categories detected, zero false positives in baseline |
| Gold | L2 compliance, 7+ attack categories detected |
| Silver | L1 compliance, 4+ attack categories detected |

### Benchmark Corpus (v2.0)

4,245 ground-truth labeled samples for scanner evaluation:

| | Count | Description |
|---|---|---|
| Malicious | 270 | 30 per attack category (9 categories) from DVAA, ARIA, HMA payloads, expert review |
| Benign | 3,881 | Real skills from registry, open-source repos, well-governed configs |
| Edge cases | 94 | Security tools, defensive governance, broad-permission configs |

> The published results below were produced on this 4,245-sample categorized set. The corpus file (`corpus/v2.json`) has since grown additional uncategorized malicious samples; the `--categorized-only` flag used by the runner pins evaluation to the 270 categorized malicious samples (30 × 9) so the numbers are reproducible.

### Benchmark Runner

```bash
npx tsx scripts/run-benchmark-v2.ts --categorized-only            # Full corpus, all adapters
npx tsx scripts/run-benchmark-v2.ts --categorized-only --limit=100  # Quick test with 100 samples
npx tsx scripts/run-dvaa-benchmark.ts                              # DVAA ground-truth comparison (70 scenarios)
```

### Latest Results (2026-06-05, partially withdrawn 2026-08-09)

**F1, precision, false-positive rate and flag rate are withdrawn.** The benign class of this corpus
was labeled by the scanner under test: `scripts/export-registry-corpus.mjs` lines 9-11 assign
`verdict=safe AND score >= 80`, as reported by HackMyAgent itself, to the benign class, and 3,811 of
the 3,881 benign samples came from that rule. Anything HackMyAgent would have flagged was excluded
from the benign class by construction, so a near-zero false-positive rate was guaranteed before a
single scan ran. Those figures are not restated here, and no replacement figure is offered.

**Recall is retained**, because it reads only the malicious class, and the published run excludes the
225 registry samples labeled malicious by that same rule (`--categorized-only`). Measured on
hackmyagent 0.23.8 (the build under test on 2026-06-05; these figures have not been re-run against
later releases), full pipeline:

| Scanner | Recall | F1 / Precision / FPR / Flag rate |
|---------|--------|----------------------------------|
| HMA Full Pipeline | **82.6%** (223/270) | withdrawn |
| HMA Static (regex) | 51.1% | withdrawn |
| NanoMind TME v0.5.0 (ablation) | 93.0% | withdrawn |

Read that 82.6% with its denominator: all 270 attack fixtures are ones we wrote (ARIA 89, DVAA 91,
HackMyAgent's own test payloads 90). Excluding HMA's own payloads it is 82.2% (148/180) — they are
not inflating it. Scored over all 495 samples the corpus calls malicious, including the 225
self-labeled ones, it is 47.3% (234/495). This is detection against a fixed fixture set we authored,
not a measure of detection in the wild, and not comparable to another scanner's number on another
corpus. Full breakdown: [BENCHMARK-RESULTS.md](BENCHMARK-RESULTS.md) § 1a.

Verdict = high/critical **attack** findings. Posture findings that fire on benign and malicious alike are
excluded from the verdict (but still surfaced by the scanner): missing prompt/governance defenses, and
**wildcard tool access** (`allowedTools:["*"]`, declared by 2,900+ benign registry MCP servers — a
least-privilege posture issue, not malice).

Per-category detection, as counts (each cell is 30 samples, roughly ±9pp standard error, so the
percentages that used to appear here claimed more precision than the sample size supports):
credential/stego/social/data 29/30, persistence 27/30, prompt_injection 26/30, heartbeat_rce 21/30,
privilege_escalation 19/30 (up from 9/30 after routing + the new `AST-SCOPE-004` check), supply_chain
14/30. DVAA: full-repo 25/86, corpus config-subset 74/91 — the structural pipeline catches
config-encoded attacks well but misses most behavioral / natural-language attacks (which need the
semantic layer).

See [BENCHMARK-RESULTS.md](BENCHMARK-RESULTS.md) for the full per-category breakdown, the posture-vs-attack
verdict methodology, and comparison with Holzbauer et al. (arXiv:2603.16572).

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
