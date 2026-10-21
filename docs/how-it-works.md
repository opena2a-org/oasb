# How OASB works

What OASB evaluates, how it differs from HackMyAgent, the related OpenA2A
tools, and how the OpenA2A CLI and HackMyAgent compute their OASB-1
percentages. The [README](../README.md) has the first run; the
[test harness](test-harness.md) page describes the files that run the suite
against a security product.

## What OASB Is (and Isn't)

**MITRE ATT&CK Evaluations, but for AI agent security products.**

OASB evaluates **security products**, not agents. It answers: "does your runtime protection actually catch these attacks?"

The [bait compliance](bait-compliance.md) track is the exception: it records whether named agents, run in a lab, do what an instruction planted in the content they read asks.

| | OASB | [HackMyAgent](https://github.com/opena2a-org/hackmyagent) |
|---|---|---|
| **Purpose** | Evaluate security *products* | Pentest AI *agents* |
| **Tests** | "Does your EDR catch this exfiltration?" | "Is your agent leaking credentials?" |
| **Audience** | Security product vendors, evaluators | Agent developers, red teams |
| **Analogous to** | [MITRE ATT&CK Evaluations](https://attackevals.mitre-engenuity.org/) | [OWASP ZAP](https://www.zaproxy.org/) / Burp Suite |
| **Method** | Controlled lab - inject attacks, measure detection | Active scanning + adversarial payloads against live targets |
| **Output** | Detection coverage scorecard | Vulnerability report + auto-fix |

Use both together: **HackMyAgent** finds vulnerabilities in your agent, **OASB** proves your security product catches real attacks.

Related OpenA2A tools: [AIM](https://github.com/opena2a-org/agent-identity-management) (identity and access control for AI agents), [HackMyAgent](https://github.com/opena2a-org/hackmyagent) (security scanner), [ARP](https://www.npmjs.com/package/arp-guard) (agent runtime protection), [Secretless AI](https://github.com/opena2a-org/secretless-ai) (keeps credentials out of AI context windows) and [DVAA](https://github.com/opena2a-org/damn-vulnerable-ai-agent) (a deliberately vulnerable agent for security training and red-teaming).

## Usage via OpenA2A CLI

The [README](../README.md#usage-via-opena2a-cli) shows the `opena2a benchmark` and `hackmyagent secure -b oasb-1` commands that check an agent directory against the OASB-1 controls.

The two percentages are different figures and are not comparable with each other; compare each with its own earlier runs. `opena2a benchmark` scores the check IDs of the level's controls, such as `CRED-002` (its output calls them controls), as passing over evaluated check IDs. `hackmyagent secure -b oasb-1` scores the controls themselves, such as `5.1`, as passed over verified controls, leaving unverified and not applicable controls out. At L1, opena2a-cli 0.10.13 counts 39 check IDs, from the catalogue of the hackmyagent 0.25.2 it installs, and hackmyagent 0.33.2 counts 26 controls. Neither help text states how its percentage is computed: `hackmyagent secure --help` mentions verified controls under `--fail-below` ("0 verified controls: exit 2"), and `opena2a benchmark --help` lists its `--dir` and `--level` options.
