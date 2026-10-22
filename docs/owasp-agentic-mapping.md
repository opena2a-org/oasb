# OWASP Test Mapping

OASB maps each attack scenario to two OWASP lists:

- the [OWASP Top 10 for Agentic Applications (2026)](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/), IDs ASI01 to ASI10, published 2025-12-09;
- the [OWASP Top 10 for LLM Applications (2025)](https://genai.owasp.org/llm-top-10/), IDs LLM01 to LLM10.

IDs and category names follow the published lists. Each scenario file under `src/atomic`, `src/integration`, `src/baseline` and `src/e2e` names its Agentic risk in its header, for example `// OWASP Agentic: ASI05 (Unexpected Code Execution (RCE))`, next to its LLM Top 10 ID (`// OWASP: LLM06 (Excessive Agency)`) where it has one. `npm run test:scripts` runs `scripts/check-owasp-mapping.mjs`, which fails when a scenario file names no published Agentic ID, or when the Agentic tables, the Agentic coverage summary or the gaps table on this page disagree with the headers.

## OWASP Top 10 for Agentic Applications (2026)

A scenario maps to the Agentic risk whose attack it injects or whose outcome it detects. Tests of the product's own response, of its baselines and of its anomaly scoring map to ASI10 Rogue Agents, whose mitigations include behavioral monitoring and containment such as kill switches. A file that covers more than one risk is listed under each.

### ASI01 - Agent Goal Hijack
Untrusted input redirects the agent toward an attacker's objective.

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| AT-AI-001 | Prompt-input scanning detects injection, jailbreak and context-manipulation payloads | AI-layer |
| AT-AI-002 | Prompt-output scanning detects secrets, PII and the system prompt disclosed in a response | AI-layer |
| AT-AI-005 | Every AI-layer pattern is triggered by at least one known payload | AI-layer |
| INT-003 | Normal baseline, then prompt injection; the ARP proxy reports a leak in a raw HTTP response | Integration |

AT-AI-002 is the response-side check: it detects what a hijacked agent discloses.

### ASI02 - Tool Misuse & Exploitation
The agent uses a legitimate tool in an unsafe or unauthorized way.

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| AT-AI-003 | MCP tool-call scanning detects path traversal, command injection and SSRF in parameters | AI-layer |
| AT-AI-005 | Every AI-layer pattern is triggered by at least one known payload | AI-layer |
| AT-FS-002 | File access outside allowed paths | Filesystem |
| AT-NET-001 | New outbound connection to unknown host | Network |
| AT-NET-002 | Connection to suspicious host (webhook.site, ngrok) | Network |
| AT-NET-004 | Allowed host bypass via subdomain | Network |
| AT-NET-005 | Exfiltration to known destinations | Network |
| E2E-003 | Live network monitor detects real TCP connections (skipped on every platform) | Network |
| E2E-005 | Network interceptor catches a connection before it opens | Network |
| INT-001 | Internal contact for credentials, then exfiltration to an external host | Integration |
| INT-002 | MCP tool abuse (path traversal + command injection) | Integration |

The network tests map here as the agent's network access used to send data out.

### ASI03 - Identity & Privilege Abuse
The agent's credentials or privileges are reused or escalated beyond what it was given.

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| AT-FS-001 | Sensitive path access (.ssh, .aws, .gnupg) | Filesystem |
| AT-FS-003 | Credential file access (.npmrc, .pypirc, .netrc) | Filesystem |
| AT-PROC-004 | Child process running as root while the agent is not | Process |
| E2E-001 | Live filesystem monitor detects .env, .ssh and .npmrc access on disk | Filesystem |
| E2E-006 | Filesystem interceptor catches a .env write and a .ssh read before the I/O | Filesystem |

### ASI05 - Unexpected Code Execution (RCE)
Code the agent runs or writes executes outside what it was meant to run.

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| AT-PROC-001 | Unauthorized child process spawning | Process |
| AT-PROC-002 | Suspicious binary execution (curl, wget, nc) | Process |
| AT-FS-005 | Shell config modification (.bashrc, .zshrc) | Filesystem |
| E2E-001 | Live filesystem monitor detects a .bashrc write | Filesystem |
| E2E-002 | Live process monitor detects real child processes | Process |
| E2E-004 | Process interceptor catches spawn and exec before execution | Process |
| E2E-006 | Filesystem interceptor catches a .bashrc write before the I/O | Filesystem |

Code written to a shell startup file runs on the host in every new shell, so the dotfile tests map here.

### ASI07 - Insecure Inter-Agent Communication
Messages between agents are accepted without checking who sent them.

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| AT-AI-004 | A2A message scanning detects identity spoofing, delegation abuse and embedded injection | AI-layer |
| AT-AI-005 | Every AI-layer pattern is triggered by at least one known payload | AI-layer |
| INT-004 | A2A trust exploitation via identity spoofing | Integration |

### ASI08 - Cascading Failures
A fault in one component spreads to the components that depend on it.

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| AT-INT-004 | The budget controller denies L2 analysis once the budget or the hourly call cap is spent | Intelligence |
| INT-007 | A noise flood exhausts the L2 budget, then L0 rules still catch the real attack | Integration |

These tests check that exhausting one detection layer does not take the others down with it.

### ASI10 - Rogue Agents
The agent acts outside its policy or its normal pattern.

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| AT-ENF-001 | Log enforcement action | Enforcement |
| AT-ENF-002 | Alert callback execution | Enforcement |
| AT-ENF-003 | Process pause via SIGSTOP | Enforcement |
| AT-ENF-004 | Process kill via SIGTERM | Enforcement |
| AT-ENF-005 | Process resume via SIGCONT | Enforcement |
| AT-INT-001 | L0 rules dispatch kill and alert actions by category and severity | Intelligence |
| AT-INT-002 | Statistical anomaly in behavior pattern | Intelligence |
| AT-INT-003 | Enforcement fires at once when a rule also asks for LLM confirmation | Intelligence |
| AT-INT-005 | Baseline learning detects capability drift | Intelligence |
| AT-PROC-003 | High CPU usage detection (>90%) | Process |
| AT-PROC-005 | Process termination and rapid respawn | Process |
| AT-NET-003 | Connection burst (rapid outbound connections) | Network |
| AT-FS-004 | Mass file creation | Filesystem |
| BL-001 | A normal agent workload raises no false positives | Baseline |
| BL-002 | Injected anomalies score above the learned baseline | Baseline |
| BL-003 | Baselines persist across a restart | Baseline |
| INT-005 | Normal traffic, then a sudden attack burst | Integration |
| INT-006 | Events from three monitors correlate into a critical threat | Integration |
| INT-008 | Kill switch stops the agent process, then recovery | Integration |

The enforcement tests exercise containment (pause, kill, resume, alert); the baseline, anomaly and resource tests detect an agent acting outside its normal pattern. BL-001 is the false-positive control for that detection.

### Agentic coverage summary

| ASI ID | Category | Scenario files |
|--------|----------|----------------|
| ASI01 | Agent Goal Hijack | 4 |
| ASI02 | Tool Misuse & Exploitation | 11 |
| ASI03 | Identity & Privilege Abuse | 5 |
| ASI05 | Unexpected Code Execution (RCE) | 7 |
| ASI07 | Insecure Inter-Agent Communication | 3 |
| ASI08 | Cascading Failures | 2 |
| ASI10 | Rogue Agents | 19 |

A file listed under more than one ID is counted under each. ASI04, ASI06 and ASI09 have no scenario; see [Gaps and Future Coverage](#gaps-and-future-coverage).

## OWASP Top 10 for LLM Applications (2025)

### LLM01 - Prompt Injection
Manipulation of agent behavior through crafted inputs that override or bypass system instructions.

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| AT-AI-001 | Prompt-input scanning detects injection / jailbreak payloads | AI-layer |
| AT-INT-001 | L0 rule classification detects threat patterns | Intelligence |
| AT-INT-003 | L2 LLM escalation defers enforcement for confirmation | Intelligence |
| INT-003 | Normal baseline → prompt injection → anomaly burst | Integration |

**ARP Detection:** Prompt scanner matches injection/jailbreak patterns. L0 rules classify severity, L1 detects behavioral deviation, L2 can confirm via LLM analysis.

### LLM02 - Sensitive Information Disclosure
Unauthorized disclosure of credentials, secrets, or sensitive data through the agent (in output or via exfiltration).

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| AT-AI-002 | Prompt-output scanning detects data leaks in responses | AI-layer |
| AT-NET-001 | New outbound connection to unknown host | Network |
| AT-NET-002 | Connection to suspicious host (webhook.site, ngrok) | Network |
| AT-NET-005 | Exfiltration to known destinations | Network |
| AT-FS-001 | Sensitive path access (.ssh, .aws, .gnupg) | Filesystem |
| AT-FS-003 | Credential file access (.npmrc, .pypirc, .netrc) | Filesystem |
| INT-001 | End-to-end data exfiltration chain | Integration |

**ARP Detection:** Output scanner flags leaked secrets. Network monitor maintains a suspicious-host list. Filesystem monitor protects sensitive paths. Combined detection provides defense-in-depth.

### LLM06 - Excessive Agency
Agent performs actions beyond its declared capabilities or authorized scope.

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| AT-PROC-001 | Unauthorized child process spawning | Process |
| AT-PROC-002 | Suspicious binary execution (curl, wget, nc) | Process |
| AT-PROC-004 | Privilege escalation to root | Process |
| AT-FS-002 | File access outside allowed paths | Filesystem |
| AT-FS-005 | Shell config modification (.bashrc, .zshrc) | Filesystem |
| AT-NET-004 | Allowed host bypass via subdomain | Network |
| AT-AI-003 | MCP tool-call abuse (path traversal + command injection) | AI-layer |
| AT-AI-004 | A2A identity spoofing / delegation abuse | AI-layer |
| AT-INT-002 | Statistical anomaly in behavior pattern | Intelligence |
| AT-INT-005 | Baseline learning detects capability drift | Intelligence |
| INT-002 | MCP tool abuse (path traversal + command injection) | Integration |
| INT-004 | A2A trust exploitation via identity spoofing | Integration |
| INT-005 | Slow baseline poisoning then attack | Integration |
| INT-006 | Multi-monitor correlation of excessive actions | Integration |
| INT-008 | Kill switch response to excessive agency | Integration |

**ARP Detection:** Process monitor tracks all child processes and suspicious binaries. Filesystem monitor enforces path boundaries. Network monitor validates allowed hosts. MCP/A2A scanners validate tool calls and inter-agent messages.

### LLM10 - Unbounded Consumption
Agent consumes resources beyond reasonable bounds, causing denial of service or runaway cost.

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| AT-PROC-003 | High CPU usage detection (>90%) | Process |
| AT-NET-003 | Connection burst (rapid outbound connections) | Network |
| AT-FS-004 | Mass file creation | Filesystem |
| AT-INT-004 | Budget exhaustion under load | Intelligence |
| INT-007 | Budget exhaustion (chaff flood) then real attack | Integration |

**ARP Detection:** Process monitor tracks CPU/memory. Network monitor detects connection bursts. Budget controller prevents L2 cost overruns.

### LLM coverage summary

| OWASP ID | Category | Tests | Coverage Level |
|----------|----------|-------|---------------|
| LLM01 | Prompt Injection | 4 | Moderate - L0/L1/L2 detection |
| LLM02 | Sensitive Information Disclosure | 7 | Strong - output + network + filesystem guards |
| LLM06 | Excessive Agency | 15 | Strong - multi-monitor + AI-layer coverage |
| LLM10 | Unbounded Consumption | 5 | Good - resource + budget tracking |

## Gaps and Future Coverage

### Agentic Applications (2026)

| ASI ID | Category | Gap |
|--------|----------|-----|
| ASI04 | Agentic Supply Chain Vulnerabilities | Not tested by the runtime suite, as for LLM03 below |
| ASI06 | Memory & Context Poisoning | No scenario poisons an agent's persistent memory or retrieval store. INT-005 poisons the detector's baseline, not the agent's memory |
| ASI09 | Human-Agent Trust Exploitation | Out of scope for runtime monitoring: the harm is in how a person acts on the agent's output |

### LLM Applications (2025)

| OWASP ID | Category | Gap |
|----------|----------|-----|
| LLM03 | Supply Chain | Covered in the Scanner Benchmark corpus, not the runtime suite |
| LLM04 | Data and Model Poisoning | No training-data / model integrity monitoring (out of runtime scope) |
| LLM05 | Improper Output Handling | Output scanning covers leaks, in model responses (AT-AI-002) and in raw HTTP response bodies through the proxy (INT-003); no scenario cites LLM05 |
| LLM07 | System Prompt Leakage | Prompt-input scanning detects a request to repeat the system prompt (DE-001 in AT-AI-001), and prompt-output scanning a system prompt disclosed in a response (OL-003 in AT-AI-002); no scenario cites LLM07 |
| LLM08 | Vector and Embedding Weaknesses | No RAG / embedding-store monitoring |
| LLM09 | Misinformation | Out of scope for runtime monitoring |
