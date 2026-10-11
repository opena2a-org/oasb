// Tests for scripts/check-owasp-mapping.mjs, the OWASP Agentic mapping check.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTIC, checkMapping, parseHeader, scenarioHeaders } from './check-owasp-mapping.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'check-owasp-mapping.mjs');
const repo = join(dirname(script), '..');

const FILES = {
  'src/atomic/process/AT-PROC-001.spawn.test.ts': '// OWASP Agentic: ASI05 (Unexpected Code Execution (RCE))',
  'src/integration/INT-001.exfil.test.ts': '// OWASP Agentic: ASI02 (Tool Misuse & Exploitation), ASI03 (Identity & Privilege Abuse)',
  'src/baseline/BL-001.profile.test.ts': '// OWASP Agentic: ASI10 (Rogue Agents)',
};

const SECTIONS = `## OWASP Top 10 for Agentic Applications (2026)

### ASI02 - Tool Misuse & Exploitation

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| INT-001 | Exfiltration | Integration |

### ASI03 - Identity & Privilege Abuse

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| INT-001 | Exfiltration | Integration |

### ASI05 - Unexpected Code Execution (RCE)

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| AT-PROC-001 | Spawn | Process |

### ASI10 - Rogue Agents

| Test ID | Scenario | Monitor |
|---------|----------|---------|
| BL-001 | Profile | Baseline |

### Agentic coverage summary

| ASI ID | Category | Scenario files |
|--------|----------|----------------|
| ASI02 | Tool Misuse & Exploitation | 1 |
| ASI03 | Identity & Privilege Abuse | 1 |
| ASI05 | Unexpected Code Execution (RCE) | 1 |
| ASI10 | Rogue Agents | 1 |

## OWASP Top 10 for LLM Applications (2025)

| LLM06 | Excessive Agency | 2 |

`;

const GAPS = ['ASI01', 'ASI04', 'ASI06', 'ASI07', 'ASI08', 'ASI09']
  .map((id) => `| ${id} | ${AGENTIC[id]} | No scenario |`)
  .join('\n');
const PAGE = `# OWASP Test Mapping\n\n${SECTIONS}## Gaps and Future Coverage\n\n| ASI ID | Category | Gap |\n|---|---|---|\n${GAPS}\n`;

// Write a small repository with FILES (header line, then code) and the page.
function fixture(files = FILES, page = PAGE) {
  const dir = mkdtempSync(join(tmpdir(), 'owasp-map-'));
  for (const [path, header] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), `// ${path.split('/').pop()}\n${header}\n//\n\nimport { it } from 'vitest';\n`);
  }
  if (page !== null) {
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', 'owasp-agentic-mapping.md'), page);
  }
  return dir;
}

