#!/usr/bin/env node
// OWASP Top 10 for Agentic Applications mapping check.
//
// The package description and the README say each attack scenario is mapped
// to the OWASP Top 10 for Agentic Applications (2026). This check holds the
// scenario files and docs/owasp-agentic-mapping.md to that claim:
//   1. every scenario file (a *.test.ts under src/atomic, src/integration,
//      src/baseline or src/e2e) has exactly one `// OWASP Agentic:` line in
//      the comment block it starts with, naming one or more published IDs,
//      each written with its published title: `ASI01 (Agent Goal Hijack)`;
//   2. the page's Agentic section has a `### ASIxx - <title>` heading for
//      each ID, and its tables list each scenario under exactly the IDs its
//      header names;
//   3. the Agentic coverage summary has one row per mapped ID, stating the
//      number of scenario files mapped to it;
//   4. each published ID that no scenario names is a row of the gaps table,
//      and no mapped ID is.
//
// Usage: node scripts/check-owasp-mapping.mjs [path/to/repo]
// Exit code 0 when every check passes (and for --help), 1 otherwise. Run by
// npm run test:scripts.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIO_DIRS } from './readme-counts.mjs';

// The OWASP Top 10 for Agentic Applications for 2026, published 2025-12-09:
// https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
export const AGENTIC = {
  ASI01: 'Agent Goal Hijack',
  ASI02: 'Tool Misuse & Exploitation',
  ASI03: 'Identity & Privilege Abuse',
  ASI04: 'Agentic Supply Chain Vulnerabilities',
  ASI05: 'Unexpected Code Execution (RCE)',
  ASI06: 'Memory & Context Poisoning',
  ASI07: 'Insecure Inter-Agent Communication',
  ASI08: 'Cascading Failures',
  ASI09: 'Human-Agent Trust Exploitation',
  ASI10: 'Rogue Agents',
};

export const PAGE = 'docs/owasp-agentic-mapping.md';
const HEADER = '// OWASP Agentic:';
const AGENTIC_SECTION = /^## OWASP Top 10 for Agentic Applications\b/;
const GAPS_SECTION = /^## Gaps and Future Coverage\s*$/;
const TEST_ID = /^(AT-[A-Z]+-\d+|INT-\d+|BL-\d+|E2E-\d+)$/;

const USAGE = 'usage: node scripts/check-owasp-mapping.mjs [path/to/repo]';

function testFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

/** The IDs a header value names, or the problems with it. */
export function parseHeader(value) {
  const parts = value.trim().split(/,\s*(?=ASI\d)/);
  const ids = [];
  const problems = [];
  for (const part of parts) {
    const m = part.match(/^(ASI\d\d) \((.*)\)$/);
    if (!m) {
      problems.push(`"${part}" is not written as "ASIxx (<published title>)"`);
    } else if (!(m[1] in AGENTIC)) {
      problems.push(`${m[1]} is not an ID of the OWASP Top 10 for Agentic Applications`);
    } else if (m[2] !== AGENTIC[m[1]]) {
      problems.push(`${m[1]} is titled "${AGENTIC[m[1]]}", not "${m[2]}"`);
    } else if (ids.includes(m[1])) {
      problems.push(`${m[1]} is named twice`);
    } else {
      ids.push(m[1]);
    }
  }
  return { ids, problems };
}

/** Each scenario file's test ID and the Agentic IDs its header names. */
export function scenarioHeaders(root) {
  const fail = [];
  const mapped = new Map();
  const files = SCENARIO_DIRS.flatMap((dir) => testFiles(join(root, dir))).sort();
  for (const file of files) {
    const rel = file.slice(root.length + 1);
    const id = basename(file).split('.')[0];
    if (!TEST_ID.test(id)) {
      fail.push(`${rel}: the file name does not start with a test ID`);
      continue;
    }
    const lines = readFileSync(file, 'utf8').split('\n');
    const block = [];
    for (const line of lines) {
      if (!line.startsWith('//')) break;
      block.push(line.replace(/\r$/, ''));
    }
    const headers = block.filter((line) => line.startsWith(HEADER));
    if (headers.length !== 1) {
      const found = headers.length === 0 ? `no "${HEADER}" line` : `${headers.length} "${HEADER}" lines`;
      fail.push(`${rel}: ${found} in its opening comment block (expected one)`);
      continue;
    }
    const { ids, problems } = parseHeader(headers[0].slice(HEADER.length));
    for (const p of problems) fail.push(`${rel}: ${p}`);
    if (problems.length === 0) {
      if (mapped.has(id)) fail.push(`${rel}: test ID ${id} is used by another scenario file too`);
      mapped.set(id, { file: rel, ids });
    }
  }
  if (files.length === 0) fail.push(`no scenario files under ${SCENARIO_DIRS.join(', ')}`);
  return { mapped, fail };
}

