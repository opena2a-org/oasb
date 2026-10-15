# OASB test catalog

The category totals, how to run each group, and per-test detail for every
scenario category. The MITRE ATLAS mapping is in
[mitre-atlas-mapping.md](mitre-atlas-mapping.md); the [README](../README.md)
has the first run.

## What Gets Tested

223 standardized attack scenarios that evaluate whether a runtime security product can detect and respond to threats against AI agents. 166 of them, in 33 files, map to MITRE ATLAS (15 techniques, including the AI-agent technique family); the other 57 test the product's defensive response and its own detection machinery, which no adversary technique describes, and are [tracked separately](mitre-atlas-mapping.md#mitre-atlas-coverage).

Each test simulates a specific attack technique and checks whether the security product under evaluation detects it, classifies it correctly, and responds appropriately.

Counts below are the live test totals (`npm test`); each maps to a source directory so they are reproducible. Per-test detail for every category is in the [test catalog](#atomic-tests-srcatomic).

| Category | Tests | Source | What It Evaluates |
|----------|-------|--------|-------------------|
| Process detection | 19 | `src/atomic/process` | Child process spawns, suspicious binaries, privilege escalation, CPU anomalies |
| Network detection | 18 | `src/atomic/network` | Outbound connections, suspicious hosts, exfiltration, subdomain bypass |
| Filesystem detection | 28 | `src/atomic/filesystem` | Sensitive path access, credential files, dotfile persistence, mass file DoS |
| Intelligence layers | 21 | `src/atomic/intelligence` | Rule matching, anomaly scoring, LLM escalation, budget exhaustion |
| Enforcement actions | 18 | `src/atomic/enforcement` | Logging, alerting, process pause (SIGSTOP), kill (SIGTERM/SIGKILL), resume |
| AI-layer scanning | 40 | `src/atomic/ai-layer` | Prompt injection/output, MCP tool call validation, A2A message scanning, pattern coverage |
| Multi-step attacks | 44 | `src/integration` | Data exfiltration chains, MCP tool abuse, prompt injection, A2A trust exploitation |
| Baseline behavior | 12 | `src/baseline` | False positive rates, anomaly injection, baseline persistence |
| Real OS detection | 9 | `src/e2e` (live monitors) | Live filesystem watches, process polling, network monitoring |
| Application-level hooks | 14 | `src/e2e` (interceptors) | Pre-execution interception of spawn, connect, read/write |
| **Attack scenarios** | **223** | atomic + integration + baseline + E2E | **15 MITRE ATLAS techniques** |
| Scoring-engine unit tests | 34 | `src/benchmark` | Pooled metrics, tier/compliance assignment, Cohen's Kappa, leaderboard, NanoMind adapter names, analyzer calls of the deprecated AST adapter, the scanner root the AST, pipeline and model-only adapters scan on and the version an adapter reports after a root change |
| Pinned benchmark harness tests | 118 | `src/benchmark/pinned` | Pin file checks, refusal of unpinned or changed inputs, results never overwritten |
| Adapter tests | 49 | `src/harness` | `OASB_ADAPTER` module paths: relative paths resolve from the working directory; the rebuff adapter runs the rebuff package's heuristic, and a scan fails with the reason when the package cannot be loaded; `waitForFilesystemWatch`, which E2E-001 calls before each case, writes probe files until the watcher reports one, within the time the hook has left; the harness's own control watcher and the rules that read an E2E-001 case against it: a product miss, read when the 5 s window ends (a failure when the host delivered the event, inconclusive when it delivered none), and a product that reported no probe file (the case makes its write when the watcher saw one, and is inconclusive when it saw none); the inconclusive skip of a case where Node.js has no recursive `fs.watch`, the watcher's own error in an inconclusive message, the mark of a case that got the product's own event, the detection predicates, which pass over an event without data, and the end of a case, which closes the watcher and removes the directory also when `stop()` rejects, and passes that rejection on |
| **`npm test` total** | **424** | (423 pass, 1 skipped on every platform) | |

### Counts

> **Counts.** `npm test` runs **424 tests** (423 passing, 1 skipped on every platform: the live network-detection E2E is disabled pending a reliable cross-platform check - see `src/e2e/E2E-003`; E2E-001 cases are skipped only when the harness's own watcher recorded no file event: none for the case's file within its 5 s window, or none for any probe file during the readiness wait of a product that reported none; each such skip prints the wait, what that watcher saw, the error it reported if it reported one, and the measured load where the platform measures one; where Node.js has no recursive `fs.watch`, as on Linux before Node.js 19.1.0, that watcher cannot be opened and every E2E-001 case is skipped as inconclusive with a message that says so, which the release smoke reports as the file not measured): **223 attack scenarios** (atomic, integration, baseline, E2E) plus **34 scoring-engine unit tests**, **118 pinned benchmark harness tests** and the adapter tests in `src/harness`. "223" is the scenario count; "423 passing" is the full `npm test` total. Both are reproducible from a clean checkout - see [What Gets Tested](#what-gets-tested). Before the suite, `npm test` runs the tests in `scripts/` (`npm run test:scripts`, each file listed in [the release smoke guide](testing/release-smoke.md#the-tests-in-scripts)), which these counts do not include.

### Run the suite

```bash
npm test                    # Full suite: 424 tests (423 pass, 1 skip)
```

Run one group at a time:

```bash
npm run test:atomic         # 144 atomic detection tests (no external deps)
npm run test:integration    # 44 tests across 8 integration scenarios
npm run test:baseline       # 12 false-positive / baseline tests
npm run test:e2e            # 23 E2E tests (real OS detection; E2E-003 currently skipped)
```

## Atomic Tests (`src/atomic/`)

Discrete tests that exercise individual detection capabilities. Each test injects a single attack event and verifies the product detects it with the correct classification and severity.

<details>
<summary><strong>AI-Layer Scanning</strong> - 5 files (40 tests)</summary>

| Test | What the Product Should Detect |
|------|-------------------------------|
| AT-AI-001 | Prompt input scanning - PI, JB, DE, CM pattern detection (11 tests) |
| AT-AI-002 | Prompt output scanning - OL pattern detection, data leak prevention (6 tests) |
| AT-AI-003 | MCP tool call scanning - path traversal, command injection, SSRF, allowlist (11 tests) |
| AT-AI-004 | A2A message scanning - identity spoofing, delegation abuse, trust validation (7 tests) |
| AT-AI-005 | Pattern coverage - every pattern the scanner exposes has a known payload that triggers it, no false positives (5 tests) |

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

## Integration Tests (`src/integration/`)

Multi-step attack chains that combine multiple techniques. Tests whether the product can detect coordinated attacks, not just isolated events. Optionally validates against live [DVAA](https://github.com/opena2a-org/damn-vulnerable-ai-agent) agents.

| Test | ATLAS | Attack Chain |
|------|-------|-------------|
| INT-001 | AML.T0086 | Data exfiltration: internal contact lookup → credential harvest → webhook.site POST |
| INT-002 | AML.T0053 | MCP tool abuse: path traversal + command injection via tool arguments |
| INT-003 | AML.T0051 | Prompt injection: establish baseline → inject malicious prompt → measure detection |
| INT-004 | AML.T0073 | A2A trust exploitation: spoofed agent identity → unauthorized data access |
| INT-005 | AML.T0015 | Evasion: 60 minutes of timed normal traffic → burst of 20 normal-looking events in one minute → anomaly scorer flags the burst (z-score above 2); rule alert on a burst of pre-labelled violations |
| INT-006 | capability | Multi-monitor correlation: single attack triggers process + network + filesystem events |
| INT-007 | AML.T0046 | Budget exhaustion: noise flood (chaff) drains LLM budget → real attack goes unanalyzed |
| INT-008 | response | Kill switch: critical threat → product kills agent → verify death → recovery |

## Baseline Tests (`src/baseline/`)

Every security product must avoid false positives. These tests verify the product stays quiet during normal operations.

| Test | What It Proves |
|------|----------------|
| BL-001 | Zero false positives from normal agent activity |
| BL-002 | Controlled anomaly injection triggers detection (not silent) |
| BL-003 | Baseline persistence across product restarts: baselines saved before a restart load into the restarted scorer unchanged (N/A for a product without `baseline-persistence`) |

## E2E Tests (`src/e2e/`)

Real OS-level detection - no mocks, no event injection. These tests spawn real processes, open real connections, and write real files, then verify the product detects them.

<details>
<summary><strong>Live Monitors</strong> - OS-level polling</summary>

| Test | Latency | What the Product Should Detect |
|------|---------|-------------------------------|
| E2E-001 | 5000ms window | fs.watch detects .env, .ssh, .bashrc, .npmrc writes; a case is skipped as inconclusive when the host delivered no file event to the harness's own watcher: none for the path within the window, or none for any probe file before the write when the product reported none; where Node.js has no recursive `fs.watch` (Linux before 19.1.0), every case is skipped as inconclusive with a message that says so; a filesystem event that has no `data` is not read as the report of a write, and the case goes on waiting |
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
