# OWASP LLM Top 10 (2025) Test Mapping

OASB maps tests to the [OWASP Top 10 for LLM Applications (2025)](https://genai.owasp.org/llm-top-10/) to demonstrate coverage of the most critical security risks in AI agent systems. IDs and category names follow the published 2025 list.

## Coverage by Category

### LLM01 — Prompt Injection
Manipulation of agent behavior through crafted inputs that override or bypass system instructions.

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| AT-AI-001 | Prompt-input scanning detects injection / jailbreak payloads | AI-layer |
| AT-INT-001 | L0 rule classification detects threat patterns | Intelligence |
| AT-INT-003 | L2 LLM escalation defers enforcement for confirmation | Intelligence |
| INT-003 | Normal baseline → prompt injection → anomaly burst | Integration |

**ARP Detection:** Prompt scanner matches injection/jailbreak patterns. L0 rules classify severity, L1 detects behavioral deviation, L2 can confirm via LLM analysis.

### LLM02 — Sensitive Information Disclosure
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

### LLM06 — Excessive Agency
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

### LLM10 — Unbounded Consumption
Agent consumes resources beyond reasonable bounds, causing denial of service or runaway cost.

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| AT-PROC-003 | High CPU usage detection (>90%) | Process |
| AT-NET-003 | Connection burst (rapid outbound connections) | Network |
| AT-FS-004 | Mass file creation | Filesystem |
| AT-INT-004 | Budget exhaustion under load | Intelligence |
| INT-007 | Budget exhaustion (chaff flood) then real attack | Integration |

**ARP Detection:** Process monitor tracks CPU/memory. Network monitor detects connection bursts. Budget controller prevents L2 cost overruns.

## Coverage Summary

| OWASP ID | Category | Tests | Coverage Level |
|----------|----------|-------|---------------|
| LLM01 | Prompt Injection | 4 | Moderate — L0/L1/L2 detection |
| LLM02 | Sensitive Information Disclosure | 7 | Strong — output + network + filesystem guards |
| LLM06 | Excessive Agency | 15 | Strong — multi-monitor + AI-layer coverage |
| LLM10 | Unbounded Consumption | 5 | Good — resource + budget tracking |

## Gaps and Future Coverage

| OWASP ID | Category | Gap |
|----------|----------|-----|
| LLM03 | Supply Chain | Covered in the Scanner Benchmark corpus, not the runtime suite |
| LLM04 | Data and Model Poisoning | No training-data / model integrity monitoring (out of runtime scope) |
| LLM05 | Improper Output Handling | Output scanning covers leaks; raw HTTP response bodies are not inspected (gap) |
| LLM07 | System Prompt Leakage | No dedicated system-prompt-extraction detection (future AI-layer pattern) |
| LLM08 | Vector and Embedding Weaknesses | No RAG / embedding-store monitoring |
| LLM09 | Misinformation | Out of scope for runtime monitoring |
