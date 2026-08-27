# OASB Scanner Benchmark Results

**Date:** 2026-06-05
**Build under test:** hackmyagent 0.23.8, NanoMind classifier v0.5.0
**Dataset:** OASB v2 corpus, 4,245 categorized samples (270 malicious, 3,881 benign, 94 edge).
**3,704 of the 3,881 benign samples were labeled by the scanner under test** — see the withdrawal
notice in Section 1 before quoting anything from this document.
**DVAA:** 86 full-repo scenarios (29.1% detected) / 91 corpus config-subset samples (81.3%) - see Section 4
**Paper comparison:** Holzbauer et al., "Malicious Or Not" (arXiv:2603.16572), 238K skills

---

## 1. HMA Scanner Results (OASB v2 corpus)

> **F1, precision, false-positive rate and flag rate are withdrawn (2026-08-09).** The benign class
> of this corpus was labeled by the scanner under test.
>
> **Correction, 2026-08-27: this notice previously quoted the wrong rule, and the true one is
> worse.** It cited the docstring at `scripts/export-registry-corpus.mjs:9`
> (`verdict=safe AND score >= 80`). The rule the code actually applies is at `:146-164`:
> `verdict === 'warning' && overall_score >= 70`. The shipped corpus proves which one ran:
> `metadata.scanVerdict` across the registry samples is **warning 3,746 / blocked 205 / passed 23**,
> and **`safe` appears zero times**. So the benign class is not "artifacts HackMyAgent called
> clean". It is **artifacts HackMyAgent emitted a warning on, kept because they scored 70 or
> above**. The count was also overstated: **3,704** benign samples carry a scanner verdict, and a
> further 177 are hand-authored fixtures that merely declare `source: 'registry'`.
>
> The conclusion is unchanged and, if anything, stronger. Any artifact the scanner scored below 70
> was excluded from the benign class by construction, so a near-zero false-positive rate was
> guaranteed before a single scan ran. Every metric that reads the benign class -- FPR,
> precision, F1, flag rate -- is a labeling artifact, not a measurement. They are not restated here.
>
> **Recall is not withdrawn**, and the distinction is not a convenience. Recall reads only the
> malicious class, and the published run excludes the 225 registry samples labeled malicious by the
> same rule (`run-benchmark-v2.ts --categorized-only`). What remains is 270 fixtures we authored.
> Read Section 1a before quoting the number.

| Scanner | Recall | F1 | Precision | FPR | Flag rate |
|---------|--------|----|-----------|-----|-----------|
| HMA Full Pipeline (AST + 6 analyzers + NanoMind) | **82.6%** (223/270) | withdrawn | withdrawn | withdrawn | withdrawn |
| HMA Static (regex only) | 51.1% | withdrawn | withdrawn | withdrawn | withdrawn |
| NanoMind TME v0.5.0 (model-only ablation) | 93.0% | withdrawn | withdrawn | withdrawn | withdrawn |

The NanoMind TME row is a **model-only ablation**, not a scanner verdict, and its recall is not a
detection claim: the classifier uses a whitespace-split vocabulary that goes out-of-vocabulary on code
and skill text, so it flags most of what it is shown. Its high recall is the arithmetic consequence of
over-flagging, and the metric that would have exposed that -- its false-positive rate -- is one of the
withdrawn ones.

### 1a. What the recall number is measured on

The 270-sample malicious class is authored entirely by us:

