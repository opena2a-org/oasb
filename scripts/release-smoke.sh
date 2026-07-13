#!/usr/bin/env bash
# Release smoke test for @opena2a/oasb.
#
# Simulates a new user: clones the current HEAD into a temp directory with no
# sibling checkouts, installs from the lockfile, builds, runs the full suite,
# and cross-checks the live test totals against the counts the README claims.
# Also inspects the npm pack file list so a publish never ships without the
# README, LICENSE, or the harness sources.
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

echo "==> npm ci (lockfile install, registry deps only)"
npm ci --silent

echo "==> npm run build"
npm run build

echo "==> Full test suite with JSON reporter"
npx vitest run --reporter=json --outputFile="$TMP/results.json" >/dev/null

echo "==> Drift guard: live totals vs README claims"
node - "$TMP/results.json" "$ROOT/README.md" <<'EOF'
const fs = require('fs');
const [resultsPath, readmePath] = process.argv.slice(2);
const r = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const readme = fs.readFileSync(readmePath, 'utf8');

const total = r.numTotalTests;
const passed = r.numPassedTests;
const skipped = r.numPendingTests;
const benchmarkTests = r.testResults
  .filter(t => /\/src\/benchmark\//.test(t.name))
  .reduce((s, t) => s + t.assertionResults.length, 0);
const scenarios = total - benchmarkTests;

const claimTotal = Number((readme.match(/runs \*\*(\d+) tests\*\*/) || [])[1]);
const claimScenarios = Number((readme.match(/\*\*(\d+) attack scenarios\*\*/) || [])[1]);
const claimBadge = Number((readme.match(/tests-(\d+)%20passing/) || [])[1]);

const fail = (msg) => { console.error('DRIFT: ' + msg); process.exitCode = 1; };

if (!claimTotal || !claimScenarios || !claimBadge)
  fail('could not parse README claims (total=' + claimTotal + ', scenarios=' + claimScenarios + ', badge=' + claimBadge + ') - update the regexes if the wording changed');
if (claimTotal && total !== claimTotal)
  fail('npm test total is ' + total + ' but README claims ' + claimTotal);
if (claimScenarios && scenarios !== claimScenarios)
  fail('attack-scenario count is ' + scenarios + ' (total ' + total + ' - ' + benchmarkTests + ' scoring-engine tests) but README claims ' + claimScenarios);
if (claimBadge && passed < claimBadge)
  fail('passing count is ' + passed + ' but README badge claims ' + claimBadge);

console.log('   total=' + total + ' passed=' + passed + ' skipped=' + skipped +
  ' scenarios=' + scenarios + ' scoring-engine=' + benchmarkTests);
if (process.exitCode) process.exit(process.exitCode);
console.log('   README claims match the live suite.');
EOF

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

echo "==> Release smoke PASSED"
