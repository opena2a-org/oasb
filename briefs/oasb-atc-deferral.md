# OASB ATC Verification — Formal Deferral

**Status:** Deferred indefinitely. Not scheduled for any milestone.
**Date:** 2026-04-14

## Context

OASB ATC verification was recorded as deferred work without saying what was deferred — readable as either a deferred feature inside OASB or deferred work elsewhere that mentions OASB. There was no corresponding deferred flag, TODO, or unfinished code path in this repository.

This brief closes that ambiguity.

## What "ATC in OASB" could mean

1. **Runtime ATC verifier inside OASB** — a crypto client that validates agent-trust-certificate signatures during benchmark runs.
2. **ATC forgery-scenario fixture generator** — tooling that synthesizes realistic-but-forged ATC payloads to feed to defenders under test.
3. **ATC-aware scoring** — a scoring rubric in OASB that rewards defenders which cryptographically validate ATCs.

## Decision

We implement **none of the three** in OASB at this time.

**Why 1 (runtime verifier) is out of scope:**
OASB evaluates security _products_ against attack scenarios. It does not run as an agent and does not transit requests that carry real ATCs. A verifier here would have no production call site. The canonical ATC verifier already lives in aim-cloud, with CBOR-COSE signature validation, CRL caching, dual-signature, and capability scoping. Re-implementing it in a benchmark repo is duplication with a worse update cadence.

**Why 2 (fixture generator) is premature:**
The single scenario that needs ATC-shaped payloads today is `atc-forgery-attack` (see `scripts/run-dvaa-benchmark.ts:76` and `dvaa-benchmark-results.json`). It is currently mapped to the `social_engineering` category and tests whether defenders catch identity spoofing at the narrative level — not at the CBOR/COSE byte level. Until a defender-under-test actually ingests ATCs, a crypto-grade forgery generator is build-for-its-own-sake.

**Why 3 (ATC-aware scoring) is premature:**
No defender in the OASB corpus currently claims ATC validation. Adding a scoring dimension no product can score on is dead weight.

## Triggers that would revive this

Reopen the decision when **any** of the following become true:

- A defender enrolled in OASB (ARP, a customer deployment, etc.) advertises ATC validation and we want to verify the claim.
- The `atc-forgery-attack` scenario is upgraded from social-engineering narrative into a protocol-level fixture (requires aim-cloud to expose a forged-ATC generator and a `verifyAtc(bytes) -> {valid, reason}` API).
- The threat research or model evaluation owner requests an ATC-forgery track in a published OASB release for benchmarking purposes (e.g., a Black Hat / DEFCON deliverable).

At that point:
- **Do not** re-implement the verifier in OASB — import the aim-cloud client as a dependency.
- Add an `atc_evidence` evidence type to the runner so defenders can signal cryptographic verification separately from rule-matching detection.
- Extend the scoring rubric with an `atc_validation` dimension, scored only for defenders that claim the capability.

## Alternatives considered

- **Implement now as a forward-compatible stub.** Rejected — a stub with no production call site accrues drift cost and makes the repo harder to audit.
- **Leave the ambiguous entry in place.** Rejected — an undocumented deferred entry rots quickly: later, nobody can tell what it deferred or why.
- **Move the entry to an OASB-specific TODO.** Rejected — the entry was never OASB's work. Correct resolution is to close it here.

## Escalation

- **The architecture owner** made the call to delegate ATC validation to aim-cloud and keep OASB a pure attack benchmark. Re-route here if that decision changes.
- **The threat research owner** should flag if any threat-research deliverable requires an OASB-internal ATC generator (trigger #3 above).
