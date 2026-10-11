// Tests for scripts/check-maturity-page.mjs, the Security Product Maturity
// page check.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATLAS_PAGE, PAGE, STATUS, atlasTechniques, checkPage } from './check-maturity-page.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'check-maturity-page.mjs');
const repo = join(dirname(script), '..');

const ATLAS = `# MITRE ATLAS Test Mapping

### AML.T0034.002 - Agentic Resource Consumption

### AML.T0025 - Exfiltration via Cyber Means

### AML.T0015 - Evade AI Model

## Coverage Summary

| Evade AI Model | AML.T0015 | 2 |
`;

const PROPOSAL = `# OASB Extension: Security Product Maturity Scorecard

${STATUS} No SM test exists yet. The Shield coverage below is not measured.

### SM-SIGN: Artifact Signing (6 tests)

**Expected Shield coverage (not measured):** all 6, via \`signing.ts\`.

## Summary

| Category | Tests | Expected Shield coverage (not measured) |
|----------|-------|----------------|
| SM-SIGN: Artifact Signing | 6 | 6/6 |

## MITRE ATLAS Mapping

The SM categories are not mapped to MITRE ATLAS techniques.
`;

// The mapping table the page carried, under names ATLAS does not give the IDs.
const MAPPED = `${PROPOSAL}
| Category | ATLAS Technique |
|----------|----------------|
| SM-LOG | AML.T0006 (Audit Log Manipulation) |
| SM-SIGN | AML.T0024 (Supply Chain Compromise) |
| SM-SESSION | AML.T0043 (Shadow AI Discovery) |
| SM-POLICY | AML.T0040 (Policy Evasion) |
| SM-HEAL | AML.T0011 (Security Product Disablement) |
| SM-LLM | AML.T0015 (Automated Triage) |
| SM-CRED | AML.T0025 (Credential Theft) |
| SM-ENV | AML.T0007 (Discovery) |
`;

// Write a small repository: the two pages, and the named files under src/.
function fixture(page = PROPOSAL, { atlas = ATLAS, files = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'maturity-page-'));
  mkdirSync(join(dir, 'docs'));
  if (page !== null) writeFileSync(join(dir, PAGE), page);
  if (atlas !== null) writeFileSync(join(dir, ATLAS_PAGE), atlas);
  for (const path of files) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), "import { it } from 'vitest';\n");
  }
  return dir;
}

