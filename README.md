> **[OpenA2A](https://github.com/opena2a-org/opena2a)**: [CLI](https://github.com/opena2a-org/opena2a) · [HackMyAgent](https://github.com/opena2a-org/hackmyagent) · [Secretless](https://github.com/opena2a-org/secretless-ai) · [AIM](https://github.com/opena2a-org/agent-identity-management) · [Browser Guard](https://github.com/opena2a-org/AI-BrowserGuard) · [DVAA](https://github.com/opena2a-org/damn-vulnerable-ai-agent)

# OASB — Open Agent Security Benchmark

[![Status: stable](https://img.shields.io/badge/status-stable-green)](./STATUS.md)

> **Note:** OASB controls are also available in [HackMyAgent](https://github.com/opena2a-org/hackmyagent) v0.8.0+ via `opena2a benchmark`. This repository is the canonical source for the full 222-test evaluation suite and is actively maintained. ARP (the reference adapter) is now part of HackMyAgent — install via `npm install arp-guard`.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Tests](https://img.shields.io/badge/tests-241%20passing-brightgreen)](https://github.com/opena2a-org/oasb)
[![MITRE ATLAS](https://img.shields.io/badge/MITRE%20ATLAS-10%20techniques-teal)](https://atlas.mitre.org/)

**MITRE ATT&CK Evaluations, but for AI agent security products.**

222 standardized attack scenarios that evaluate whether a runtime security product can detect and respond to threats against AI agents. Each test is mapped to MITRE ATLAS and OWASP Agentic Top 10. Plug in your product, run the suite, get a detection coverage scorecard.

[OASB Website](https://oasb.ai) | [MITRE ATLAS Coverage](#mitre-atlas-coverage)

---

## Updates

| Date | Change |
|------|--------|
| 2026-04-02 | Scanner Benchmark v2: 4,245-sample corpus, 3 HMA adapter tiers (static/TME/pipeline), DVAA ground-truth comparison. TME v0.5.0 achieves 89.2% F1. Comparison with Holzbauer et al. (arXiv:2603.16572). |
| 2026-03-23 | `arp-guard` v0.3.0 — ARP now re-exports from HackMyAgent. Updated OASB to v0.3.0. All 222 tests pass. Updated Quick Start (no standalone ARP clone). |
| 2026-02-19 | Added 40 AI-layer test scenarios (AT-AI-001 through AT-AI-005) for prompt, MCP, and A2A scanning via ARP v0.2.0. Total tests: 222. |
| 2026-02-18 | Added integration tests for DVAA v0.4.0 MCP JSON-RPC and A2A endpoints. |
| 2026-02-09 | Initial release -- 182 attack scenarios across 10 MITRE ATLAS techniques. |

---

## What OASB Is (and Isn't)

OASB evaluates **security products**, not agents. It answers: "does your runtime protection actually catch these attacks?"

| | OASB | [HackMyAgent](https://github.com/opena2a-org/hackmyagent) |
|---|---|---|
| **Purpose** | Evaluate security *products* | Pentest AI *agents* |
| **Tests** | "Does your EDR catch this exfiltration?" | "Is your agent leaking credentials?" |
| **Audience** | Security product vendors, evaluators | Agent developers, red teams |
| **Analogous to** | [MITRE ATT&CK Evaluations](https://attackevals.mitre-engenuity.org/) | [OWASP ZAP](https://www.zaproxy.org/) / Burp Suite |
| **Method** | Controlled lab — inject attacks, measure detection | Active scanning + adversarial payloads against live targets |
| **Output** | Detection coverage scorecard | Vulnerability report + auto-fix |

Use both together: **HackMyAgent** finds vulnerabilities in your agent, **OASB** proves your security product catches real attacks.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Usage via OpenA2A CLI](#usage-via-opena2a-cli)
- [What Gets Tested](#what-gets-tested)
- [Test Categories](#test-categories)
  - [Atomic Tests](#atomic-tests-srcatomic) — 65 discrete detection tests (OS-level + AI-layer)
  - [Integration Tests](#integration-tests-srcintegration) — 8 multi-step attack chains
  - [Baseline Tests](#baseline-tests-srcbaseline) — 3 false positive validations
  - [E2E Tests](#e2e-tests-srce2e) — 6 real OS-level detection tests
- [MITRE ATLAS Coverage](#mitre-atlas-coverage)
- [Test Harness](#test-harness)
- [Skills Security Benchmark](#skills-security-benchmark)
- [Known Detection Gaps](#known-detection-gaps)
- [License](#license)

---

## Quick Start

Ships with [ARP](https://www.npmjs.com/package/arp-guard) (`arp-guard`) as the reference adapter. To evaluate your own security product, implement the `SecurityProductAdapter` interface in `src/harness/adapter.ts` and run the same 222 tests.

```bash
git clone https://github.com/opena2a-org/oasb.git
cd oasb && npm install
```

> `arp-guard` is an optional peer dependency. It is installed automatically for running the reference ARP evaluation. If you are implementing your own adapter, you do not need it.

### Run the Evaluation

```bash
npm test                    # Full evaluation (222 tests)
npm run test:atomic         # 65 atomic tests (no external deps)
npm run test:integration    # 8 integration scenarios
npm run test:baseline       # 3 baseline tests
npx vitest run src/e2e/     # 6 E2E tests (real OS detection)
```

![OASB Demo](docs/oasb-demo.gif)

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

| Category | Tests | What It Evaluates |
|----------|-------|-------------------|
| Process detection | 25 | Child process spawns, suspicious binaries, privilege escalation, CPU anomalies |
| Network detection | 20 | Outbound connections, suspicious hosts, exfiltration, subdomain bypass |
| Filesystem detection | 28 | Sensitive path access, credential files, dotfile persistence, mass file DoS |
| Intelligence layers | 21 | Rule matching, anomaly scoring, LLM escalation, budget exhaustion |
| Enforcement actions | 18 | Logging, alerting, process pause (SIGSTOP), kill (SIGTERM/SIGKILL), resume |
| Multi-step attacks | 33 | Data exfiltration chains, MCP tool abuse, prompt injection, A2A trust exploitation |
| Baseline behavior | 13 | False positive rates, anomaly injection, baseline persistence |
| Real OS detection | 14 | Live filesystem watches, process polling, network monitoring |
| Application-level hooks | 14 | Pre-execution interception of spawn, connect, read/write |
| AI-layer scanning | 40 | Prompt injection/output, MCP tool call validation, A2A message scanning, pattern coverage |
| **Total** | **222** | **10 MITRE ATLAS techniques** |

---

## Test Categories

### Atomic Tests (`src/atomic/`)

Discrete tests that exercise individual detection capabilities. Each test injects a single attack event and verifies the product detects it with the correct classification and severity.

<details>
<summary><strong>AI-Layer Scanning</strong> — 5 files (40 tests)</summary>

| Test | What the Product Should Detect |
|------|-------------------------------|
| AT-AI-001 | Prompt input scanning — PI, JB, DE, CM pattern detection (11 tests) |
| AT-AI-002 | Prompt output scanning — OL pattern detection, data leak prevention (6 tests) |
| AT-AI-003 | MCP tool call scanning — path traversal, command injection, SSRF, allowlist (11 tests) |
| AT-AI-004 | A2A message scanning — identity spoofing, delegation abuse, trust validation (7 tests) |
| AT-AI-005 | Pattern coverage — all 19 patterns detect known payloads, no false positives (5 tests) |

</details>

<details>
<summary><strong>Process Detection</strong> — 5 files</summary>

| Test | ATLAS | What the Product Should Detect |
|------|-------|-------------------------------|
| AT-PROC-001 | AML.T0046 | Child process spawn |
| AT-PROC-002 | AML.T0046 | Suspicious binary execution (curl, wget, nc) |
| AT-PROC-003 | AML.T0029 | High CPU anomaly |
| AT-PROC-004 | AML.T0046 | Privilege escalation (root user) |
| AT-PROC-005 | AML.TA0006 | Process termination |

</details>

<details>
<summary><strong>Network Detection</strong> — 5 files</summary>

| Test | ATLAS | What the Product Should Detect |
|------|-------|-------------------------------|
| AT-NET-001 | AML.T0024 | New outbound connection |
| AT-NET-002 | AML.T0057 | Connection to suspicious host (webhook.site, ngrok) |
| AT-NET-003 | AML.T0029 | Connection burst |
| AT-NET-004 | AML.T0024 | Subdomain bypass of allowlist |
| AT-NET-005 | AML.T0057 | Exfiltration destination |

</details>

<details>
<summary><strong>Filesystem Detection</strong> — 5 files</summary>

| Test | ATLAS | What the Product Should Detect |
|------|-------|-------------------------------|
| AT-FS-001 | AML.T0057 | Sensitive path access (.ssh, .aws, .gnupg) |
| AT-FS-002 | AML.T0046 | Access outside allowed paths |
| AT-FS-003 | AML.T0057 | Credential file access (.npmrc, .pypirc, .netrc) |
| AT-FS-004 | AML.T0029 | Mass file creation (DoS) |
| AT-FS-005 | AML.T0018 | Shell config modification (.bashrc, .zshrc) |

</details>

<details>
<summary><strong>Intelligence</strong> — 5 files</summary>

| Test | ATLAS | What the Product Should Do |
|------|-------|---------------------------|
| AT-INT-001 | AML.T0054 | Match rules and trigger enforcement |
| AT-INT-002 | AML.T0015 | Score statistical anomalies (z-score) |
| AT-INT-003 | AML.T0054 | Escalate to LLM-assisted assessment |
| AT-INT-004 | AML.T0029 | Handle budget exhaustion gracefully |
| AT-INT-005 | AML.T0015 | Learn and reset behavioral baselines |

</details>

<details>
<summary><strong>Enforcement</strong> — 5 files</summary>

| Test | ATLAS | What the Product Should Do |
|------|-------|---------------------------|
| AT-ENF-001 | AML.TA0006 | Execute log action |
| AT-ENF-002 | AML.TA0006 | Fire alert callback |
| AT-ENF-003 | AML.TA0006 | Pause process (SIGSTOP) |
| AT-ENF-004 | AML.TA0006 | Kill process (SIGTERM/SIGKILL) |
| AT-ENF-005 | AML.TA0006 | Resume paused process (SIGCONT) |

</details>

---

### Integration Tests (`src/integration/`)

Multi-step attack chains that combine multiple techniques. Tests whether the product can detect coordinated attacks, not just isolated events. Optionally validates against live [DVAA](https://github.com/opena2a-org/damn-vulnerable-ai-agent) agents.

| Test | ATLAS | Attack Chain |
|------|-------|-------------|
| INT-001 | AML.T0057 | Data exfiltration: internal contact lookup → credential harvest → webhook.site POST |
| INT-002 | AML.T0056 | MCP tool abuse: path traversal + command injection via tool arguments |
| INT-003 | AML.T0051 | Prompt injection: establish baseline → inject malicious prompt → measure detection |
| INT-004 | AML.T0024 | A2A trust exploitation: spoofed agent identity → unauthorized data access |
| INT-005 | AML.T0015 | Evasion: 5 minutes normal traffic → sudden attack burst → verify anomaly detection |
| INT-006 | AML.T0046 | Multi-monitor correlation: single attack triggers process + network + filesystem events |
| INT-007 | AML.T0029 | Budget exhaustion: noise flood drains LLM budget → real attack goes unanalyzed |
| INT-008 | AML.TA0006 | Kill switch: critical threat → product kills agent → verify death → recovery |

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

Real OS-level detection — no mocks, no event injection. These tests spawn real processes, open real connections, and write real files, then verify the product detects them.

<details>
<summary><strong>Live Monitors</strong> — OS-level polling</summary>

| Test | Latency | What the Product Should Detect |
|------|---------|-------------------------------|
| E2E-001 | ~200ms | fs.watch detects .env, .ssh, .bashrc, .npmrc writes |
| E2E-002 | ~1000ms | ps polling detects child processes, suspicious binaries |
| E2E-003 | ~1000ms | lsof detects outbound TCP (skips if unavailable) |

</details>

<details>
<summary><strong>Interceptors</strong> — application-level hooks</summary>

| Test | Latency | What the Product Should Intercept |
|------|---------|----------------------------------|
| E2E-004 | <1ms | child_process.spawn/exec intercepted before execution |
| E2E-005 | <1ms | net.Socket.connect intercepted before connection |
| E2E-006 | <1ms | fs.writeFileSync/readFileSync intercepted before I/O |

</details>

---

## MITRE ATLAS Coverage

10 unique techniques across 47 test files:

| Technique | ID | Tests |
|-----------|----|-------|
| Unsafe ML Inference | AML.T0046 | AT-PROC-001/002/004, AT-FS-002, INT-006, E2E-002/004 |
| Data Leakage | AML.T0057 | AT-NET-002/005, AT-FS-001/003, INT-001, E2E-001/006 |
| Exfiltration | AML.T0024 | AT-NET-001/004, INT-004, E2E-003/005 |
| Persistence | AML.T0018 | AT-FS-005, E2E-001/006 |
| Denial of Service | AML.T0029 | AT-PROC-003, AT-NET-003, AT-INT-004, INT-007 |
| Evasion | AML.T0015 | AT-INT-002/005, INT-005, BL-002/003 |
| Jailbreak | AML.T0054 | AT-INT-001/003 |
| MCP Compromise | AML.T0056 | INT-002 |
| Prompt Injection | AML.T0051 | INT-003 |
| Defense Response | AML.TA0006 | AT-ENF-001-005, AT-PROC-005, INT-008 |

---

## Test Harness

The harness wraps a security product via an adapter interface and provides event collection, injection, and metrics.

| File | Purpose |
|------|---------|
| `adapter.ts` | **Product-agnostic adapter interface** — implement `SecurityProductAdapter` for your product |
| `arp-wrapper.ts` | Reference adapter — wraps ARP (`arp-guard`) with event collection, injection helpers |
| `event-collector.ts` | Captures events with async `waitForEvent(predicate, timeout)` |
| `mock-llm-adapter.ts` | Deterministic LLM for intelligence layer testing (pattern-based responses) |
| `dvaa-client.ts` | HTTP client for DVAA vulnerable agent endpoints |
| `dvaa-manager.ts` | DVAA process lifecycle (spawn, health check, teardown) |
| `metrics.ts` | Detection rate, false positive rate, P95 latency computation |

To evaluate your own product: implement `SecurityProductAdapter` from `src/harness/adapter.ts`, swap it into the test harness, and run the full suite. The interface defines event types, scanner interfaces, and enforcement contracts — no dependency on any specific product.

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

### Benchmark Runner

```bash
npx tsx scripts/run-benchmark-v2.ts --categorized-only            # Full corpus, all adapters
npx tsx scripts/run-benchmark-v2.ts --categorized-only --limit=100  # Quick test with 100 samples
npx tsx scripts/run-dvaa-benchmark.ts                              # DVAA ground-truth comparison (70 scenarios)
```

### Latest Results (2026-04-02)

Comparison of HMA scanner tiers on 4,245 labeled samples:

| Scanner | F1 | Precision | Recall | FPR | Flag Rate |
|---------|-----|-----------|--------|-----|-----------|
| HMA Static (regex only) | 67.5% | 99.3% | 51.1% | 0.03% | 3.6% |
| NanoMind TME v0.5.0 (model only) | 89.2% | 88.4% | 90.0% | 0.82% | 6.9% |
| HMA Full Pipeline (AST + NanoMind) | 81.3% | 68.5% | 100.0% | 3.20% | 10.3% |

DVAA controlled comparison: 61/70 scenarios detected (87.1%).

See [BENCHMARK-RESULTS.md](BENCHMARK-RESULTS.md) for full per-category breakdown and comparison with Holzbauer et al. (arXiv:2603.16572).

---

## Known Detection Gaps

OASB documents what the reference product (ARP) does and doesn't catch. Other products may have different gap profiles — that's the point of running the benchmark.

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
| [**HackMyAgent**](https://github.com/opena2a-org/hackmyagent) | Security scanner -- 238 checks, attack mode, auto-fix | `npx hackmyagent secure` |
| [**ARP**](https://www.npmjs.com/package/arp-guard) | Agent Runtime Protection -- process, network, filesystem, AI-layer monitoring | `npm install arp-guard` |
| [**Secretless AI**](https://github.com/opena2a-org/secretless-ai) | Keep credentials out of AI context windows | `npx secretless-ai init` |
| [**DVAA**](https://github.com/opena2a-org/damn-vulnerable-ai-agent) | Damn Vulnerable AI Agent -- security training and red-teaming | `docker pull opena2a/dvaa` |
