# Status: stable

**Stage:** stable
**Maintenance horizon:** actively maintained through 2026-12-31, status reviewed quarterly
**Maintainer wanted:** no

## Stage definitions

- **stable**: production-ready, semver honored, breaking changes documented, security patches triaged within 24 hours.
- **beta**: feature-complete or near, breaking changes possible with notice, actively developed.
- **experimental**: early stage, breaking changes expected, use at your own risk.
- **reference-only**: spec or reference implementation, not intended for production use.

## Status changes

| Date | Stage | Reason |
|---|---|---|
| 2026-05-24 | stable | initial STATUS.md (org lifecycle introduction) |

## Not planned

- **Agent trust certificate (ATC) verification.** No ATC work is planned in this repository: OASB does not verify ATC signatures, generate forged ATC fixtures or score a product on ATC validation. OASB evaluates security products against attack scenarios and does not handle real ATCs; the DVAA `atc-forgery-attack` scenario tests identity spoofing as social engineering, not at the protocol level.
