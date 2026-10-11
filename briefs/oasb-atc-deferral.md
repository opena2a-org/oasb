# OASB ATC Verification — Formal Deferral

**Status:** Deferred indefinitely. Not scheduled for any milestone.
**Date:** 2026-04-14

## Context

Earlier memory (`project_secretless_v2_state_2026_04_14.md`, "Still open / deferred" list) carried an entry: _"OASB ATC verification (deferred from Phase 7 originally)"_. The entry was ambiguous — readable as either a deferred feature inside OASB or a deferred piece of the Secretless v2 rollout. There was no corresponding deferred flag, TODO, or unfinished code path in this repository.

This brief closes that ambiguity.

## What "ATC in OASB" could mean

1. **Runtime ATC verifier inside OASB** — a crypto client that validates agent-trust-certificate signatures during benchmark runs.
2. **ATC forgery-scenario fixture generator** — tooling that synthesizes realistic-but-forged ATC payloads to feed to defenders under test.
3. **ATC-aware scoring** — a scoring rubric in OASB that rewards defenders which cryptographically validate ATCs.

## Decision

We implement **none of the three** in OASB at this time.

**Why 1 (runtime verifier) is out of scope:**
OASB evaluates security _products_ against attack scenarios. It does not run as an agent and does not transit requests that carry real ATCs. A verifier here would have no production call site. The canonical ATC verifier already lives in aim-cloud (PR #100, Phase 6 of AIM Secrets), with CBOR-COSE signature validation, CRL caching, dual-signature, and capability scoping. Re-implementing it in a benchmark repo is duplication with a worse update cadence.

**Why 2 (fixture generator) is premature:**
The single scenario that needs ATC-shaped payloads today is `atc-forgery-attack` (see `scripts/run-dvaa-benchmark.ts:76` and `dvaa-benchmark-results.json`). It is currently mapped to the `social_engineering` category and tests whether defenders catch identity spoofing at the narrative level — not at the CBOR/COSE byte level. Until a defender-under-test actually ingests ATCs, a crypto-grade forgery generator is build-for-its-own-sake.

**Why 3 (ATC-aware scoring) is premature:**
No defender in the OASB corpus currently claims ATC validation. Adding a scoring dimension no product can score on is dead weight.

## Triggers that would revive this

Reopen the decision when **any** of the following become true:

- A defender enrolled in OASB (ARP, a customer deployment, etc.) advertises ATC validation and we want to verify the claim.
- The `atc-forgery-attack` scenario is upgraded from social-engineering narrative into a protocol-level fixture (requires aim-cloud to expose a forged-ATC generator and a `verifyAtc(bytes) -> {valid, reason}` API).
- CSR/CDS requests an ATC-forgery track in a published OASB release for benchmarking purposes (e.g., a Black Hat / DEFCON deliverable).

At that point:
- **Do not** re-implement the verifier in OASB — import the aim-cloud client as a dependency.
- Add an `atc_evidence` evidence type to the runner so defenders can signal cryptographic verification separately from rule-matching detection.
- Extend the scoring rubric with an `atc_validation` dimension, scored only for defenders that claim the capability.

## Alternatives considered

- **Implement now as a forward-compatible stub.** Rejected — a stub with no production call site accrues drift cost and makes the repo harder to audit.
- **Leave the ambiguous memory entry in place.** Rejected — drift flags rot quickly; "don't leave undocumented deferred flags" is a standing rule.
- **Move the entry to an OASB-specific TODO.** Rejected — the entry was never OASB's; it was a leftover from the Secretless v2 rollout. Correct resolution is to close it here and prune the memory entry.

## Escalation

- **CA** owns the architectural call to delegate ATC validation to aim-cloud and keep OASB a pure attack benchmark. Re-route here if that decision changes.
- **CSR** should flag if any threat-research deliverable requires an OASB-internal ATC generator (trigger #3 above).
