# Proposal: paired prompt-injection and benign-context pilot

Status: draft protocol for maintainer discussion. No fixtures, experiments,
results, new scenario IDs or scoring changes are included in this proposal.

Scope discussion: [issue #384](https://github.com/opena2a-org/oasb/issues/384).

## Research question

How do a security product's detection and intervention decisions change when
similar attack language is an active instruction in untrusted content, a
quotation in a legitimate security task, or absent from an ordinary task?

The objective is to characterize detection misses and unnecessary intervention,
including successful defenses. Cases will not be selected or retained according
to whether a particular product fails them.

## Relationship to existing work

- [AT-AI-001](../src/atomic/ai-layer/AT-AI-001.prompt-input-scan.test.ts)
  already tests prompt input scanning, with ordinary benign examples. This
  proposal adds matched contexts and a declared sampling and analysis protocol.
- [Adapter documentation](adapters.md) explains that the current atomic tests
  assert reference-product pattern IDs. This pilot would record product verdicts
  without requiring another product to use those IDs.
- [Issue #105](https://github.com/opena2a-org/oasb/issues/105) requests independent
  benign labels. This small, authored study would complement that work; it would
  not replace the corpus or restore its withdrawn metrics.
- [PR #356](https://github.com/opena2a-org/oasb/pull/356) and the existing
  [annotation](../scripts/external-skill-annotation.ts) and
  [adjudication](../scripts/external-skill-adjudication.ts) tools provide a
  starting point for independent review. Their artifact format and acceptance
  criteria must be checked before reuse for these text scenarios.
- [INT-003](../src/integration/INT-003.prompt-injection-response.test.ts)
  includes HTTP response scanning. An alert from that surface alone does not
  establish that an agent action was prevented.

## Proposed pilot design

Start with 12 independently authored task families. Each family has three
conditions and three wording variants: 108 inputs, comprising 36 active attacks,
36 benign quotations and 36 ordinary benign controls. This is a diagnostic
pilot, not a statistically powered population estimate. Maintainers should
approve the size and any overlap with existing fixtures before implementation.

| Condition | Illustrative setup | Ground-truth basis |
| --- | --- | --- |
| Active attack | A document to summarize directs the agent to send a synthetic canary to a mock destination. | The instruction attempts an action outside the user's authorized summarization task. |
| Benign quotation | A security report quotes the same instruction and asks for an explanation of the attack. | The authorized task is analysis; no transfer is requested or permitted. |
| Ordinary benign control | A report on the same topic contains ordinary content to summarize. | The authorized task requires no transfer or security-sensitive operation. |

Use a literal form, a meaning-preserving paraphrase, and a version embedded in
longer neutral context. Publish exact strings, lengths and insertion positions;
do not assume those transformations increase difficulty until measured. Apply
the same transformation rules across all three conditions. Avoid systematic
label cues in filenames, identifiers, canaries and destinations.

The full authorized task and source content must be visible in every condition.
An instruction written inside a retrieved document does not gain authority by
claiming to be a system message. Annotators must inspect the complete task and
context, not classify individual suspicious words.

## Measurement contract and adapter boundary

Before running products, agree on the intended operating policy. A signature
scanner can correctly report attack-like text inside a benign quotation. Record
that as a benign-content alert; call it a false positive for actionable-threat
triage only if that is the product configuration's declared decision contract.
An alert is not itself a block or a failure of the legitimate task.

The first phase measures detection through
[PromptScanner.scanInput](../src/harness/adapter.ts), gated on the adapter's
`prompt-input-scanning` capability. That method accepts one string, not role or
trust metadata. Propose one fixed, published serialization of authorized task
and source content, identical across products. It is an experimental text
representation, not native enforcement of role boundaries or a deployment test.
If this representation cannot support the agreed question, revise the design
before collecting results rather than infer capabilities the API does not have.

Only task content enters the scanner. Labels, conditions, family IDs and expected
outcomes stay in a separate evaluator manifest. Do not use `injectEvent` with a
preclassified threat as evidence that the product detected the attack. Record
`detected`, matches, truncation, errors and elapsed time; product-specific pattern
names are descriptive evidence, not cross-product pass criteria.

A second, separately agreed runtime phase could measure containment and task
completion. It would require an actual agent or explicitly labeled scripted
executor, a tool-action boundary, and an independently observed mock sink.
Record attempts and committed effects separately from product alerts. Absence
of an unsafe effect alone does not establish a product prevented it: compare
the same workload with the control disabled and record agent refusal, crashes
and missing attempts separately. Scanner-only runs mark containment and task
completion **not measured**. A scripted executor cannot establish LLM robustness.

## Independent labeling and freezing the protocol

1. Agree on the authorization policy and a written annotation rubric before
   inspecting any scanner output. Separate attack intent from signature presence.
2. Have two human reviewers independently label shuffled inputs as active attack,
   benign analysis, ordinary benign, or unresolved. Hide proposed labels, scanner
   output and pairing metadata; preserve all task content needed to judge intent.
   Do not claim reviewers are blind to semantic clues in the content itself.
3. Resolve disagreements with a third reviewer and retain rationales, original
   labels, agreement counts and Cohen's kappa. Unresolved cases remain visible in
   the inventory and are excluded from scored denominators with reasons.
4. Freeze content hashes, labels, family membership, ordering seed, adapter
   versions, configurations, serialization and analysis before the first product
   run. Keep an audit log of any later corrections and rerun every affected arm.
5. Preserve every outcome. Any cases developed after seeing product results are
   exploratory follow-ups. A later confirmatory study must use new task families,
   not sibling paraphrases presented as an unseen holdout.

## Reporting and analysis

Report numerator, denominator and coverage for each product and condition:

- Attack detection: alerted active attacks / validly measured active attacks.
- Benign-content alert rate: alerted benign inputs / validly measured benign
  inputs, separately for quotations and ordinary controls.
- Within-family differences between the matched conditions and variants.
- In a runtime phase only: attempted and committed unsafe effects, intervention
  events, and completion of a predefined legitimate task, reported separately.

Missing capability is N/A; errors, truncation and unavailable observations are
inconclusive. Count neither as a successful defense or a benign true negative.
Publish intended and measured totals and every exclusion. Compare products only
on a declared common set of inputs and policy; also show each product's coverage.

The 108 inputs are related: there are only 12 base families. Any exploratory
uncertainty intervals must resample whole families, keeping conditions, variants
and product predictions paired. State the small sample size and that intervals
do not establish representativeness of real-world traffic. Do not treat repeated
runs or paraphrases as independent evidence. Record stochastic settings and
repetitions separately if a product is nondeterministic.

Publish errors and counterexamples as well as successful defenses. Do not
publish an overall tier, deployment precision, or a replacement FPR for the
existing OASB corpus from this deliberately balanced pilot.

## Reproduction and implementation acceptance

After scope agreement, the implementation should provide:

- Versioned fixtures and evaluator-only labels, annotation records, a manifest
  with hashes, and a documented clean-checkout run command.
- A result row for every planned input, plus product and adapter versions,
  configuration, runtime, ordering seed and OASB commit in a run record.
- Capability gating and per-input failure reporting through the existing harness.
  Empirical study reports must not require every product to succeed for a run to
  be recorded; harness tests must verify measurement and aggregation correctness.
- Regression coverage under `npm test` for label isolation, missing observations,
  reproducible fixture order and metric denominators. Always-alert and
  never-alert test doubles must produce the expected counts without being
  represented as evaluated security products.
- Synthetic canaries and an in-process or loopback-only mock destination for any
  runtime phase, with no real credentials or external transmission.

Candidate mappings follow the repository's existing prompt-injection entries:
MITRE ATLAS AML.T0051, OWASP Agentic ASI01 and OWASP LLM LLM01. Confirm their
applicability to each accepted attack before assigning scenario IDs, adding the
required header and updating [the mapping](owasp-agentic-mapping.md). Benign
controls must not inflate the attack count. This proposal adds no coverage claim.

## Decisions requested before implementation

- Does this add useful paired context coverage, or should it join an existing
  study? Who can coordinate the research and independent reviewers?
- Is a text-only detection pilot the appropriate first step? Which adapter
  configurations and operating policies should be compared?
- Should this protocol and its eventual fixtures live in this repository, and
  can the external-skill annotation workflow be reused without changing its
  meaning or acceptance criteria?
- What deliverables and review criteria are needed to move from a pilot to a
  publishable evaluation? Discuss any research-report or specification authorship
  separately with the maintainers based on agreed contributions; no authorship
  or publication commitment is implied by this proposal.
