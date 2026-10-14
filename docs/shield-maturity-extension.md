# OASB Extension: Security Product Maturity Scorecard

> **Status: proposal.** None of the 52 SM tests on this page exists in this repository: there is no `src/maturity/` directory and no Shield wrapper in `src/harness/`. No figure on this page is a test result. The Shield coverage it states is what the proposal expects once the tests are written, and is not measured.

## Context

OASB currently evaluates **runtime detection** capabilities (attack scenarios across process, network, filesystem, prompt, and MCP layers; the [test catalog](test-catalog.md#what-gets-tested) states how many). Shield provides capabilities that fall outside OASB's detection-focused scope but are critical for production security posture.

This extension would add a **Security Product Maturity** category to OASB, covering infrastructure that runtime detection alone does not address.

## Proposed Categories

### SM-LOG: Log Integrity (8 tests)

Verifies that the security product maintains tamper-evident audit logs.

| ID | Test | Description |
|----|------|-------------|
| SM-LOG-001 | Hash chain integrity | Events are SHA-256 hash-chained; tampering any event breaks the chain |
| SM-LOG-002 | Genesis hash validation | First event references a well-known genesis hash |
| SM-LOG-003 | Chain verification API | Product exposes a function to verify the full chain |
| SM-LOG-004 | Tamper detection | Modifying a stored event is detected within one verification cycle |
| SM-LOG-005 | Append-only guarantee | Events cannot be deleted or reordered |
| SM-LOG-006 | Log rotation | Large log files are rotated without breaking the chain |
| SM-LOG-007 | Concurrent write safety | Multiple writers do not corrupt the chain |
| SM-LOG-008 | Event schema validation | Events conform to a defined schema (source, severity, outcome, timestamps) |

**Expected Shield coverage (not measured):** SM-LOG-001 through SM-LOG-006, via `events.ts` and `integrity.ts`.

### SM-SIGN: Artifact Signing (6 tests)

Verifies that the security product signs its own artifacts (config, policy, scan results).

| ID | Test | Description |
|----|------|-------------|
| SM-SIGN-001 | Sign artifact | Product signs a file and stores the signature |
| SM-SIGN-002 | Verify signature | Verification passes for unmodified files |
| SM-SIGN-003 | Tamper detection | Verification fails after file modification |
| SM-SIGN-004 | Missing file detection | Verification fails when a signed file is deleted |
| SM-SIGN-005 | Re-sign after update | Legitimate changes can be re-signed |
| SM-SIGN-006 | Bulk verification | All signed artifacts verified in a single call |

**Expected Shield coverage (not measured):** all 6, via `signing.ts`.

### SM-SESSION: Session Attribution (6 tests)

Verifies that the product can identify which AI assistant is driving a session.

| ID | Test | Description |
|----|------|-------------|
| SM-SESSION-001 | Detect Claude Code | Identifies Claude Code via env/process signals |
| SM-SESSION-002 | Detect Cursor | Identifies Cursor via env/process signals |
| SM-SESSION-003 | Detect Copilot | Identifies GitHub Copilot via env/process signals |
| SM-SESSION-004 | Detect Windsurf | Identifies Windsurf/Codeium via env/process signals |
| SM-SESSION-005 | No false positive | Returns null when no AI assistant is running |
| SM-SESSION-006 | Confidence scoring | Returns confidence score with signal breakdown |

**Expected Shield coverage (not measured):** all 6, via `session.ts`.

### SM-POLICY: Policy Management (8 tests)

Verifies that the product supports policy-as-data with per-agent overrides.

| ID | Test | Description |
|----|------|-------------|
| SM-POLICY-001 | Load policy from file | Reads YAML/JSON policy from disk |
| SM-POLICY-002 | Evaluate allow rule | Action matching an allow rule returns allowed |
| SM-POLICY-003 | Evaluate deny rule | Action matching a deny rule returns blocked/monitored |
| SM-POLICY-004 | Mode enforcement | Enforce mode blocks; monitor mode logs only |
| SM-POLICY-005 | Agent-specific overrides | Per-agent rules override defaults |
| SM-POLICY-006 | Policy hash integrity | Policy file hash is recorded and verified |
| SM-POLICY-007 | Tamper detection | Modified policy file is detected |
| SM-POLICY-008 | Default-deny for unknown | Unknown actions follow the configured default |

**Expected Shield coverage (not measured):** SM-POLICY-001 through SM-POLICY-007, via `policy.ts` and `integrity.ts`.

### SM-HEAL: Self-Healing Integrity (8 tests)

Verifies that the product can detect and recover from its own compromise.

| ID | Test | Description |
|----|------|-------------|
| SM-HEAL-001 | Multi-check selfcheck | Runs multiple integrity checks in a single pass |
| SM-HEAL-002 | Shell hook verification | Detects tampered shell hooks |
| SM-HEAL-003 | Process binary verification | Verifies the runtime binary is legitimate |
| SM-HEAL-004 | Lockdown on failure | Enters lockdown mode when integrity is compromised |
| SM-HEAL-005 | Lockdown blocks operations | Lockdown prevents normal operations |
| SM-HEAL-006 | Recovery with verification | Can exit lockdown after passing verification |
| SM-HEAL-007 | Recovery without verification | Forced recovery is available |
| SM-HEAL-008 | Degraded state detection | Warns on non-critical integrity issues |

**Expected Shield coverage (not measured):** all 8, via `integrity.ts`.

### SM-LLM: LLM-Assisted Analysis (6 tests)

Verifies that the product uses LLM intelligence for security analysis.

| ID | Test | Description |
|----|------|-------------|
| SM-LLM-001 | Policy suggestion | LLM generates policy rules from observed behavior |
| SM-LLM-002 | Anomaly explanation | LLM explains why an event is anomalous |
| SM-LLM-003 | Incident triage | LLM classifies incidents with response steps |
| SM-LLM-004 | Report narrative | LLM generates human-readable security narrative |
| SM-LLM-005 | Response caching | LLM responses are cached with TTL |
| SM-LLM-006 | Cost control | Budget stays under threshold (target: <$1/month) |

**Expected Shield coverage (not measured):** all 6, via `llm.ts` and `llm-backend.ts`.

### SM-CRED: Credential Auditing (6 tests)

Verifies that the product discovers and audits credential exposure.

| ID | Test | Description |
|----|------|-------------|
| SM-CRED-001 | Hardcoded credential detection | Scans source for API keys, tokens, secrets |
| SM-CRED-002 | Cloud CLI discovery | Detects installed cloud CLIs with credentials |
| SM-CRED-003 | OAuth session discovery | Finds active OAuth sessions |
| SM-CRED-004 | MCP server discovery | Finds MCP server configs with credential exposure |
| SM-CRED-005 | Scope drift detection | Detects keys with unintended cross-service access |
| SM-CRED-006 | Credential migration | Migrates hardcoded credentials to env vars |

**Expected Shield coverage (not measured):** SM-CRED-001 through SM-CRED-005, via `detect.ts` and `init.ts`. SM-CRED-006 via `protect` command.

### SM-ENV: Environment Scanning (4 tests)

Verifies that the product scans the development environment comprehensively.

| ID | Test | Description |
|----|------|-------------|
| SM-ENV-001 | Project type detection | Detects Node.js, Go, Python, and unknown |
| SM-ENV-002 | AI assistant detection | Discovers running AI coding assistants |
| SM-ENV-003 | Security hygiene check | Checks gitignore, lock files, env protection |
| SM-ENV-004 | Posture scoring | Computes a security score with risk level |

**Expected Shield coverage (not measured):** all 4, via `detect.ts`, `init.ts`, and `status.ts`.

## Summary

No SM test exists yet, so the third column is the proposal's expectation, not a result: the number of tests in each category that Shield is expected to pass once the tests are written under `src/maturity/`.

| Category | Tests | Expected Shield coverage (not measured) |
|----------|-------|----------------|
| SM-LOG: Log Integrity | 8 | 6/8 |
| SM-SIGN: Artifact Signing | 6 | 6/6 |
| SM-SESSION: Session Attribution | 6 | 6/6 |
| SM-POLICY: Policy Management | 8 | 7/8 |
| SM-HEAL: Self-Healing Integrity | 8 | 8/8 |
| SM-LLM: LLM-Assisted Analysis | 6 | 6/6 |
| SM-CRED: Credential Auditing | 6 | 5/6 |
| SM-ENV: Environment Scanning | 4 | 4/4 |
| **Total** | **52** | **48/52** |

These **52 maturity tests** would be added to the existing detection tests (the attack scenario count the [test catalog](test-catalog.md#what-gets-tested) states), so OASB would cover both runtime detection and security product maturity.

## Implementation Plan

1. Add `src/maturity/` directory to OASB with test implementations
2. Create `shield-wrapper.ts` in `src/harness/` (analogous to `arp-wrapper.ts`)
3. Extend `metrics.ts` to compute maturity scores alongside detection scores
4. Update `generate-report.ts` to include maturity category in reports
5. Update README with the new category descriptions
6. Replace the expected coverage on this page with what the tests measure, and remove its proposal status

## MITRE ATLAS Mapping

The SM categories are not mapped to MITRE ATLAS techniques. ATLAS is an adversary framework, and each SM category checks the security product's own machinery (its audit log, signatures, policy, self-checks and scans), not an attack. OASB leaves its defensive-response and detection-capability tests unmapped for the same reason: see the last section of [MITRE ATLAS Test Mapping](mitre-atlas-mapping.md).
