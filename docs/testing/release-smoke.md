# Release smoke test

Run before every release (tag push), after the version bump commit:

```bash
npm run smoke
```

The script (`scripts/release-smoke.sh`) simulates a first-time user and guards
the claims this repository publishes:

1. **Fresh-clone install.** Clones the current HEAD into a temp directory with
   no sibling checkouts and runs `npm ci`. Catches dependencies that only
   resolve because of local state (a sibling `../arp` checkout, a stale
   `node_modules`, an unpinned range that drifted from the measured version).
   Before installing, `scripts/check-readme.mjs` (also `npm run check:readme`)
   checks the README layout: under 400 lines, "Quick Start" is the first H2
   and starts before line 25, a shell command appears before line 30, and
   the relative links it reads resolve. It reads three link forms, each
   written within one line: inline links (`[text](path)`, with an optional
   double-quoted title), reference definitions at the start of a line
   (`[label]: path`) and quoted HTML `href` attributes. It checks a `#anchor`
   only in links to `.md` files. Other forms, such as an unquoted `href` or a
   definition inside a list item, are not checked. The checker's own tests
   (`npm run test:scripts`) run first. Reference detail belongs in `docs/`
   (for example `docs/test-catalog.md`), linked from the README.
2. **Build + full suite.** `npm run build` then the complete vitest run,
   including E2E. One test (E2E-003) may skip on machines without `lsof`/`ss`;
   the guard tolerates environment skips but not failures.
3. **README count drift guard.** Parses the live totals from the JSON reporter
   and cross-checks three numbers the README claims: the `npm test` total, the
   attack-scenario count (total minus `src/benchmark` scoring-engine tests),
   and the passing-count badge. Any mismatch fails the smoke. If you add or
   remove tests, update the README in the same change or this gate blocks the
   release - that is the point.
4. **Pack check.** `npm pack --dry-run` must include README.md, LICENSE,
   `dist/`, `src/harness/`, and `config/`, and must not include credential
   files or assistant config.

## Why these guards exist

- 2026-07-13: the README's "244 passing" claim and the published benchmark's
  "measured on hackmyagent 0.23.8" were both verified only by hand; the
  package.json range (`^0.17.9`) actually installed a year-old hackmyagent on
  fresh clones, so the canonical checkout could not reproduce the published
  scanner numbers. The exact pin plus this smoke keep the repo reproducible.
- The v0.3.2 release failed at publish time (Trusted Publishing not yet
  configured) after CI tests passed - the smoke does not replace the tag-push
  gate, it feeds it. Publishing is still: smoke -> version bump -> tag push
  (GHA publishes via OIDC) -> verify `npm view @opena2a/oasb
  dist.attestations`.

## Scanner benchmark numbers (separate from this smoke)

The published F1/precision/recall/FPR figures in BENCHMARK-RESULTS.md are
produced by `scripts/run-benchmark-v2.ts --categorized-only` on the pinned
hackmyagent version. Re-run that command when bumping the hackmyagent pin and
update BENCHMARK-RESULTS.md + README in the same change; do not bump the pin
without re-measuring.
