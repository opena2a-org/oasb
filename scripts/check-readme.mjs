#!/usr/bin/env node
// README layout and link check.
//
// Guards the first screen a visitor sees and the links that hold the README
// together after content moves into docs/:
//   1. the README stays under MAX_LINES lines;
//   2. the first H2 is "Quick Start" and starts before line QUICK_START_BY;
//   3. a fenced code block with a runnable command starts before line COMMAND_BY;
//   4. each relative link the check reads resolves to a file in the
//      repository, and an #anchor in a link to a .md file resolves to a
//      heading in that file. The check reads three forms, each written within
//      one line: inline `[text](target)` with an optional double-quoted title,
//      a reference definition `[label]: target` at the start of a line
//      (indented at most three spaces), and a quoted HTML `href="target"` or
//      `href='target'` attribute. Other forms, such as an unquoted href or a
//      definition inside a list item, are not read.
//
// Usage: node scripts/check-readme.mjs [path/to/README.md]
// Exit code 0 when every check passes, 1 otherwise. Run by npm run smoke.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_LINES = 400;
const QUICK_START_BY = 25;
const COMMAND_BY = 30;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readmePath = resolve(process.argv[2] || join(root, 'README.md'));

const failures = [];
const fail = (msg) => failures.push(msg);

// Split a markdown file into lines, tagging each with whether it sits inside a
// fenced code block, so headings and links are only read from prose.
function parse(text) {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  let fence = null;
  return lines.map((line, i) => {
    const marker = line.match(/^\s*(```+|~~~+)/);
    if (marker) {
      if (fence === null) {
        fence = marker[1][0];
        return { n: i + 1, line, fenceOpen: true, inFence: false };
      }
      if (marker[1][0] === fence) {
        fence = null;
        return { n: i + 1, line, fenceClose: true, inFence: false };
      }
    }
    return { n: i + 1, line, inFence: fence !== null };
  });
}

// GitHub heading anchor: lowercase, drop punctuation except - and _, spaces to -.
function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function anchors(lines) {
  const seen = new Map();
  const out = new Set();
  for (const { line, inFence } of lines) {
    if (inFence) continue;
    const h = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!h) continue;
    const base = slug(h[1]);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    out.add(count === 0 ? base : `${base}-${count}`);
  }
  return out;
}

const readme = parse(readFileSync(readmePath, 'utf8'));

// 1. Length budget.
if (readme.length >= MAX_LINES) {
  fail(`README has ${readme.length} lines; the budget is under ${MAX_LINES}. Move reference detail into docs/ and link to it.`);
}

// 2. Quick Start is the first H2 and sits near the top.
const firstH2 = readme.find((l) => !l.inFence && /^##\s/.test(l.line));
if (!firstH2) {
  fail('README has no H2 heading; the first one must be "## Quick Start".');
} else {
  const title = firstH2.line.replace(/^##\s+/, '').trim();
  if (title !== 'Quick Start') {
    fail(`first H2 is "${title}" at line ${firstH2.n}; it must be "Quick Start".`);
  } else if (firstH2.n >= QUICK_START_BY) {
    fail(`"## Quick Start" is at line ${firstH2.n}; it must start before line ${QUICK_START_BY}.`);
  }
}

// 3. A runnable command appears before line COMMAND_BY.
let commandLine = null;
for (let i = 0; i < readme.length && commandLine === null; i++) {
  if (!readme[i].fenceOpen || readme[i].n >= COMMAND_BY) continue;
  const lang = readme[i].line.replace(/^\s*(```+|~~~+)/, '').trim().toLowerCase();
  if (lang && !['bash', 'sh', 'shell', 'console', 'zsh'].includes(lang)) continue;
  for (let j = i + 1; j < readme.length && readme[j].inFence; j++) {
    const cmd = readme[j].line.trim().replace(/^\$\s*/, '');
    if (cmd && !cmd.startsWith('#')) {
      if (readme[j].n < COMMAND_BY) commandLine = readme[j].n;
      break;
    }
  }
}
if (commandLine === null) {
  fail(`no shell code block with a command starts before line ${COMMAND_BY}; the first screen must show the first command to run.`);
}

// 4. Relative links and anchors resolve.
const anchorCache = new Map();
function anchorsOf(file) {
  if (!anchorCache.has(file)) anchorCache.set(file, anchors(parse(readFileSync(file, 'utf8'))));
  return anchorCache.get(file);
}

// Link targets on one prose line: inline [text](target), a reference
// definition [label]: target (footnotes [^1]: are not links), and HTML
// href="target" / href='target'.
function linkTargets(prose) {
  const targets = [...prose.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1]);
  const def = prose.match(/^ {0,3}\[(?!\^)[^\]]+\]:\s*(?:<([^>\s]+)>|(\S+))/);
  if (def) targets.push(def[1] || def[2]);
  for (const m of prose.matchAll(/<[a-z][^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    targets.push(m[1] ?? m[2]);
  }
  return targets;
}

for (const { n, line, inFence } of readme) {
  if (inFence) continue;
  const prose = line.replace(/`[^`]*`/g, '');
  for (const target of linkTargets(prose)) {
    if (!target) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http:, https:, mailto:
    const [pathPart, anchor] = target.split('#');
    const file = pathPart ? resolve(dirname(readmePath), decodeURIComponent(pathPart)) : readmePath;
    if (!existsSync(file)) {
      fail(`line ${n}: link target "${target}" does not exist.`);
      continue;
    }
    if (anchor && /\.md$/i.test(file) && !anchorsOf(file).has(decodeURIComponent(anchor).toLowerCase())) {
      fail(`line ${n}: anchor "#${anchor}" has no matching heading in ${pathPart || 'README.md'}.`);
    }
  }
}

if (failures.length) {
  for (const f of failures) console.error('README: ' + f);
  process.exit(1);
}
console.log(`   README: ${readme.length} lines, Quick Start at line ${firstH2.n}, first command at line ${commandLine}, links resolve.`);
