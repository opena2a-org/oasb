#!/usr/bin/env node
// Security Product Maturity page check.
//
// docs/shield-maturity-extension.md proposes the SM tests. This check holds
// what the page states to what the repository has:
//   1. every MITRE ATLAS technique ID the page writes (`AML.T0025`, or a
//      sub-technique such as `AML.T0034.002`) has a `### <ID> - <name>`
//      heading in docs/mitre-atlas-mapping.md, the page whose IDs and names
//      are verified against MITRE's published ATLAS.yaml, and an ID followed
//      by a parenthesis, `AML.T0025 (Exfiltration via Cyber Means)`, carries
//      the name of that heading;
//   2. while no test file (*.test.ts) exists under src/maturity, a line of
//      the page starts with `> **Status: proposal.**`, and each line that
//      speaks of Shield coverage says `not measured`;
//   3. once a test file exists under src/maturity, no line starts with
//      `> **Status: proposal.**`: the page then has results to state.
//
// Usage: node scripts/check-maturity-page.mjs [path/to/repo]
// Exit code 0 when every check passes (and for --help), 1 otherwise. Run by
// npm run test:scripts.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAGE = 'docs/shield-maturity-extension.md';
export const ATLAS_PAGE = 'docs/mitre-atlas-mapping.md';
export const TEST_DIR = 'src/maturity';
export const STATUS = '> **Status: proposal.**';
export const UNMEASURED = 'not measured';

const TECHNIQUE = 'AML\\.T\\d{4}(?:\\.\\d{3})?';
const ATLAS_HEADING = new RegExp(`^### (${TECHNIQUE}) - (.+?)\\s*$`);
// An ID as a page writes it, and the parenthesis after it when it has one.
const WRITTEN = new RegExp(`(${TECHNIQUE})(?: \\(([^)]*)\\))?`, 'g');
const COVERAGE = /shield coverage/i;

const USAGE = 'usage: node scripts/check-maturity-page.mjs [path/to/repo]';

function testFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

/** The name of each technique a mapping page has a heading for, by ID. */
export function atlasTechniques(text) {
  const names = new Map();
  for (const raw of text.split('\n')) {
    const h = raw.replace(/\r$/, '').match(ATLAS_HEADING);
    if (h) names.set(h[1], h[2]);
  }
  return names;
}

/** Every way the maturity page disagrees with the repository it is in. */
export function checkPage(root) {
  const pagePath = join(root, PAGE);
  if (!existsSync(pagePath)) return [`${PAGE} does not exist`];
  const lines = readFileSync(pagePath, 'utf8').split('\n').map((line) => line.replace(/\r$/, ''));
  const atlasPath = join(root, ATLAS_PAGE);
  const techniques = atlasTechniques(existsSync(atlasPath) ? readFileSync(atlasPath, 'utf8') : '');
  const tests = testFiles(join(root, TEST_DIR)).length;
  const fail = [];

  lines.forEach((line, i) => {
    for (const [, id, name] of line.matchAll(WRITTEN)) {
      if (!techniques.has(id)) {
        fail.push(`${PAGE}: line ${i + 1}: ${id} is not a technique of ${ATLAS_PAGE}`);
      } else if (name !== undefined && name !== techniques.get(id)) {
        fail.push(`${PAGE}: line ${i + 1}: ${id} is named "${techniques.get(id)}" in ${ATLAS_PAGE}, not "${name}"`);
      }
    }
  });

  const status = lines.some((line) => line.startsWith(STATUS));
  if (tests === 0) {
    if (!status) fail.push(`${PAGE}: no line starts with "${STATUS}", but ${TEST_DIR} has no test file`);
    lines.forEach((line, i) => {
      if (COVERAGE.test(line) && !line.includes(UNMEASURED)) {
        fail.push(`${PAGE}: line ${i + 1} states Shield coverage without "${UNMEASURED}", but ${TEST_DIR} has no test file`);
      }
    });
  } else if (status) {
    fail.push(`${PAGE}: a line starts with "${STATUS}", but ${TEST_DIR} has ${tests} test file${tests === 1 ? '' : 's'}: state what they measure`);
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
  const failures = checkPage(root);
  if (failures.length > 0) {
    for (const f of failures) console.error(`FAIL ${f}`);
    console.error(`${failures.length} maturity page problem${failures.length === 1 ? '' : 's'}`);
    process.exit(1);
  }
  console.log('Maturity page: every ATLAS technique it names is on the mapping page, and it states no coverage the repository cannot measure');
}
