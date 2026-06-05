# OASB Scanner Benchmark Results

**Date:** 2026-06-05
**Build under test:** hackmyagent 0.23.8, NanoMind classifier v0.5.0
**Dataset:** OASB v2 corpus, 4,245 categorized samples (270 malicious, 3,881 benign, 94 edge)
**DVAA:** 86 full-repo scenarios (25.6% detected) / 91 corpus config-subset samples (82.4%) — see Section 3
**Paper comparison:** Holzbauer et al., "Malicious Or Not" (arXiv:2603.16572), 238K skills

> **Status: aggregate F1 / precision / FPR are UNDER REVISION and are not published.**
> A faithful re-run (each sample routed through the analyzer path for its artifact type, mirroring
> the shipped scanner) shows the aggregate false-positive rate is dominated by a definitional
> disagreement, not by detection quality, and therefore is not a meaningful scanner-quality metric
> for this corpus as labeled. See Section 1. The sound, reportable signals are **per-category recall**
> and the **DVAA detection rate**. The previously circulated 82.1% F1 / 1.26% FPR and the older 89.2%
> figure are withdrawn (Section 5).

---

## 1. Why the aggregate F1 / FPR is withheld

The verdict rule is: a sample is flagged malicious when the scanner produces at least one high or
critical **attack** finding — the finding set the shipped `hackmyagent secure` surfaces in red.
Hardening findings (missing defenses, not present attacks: `AST-PROMPT-001/003/004`,
`AST-GOV-001..005`) are excluded because they fire on benign and malicious artifacts alike and carry
no detection signal. Each sample is compiled under a filename that triggers the same artifact-type
classification the shipped scanner assigns (agent_config / mcp_config / skill / soul / system_prompt).

Under this faithful routing, **2,977 of 3,881 benign samples are flagged.** Roughly 2,954 of those
are registry MCP configurations that declare `"allowedTools": ["*"]` — a wildcard tool grant. The
scanner flags this as wildcard tool access (a real least-privilege finding; the shipped `secure`
emits `SEM-MCP-004` / `AST-SCOPE-001` on the same inputs), but the corpus labels these samples benign
because the underlying server package is a legitimate published project.

This is a **definitional disagreement** between "the artifact contains a security finding" and "the
artifact is malicious," not a detection error. It drives essentially the entire aggregate FPR.
Publishing an aggregate precision/FPR/F1 from this corpus would either:

- misrepresent a routine config posture (wildcard MCP access) as a scanner error, or
- require the earlier behavior — compiling **every** sample as a skill, which silently bypassed the
  MCP analyzers and produced an artificially low FPR (this is exactly how the withdrawn 1.26% FPR
  arose).

Resolving the wildcard-MCP question — whether to soften the scanner's wildcard finding or to relabel
those corpus samples — is a prerequisite to any aggregate number. Until then we report only the
metrics that are unaffected by it.

---

## 2. Per-Category Recall (Full Pipeline) — measured, sound

Recall = detected / total. This is a detection metric and is unaffected by the benign-labeling
question above.

| Category | Recall | Detected / Total |
|----------|--------|------------------|
| credential_exfiltration | 96.7% | 29/30 |
| unicode_stego | 96.7% | 29/30 |
| social_engineering | 96.7% | 29/30 |
| data_exfiltration | 96.7% | 29/30 |
| persistence | 90.0% | 27/30 |
| prompt_injection | 86.7% | 26/30 |
| heartbeat_rce | 70.0% | 21/30 |
| privilege_escalation | 66.7% | 20/30 |
| supply_chain | 56.7% | 17/30 |
| **Overall** | **84.1%** | 227/270 |

Privilege-escalation recall rose from 30.0% (prior run) to 66.7% after two fixes: routing JSON
agent/MCP configs through their real analyzer path instead of the skill path, and a new structural
check (`AST-SCOPE-004`) that flags configuration directives which are themselves the attack
(self-escalation, security-control bypass, audit evasion, credential harvesting). The remaining
privilege-escalation and supply-chain misses are natural-language artifacts whose signal is
instruction text, not structure; those depend on the semantic layer, not the structural analyzers.
Per-category precision is not reported: benign samples carry no attack category, so per-category
false positives are ill-defined.

