# How OASB works

What OASB evaluates, and how it differs from HackMyAgent. The
[README](../README.md) has the first run; the [test harness](test-harness.md)
page describes the files that run the suite against a security product.

## What OASB Is (and Isn't)

**MITRE ATT&CK Evaluations, but for AI agent security products.**

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
