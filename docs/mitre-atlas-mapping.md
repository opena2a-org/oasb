# MITRE ATLAS Test Mapping

OASB maps every attack scenario to a [MITRE ATLAS](https://atlas.mitre.org/) technique. Technique IDs and names are verified against MITRE's published [`ATLAS.yaml`](https://github.com/mitre-atlas/atlas-data) for the current matrix, which renamed the ML-attack techniques (ML → AI) and added the AI-agent technique family in 2025.

Defensive-response and detection-capability tests are tracked separately (see the end of this document): ATLAS is an adversary framework, so a test that validates the product's *reaction* or its *own detection machinery* is not mapped to an attack technique.

## Technique Coverage

### AML.T0050 — Command and Scripting Interpreter
Adversary uses a command/script interpreter to execute commands via the agent's host.

| Test ID | Description |
|---------|-------------|
| AT-PROC-001 | Child process spawn detection |
| AT-PROC-002 | Suspicious binary execution (curl, wget, nc) |
| E2E-002 | Live process polling detects child processes / suspicious binaries |
| E2E-004 | `child_process.spawn`/`exec` intercepted before execution |

### AML.T0105 — Escape to Host
Privilege escalation / breaking out of the agent's execution context to the host.

| Test ID | Description |
|---------|-------------|
| AT-PROC-004 | Privilege escalation to root |

### AML.T0034.002 — Agentic Resource Consumption
Adversary drives the agent to consume excessive compute, network, or storage resources.

| Test ID | Description |
|---------|-------------|
| AT-PROC-003 | High CPU usage detection (>90%) |
| AT-NET-003 | Connection burst detection (rapid new connections) |
| AT-FS-004 | Mass file creation detection |
| AT-INT-004 | Budget handling under resource-exhaustion load |

### AML.T0025 — Exfiltration via Cyber Means
Data exfiltration over conventional network channels.

| Test ID | Description |
|---------|-------------|
| AT-NET-001 | New outbound connection detection |
| AT-NET-002 | Connection to known-bad host (webhook.site, ngrok) |
| AT-NET-004 | Allowed-host bypass via subdomain matching |
| AT-NET-005 | Exfiltration destination detection (transfer.sh, requestbin) |
| E2E-003 | `lsof` detects outbound TCP |
| E2E-005 | `net.Socket.connect` intercepted before connection |

### AML.T0055 — Unsecured Credentials
Harvesting credentials from unsecured local files.

| Test ID | Description |
|---------|-------------|
| AT-FS-001 | Sensitive path access (.ssh, .aws, .gnupg) |
| AT-FS-003 | Credential file access (.npmrc, .pypirc, .netrc) |
| E2E-001 | `fs.watch` detects .env / .ssh / .npmrc writes |
| E2E-006 | `fs.readFileSync` intercepted before credential I/O |

### AML.T0037 — Data from Local System
Collection of data from the local filesystem outside the allowed scope.

| Test ID | Description |
|---------|-------------|
| AT-FS-002 | File access outside allowed paths |

### AML.T0081 — Modify AI Agent Configuration
Persistence by modifying configuration the agent/host loads at startup.

| Test ID | Description |
|---------|-------------|
| AT-FS-005 | Shell config dotfile write (.bashrc, .zshrc, .profile) detection |
| E2E-001 | `fs.watch` detects .bashrc writes |
| E2E-006 | `fs.writeFileSync` intercepted before config I/O |

### AML.T0051 — LLM Prompt Injection
Manipulation of LLM behavior through crafted inputs.

| Test ID | Description |
|---------|-------------|
| AT-AI-001 | Prompt-input scanning — prompt-injection pattern detection |
| AT-AI-005 | Pattern coverage — prompt-injection patterns detect known payloads |
| INT-003 | Prompt injection with anomaly-detection response |

### AML.T0054 — LLM Jailbreak
Bypassing LLM safety constraints and guardrails.

| Test ID | Description |
|---------|-------------|
| AT-AI-001 | Prompt-input scanning — jailbreak pattern detection |
| AT-AI-005 | Pattern coverage — jailbreak patterns detect known payloads |

### AML.T0057 — LLM Data Leakage
Unauthorized disclosure of sensitive data in LLM output.

| Test ID | Description |
|---------|-------------|
| AT-AI-002 | Prompt-output scanning — output-leak pattern detection |
| AT-AI-005 | Pattern coverage — output-leak patterns detect known payloads |

### AML.T0053 — AI Agent Tool Invocation
Abuse of the agent's tool-invocation surface (e.g. MCP tool calls).

| Test ID | Description |
|---------|-------------|
| AT-AI-003 | MCP tool-call scanning — path traversal, command injection, SSRF, allowlist |
| AT-AI-005 | Pattern coverage — MCP-exploitation patterns detect known payloads |
| INT-002 | MCP tool abuse — path traversal + command injection |

### AML.T0073 — Impersonation
Spoofing an identity to gain trust between agents.

| Test ID | Description |
|---------|-------------|
| AT-AI-004 | A2A message scanning — identity spoofing, delegation abuse, trust validation |
| AT-AI-005 | Pattern coverage — A2A-attack patterns detect known payloads |
| INT-004 | A2A trust exploitation — spoofed identity → unauthorized data access |

### AML.T0086 — Exfiltration via AI Agent Tool Invocation
Using the agent's own tools as an exfiltration channel.

| Test ID | Description |
|---------|-------------|
| INT-001 | End-to-end data exfiltration chain (contact lookup → credential harvest → webhook POST) |

### AML.T0046 — Spamming AI System with Chaff Data
Flooding the system with noise to overwhelm or evade detection.

| Test ID | Description |
|---------|-------------|
| INT-007 | Noise flood drains LLM budget so a real attack goes unanalyzed |

### AML.T0015 — Evade AI Model
Adapting behavior over time to evade detection.

| Test ID | Description |
|---------|-------------|
| INT-005 | Baseline learning then attack burst — slow-poisoning evasion |
| AT-INT-002 | L1 statistical anomaly scoring surfaces evasive deviations |

## Coverage Summary

| ATLAS Technique | ID | Tests |
|-----------------|----|-------|
| Command and Scripting Interpreter | AML.T0050 | 4 |
| Escape to Host | AML.T0105 | 1 |
| Agentic Resource Consumption | AML.T0034.002 | 4 |
| Exfiltration via Cyber Means | AML.T0025 | 6 |
| Unsecured Credentials | AML.T0055 | 4 |
| Data from Local System | AML.T0037 | 1 |
| Modify AI Agent Configuration | AML.T0081 | 3 |
| LLM Prompt Injection | AML.T0051 | 3 |
| LLM Jailbreak | AML.T0054 | 2 |
| LLM Data Leakage | AML.T0057 | 2 |
| AI Agent Tool Invocation | AML.T0053 | 3 |
| Impersonation | AML.T0073 | 3 |
| Exfiltration via AI Agent Tool Invocation | AML.T0086 | 1 |
| Spamming AI System with Chaff Data | AML.T0046 | 1 |
| Evade AI Model | AML.T0015 | 2 |
| **Total** | | **15 techniques** |

## Defensive-response and capability tests (not adversary techniques)

These validate the product's reaction or its own detection machinery. They are intentionally not mapped to ATLAS attack techniques.

| Test ID | Kind | Validates |
|---------|------|-----------|
| AT-PROC-005 | Response | Process termination tracking (counters Impact, AML.TA0011) |
| AT-ENF-001 | Response | Log enforcement action |
| AT-ENF-002 | Response | Alert callback execution |
| AT-ENF-003 | Response | Process pause via SIGSTOP |
| AT-ENF-004 | Response | Process kill via SIGTERM |
| AT-ENF-005 | Response | Process resume via SIGCONT |
| INT-008 | Response | Kill switch and recovery |
| AT-INT-001 | Capability | L0 rule-based threat classification |
| AT-INT-003 | Capability | L2 LLM escalation for ambiguous events |
| AT-INT-005 | Capability | Behavioral baseline learning and reset |
| INT-006 | Capability | Multi-monitor correlation over a multi-surface attack chain |
| BL-001 | Capability | Zero false positives from normal agent activity |
| BL-002 | Capability | Controlled anomaly injection triggers detection |
| BL-003 | Capability | Baseline persistence across product restarts |