---

## 3. DVAA Ground-Truth Results

DVAA appears in the benchmark two ways, and they measure different things — both are reported here to
avoid overstating detection:

| Source | Scenarios | Detected | Rate | What it measures |
|--------|-----------|----------|------|------------------|
| Full DVAA scenario repo (`run-dvaa-benchmark.ts`) | 86 | 22 | **25.6%** | Every DVAA scenario, including behavioral / code / natural-language attacks. |
| Corpus DVAA subset (`source: dvaa` in v2.json) | 91 | 75 | 82.4% | The config-structural DVAA samples carried in the corpus. |

The gap is the honest characterization of the structural pipeline: it detects **config-encoded**
attacks well (wildcard scopes, self-escalation flags, credential-harvest directives — the
`AST-SCOPE-004` family) but misses most **behavioral / natural-language** attacks (prompt injection,
social engineering, code-level RCE), whose signal is instruction text rather than structure. Those
depend on the semantic layer (NanoMind), which under-performs on this corpus today. Lead with the
26% full-repo number when characterizing DVAA detection; the 82% subset number is not representative
of DVAA as a whole.

---

## 4. Static and model-only rows (context)

| Scanner | Recall | Flag Rate | Note |
|---------|--------|-----------|------|
| HMA Static (regex only) | 51.1% | 3.6% | No structural understanding; misses config-structural attacks. |
| NanoMind TME v0.5.0 (model-only) | 93.0% | 79.8% | Model-only ablation, not a scanner verdict; over-flags due to a whitespace-vocabulary OOV limitation on code/skill text. A code/text-aware classifier is in progress. |

These rows are context, not headline claims. The static row's precision and the model row's flag rate
are reported as measured, but neither is the shipped verdict.

---

## 5. Withdrawn claims

- **82.1% F1 / 1.26% FPR / 82.2% recall** (the 2026-06-05 morning run) — the 1.26% FPR was an
  artifact of compiling every sample as a skill, which bypassed the MCP analyzers. Withdrawn.
- **89.2% F1** (April 2026) — keyed off the raw classifier intent label, which over-flags benign
  inputs. Withdrawn.

Neither number is publishable. The faithful re-run replaces the verdict and routing; the aggregate it
produces is governed by the wildcard-MCP labeling question in Section 1.

---

## 6. Comparison with Holzbauer et al. Table 2 (external reference)

The paper measures **flag rates** across 238K skills from ClawHub and Skills.sh. It does NOT report
precision/recall/F1 (no ground-truth labels exist for that dataset), so we make no head-to-head
accuracy claim against it. The flag rates below are reproduced as external context only.

| Scanner | Flag Rate | Dataset |
|---------|-----------|---------|
| Socket | 3.79% | Skills.sh (no ground truth) |
| Snyk | 7.69% | Skills.sh (no ground truth) |
| agent-trust-hub | 13.76% | Skills.sh (no ground truth) |
| Cisco Skill Scanner | 14.04–16.74% | both (no ground truth) |
| GPT 5.3-based | 27.28–38.80% | both (no ground truth) |
| VirusTotal | 36.20% | ClawHub (no ground truth) |
| OpenClaw Scanner | 41.93% | ClawHub (no ground truth) |

Paper key finding: scanner consensus is extremely low — only 33 of 27,111 Skills.sh skills (0.12%)
are flagged by all five scanners.

---

## 7. Reproducibility

```bash
git clone https://github.com/opena2a-org/oasb.git
cd oasb && npm install

# Full benchmark (all adapters, ~7 minutes)
npx tsx scripts/run-benchmark-v2.ts --categorized-only

# DVAA ground-truth comparison
npx tsx scripts/run-dvaa-benchmark.ts
```

- OASB v2 corpus: `corpus/v2.json`
- Full machine-readable results: `benchmark-results-v6.json` (the `note` field carries the FPR caveat)
- Paper: arXiv:2603.16572 (Holzbauer et al., March 2026)