/** The test IDs, summary counts and gaps the page states, by Agentic ID. */
export function pageMapping(text) {
  const fail = [];
  const listed = new Map(); // ASI ID -> Set of test IDs
  const summary = new Map(); // ASI ID -> stated count
  const gaps = new Set();
  let section = null;
  let current = null;
  let sawAgentic = false;
  let sawGaps = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('## ')) {
      section = AGENTIC_SECTION.test(line) ? 'agentic' : GAPS_SECTION.test(line) ? 'gaps' : null;
      sawAgentic ||= section === 'agentic';
      sawGaps ||= section === 'gaps';
      current = null;
      continue;
    }
    if (section === 'agentic' && line.startsWith('### ')) {
      const h = line.match(/^### (ASI\d\d) - (.+?)\s*$/);
      current = null;
      if (h) {
        if (!(h[1] in AGENTIC)) fail.push(`${PAGE}: heading "${line}" names an unknown ID`);
        else if (h[2] !== AGENTIC[h[1]]) fail.push(`${PAGE}: ${h[1]} is titled "${AGENTIC[h[1]]}", not "${h[2]}"`);
        else if (listed.has(h[1])) fail.push(`${PAGE}: ${h[1]} has two headings`);
        else listed.set((current = h[1]), new Set());
      }
      continue;
    }
    const cells = line.match(/^\|(.*)\|\s*$/)?.[1].split('|').map((c) => c.trim());
    if (!cells) continue;
    if (section === 'agentic' && current && TEST_ID.test(cells[0])) {
      if (listed.get(current).has(cells[0])) fail.push(`${PAGE}: ${cells[0]} is listed twice under ${current}`);
      listed.get(current).add(cells[0]);
    } else if (section === 'agentic' && !current && /^ASI\d\d$/.test(cells[0])) {
      if (cells[1] !== AGENTIC[cells[0]]) fail.push(`${PAGE}: the summary row for ${cells[0]} reads "${cells[1]}", not "${AGENTIC[cells[0]] ?? 'a published title'}"`);
      if (!/^\d+$/.test(cells[2] ?? '')) fail.push(`${PAGE}: the summary row for ${cells[0]} states no file count`);
      else summary.set(cells[0], Number(cells[2]));
    } else if (section === 'gaps' && /^ASI\d\d$/.test(cells[0])) {
      if (cells[1] !== AGENTIC[cells[0]]) fail.push(`${PAGE}: the gaps row for ${cells[0]} reads "${cells[1]}", not "${AGENTIC[cells[0]] ?? 'a published title'}"`);
      gaps.add(cells[0]);
    }
  }
  if (!sawAgentic) fail.push(`${PAGE}: no "## OWASP Top 10 for Agentic Applications" section`);
  if (!sawGaps) fail.push(`${PAGE}: no "## Gaps and Future Coverage" section`);
  return { listed, summary, gaps, fail };
}

/** Every way the headers and the page disagree with each other or the list. */
export function checkMapping(root) {
  const { mapped, fail } = scenarioHeaders(root);
  const pagePath = join(root, PAGE);
  if (!existsSync(pagePath)) return [...fail, `${PAGE} does not exist`];
  const page = pageMapping(readFileSync(pagePath, 'utf8'));
  fail.push(...page.fail);

  const byAgentic = new Map();
  for (const [testId, { ids }] of mapped) {
    for (const asi of ids) {
      if (!byAgentic.has(asi)) byAgentic.set(asi, new Set());
      byAgentic.get(asi).add(testId);
    }
  }
  for (const asi of Object.keys(AGENTIC)) {
    const want = byAgentic.get(asi) ?? new Set();
    const have = page.listed.get(asi);
    const naming = `${[...want].join(', ')} ${want.size === 1 ? 'names' : 'name'}`;
    if (want.size > 0 && !have) {
      fail.push(`${PAGE}: no "### ${asi} - ${AGENTIC[asi]}" section, but ${naming} ${asi}`);
      continue;
    }
    for (const testId of want) {
      if (!have.has(testId)) fail.push(`${PAGE}: ${testId} names ${asi} in ${mapped.get(testId).file} but is not listed under ${asi}`);
    }
    for (const testId of have ?? []) {
      if (!mapped.has(testId)) fail.push(`${PAGE}: ${testId} is listed under ${asi} but no scenario file has that test ID and a valid header`);
      else if (!want.has(testId)) fail.push(`${PAGE}: ${testId} is listed under ${asi}, but ${mapped.get(testId).file} does not name ${asi}`);
    }
    if (want.size > 0 && page.summary.get(asi) !== want.size) {
      fail.push(`${PAGE}: the coverage summary should state ${want.size} scenario file${want.size === 1 ? '' : 's'} for ${asi}, not ${page.summary.get(asi) ?? 'nothing'}`);
    }
    if (want.size === 0 && page.summary.has(asi)) fail.push(`${PAGE}: the coverage summary has a row for ${asi}, which no scenario names`);
    if (want.size === 0 && !page.gaps.has(asi)) fail.push(`${PAGE}: ${asi} (${AGENTIC[asi]}) has no scenario and is not in the gaps table`);
    if (want.size > 0 && page.gaps.has(asi)) fail.push(`${PAGE}: ${asi} is in the gaps table, but ${naming} it`);
  }
  return fail;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }
  if (args.length > 1 || args.some((a) => a.startsWith('-'))) {
    console.error(USAGE);
    process.exit(1);
  }
  const root = resolve(args[0] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const failures = checkMapping(root);
  if (failures.length > 0) {
    for (const f of failures) console.error(`FAIL ${f}`);
    console.error(`${failures.length} OWASP Agentic mapping problem${failures.length === 1 ? '' : 's'}`);
    process.exit(1);
  }
  console.log('OWASP Agentic mapping: every scenario file names its risk, and the mapping page agrees');
}
