#!/usr/bin/env bash
# Release smoke test for @opena2a/oasb.
#
# Simulates a new user: clones the current HEAD into a temp directory with no
# sibling checkouts, installs from the lockfile, builds, runs the full suite,
# and compares every test count the README states with the live suite.
# Checks the README layout (Quick Start first, under 400 lines) and its links.
# Also inspects the npm pack file list so a publish never ships without the
# README, LICENSE, or the harness sources. Last, runs the commands the README
# documents and holds them to what it says: OASB_ADAPTER by name and by a
# relative path, and the library example in a fresh install of the tarball.
#
# Run before every release: npm run smoke
# Documented in docs/testing/release-smoke.md

set -euo pipefail

ROOT=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "==> Fresh clone of HEAD into $TMP/oasb (no sibling checkouts)"
git clone --quiet "$ROOT" "$TMP/oasb"
cd "$TMP/oasb"

echo "==> README layout and link check"
# vitest is not installed yet; the drift guard below compares the test counts
# with the suite's report once it has run.
node scripts/check-readme.mjs --no-counts

echo "==> npm ci (lockfile install, registry deps only)"
npm ci --silent

echo "==> Tests in scripts/: the README checks, the changelog width and the scenario tests' capability gating (these use vitest)"
npm run test:scripts

echo "==> npm run build"
npm run build

echo "==> Full test suite with JSON reporter"
npx vitest run --reporter=json --outputFile="$TMP/results.json" >/dev/null

echo "==> Drift guard: every README test count vs the live suite"
node scripts/check-test-counts.mjs "$TMP/results.json" "$ROOT/README.md"

echo "==> Pack check: required files present in the publish tarball"
node - <<'EOF'
const { execSync } = require('child_process');
const out = JSON.parse(execSync('npm pack --dry-run --json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }));
const files = out[0].files.map(f => f.path);
const required = ['README.md', 'LICENSE', 'package.json'];
const requiredPrefixes = ['dist/', 'src/harness/', 'config/'];
let ok = true;
for (const f of required) if (!files.includes(f)) { console.error('PACK: missing ' + f); ok = false; }
for (const p of requiredPrefixes) if (!files.some(f => f.startsWith(p))) { console.error('PACK: nothing under ' + p); ok = false; }
const forbidden = files.filter(f => /^(\.env|.*\.pem|.*\.key|CLAUDE\.md|\.claude\/)/.test(f));
if (forbidden.length) { console.error('PACK: forbidden files: ' + forbidden.join(', ')); ok = false; }
if (!ok) process.exit(1);
console.log('   ' + files.length + ' files, required entries present, no forbidden files.');
EOF

echo "==> Documented commands: OASB_ADAPTER=llm-guard, OASB_ADAPTER=<relative path>, the README library example in a fresh install"
node scripts/check-documented-commands.mjs

echo "==> Release smoke PASSED"
