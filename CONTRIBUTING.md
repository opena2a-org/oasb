# Contributing to OASB

The Open Agent Security Benchmark is authored in the open and published with a working reference implementation and a reproducible test harness. It is early, and we are looking for co-authors and contributors to help shape it before it goes to an external standards body. Your review, critique, and independent evaluation work all carry weight on the benchmark.

## What we are looking for

- Review and critique. Read the [methodology](docs/) and [scenarios](corpus/) and tell us where the scoring is ambiguous, where the scenarios leave coverage gaps, or where the MITRE ATLAS and OWASP mappings do not hold up.
- An independent second implementation of the scoring engine or harness, to prove the methodology is reproducible outside this repository.
- Security audit and threat modeling of the benchmark itself, not just a product under test.
- Benchmark and evaluation methodology expertise. We want input from people who have built detection benchmarks, attack corpora, or scoring rubrics, and who can stress-test how OASB measures detection coverage and false-positive rate.
- We need security-product teams to run their detectors against the benchmark, contribute attack scenarios, and be listed as adopters, plus review of the evaluation methodology.

## Who we are looking for

We especially welcome:

- Security and cryptography researchers, including academic and PhD-level work.
- Standards-process experts (W3C, IETF, OpenTelemetry) who can help take these specifications to external bodies.
- Engineers building agent platforms and runtimes, for independent implementations and adoption.
- Red teamers and security auditors.

## How to contribute

- Open an issue or pull request on this repository.
- Or email info@opena2a.org with "co-author" in the subject line.
- Run your detector against the benchmark and contribute attack scenarios. New scenarios should be mapped to MITRE ATLAS and the OWASP LLM/Agentic Top 10, and include the ground-truth label and reproduction steps.
- To be listed as an adopter, open an issue describing how you run OASB and against which product.
- For new attack techniques or coordinated disclosure, email info@opena2a.org with "disclosure" in the subject line.

Small fixes (typos, broken links, clarifications) can go straight to a pull request. For new scenarios or changes to the scoring engine, open an issue first so the change can be discussed and validated against the harness before implementation work begins.

## Ground rules

- Contributions are licensed under Apache-2.0, consistent with the project license.
- Be specific and evidence-based. A new scenario should carry a ground-truth label and reproduce from a clean checkout.
- No purely theoretical claims without a path to validation. Every scenario and metric must be reproducible with `npm test`.