| Source | Samples | Detected | Recall |
|--------|---------|----------|--------|
| `aria` (our offensive-research findings) | 89 | 74 | 83.1% |
| `dvaa` (our deliberately-vulnerable app) | 91 | 74 | 81.3% |
| `hma_payload` (HackMyAgent's own test payloads) | 90 | 75 | 83.3% |
| **Total** | **270** | **223** | **82.6%** |

Two things this table is here to let a reader check rather than take on trust:

- **A third of the denominator is the scanner's own test payloads.** They are not inflating the
  result: 83.3% on its own payloads against 81.3% on DVAA and 83.1% on ARIA. Excluding
  `hma_payload` entirely, recall is **82.2% (148/180)**.
- **Excluding the 225 self-labeled registry samples raises the number a great deal.** Scored over all
  495 samples the corpus calls malicious, recall is **47.3% (234/495)**. We report 82.6% because the
  225 carry no attack content -- they are registry entries HackMyAgent happened to block -- and
  scoring against them would be the same circularity in the other direction. A reader who disagrees
  with that exclusion should use 47.3%.

This measures detection against a known, fixed fixture set that we wrote. It is not a measure of
detection in the wild, and it is not comparable to a figure another scanner reports on another corpus.

Source data: `nanomind-training/evaluation/phase-a/corpus-structural-verdicts.json`.

The NanoMind TME row is a **model-only ablation**, not a scanner verdict. The current classifier uses a
whitespace-split vocabulary that goes out-of-vocabulary on code and skill text, so on its own it
over-flags benign inputs (79% FPR). A code/text-aware classifier is in progress; the ablation row is
published only to document model-only behavior and is not a detection claim.

---

## 2. Per-Category Recall (Full Pipeline)

Recall = detected / total. This is the per-category detection metric (per-category precision is not
reported — benign samples carry no attack category, so per-category false positives are ill-defined).

**Reported as counts, deliberately.** Each cell is 30 samples, which carries a standard error of
roughly ±9 percentage points. `46.7%` on 14 of 30 claims a precision the sample size does not
support, so the percentage column has been removed rather than restated.

| Category | Detected / Total |
|----------|------------------|
| credential_exfiltration | 29/30 |
| unicode_stego | 29/30 |
| social_engineering | 29/30 |
| data_exfiltration | 29/30 |
| persistence | 27/30 |
| prompt_injection | 26/30 |
| heartbeat_rce | 21/30 |
| privilege_escalation | 19/30 |
| supply_chain | 14/30 |
| **Overall** | **223/270** |

Neighbouring cells are not separated by these data. `29/30` and `27/30` are one sample apart; the
ordering above is not evidence that credential exfiltration is detected more reliably than
persistence. The gap that does survive the sample size is between the top of this table and
`supply_chain` at 14/30.

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
- `AST-SCOPE-001` — **wildcard tool access** (`allowedTools:["*"]`). It is a least-privilege
  **posture** issue, not an attack, and malicious configs are caught by the adversarial directives
  they layer on top (`AST-SCOPE-004`) rather than by the wildcard itself.

  > **Correction, 2026-08-27.** This exclusion was previously justified by the claim that "over
  > 2,900 benign registry MCP servers declare this". **Those servers did not declare it.**
  > `scripts/export-registry-corpus.mjs:233` hard-codes `allowedTools: ['*']` into every
  > synthesized `mcp_tool` sample, so all **3,101 of 3,101** registry-derived MCP samples contain
  > it and **2,954** of those are labeled benign. The observation that motivated excluding a check
  > class from the verdict was written into the corpus by the corpus builder, which is the same
  > defect class as the withdrawn metrics in Section 1 and was missed when those were withdrawn.
  >
  > The exclusion itself is retained on the argument above, which does not depend on the frequency
  > claim: a wildcard grant is a posture finding whether it appears once or three thousand times.
  > But the frequency claim is not evidence and must not be cited as though the corpus measured
  > something about real registry servers. It measured its own generator.

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
- **82.9% F1 / 83.2% precision / 1.16% FPR / 6.3% flag rate** (2026-06-05, the run this document
  reports) — **withdrawn 2026-08-09.** The benign class was labeled by the scanner under test, so
  every metric that reads it was determined by the labeling rule rather than measured. Recall from
  the same run is retained under the disclosure in Section 1a.

Note what the first two withdrawals have in common with the third: each replaced a number with a
better number from the same self-labeled corpus, and each therefore carried the defect forward. The
third withdrawal is not followed by a replacement figure. There is no comparative accuracy claim in
this document, and there will not be one until the measurement runs on a corpus we neither own nor
labeled.

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