function failures(page, options) {
  const dir = fixture(page, options);
  try {
    return checkPage(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const line = (page, text) => page.split('\n').findIndex((l) => l.includes(text)) + 1;

test('the maturity page in this repository passes', () => {
  const r = spawnSync(process.execPath, [script, repo], { encoding: 'utf8' });
  assert.equal(r.stderr, '');
  assert.equal(r.status, 0);
});

test('a consistent fixture passes', () => {
  assert.deepEqual(failures(), []);
});

test('the mapping page gives each technique its name by its heading', () => {
  assert.deepEqual([...atlasTechniques(ATLAS)], [
    ['AML.T0034.002', 'Agentic Resource Consumption'],
    ['AML.T0025', 'Exfiltration via Cyber Means'],
    ['AML.T0015', 'Evade AI Model'],
  ]);
  assert.deepEqual([...atlasTechniques('### AML.T0015 - Evade AI Model  \r\n')], [['AML.T0015', 'Evade AI Model']]);
});

test('an ID the mapping page does not list fails, and so does a listed ID under another name', () => {
  const at = (text) => `${PAGE}: line ${line(MAPPED, text)}`;
  assert.deepEqual(failures(MAPPED), [
    `${at('SM-LOG ')}: AML.T0006 is not a technique of ${ATLAS_PAGE}`,
    `${at('SM-SIGN ')}: AML.T0024 is not a technique of ${ATLAS_PAGE}`,
    `${at('SM-SESSION ')}: AML.T0043 is not a technique of ${ATLAS_PAGE}`,
    `${at('SM-POLICY ')}: AML.T0040 is not a technique of ${ATLAS_PAGE}`,
    `${at('SM-HEAL ')}: AML.T0011 is not a technique of ${ATLAS_PAGE}`,
    `${at('SM-LLM ')}: AML.T0015 is named "Evade AI Model" in ${ATLAS_PAGE}, not "Automated Triage"`,
    `${at('SM-CRED ')}: AML.T0025 is named "Exfiltration via Cyber Means" in ${ATLAS_PAGE}, not "Credential Theft"`,
    `${at('SM-ENV ')}: AML.T0007 is not a technique of ${ATLAS_PAGE}`,
  ]);
});

test('a listed ID passes with its name or with none, and every ID on a line is read', () => {
  const named = `${PROPOSAL}\nSM-CRED audits what AML.T0025 (Exfiltration via Cyber Means) and AML.T0015 use.\n`;
  assert.deepEqual(failures(named), []);
  const two = `${PROPOSAL}\nSee AML.T0025 (Exfiltration) and AML.T0055.\n`;
  const n = line(two, 'See AML');
  assert.deepEqual(failures(two), [
    `${PAGE}: line ${n}: AML.T0025 is named "Exfiltration via Cyber Means" in ${ATLAS_PAGE}, not "Exfiltration"`,
    `${PAGE}: line ${n}: AML.T0055 is not a technique of ${ATLAS_PAGE}`,
  ]);
});

test('a sub-technique is read whole, and a tactic ID is not read as a technique', () => {
  const page = `${PROPOSAL}\nAML.T0034.002 (Agentic Resource Consumption) counters Impact, AML.TA0011.\n`;
  assert.deepEqual(failures(page), []);
  const parent = `${PROPOSAL}\nAML.T0034 (Agentic Resource Consumption)\n`;
  assert.deepEqual(failures(parent), [`${PAGE}: line ${line(parent, 'AML.T0034')}: AML.T0034 is not a technique of ${ATLAS_PAGE}`]);
});

test('without the mapping page, every ID the page writes fails', () => {
  const page = `${PROPOSAL}\nAML.T0015 (Evade AI Model)\n`;
  assert.deepEqual(failures(page, { atlas: null }), [`${PAGE}: line ${line(page, 'AML.T0015')}: AML.T0015 is not a technique of ${ATLAS_PAGE}`]);
});

test('while src/maturity has no test file, the page must say it is a proposal', () => {
  const page = PROPOSAL.replace(STATUS, 'Status: proposal.');
  assert.deepEqual(failures(page), [`${PAGE}: no line starts with "${STATUS}", but src/maturity has no test file`]);
  // A file that is not a test does not make the tests exist.
  assert.deepEqual(failures(page, { files: ['src/maturity/README.md', 'src/harness/shield-wrapper.ts'] }), [
    `${PAGE}: no line starts with "${STATUS}", but src/maturity has no test file`,
  ]);
});

test('while src/maturity has no test file, a line that states Shield coverage as a result fails', () => {
  const page = PROPOSAL.replace('**Expected Shield coverage (not measured):** all 6, via', '**Shield coverage:** All 6 pass today via').replace(
    '| Category | Tests | Expected Shield coverage (not measured) |',
    '| Category | Tests | Shield Coverage |',
  );
  assert.deepEqual(failures(page), [
    `${PAGE}: line ${line(page, 'pass today')} states Shield coverage without "not measured", but src/maturity has no test file`,
    `${PAGE}: line ${line(page, '| Shield Coverage |')} states Shield coverage without "not measured", but src/maturity has no test file`,
  ]);
});

test('once src/maturity has a test file, the page may state coverage and must not say it is a proposal', () => {
  const files = ['src/maturity/signing/SM-SIGN-001.sign-artifact.test.ts'];
  assert.deepEqual(failures(PROPOSAL, { files }), [
    `${PAGE}: a line starts with "${STATUS}", but src/maturity has 1 test file: state what they measure`,
  ]);
  const measured = PROPOSAL.replace(`${STATUS} No SM test exists yet. The Shield coverage below is not measured.`, '').replace(
    '**Expected Shield coverage (not measured):** all 6, via',
    '**Shield coverage:** SM-SIGN-001 passes via',
  );
  assert.deepEqual(failures(measured, { files }), []);
  assert.deepEqual(failures(PROPOSAL, { files: [...files, 'src/maturity/SM-LOG-001.hash-chain.test.ts'] }), [
    `${PAGE}: a line starts with "${STATUS}", but src/maturity has 2 test files: state what they measure`,
  ]);
});

test('no page at all fails', () => {
  assert.deepEqual(failures(null), [`${PAGE} does not exist`]);
});

test('--help prints the usage and exits 0; an unknown flag exits 1', () => {
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^usage: node scripts\/check-maturity-page\.mjs \[path\/to\/repo\]$/m);
  const bad = spawnSync(process.execPath, [script, '--nope'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
});

test('a failing page is reported on stderr with a count, and exits 1', () => {
  const dir = fixture(MAPPED);
  try {
    const r = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /^FAIL docs\/shield-maturity-extension\.md: line \d+: AML\.T0006 is not a technique of docs\/mitre-atlas-mapping\.md$/m);
    assert.match(r.stderr, /^8 maturity page problems$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
