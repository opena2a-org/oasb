# Open Agent Security Benchmark (OASB)

[![Status: stable](https://img.shields.io/badge/status-stable-green)](STATUS.md)
[![npm version](https://img.shields.io/npm/v/@opena2a/oasb.svg)](https://www.npmjs.com/package/@opena2a/oasb)
[![CI](https://github.com/opena2a-org/oasb/actions/workflows/ci.yml/badge.svg)](https://github.com/opena2a-org/oasb/actions/workflows/ci.yml)
[![Security](https://github.com/opena2a-org/oasb/actions/workflows/security.yml/badge.svg)](https://github.com/opena2a-org/oasb/actions/workflows/security.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

> **[OpenA2A](https://github.com/opena2a-org)**: [CLI](https://github.com/opena2a-org/opena2a) · [HackMyAgent](https://github.com/opena2a-org/hackmyagent) · [Secretless](https://github.com/opena2a-org/secretless-ai) · [AIM](https://github.com/opena2a-org/agent-identity-management) · [Browser Guard](https://github.com/opena2a-org/ai-browserguard) · [DVAA](https://github.com/opena2a-org/damn-vulnerable-ai-agent)

[Website](https://oasb.ai) · [Discord](https://discord.gg/uRZa3KXgEn)

Standardized attack scenarios that evaluate whether a runtime security tool can detect and respond to threats against AI agents. Each scenario is mapped to the [OWASP Top 10 for Agentic Applications (2026)](docs/owasp-agentic-mapping.md), and most also to the OWASP Top 10 for LLM Applications (2025). Plug in your tool, run the suite, get a detection coverage scorecard.

## Quick Start

```bash
npx @opena2a/oasb AT-AI-001   # one scenario file: prompt input scanning, against the reference adapter
```

What `npx @opena2a/oasb AT-AI-001` prints, trimmed ([full output](docs/captures/quick-start.txt)):

```text
...
 ✓ src/atomic/ai-layer/AT-AI-001.prompt-input-scan.test.ts > AT-AI-001: Prompt Input Scanning > should detect instruction override (PI-001) 4ms
 ✓ src/atomic/ai-layer/AT-AI-001.prompt-input-scan.test.ts > AT-AI-001: Prompt Input Scanning > should detect delimiter escape (PI-002) 1ms
 ✓ src/atomic/ai-layer/AT-AI-001.prompt-input-scan.test.ts > AT-AI-001: Prompt Input Scanning > should detect tag injection (PI-003) 0ms
...
 ✓ src/atomic/ai-layer/AT-AI-001.prompt-input-scan.test.ts > AT-AI-001: Prompt Input Scanning > should not flag benign input 0ms
 ✓ src/atomic/ai-layer/AT-AI-001.prompt-input-scan.test.ts > AT-AI-001: Prompt Input Scanning > should not flag technical questions about security 0ms

 Test Files  1 passed (1)
      Tests  11 passed (11)
...
OASB AT-AI-001 against arp-guard 0.3.0: PASS (11 of 11 tests passed)
```

The last line is the verdict. The command exits 0 on PASS, 1 on FAIL and 2 on NOT MEASURED, when every test of the file was skipped; `npx @opena2a/oasb --help` lists the scenario IDs.

To run the whole suite, or to change it, work from a clone:

```bash
git clone https://github.com/opena2a-org/oasb.git
cd oasb && npm ci
npx vitest run AT-AI-001 --reporter=verbose   # the same scenario file, from the checkout
```

`npm test` runs the whole suite against [ARP](https://www.npmjs.com/package/arp-guard) (`arp-guard`), the reference adapter. The [test catalog](docs/test-catalog.md#what-gets-tested) has the totals and a command for each group.

The vulnerabilities `npm ci` reports are in vitest, the test runner, and in the products the adapters load. arp-guard and vitest are optional dependencies of `@opena2a/oasb` as well, so `npm audit --omit=dev` reports the ones in them and in the packages they pull in. The package has no other dependency, and `npm audit --omit=dev --omit=optional` reports none.

## Evaluating Other Products

To evaluate another tool, implement `SecurityProductAdapter` from `src/harness/adapter.ts`, declare its capabilities, and select it with `OASB_ADAPTER`:

```bash
npm test                              # ARP (arp-guard), the reference adapter (default)
OASB_ADAPTER=llm-guard npm test       # the llm-guard npm package
OASB_ADAPTER=rebuff npm test          # the rebuff npm package
OASB_ADAPTER=./my-adapter.js npm test # your own adapter module
```

Tests for a surface the adapter does not declare are marked **N/A (skipped)**, not FAIL. A run in which every selected attack scenario is N/A measured nothing and exits 2.

> The atomic AI-layer tests verify *conformance to the OASB harness*, not neutral detection quality. Across scanners, the [Scanner Benchmark](docs/pinned-benchmark.md#skills-security-benchmark) gives a **recall-only comparison**: its benign class was labeled by HackMyAgent, one of the scanners it compares.

The scorecard is written from a JSON report of the suite. Set `OASB_ADAPTER` on the first line to score another adapter:

```bash
npx vitest run --reporter=json --outputFile=test-results.json   # the suite, with a JSON report
npm run report -- test-results.json                             # writes REPORT.generated.md, the scorecard
```

[REPORT.md](REPORT.md) is the 2026-03-23 run kept as recorded, not the output of this command. The [test catalog](docs/test-catalog.md#run-the-suite) says what the scorecard holds.

## Use as a library

The suite is also published as [`@opena2a/oasb`](https://www.npmjs.com/package/@opena2a/oasb) for building adapters and consuming the scoring engine programmatically:

```bash
npm install @opena2a/oasb
```

npm also installs two optional dependencies: arp-guard, the default adapter's product, and vitest, which runs the scenario files. If you select your own adapter and run no scenario file, `npm install @opena2a/oasb --omit=optional` leaves them out.

```ts
import type { SecurityProductAdapter } from '@opena2a/oasb';
import { createAdapter, getCapabilityMatrix, benchmark } from '@opena2a/oasb';

// Implement SecurityProductAdapter for your product, or select one via
// the OASB_ADAPTER env var (see "Evaluating Other Products" above).
const adapter = createAdapter();
console.log(getCapabilityMatrix());

// Scoring engine: score a scanner's verdicts against labeled samples.
// F1, precision, FPR and tier on the bundled corpus are withdrawn: docs/pinned-benchmark.md
const sample = (id: string): benchmark.BenchmarkSample => ({
  id, label: 'malicious', category: 'prompt_injection', source: 'dvaa',
  version: 'example', artifactType: 'skill', content: 'skill text',
});
const entry = benchmark.scoreSubmission(
  {
    scannerId: 'my-scanner', scannerName: 'My scanner', scannerVersion: '1.0.0',
    submittedAt: new Date().toISOString(), datasetVersion: 'example',
    results: [
      { sampleId: 'm1', verdict: 'malicious' },
      { sampleId: 'm2', verdict: 'benign' },
    ],
  },
  [sample('m1'), sample('m2')],
);
console.log(entry.metrics.recall); // 0.5: one of the two malicious samples flagged
```

The [test harness](docs/test-harness.md) page lists what the package exports.

## Usage via OpenA2A CLI

The [OpenA2A CLI](https://github.com/opena2a-org/opena2a) and [HackMyAgent](https://github.com/opena2a-org/hackmyagent) check an agent directory against the OASB-1 controls: how the agent is configured, not how a security tool detects attacks.

The [OASB-1 checklist](docs/oasb-1-checklist.md) lists those controls by level, each with a question to ask a vendor, the steps that verify it and, where HackMyAgent maps a check to it, the command that checks it; `npx @opena2a/oasb checklist` prints it.

Neither runs the attack scenarios in this repository: `npx @opena2a/oasb <ID>` runs one scenario file of them, and `npm test` in a checkout runs them all (see [Quick Start](#quick-start)).

```bash
opena2a benchmark ./my-agent                            # OASB-1 controls at level L1
opena2a benchmark ./my-agent --level L2                 # OASB-1 controls of levels L1 and L2
opena2a benchmark ./my-agent --format json              # rating, compliance and control coverage as JSON
hackmyagent secure ./my-agent -b oasb-1                 # OASB-1 controls at level L1, scored per control
hackmyagent secure ./my-agent -b oasb-1 --fail-below 80 # also exit 1 below 80% compliance, for CI
```

Of the commands above, only the `hackmyagent` ones exit non-zero on a Not Passing rating, so use one of them for a CI step that should fail on that rating. On a copy of [DVAA](https://github.com/opena2a-org/damn-vulnerable-ai-agent) 0.9.2 that both CLIs rate Not Passing, `hackmyagent secure -b oasb-1` (hackmyagent 0.33.2) exits 1, and `opena2a benchmark` (opena2a-cli 0.10.13) prints the rating and exits 0, also with `--ci`.

Both score only what they could evaluate. The rest are listed as not evaluated (OpenA2A CLI) or unverified (HackMyAgent), not counted as passing.

The two percentages are different figures and are not comparable with each other; [How OASB works](docs/how-it-works.md#usage-via-opena2a-cli) says how each is computed.

## MITRE ATLAS Coverage

Each scenario that simulates an adversary maps to a [MITRE ATLAS](https://atlas.mitre.org/) technique. The technique table and its counts are in [docs/mitre-atlas-mapping.md](docs/mitre-atlas-mapping.md#mitre-atlas-coverage).

## Documentation

- [How OASB works](docs/how-it-works.md): what OASB evaluates, how it differs from HackMyAgent, how each CLI computes its OASB-1 percentage, related tools.
- [OASB-1 checklist](docs/oasb-1-checklist.md): the OASB-1 controls by level, each with a question to ask a vendor, the steps that verify it and, where HackMyAgent maps a check to it, the command that checks it.
- [Test catalog](docs/test-catalog.md): what each category tests, the test totals, a command for each group, what the scorecard holds, and per-test detail.
- [Adapters](docs/adapters.md): the reference adapter, the worked examples, the surfaces each declares and the tests that fail under llm-guard and rebuff.
- [Test harness](docs/test-harness.md) and [release smoke test](docs/testing/release-smoke.md): harness files, package exports, build and type-check, and checks on documented counts and commands.
- [Skills Security Benchmark](docs/pinned-benchmark.md#skills-security-benchmark): the scoring engine, the corpus, the runners, pinned runs and the latest results; only recall is retained.
- [BENCHMARK-RESULTS.md](BENCHMARK-RESULTS.md): per-category counts, the verdict methodology and the DVAA breakdown.
- [Bait compliance](docs/bait-compliance.md): the record a lab run against a named agent writes, and the command that reads the records into a grid of agents by bait type.
- [MITRE ATLAS](docs/mitre-atlas-mapping.md) and [OWASP Agentic](docs/owasp-agentic-mapping.md) mappings, and the [known detection gaps](docs/known-gaps.md) of the reference adapter.
- [Updates](docs/updates.md), [CHANGELOG.md](CHANGELOG.md), [STATUS.md](STATUS.md) and a [recording of a run](https://github.com/opena2a-org/oasb/blob/main/docs/oasb-demo.gif).
- [Contributing](CONTRIBUTING.md): co-authors, a second implementation, new attack scenarios and adopters, before OASB goes to an external standards body.

## License

Apache-2.0
