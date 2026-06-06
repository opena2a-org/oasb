# OASB Scanner Benchmark Results

**Date:** 2026-06-05
**Build under test:** hackmyagent 0.23.8, NanoMind classifier v0.5.0
**Dataset:** OASB v2 corpus, 4,245 categorized samples (270 malicious, 3,881 benign, 94 edge)
**DVAA:** 86 full-repo scenarios (29.1% detected) / 91 corpus config-subset samples (81.3%) - see Section 4
**Paper comparison:** Holzbauer et al., "Malicious Or Not" (arXiv:2603.16572), 238K skills

---

## 1. HMA Scanner Results (OASB v2 corpus)

| Scanner | F1 | Precision | Recall | FPR | Flag rate |
|---------|----|-----------|--------|-----|-----------|
| HMA Full Pipeline (AST + 6 analyzers + NanoMind) | **82.9%** | 83.2% | 82.6% | 1.16% | 6.3% |
| HMA Static (regex only) | 67.5% | 99.3% | 51.1% | 0.03% | 3.6% |
| NanoMind TME v0.5.0 (model-only ablation) | 14.0% | 7.5% | 93.0% | 79.18% | 79.8% |

**Read recall alongside F1.** The full pipeline favors precision; recall (82.6%) is the honest measure
of coverage, and per-category recall (Section 2) shows where coverage is strong vs. weak.

The NanoMind TME row is a **model-only ablation**, not a scanner verdict. The current classifier uses a
whitespace-split vocabulary that goes out-of-vocabulary on code and skill text, so on its own it
over-flags benign inputs (79% FPR). A code/text-aware classifier is in progress; the ablation row is
published only to document model-only behavior and is not a detection claim.

---

## 2. Per-Category Recall (Full Pipeline)

Recall = detected / total. This is the per-category detection metric (per-category precision is not
reported — benign samples carry no attack category, so per-category false positives are ill-defined).

| Category | Recall | Detected / Total |
|----------|--------|------------------|
| credential_exfiltration | 96.7% | 29/30 |
| unicode_stego | 96.7% | 29/30 |
| social_engineering | 96.7% | 29/30 |
| data_exfiltration | 96.7% | 29/30 |
| persistence | 90.0% | 27/30 |
| prompt_injection | 86.7% | 26/30 |
| heartbeat_rce | 70.0% | 21/30 |
| privilege_escalation | 63.3% | 19/30 |
| supply_chain | 46.7% | 14/30 |
| **Overall** | **82.6%** | 223/270 |

Privilege-escalation recall rose from 30.0% (the prior, under-detecting run) to 63.3% after two fixes:
routing JSON agent/MCP configs through their real analyzer path instead of the skill path, and a new
structural check (`AST-SCOPE-004`) that flags configuration directives which are themselves the attack
(self-escalation, security-control bypass, audit evasion, credential harvesting). The remaining
privilege-escalation and supply-chain misses are natural-language artifacts whose signal is instruction
text, not structure; those depend on the semantic layer, not the structural analyzers.

---

## 3. Verdict methodology — posture vs. attack

A sample is flagged malicious when the scanner produces at least one high/critical **attack** finding.
The verdict excludes **posture / hardening** findings, which fire on benign and malicious artifacts
alike and so carry no malicious-intent signal:

- `AST-PROMPT-001/003/004` — missing prompt defenses (jailbreak / injection resistance / trust hierarchy).
- `AST-GOV-001..005` — missing governance, oversight, scope limits, override resistance.
- `AST-SCOPE-001` — **wildcard tool access** (`allowedTools:["*"]`). Over 2,900 benign registry MCP
  servers declare this; a signal that fires on thousands of benign configs cannot distinguish malicious
  intent. It is a least-privilege **posture** issue, not an attack. Malicious configs are caught by the
  adversarial directives they layer on top (`AST-SCOPE-004`), not by the wildcard itself.

The **scanner still emits all of these to users** with severity and a fix — this exclusion governs the
benchmark verdict only, not the product's findings. `AST-SCOPE-003` (scope-purpose mismatch) is **kept**
as a verdict driver: it is a genuine trojan-detection signal that catches real privilege-escalation and
supply-chain attacks (excluding it would collapse those categories' recall from ~63%/47% to ~37%/33%
for a marginal aggregate-F1 gain).

Each sample is routed through the analyzer path for its real artifact type (agent_config / mcp_config /
skill / soul / system_prompt), mirroring the shipped scanner. A handful of malicious configs whose only
signal was wildcard access become false negatives under this verdict — genuinely so, since a config
whose sole signal is wildcard access is indistinguishable from a benign over-permissioned server.

