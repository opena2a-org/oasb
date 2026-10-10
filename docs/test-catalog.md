# OASB test catalog

Per-test detail for every scenario category. For the category totals, the
MITRE ATLAS mapping and how to run each group, see the
[README](../README.md#what-gets-tested).

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

## Integration Tests (`src/integration/`)

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

## Baseline Tests (`src/baseline/`)

Every security product must avoid false positives. These tests verify the product stays quiet during normal operations.

| Test | What It Proves |
|------|----------------|
| BL-001 | Zero false positives from normal agent activity |
| BL-002 | Controlled anomaly injection triggers detection (not silent) |
| BL-003 | Baseline persistence across product restarts |

## E2E Tests (`src/e2e/`)

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