function failures(files, page) {
  const dir = fixture(files, page);
  try {
    return checkMapping(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('every scenario file in this repository names its OWASP Agentic risk and the mapping page agrees', () => {
  const r = spawnSync(process.execPath, [script, repo], { encoding: 'utf8' });
  assert.equal(r.stderr, '');
  assert.equal(r.status, 0);
});

test('the lab report lists the Agentic IDs the scenarios name, with their published titles', () => {
  const report = readFileSync(join(repo, 'scripts', 'scenario-report.mjs'), 'utf8');
  const listed = Object.fromEntries([...report.matchAll(/'(ASI\d\d)': '([^']+)'/g)].map((m) => [m[1], m[2]]));
  const { mapped } = scenarioHeaders(repo);
  const named = [...new Set([...mapped.values()].flatMap((m) => m.ids))].sort();
  assert.deepEqual(Object.keys(listed).sort(), named);
  for (const [id, title] of Object.entries(listed)) assert.equal(title, AGENTIC[id], id);
});

test('a consistent fixture passes', () => {
  assert.deepEqual(failures(), []);
});

test('a scenario file without an OWASP Agentic line fails', () => {
  const files = { ...FILES, 'src/e2e/E2E-001.live.test.ts': '// OWASP: LLM02 (Sensitive Information Disclosure)' };
  assert.deepEqual(failures(files), ['src/e2e/E2E-001.live.test.ts: no "// OWASP Agentic:" line in its opening comment block (expected one)']);
});

test('an OWASP Agentic line after the opening comment block is not read', () => {
  const dir = fixture();
  try {
    const path = join(dir, 'src/baseline/BL-001.profile.test.ts');
    writeFileSync(path, "// BL-001\n\nimport { it } from 'vitest';\n// OWASP Agentic: ASI10 (Rogue Agents)\n");
    assert.deepEqual(checkMapping(dir), [
      'src/baseline/BL-001.profile.test.ts: no "// OWASP Agentic:" line in its opening comment block (expected one)',
      'docs/owasp-agentic-mapping.md: BL-001 is listed under ASI10 but no scenario file has that test ID and a valid header',
      'docs/owasp-agentic-mapping.md: the coverage summary has a row for ASI10, which no scenario names',
      'docs/owasp-agentic-mapping.md: ASI10 (Rogue Agents) has no scenario and is not in the gaps table',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an LLM Top 10 ID, an unknown ID or a wrong title in the header fails', () => {
  assert.deepEqual(parseHeader(' LLM06 (Excessive Agency)').problems, ['"LLM06 (Excessive Agency)" is not written as "ASIxx (<published title>)"']);
  assert.deepEqual(parseHeader(' ASI11 (Rogue Tools)').problems, ['ASI11 is not an ID of the OWASP Top 10 for Agentic Applications']);
  assert.deepEqual(parseHeader(' ASI05 (Unexpected Code Execution)').problems, ['ASI05 is titled "Unexpected Code Execution (RCE)", not "Unexpected Code Execution"']);
  assert.deepEqual(parseHeader(' ASI10 (Rogue Agents), ASI10 (Rogue Agents)').problems, ['ASI10 is named twice']);
  assert.deepEqual(parseHeader(' ASI03 (Identity & Privilege Abuse), ASI05 (Unexpected Code Execution (RCE))'), { ids: ['ASI03', 'ASI05'], problems: [] });
});

test('a scenario the page lists under another ID fails both ways', () => {
  const page = PAGE.replace('| AT-PROC-001 | Spawn | Process |', '| BL-001 | Spawn | Process |').replace('| BL-001 | Profile | Baseline |', '| AT-PROC-001 | Profile | Baseline |');
  assert.deepEqual(failures(FILES, page), [
    'docs/owasp-agentic-mapping.md: AT-PROC-001 names ASI05 in src/atomic/process/AT-PROC-001.spawn.test.ts but is not listed under ASI05',
    'docs/owasp-agentic-mapping.md: BL-001 is listed under ASI05, but src/baseline/BL-001.profile.test.ts does not name ASI05',
    'docs/owasp-agentic-mapping.md: BL-001 names ASI10 in src/baseline/BL-001.profile.test.ts but is not listed under ASI10',
    'docs/owasp-agentic-mapping.md: AT-PROC-001 is listed under ASI10, but src/atomic/process/AT-PROC-001.spawn.test.ts does not name ASI10',
  ]);
});

test('a wrong count in the coverage summary fails', () => {
  const page = PAGE.replace('| ASI10 | Rogue Agents | 1 |', '| ASI10 | Rogue Agents | 3 |');
  assert.deepEqual(failures(FILES, page), ['docs/owasp-agentic-mapping.md: the coverage summary should state 1 scenario file for ASI10, not 3']);
});

test('an ID with no scenario must be in the gaps table, and a mapped ID must not be', () => {
  const page = PAGE.replace(`| ASI09 | ${AGENTIC.ASI09} | No scenario |\n`, `| ASI10 | ${AGENTIC.ASI10} | No scenario |\n`);
  assert.deepEqual(failures(FILES, page), [
    'docs/owasp-agentic-mapping.md: ASI09 (Human-Agent Trust Exploitation) has no scenario and is not in the gaps table',
    'docs/owasp-agentic-mapping.md: ASI10 is in the gaps table, but BL-001 names it',
  ]);
});

test('a page without the Agentic section, or no page at all, fails', () => {
  const page = PAGE.replace('## OWASP Top 10 for Agentic Applications (2026)', '## Coverage by Category');
  const out = failures(FILES, page);
  assert.ok(out.includes('docs/owasp-agentic-mapping.md: no "## OWASP Top 10 for Agentic Applications" section'), out.join('\n'));
  assert.deepEqual(failures(FILES, null), ['docs/owasp-agentic-mapping.md does not exist']);
});

test('--help prints the usage and exits 0; an unknown flag exits 1', () => {
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^usage: node scripts\/check-owasp-mapping\.mjs \[path\/to\/repo\]$/m);
  const bad = spawnSync(process.execPath, [script, '--nope'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
});
