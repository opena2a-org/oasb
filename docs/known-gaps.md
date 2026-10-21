# Known detection gaps

What the reference adapter (ARP) does not detect, by the test that shows it.
The [README](../README.md) has the first run.

## Known Detection Gaps

OASB documents what the reference product (ARP) does and doesn't catch. Other products may have different gap profiles - that's the point of running the benchmark. For the methodology audit (counts, ATLAS mapping, scoring), see [docs/AUDIT-2026-06-03.md](AUDIT-2026-06-03.md).

| Gap | Severity | Test | Notes |
|-----|----------|------|-------|
| Anomaly baselines not reloaded when the runtime restarts | Medium | BL-003 | BL-003 checks the anomaly detector's `save`/`load`, which ARP passes; the runtime creates a new detector at start and does not load saved baselines, so a restarted runtime relearns from zero |