---

## 4. DVAA ground-truth results

DVAA appears two ways and they measure different things; both are reported.

| Source | Scenarios | Detected | Rate | What it measures |
|--------|-----------|----------|------|------------------|
| Full DVAA scenario repo (`run-dvaa-benchmark.ts`) | 86 | 25 | **29.1%** | Every DVAA scenario, incl. behavioral / code / natural-language attacks. |
| Corpus DVAA subset (`source: dvaa` in v2.json) | 91 | 74 | 81.3% | The config-structural DVAA samples carried in the corpus. |

The full-repo loader reads each scenario's `vulnerable/` tree recursively, mirroring what HMA reads on
a real repository: every subdirectory (e.g. `knowledge-base/`, `public/`) and every dot-directory or
dot-file that carries a payload (`.well-known/`, `.github/`, `.streamlit/`, an exposed `.env`), skipping
only true noise (`.git`, `.DS_Store`, `node_modules`). The earlier top-level-only read scanned nothing
for scenarios whose entire payload sat below the top level, scoring them as misses. The honest number
was 23.3% (20/86) and is now **29.1% (25/86), +5, with zero regressions** (every scenario detected
before is still detected).

Where the +5 come from, so the number is auditable:

- `indirect-prompt-injection-doc`, `webexpose-claude-md` - payload was in a non-dot subdirectory the
  top-level read missed; now structurally detected.
- `embedding-adversarial-rag`, `behavioral-drift-to-exfil` - these had readable top-level files but
  their attack payload (a poisoned `knowledge-base/` doc, an exfil `skills/` file) sat in a
  subdirectory, so they only fire once the subtree is read.
- `a2a-agent-noauth` - its A2A agent card lives in `.well-known/agent.json` by spec; a loader that
  skipped dot-directories could not see it at all. This is why dot-directories must be read: skipping
  `.well-known/` structurally blinds the benchmark to the entire A2A scenario family.

What is read but still **not** detected, and why that is correct: `mcp-discovery-exposed`
(`.well-known/mcp.json`), `docker-provenance-disabled` (`.github/workflows/docker.yml`), and
`webexpose-env-file` (`public/.env`) are now read in full but remain undetected - they are
posture / exposure, not attack content, and the structural verdict counts only high/critical attack
findings (posture findings are excluded by design, per the posture-vs-attack methodology). Reading the
exposed `.env` produced no finding, confirming the loader fix does not inflate the number via posture.

The gap is the honest characterization: the structural pipeline detects config-encoded attacks well but
misses most behavioral / natural-language attacks (prompt injection, social engineering, code-level RCE),
whose signal is instruction text rather than structure. Lead with the 29.1% full-repo number when
characterizing DVAA detection.

---

## 5. Withdrawn claims

- **82.1% F1 / 1.26% FPR** (a 2026-06-05 interim run) — that 1.26% FPR was an artifact of compiling every
  sample as a skill, which bypassed the MCP analyzers. Withdrawn.
- **89.2% F1** (April 2026) — keyed off the raw classifier intent label, which over-flags benign inputs.
  Withdrawn.

The current numbers replace both, on a faithful per-artifact routing with a posture-vs-attack verdict.

---

## 6. Comparison with Holzbauer et al. Table 2 (external reference)

The paper measures **flag rates** across 238K skills from ClawHub and Skills.sh. It does NOT report
precision/recall/F1 (no ground-truth labels exist for that dataset), so we make no head-to-head accuracy
claim against it. Flag rates reproduced as external context only.

| Scanner | Flag rate | Dataset |
|---------|-----------|---------|
| Socket | 3.79% | Skills.sh (no ground truth) |
| Snyk | 7.69% | Skills.sh (no ground truth) |
| agent-trust-hub | 13.76% | Skills.sh (no ground truth) |
| Cisco Skill Scanner | 14.04–16.74% | both (no ground truth) |
| GPT 5.3-based | 27.28–38.80% | both (no ground truth) |
| VirusTotal | 36.20% | ClawHub (no ground truth) |
| OpenClaw Scanner | 41.93% | ClawHub (no ground truth) |

Paper key finding: scanner consensus is extremely low — only 33 of 27,111 Skills.sh skills (0.12%) are
flagged by all five scanners.

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
- Full machine-readable results: `benchmark-results-v6.json` (the `note` field carries the verdict methodology)
- Paper: arXiv:2603.16572 (Holzbauer et al., March 2026)
