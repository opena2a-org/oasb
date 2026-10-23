// Tests for the OASB-1 checklist: the page docs/oasb-1-checklist.md and the
// command that prints it, `npx @opena2a/oasb checklist` (bin/oasb.mjs,
// bin/checklist.mjs and the controls in bin/oasb-1-checklist.json).
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.
//
// The command is run as `node bin/oasb.mjs checklist` from an empty
// temporary directory. The page is read as text: a control is a ### heading
// under the ## heading of a level, with the lines below it, and each is held
// equal to the control the command prints as JSON and as text.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CHECKLIST_USAGE, levelsUpTo, loadChecklist } from '../bin/checklist.mjs';
import { scenarioFiles } from '../bin/run-scenario.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'docs/oasb-1-checklist.md';
const read = (path) => readFileSync(join(repo, path), 'utf8');

/** Runs `node bin/oasb.mjs checklist <args>` from an empty temporary directory. */
function checklist(args = []) {
  const cwd = mkdtempSync(join(tmpdir(), 'oasb-checklist-'));
  try {
    return spawnSync(process.execPath, [join(repo, 'bin', 'oasb.mjs'), 'checklist', ...args], { cwd, encoding: 'utf8' });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

/** The JSON the command prints with `args` and --json. */
function checklistJson(args = []) {
  const r = checklist([...args, '--json']);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

const PAGE_FIELDS = { '**Requirement:** ': 'requirement', '**Ask the vendor:** ': 'question', '**Command:** ': 'note' };

/**
 * The levels of the page, each with its heading and controls. A line under
 * a control that is none of its parts is kept in `unread`.
 */
export function parsePage(text) {
  const levels = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let level = null;
  let control = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if ((m = /^## (L\d) /.exec(line))) {
      level = { id: m[1], heading: line.slice(3), controls: [] };
      levels.push(level);
      control = null;
    } else if (line.startsWith('## ')) {
      level = null;
      control = null;
    } else if (level && (m = /^### (\d+\.\d+) (.+)$/.exec(line))) {
      control = { id: m[1], name: m[2], level: level.id, steps: [], command: null, unread: [] };
      level.controls.push(control);
    } else if (!control || line === '' || line === '**How to verify:**') {
      continue;
    } else if (line === '```bash' && lines[i + 2] === '```') {
      control.command = lines[i + 1];
      i += 2;
    } else if ((m = /^\*\*Category:\*\* (.+)\. \*\*Verification:\*\* (\S+)\.$/.exec(line))) {
      control.category = m[1];
      control.verification = m[2];
    } else if ((m = /^(\d+)\. (.+)$/.exec(line)) && Number(m[1]) === control.steps.length + 1) {
      control.steps.push(m[2]);
    } else {
      const field = Object.keys(PAGE_FIELDS).find((f) => line.startsWith(f));
      if (field) control[PAGE_FIELDS[field]] = line.slice(field.length);
      else control.unread.push(line);
    }
  }
  return levels;
}

/**
 * The levels of the command's text output, as parsePage returns them. The
 * lines a field wraps onto are joined with a space, as the command breaks
 * them at one.
 */
export function parseText(text) {
  const levels = [];
  let level = null;
  let control = null;
  let field = null;
  const raw = new Map();
  for (const line of text.split('\n')) {
    let m;
    if ((m = /^(L\d) \S+: \d+ controls?$/.exec(line))) {
      level = { id: m[1], heading: line, controls: [] };
      levels.push(level);
      control = null;
    } else if (level && (m = /^(\d+\.\d+) (.+)$/.exec(line))) {
      control = { id: m[1], name: m[2], level: level.id, steps: [], command: null, unread: [] };
      raw.set(control, {});
      level.controls.push(control);
      field = null;
    } else if (!control || line === '') {
      continue;
    } else if ((m = /^ {4}(Category|Requirement|Ask the vendor|How to verify|Command):(?: (.*))?$/.exec(line))) {
      field = m[1];
      raw.get(control)[field] = m[2] ?? '';
    } else if (field === 'How to verify' && (m = /^ {6}(\d+)\. (.+)$/.exec(line))) {
      control.steps.push(m[2]);
    } else if (field === 'How to verify' && control.steps.length && (m = /^ {9}(\S.*)$/.exec(line))) {
      control.steps[control.steps.length - 1] += ` ${m[1]}`;
    } else if (field === 'Command' && (m = /^ {6}(npx hackmyagent .*)$/.exec(line))) {
      control.command = m[1];
    } else if (field && field !== 'How to verify' && (m = /^ {6}(\S.*)$/.exec(line))) {
      raw.get(control)[field] += ` ${m[1]}`;
    } else {
      control.unread.push(line);
    }
  }
  for (const [control, fields] of raw) {
    const m = /^(.+)\. Verification: (\S+)\.$/.exec(fields.Category ?? '');
    Object.assign(control, {
      category: m?.[1],
      verification: m?.[2],
      requirement: fields.Requirement,
      question: fields['Ask the vendor'],
      note: fields.Command,
    });
  }
  return levels;
}

const COMPARED = ['name', 'level', 'category', 'verification', 'requirement', 'question', 'steps', 'command'];

/** The controls of a list of levels as the parsers return them, or of a list of controls. */
const controlsOf = (list) => list.flatMap((e) => (Array.isArray(e.controls) ? e.controls : [e]));

/**
 * How the controls of `page` differ from those of `other`, each a list of
 * levels as the parsers return them or, for the JSON output, a list of
 * controls: a control one of them lacks, a field that differs, the order,
 * and a line of either that the parsers could not read.
 */
export function differences(page, other, { what, fields = COMPARED } = {}) {
  const diffs = [];
  const pageControls = controlsOf(page);
  const otherControls = controlsOf(other);
  for (const [name, list] of [['the page', pageControls], [what, otherControls]]) {
    const ids = list.map((c) => c.id);
    const twice = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (twice.length) diffs.push(`${name} lists ${twice.join(', ')} more than once`);
    for (const c of list) if (c.unread?.length) diffs.push(`${name}, ${c.id}: lines that are none of its parts: ${JSON.stringify(c.unread)}`);
  }
  const byId = new Map(otherControls.map((c) => [c.id, c]));
  const pageIds = new Set(pageControls.map((c) => c.id));
  for (const c of pageControls) if (!byId.has(c.id)) diffs.push(`${c.id} ${c.name} is on the page and not in ${what}`);
  for (const c of otherControls) if (!pageIds.has(c.id)) diffs.push(`${c.id} ${c.name} is in ${what} and not on the page`);
  for (const p of pageControls) {
    const o = byId.get(p.id);
    if (!o) continue;
    for (const key of fields) {
      if (!isDeepStrictEqual(p[key], o[key])) {
        diffs.push(`${p.id} ${key}: the page has ${JSON.stringify(p[key])}, ${what} ${JSON.stringify(o[key])}`);
      }
    }
  }
  const order = (list) => list.map((c) => c.id).filter((id) => pageIds.has(id) && byId.has(id)).join(' ');
  if (order(pageControls) !== order(otherControls)) diffs.push(`the page and ${what} list the controls in a different order`);
  return diffs;
}

test('the page and the command list the same controls, by level, with the same text', () => {
  const page = parsePage(read(PAGE));
  const json = checklistJson();
  const r = checklist();
  assert.equal(r.status, 0, r.stderr);
  const text = parseText(r.stdout);
  assert.ok(json.controls.length > 0, 'the command printed no control');
  assert.deepEqual(differences(page, json.controls, { what: 'the JSON output' }), []);
  assert.deepEqual(differences(page, text, { what: 'the text output', fields: [...COMPARED, 'note'] }), []);
  // The page and the text output head each level with the same line, which
  // counts the controls under it.
  assert.deepEqual(page.map((l) => l.heading), text.map((l) => l.heading));
  assert.deepEqual(page.map((l) => l.id), json.levels.map((l) => l.id));
  for (const level of page) {
    const n = Number(/: (\d+) controls?$/.exec(level.heading)?.[1]);
    assert.equal(n, level.controls.length, `${PAGE}: "${level.heading}" heads ${level.controls.length} controls`);
  }
});

test('a control the page lacks, or a field it gives differently, is a difference', () => {
  // Checks that differences() reports what it is for: the page is changed in
  // memory and compared with the command's output.
  const json = checklistJson();
  const text = read(PAGE);
  const changed = text.replace(
    '**Ask the vendor:** How can the agent be stopped immediately and remotely, without its cooperation?',
    '**Ask the vendor:** Can the agent be stopped?',
  );
  assert.notEqual(changed, text, `${PAGE} no longer asks this question of control 10.3; update this test`);
  assert.deepEqual(differences(parsePage(changed), json.controls, { what: 'the JSON output' }), [
    '10.3 question: the page has "Can the agent be stopped?", the JSON output "How can the agent be stopped immediately and remotely, without its cooperation?"',
  ]);
  const start = text.indexOf('\n### 10.3 Kill Switch\n');
  const end = text.indexOf('\n## ', start);
  assert.ok(start > 0 && end > start, `${PAGE} has no section for control 10.3 at the end of a level; update this test`);
  const without = text.slice(0, start) + text.slice(end);
  assert.deepEqual(differences(parsePage(without), json.controls, { what: 'the JSON output' }), [
    '10.3 Kill Switch is in the JSON output and not on the page',
  ]);
  const extra = text.replace('\n**How to verify:**\n', '\n**How to verify:**\n\nAn extra line.\n');
  assert.match(differences(parsePage(extra), json.controls, { what: 'the JSON output' }).join('\n'), /lines that are none of its parts: \["An extra line\."\]/);
});

test('--level prints the controls a run at that level checks: those of the level and of the levels below it', () => {
  const all = parsePage(read(PAGE));
  const checklistData = loadChecklist();
  for (const { id } of checklistData.levels) {
    const levels = levelsUpTo(checklistData, id);
    const expected = all.filter((l) => levels.includes(l.id));
    const json = checklistJson(['--level', id]);
    assert.deepEqual(json.levels.map((l) => l.id), levels);
    assert.deepEqual(differences(expected, json.controls, { what: `the JSON output at ${id}` }), []);
    const r = checklist(['--level', id]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(differences(expected, parseText(r.stdout), { what: `the text output at ${id}`, fields: [...COMPARED, 'note'] }), []);
  }
  // The level is read in either case, and also as --level=<level>.
  assert.deepEqual(checklistJson(['--level', 'l2']), checklistJson(['--level', 'L2']));
  assert.deepEqual(checklistJson(['--level=L2']), checklistJson(['--level', 'L2']));
});

test('the counts the page states are those of the controls it lists', () => {
  const text = read(PAGE);
  const controls = parsePage(text).flatMap((l) => l.controls);
  const { levels } = loadChecklist();
  const count = (f) => controls.filter(f).length;
  const says = (re, what) => {
    const m = re.exec(text);
    assert.ok(m, `${PAGE} no longer says ${what}; update this test with its wording`);
    return Number(m[1]);
  };
  assert.equal(says(/^A checklist of the (\d+) controls of OASB-1\b/m, 'how many controls it lists'), controls.length);
  assert.equal(
    says(/for the (\d+) controls HackMyAgent maps a check to\./, 'how many controls have a command'),
    count((c) => c.command !== null),
  );
  // The Levels table has a row for each level, in order: the controls of the
  // level, and those a run at the level checks.
  const rows = [...text.matchAll(/^\| (L\d) \| (\w+) \| (\d+) \| (\d+) \|$/gm)].map((m) => [m[1], m[2], Number(m[3]), Number(m[4])]);
  assert.deepEqual(
    rows,
    levels.map((l) => [l.id, l.name, count((c) => c.level === l.id), count((c) => levelsUpTo({ levels }, l.id).includes(c.level))]),
    `${PAGE}: the Levels table`,
  );
  // The Verification list has a line for each kind, with its count.
  const kinds = [...text.matchAll(/^- \*\*(\w+)\*\*, (\d+) controls?:/gm)].map((m) => [m[1], Number(m[2])]);
  assert.deepEqual(
    kinds,
    ['automated', 'manual', 'forward'].map((kind) => [kind, count((c) => c.verification === kind)]),
    `${PAGE}: the Verification list`,
  );
  // The example under "The command" is the command of the control it names.
  const example = /For control (\d+\.\d+):\n\n```bash\n(.+)\n```/.exec(text);
  assert.ok(example, `${PAGE} gives no example command for a control; update this test`);
  assert.equal(example[2], controls.find((c) => c.id === example[1])?.command);
});

test('each command prints its control from a HackMyAgent run at the control\'s level, and only a control with a mapped check has one', () => {
  for (const c of checklistJson().controls) {
    if (c.checks.length === 0) {
      assert.equal(c.command, null, `${c.id} has no mapped check and a command`);
      continue;
    }
    assert.equal(
      c.command,
      `npx hackmyagent secure ./my-agent -b oasb-1 -l ${c.level} --format json | jq '.categories[].controls[] | select(.controlId == "${c.id}")'`,
    );
  }
});

test('an argument the command does not take, or a level other than L1, L2 and L3, exits 1 with the usage', () => {
  for (const args of [['--level', 'L4'], ['--level'], ['--level='], ['--bogus'], ['L1'], ['--version']]) {
    const r = checklist(args);
    assert.equal(r.status, 1, `checklist ${args.join(' ')}: ${r.stdout}`);
    assert.equal(r.stdout, '', `checklist ${args.join(' ')} printed to stdout`);
    const [why, usage] = r.stderr.split('\n');
    assert.match(why, /^oasb checklist: /, `checklist ${args.join(' ')}`);
    assert.equal(usage, CHECKLIST_USAGE, `checklist ${args.join(' ')}`);
  }
  assert.equal(checklist(['--level', 'L4']).stderr.split('\n')[0], 'oasb checklist: --level takes L1, L2 or L3, not "L4"');
  const r = checklist(['--help']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.split('\n')[0], CHECKLIST_USAGE);
});

test('no scenario file has the ID checklist, so the command hides none', () => {
  const ids = scenarioFiles().map((s) => s.id.toLowerCase());
  assert.ok(ids.length > 0, 'no scenario file was read');
  assert.ok(!ids.includes('checklist'));
});

test('the README links the page and names the command', () => {
  const readme = read('README.md');
  assert.match(readme, /\]\(docs\/oasb-1-checklist\.md\)/, 'the README does not link docs/oasb-1-checklist.md');
  assert.match(readme, /`npx @opena2a\/oasb checklist`/, 'the README does not name npx @opena2a/oasb checklist');
});
