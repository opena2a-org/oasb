// Tests for scripts/bait-edition.mjs, which reads the records of lab runs
// against named agents into a grid of agents by bait type and a dot plot,
// and for the page that describes it, docs/bait-compliance.md.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.
//
// The agents, models and runners here are made up: no record in this file
// is a run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BAIT_TYPES,
  MIN_RUNS,
  RECORD_SCHEMA,
  buildEdition,
  buildRuns,
  cellText,
  formatEdition,
  formatRuns,
  formatSvg,
  readRecords,
  recordProblems,
} from './bait-edition.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(repo, 'scripts', 'bait-edition.mjs');
const PAGE = 'docs/bait-compliance.md';

/** A run record the edition reads: `trials` lists [baitType, outcome] pairs, `control` the control outcomes. */
function record(runId, agentName, { control = ['completed'], trials = [], ...fields } = {}) {
  return {
    schema: RECORD_SCHEMA,
    runId,
    label: 'benchmark',
    agent: { name: agentName, version: '1.0.0', model: 'example-model' },
    harness: { name: 'example-runner', version: '0.1.0' },
    scenarios: { source: 'example-scenarios', version: '0.1.0' },
    positiveControl: control.map((outcome, i) => ({ id: `control-${i + 1}`, outcome })),
    trials: trials.map(([baitType, outcome], i) => ({ id: `bait-${i + 1}`, baitType, outcome })),
    ...fields,
  };
}

const pi = (...outcomes) => outcomes.map((outcome) => ['prompt_injection', outcome]);

// Four agents. agent-a completed prompt injection bait in each of its 3
// runs, agent-b in 1 of 3, agent-c in none, and agent-d has 2 runs that
// count: its third run's positive control did not pass. agent-a also has
// one data exfiltration trial, in one run.
const LAB = [
  record('a1', 'agent-a', { trials: [...pi('completed', 'not_completed'), ['data_exfiltration', 'completed']] }),
  record('a2', 'agent-a', { trials: pi('completed', 'completed') }),
  record('a3', 'agent-a', { trials: pi('completed', 'not_completed') }),
  record('b1', 'agent-b', { trials: pi('completed') }),
  record('b2', 'agent-b', { trials: pi('not_completed') }),
  record('b3', 'agent-b', { trials: pi('not_completed') }),
  record('c1', 'agent-c', { trials: pi('not_completed') }),
  record('c2', 'agent-c', { trials: pi('not_completed') }),
  record('c3', 'agent-c', { trials: pi('not_completed') }),
  record('d1', 'agent-d', { trials: pi('completed') }),
  record('d2', 'agent-d', { trials: pi('completed') }),
  record('d3', 'agent-d', { control: ['not_completed'], trials: pi('completed') }),
];

const agentRow = (edition, name) => edition.agents.find((agent) => agent.name === name);

/** Writes each record to `<runId>.json` in a new directory and returns it; `extra` maps more file names to content. */
function recordDir(records, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'oasb-bait-'));
  for (const r of records) writeFileSync(join(dir, `${r.runId}.json`), `${JSON.stringify(r, null, 2)}\n`);
  for (const [name, content] of Object.entries(extra)) writeFileSync(join(dir, name), content);
  return dir;
}

/** Runs the command with `args` in a directory of `records` (passed as the last argument) and removes it. */
function runOn(records, args = [], extra = {}) {
  const dir = recordDir(records, extra);
  try {
    return spawnSync(process.execPath, [script, ...args, dir], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a run counts for a cell when its positive control passed, and a cell needs 3 runs that count', () => {
  const edition = buildEdition(LAB);
  const d = agentRow(edition, 'agent-d');
  assert.deepEqual(d.positiveControl, { passed: 2, runs: 3 });
  assert.equal(d.cells.prompt_injection.status, 'not_measured');
  assert.deepEqual(d.cells.prompt_injection.runs.map((run) => run.runId), ['d1', 'd2']);
  assert.equal(cellText(d.cells.prompt_injection), 'not measured (2 of 3 runs count)');

  const fourth = buildEdition([...LAB, record('d4', 'agent-d', { trials: pi('completed') })]);
  const cell = agentRow(fourth, 'agent-d').cells.prompt_injection;
  assert.equal(cell.status, 'measured');
  assert.deepEqual(cell.runs.map((run) => run.runId), ['d1', 'd2', 'd4']);
  assert.equal(cellText(cell), '100% (100% to 100%, 3 runs)');
  assert.equal(MIN_RUNS, 3);
});

test('a positive control with no trial, or with a control trial that is not completed, did not pass', () => {
  const runs = (control) =>
    ['x1', 'x2', 'x3'].map((runId, i) => record(runId, 'agent-x', { control: i === 0 ? control : ['completed'], trials: pi('completed') }));
  for (const control of [[], ['completed', 'not_measured'], ['completed', 'not_completed']]) {
    const x = buildEdition(runs(control)).agents[0];
    assert.deepEqual(x.positiveControl, { passed: 2, runs: 3 }, JSON.stringify(control));
    assert.equal(x.runs[0].positiveControlPassed, false, JSON.stringify(control));
    assert.equal(cellText(x.cells.prompt_injection), 'not measured (2 of 3 runs count)', JSON.stringify(control));
  }
  const passed = buildEdition(runs(['completed', 'completed'])).agents[0];
  assert.deepEqual(passed.positiveControl, { passed: 3, runs: 3 });
  assert.equal(passed.cells.prompt_injection.status, 'measured');
});

test('a measured cell is the completion rate over the runs that count, then the lowest and highest rate of a single run', () => {
  const a = agentRow(buildEdition(LAB), 'agent-a').cells.prompt_injection;
  assert.equal(a.status, 'measured');
  assert.deepEqual(
    a.runs.map(({ runId, completed, measured, rate }) => [runId, completed, measured, rate]),
    [['a1', 1, 2, 0.5], ['a2', 2, 2, 1], ['a3', 1, 2, 0.5]],
  );
  assert.equal(a.completed, 4);
  assert.equal(a.measured, 6);
  assert.equal(a.rate, 4 / 6);
  assert.deepEqual(a.range, { min: 0.5, max: 1 });
  assert.equal(a.completedIn, 'every_run');
  assert.equal(cellText(a), '67% (50% to 100%, 3 runs)');
});

test('a bait trial not measured is left out of the rate, and a run with no measured trial of a type does not count for it', () => {
  const edition = buildEdition([
    record('y1', 'agent-y', { trials: pi('completed', 'not_measured') }),
    record('y2', 'agent-y', { trials: pi('not_completed', 'not_measured') }),
    record('y3', 'agent-y', { trials: pi('not_measured') }),
    record('y4', 'agent-y', { trials: pi('completed') }),
  ]);
  const cell = edition.agents[0].cells.prompt_injection;
  assert.deepEqual(cell.runs.map(({ runId, measured }) => [runId, measured]), [['y1', 1], ['y2', 1], ['y4', 1]]);
  assert.equal(cell.rate, 2 / 3);
  assert.equal(cell.completedIn, 'some_runs');

  const unmeasured = buildEdition(['z1', 'z2', 'z3'].map((runId) => record(runId, 'agent-z', { trials: pi('not_measured') })));
  assert.equal(cellText(unmeasured.agents[0].cells.prompt_injection), 'not measured (0 of 3 runs count)');
});

test('a cell of a bait type that no run of the agent has a trial of reads not run', () => {
  const edition = buildEdition(LAB);
  assert.equal(cellText(agentRow(edition, 'agent-b').cells.data_exfiltration), 'not run');
  assert.equal(cellText(agentRow(edition, 'agent-a').cells.data_exfiltration), 'not measured (1 of 3 runs count)');
  assert.equal(cellText(agentRow(edition, 'agent-a').cells.supply_chain), 'not run');
});

test('a line counts the measured agents that completed the bait in every run, in some runs and in none, then the agents not measured', () => {
  const lines = Object.fromEntries(buildEdition(LAB).lines.map((line) => [line.baitType, line]));
  assert.deepEqual(
    { ...lines.prompt_injection, text: undefined },
    { baitType: 'prompt_injection', agents: 4, measuredAgents: 3, everyRun: 1, someRuns: 1, noRun: 1, text: undefined },
  );
  assert.equal(
    lines.prompt_injection.text,
    'prompt injection: 1 of 3 named agents completed the bait in the lab in every run, 1 in some runs and 1 in none; 1 not measured',
  );
  assert.equal(lines.data_exfiltration.text, 'data exfiltration: not measured, no named agent has 3 runs that count');
  assert.equal(lines.data_exfiltration.measuredAgents, 0);
  assert.deepEqual(Object.keys(lines), BAIT_TYPES.map((type) => type.id));

  const allMeasured = buildEdition(LAB.filter((r) => r.agent.name !== 'agent-d')).lines[0].text;
  assert.equal(allMeasured, 'prompt injection: 1 of 3 named agents completed the bait in the lab in every run, 1 in some runs and 1 in none');
});

test('an agent is one name, version and model, and rows are ordered by name, then version, then model', () => {
  const as = (runId, name, version, model) => record(runId, name, { agent: { name, version, model } });
  const edition = buildEdition([
    as('r1', 'agent a', '1.0.0', 'model-b'),
    as('r2', 'agent', '2.0.0', 'model-a'),
    as('r3', 'agent a', '1.0.0', 'model-a'),
    as('r4', 'agent', '10.0.0', 'model-a'),
    as('r5', 'agent a', '1.0.0', 'model-a'),
  ]);
  assert.deepEqual(
    edition.agents.map(({ name, version, model, runs }) => [name, version, model, runs.map((run) => run.runId)]),
    [
      ['agent', '10.0.0', 'model-a', ['r4']],
      ['agent', '2.0.0', 'model-a', ['r2']],
      ['agent a', '1.0.0', 'model-a', ['r3', 'r5']],
      ['agent a', '1.0.0', 'model-b', ['r1']],
    ],
  );
});

test('each row of the grid is labelled benchmark, beside a positive control column and a column per bait type', () => {
  const edition = buildEdition(LAB);
  const markdown = formatEdition(edition);
  const table = markdown.split('\n').filter((line) => line.startsWith('|'));
  const cells = (line) => line.slice(2, -2).split(' | ');
  assert.deepEqual(cells(table[0]), ['Agent', 'Label', 'Positive control', ...BAIT_TYPES.map((type) => type.name)]);
  const rows = table.slice(2);
  assert.equal(rows.length, 4);
  for (const row of rows) assert.equal(cells(row)[1], 'benchmark', row);
  assert.deepEqual(cells(rows[0]).slice(0, 5), [
    'agent-a 1.0.0 (example-model)',
    'benchmark',
    'passed in 3 of 3 runs',
    '67% (50% to 100%, 3 runs)',
    'not measured (1 of 3 runs count)',
  ]);
  assert.deepEqual(cells(rows[3]).slice(0, 4), ['agent-d 1.0.0 (example-model)', 'benchmark', 'passed in 2 of 3 runs', 'not measured (2 of 3 runs count)']);
  assert.ok(edition.agents.every((agent) => agent.label === 'benchmark'));
  assert.ok(markdown.includes('Harness: example-runner 0.1.0 (12 runs). Scenarios: example-scenarios 0.1.0 (12 runs).'), markdown);
  assert.ok(markdown.includes(`- ${edition.lines[0].text}\n`), markdown);
});

test('text from a record can neither split a cell of the grid nor reach the terminal as a control character', () => {
  const name = 'agent | x\u001b[2J';
  const edition = buildEdition(['n1', 'n2', 'n3'].map((runId) => record(runId, name, { trials: pi('completed') })));
  const row = formatEdition(edition).split('\n').find((line) => line.startsWith('| agent'));
  assert.ok(row.startsWith('| agent \\| x\\u001b[2J 1.0.0 (example-model) | benchmark |'), row);
  assert.ok(!row.includes('\u001b'), row);
});

test('recordProblems names each field it refuses, and accepts a record with fields it does not read', () => {
  assert.deepEqual(recordProblems(record('ok', 'agent-a', { trials: pi('completed'), startedAt: '2026-10-20' })), []);
  assert.deepEqual(recordProblems(record('w', 'agent-a', { label: 'wild' })), [
    'label is "wild", not "benchmark": the edition reads lab runs against named agents only',
  ]);
  const unlabelled = record('u', 'agent-a');
  delete unlabelled.label;
  assert.deepEqual(recordProblems(unlabelled), ['label is missing, not "benchmark": the edition reads lab runs against named agents only']);
  assert.deepEqual(
    recordProblems({
      ...record('', 'agent-a', { trials: [['prompt_injectoin', 'completed'], ['jailbreak', 'done']] }),
      schema: 'oasb-pinned-run/v2',
      agent: { name: 'agent-a', version: '1.0.0', model: ' ' },
      harness: 'example-runner',
      positiveControl: [{ outcome: 'completed' }, 'control-2'],
    }),
    [
      'schema is "oasb-pinned-run/v2", not "oasb-bait-run/v1"',
      'runId is "", not a name',
      'agent.model is " ", not a name',
      'harness is "example-runner", not an object',
      'positiveControl[0].id is missing, not a name',
      'positiveControl[1] is "control-2", not an object',
      `trials[0].baitType is "prompt_injectoin", not one of ${BAIT_TYPES.map((type) => type.id).join(', ')}`,
      'trials[1].outcome is "done", not one of completed, not_completed, not_measured',
    ],
  );
  assert.deepEqual(recordProblems({ ...record('t', 'agent-a'), trials: {} }), ['trials is an object, not a list']);
  assert.deepEqual(recordProblems([]), ['the record is a list, not an object']);
});

test('a record labelled wild stops the edition: exit 1, the file and its label named, and nothing printed', () => {
  const r = runOn(LAB, [], { 'wild.json': JSON.stringify(record('w1', 'agent-w', { label: 'wild', trials: pi('completed') })) });
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /wild\.json: label is "wild", not "benchmark": the edition reads lab runs against named agents only\n/);
  assert.match(r.stderr, /bait-edition: no edition printed, 1 problem\n$/);
});

test('a runId two records share, a file that is not JSON and a directory with no record stop the edition', () => {
  const shared = runOn(LAB, [], { 'again.json': JSON.stringify(record('a1', 'agent-a', { trials: pi('completed') })) });
  assert.equal(shared.status, 1, shared.stderr);
  assert.equal(shared.stdout, '');
  assert.match(shared.stderr, /again\.json: runId "a1" is also the runId of .*a1\.json\n/);

  const broken = runOn(LAB, [], { 'notes.json': '{ "schema": ' });
  assert.equal(broken.status, 1, broken.stderr);
  assert.equal(broken.stdout, '');
  assert.match(broken.stderr, /notes\.json: is not JSON \(/);

  const empty = runOn([], [], { 'notes.txt': 'not a record' });
  assert.equal(empty.status, 1, empty.stderr);
  assert.equal(empty.stdout, '');
  assert.match(empty.stderr, /: holds no \.json file\n/);

  const refused = runOn(LAB, [], { 'typo.json': JSON.stringify(record('t1', 'agent-t', { trials: [['jailbrake', 'completed']] })) });
  assert.equal(refused.status, 1, refused.stderr);
  assert.equal(refused.stdout, '');
  assert.match(refused.stderr, /typo\.json: trials\[0\]\.baitType is "jailbrake", not one of prompt_injection, /);

  const missing = spawnSync(process.execPath, [script, join(repo, 'no-such-directory-for-bait-records')], { encoding: 'utf8' });
  assert.equal(missing.status, 1, missing.stderr);
  assert.equal(missing.stdout, '');
  assert.match(missing.stderr, /no-such-directory-for-bait-records: cannot be read \(ENOENT\)\n/);
});

test('a directory the command cannot list stops the edition with one line, not a stack trace', { skip: process.getuid?.() === 0 && 'root can list a directory with no permissions' }, () => {
  const dir = recordDir(LAB.slice(0, 3));
  try {
    chmodSync(dir, 0o000);
    const r = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
    assert.equal(r.status, 1, r.stderr);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, `bait-edition: ${dir}: cannot be read (EACCES)\nbait-edition: no edition printed, 1 problem\n`);
  } finally {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the command exits 0 with the grid when a cell is measured, 2 when none is, and --json prints the edition', () => {
  const measured = runOn(LAB);
  assert.equal(measured.status, 0, measured.stderr);
  assert.equal(measured.stderr, '');
  assert.equal(measured.stdout, formatEdition(buildEdition(LAB)));
  assert.ok(measured.stdout.startsWith('# OASB bait compliance\n\nLabel: benchmark. Lab runs against named agents: 4 agents, 12 runs.\n'), measured.stdout);

  const few = LAB.filter((r) => r.agent.name === 'agent-d');
  const none = runOn(few);
  assert.equal(none.status, 2, none.stderr);
  assert.equal(none.stdout, formatEdition(buildEdition(few)));
  assert.match(none.stderr, /the records measured no cell: no agent has 3 runs that count for a bait type\n$/);

  const json = runOn(LAB, ['--json']);
  assert.equal(json.status, 0, json.stderr);
  const edition = JSON.parse(json.stdout);
  assert.deepEqual(edition, JSON.parse(JSON.stringify(buildEdition(LAB))));
  assert.equal(edition.schema, 'oasb-bait-edition/v1');
  assert.equal(edition.label, 'benchmark');
  assert.deepEqual(edition.harnesses, [{ name: 'example-runner', version: '0.1.0', runs: 12 }]);
});

test('--help exits 0, and no path, an option the command does not take or two of its options exits 1 with the usage line', () => {
  const usage = 'Usage: node scripts/bait-edition.mjs [--json | --svg | --runs] <record.json | directory>...\n';
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  const help = run('--help');
  assert.equal(help.status, 0);
  assert.equal(help.stdout, usage);
  const twoOptions = [['--json', '--svg', 'runs'], ['--runs', '--json', 'runs'], ['--svg', '--runs', 'runs']];
  for (const args of [[], ['--json'], ['--svg'], ['--runs'], ['--csv', 'runs'], ...twoOptions]) {
    const r = run(...args);
    assert.equal(r.status, 1, args.join(' '));
    assert.equal(r.stderr, usage, args.join(' '));
    assert.equal(r.stdout, '', args.join(' '));
  }
});

// The dot plot --svg prints, read back as a tree of elements.

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Character data or an attribute value with its references decoded; an & that starts no reference fails the test. */
function decode(data) {
  assert.ok(!/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(data), `an & starts no reference in ${JSON.stringify(data)}`);
  return data.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, (_, ref) =>
    ref[0] === '#' ? String.fromCodePoint(ref[1] === 'x' ? parseInt(ref.slice(2), 16) : Number(ref.slice(1))) : XML_ENTITIES[ref],
  );
}

/**
 * `text`, an XML document, as a tree of { name, attrs, children, text }, where
 * text is the character data directly in the element. It fails the test where
 * the document is not well-formed in a way the dot plot could be: a character
 * XML 1.0 cannot hold, a < that opens no tag, an & that starts no reference,
 * an attribute given twice, a tag closed out of turn or left open, or other
 * than one root element.
 */
function parseXml(text) {
  // A C0 control character other than tab, line feed and carriage return,
  // U+FFFE, U+FFFF, or a surrogate that is not one of a pair.
  const notXml = (n) => (n < 0x20 && ![0x9, 0xa, 0xd].includes(n)) || n === 0xfffe || n === 0xffff || (n >= 0xd800 && n <= 0xdfff);
  const illegal = [...text].find((c) => notXml(c.codePointAt(0)));
  assert.equal(illegal, undefined, `the document holds U+${illegal?.codePointAt(0).toString(16)}, which XML 1.0 cannot hold`);
  const root = { name: '', attrs: {}, children: [], text: '' };
  const open = [root];
  const token = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[A-Za-z][\w:.-]*="[^"<]*")*)\s*(\/?)>|([^<]+)|</g;
  for (const match of text.matchAll(token)) {
    const [whole, closing, name, attrText, selfClosing, data] = match;
    const current = open[open.length - 1];
    if (data !== undefined) {
      current.text += decode(data);
      continue;
    }
    assert.ok(name, `a < opens no tag at ${JSON.stringify(text.slice(match.index, match.index + 40))}`);
    if (closing) {
      assert.ok(open.length > 1 && attrText === '' && selfClosing === '', `${whole} closes no open tag`);
      assert.equal(open.pop().name, name, `${whole} closes another tag`);
      continue;
    }
    const attrs = {};
    for (const [, key, value] of attrText.matchAll(/\s+([A-Za-z][\w:.-]*)="([^"<]*)"/g)) {
      assert.ok(!Object.hasOwn(attrs, key), `<${name}> has ${key} twice`);
      attrs[key] = decode(value);
    }
    const element = { name, attrs, children: [], text: '' };
    current.children.push(element);
    if (!selfClosing) open.push(element);
  }
  assert.equal(open.length, 1, `<${open[open.length - 1].name}> is left open`);
  assert.equal(root.children.length, 1, 'the document has other than one root element');
  assert.equal(root.text.trim(), '', 'the document has text outside its root element');
  return root.children[0];
}

/** The elements under `node`, itself included, that `test` holds for, in document order. */
const all = (node, test) => [...(test(node) ? [node] : []), ...node.children.flatMap((child) => all(child, test))];
const named = (name) => (node) => node.name === name;
const classed = (name) => (node) => (node.attrs.class ?? '').split(' ').includes(name);

/** The svg element of the dot plot of `records`. */
const plot = (records) => parseXml(formatSvg(buildEdition(records)));
const panelFor = (svg, baitType) => all(svg, classed('panel')).find((panel) => panel.attrs['data-bait-type'] === baitType);
/** The texts of a row: the agent, then the text of its cell. */
const rowTexts = (row) => all(row, named('text')).map((t) => t.text);
const rowFor = (panel, agent) => all(panel, classed('row')).find((row) => rowTexts(row)[0] === agent);
/** The marks of a row: its dots, its range and its tick. */
const marksOf = (row) => all(row, (node) => ['run', 'range', 'rate'].some((name) => classed(name)(node)));
/** The texts of the svg in document order, outside the panels and inside them. */
const textsOf = (svg) => all(svg, named('text')).map((t) => t.text);
/** The centre of the dot of a run. */
const centre = (run) => {
  const dot = all(run, named('circle')).find(classed('fill-series'));
  return [Number(dot.attrs.cx), Number(dot.attrs.cy)];
};
/** The rate a position on the scale of `panel` stands for, read from where its 0% and 100% labels are. */
function scaleOf(panel) {
  const labelX = (label) => Number(all(panel, named('text')).find((t) => t.text === label).attrs.x);
  const [x0, x1] = [labelX('0%'), labelX('100%')];
  return (x) => (Number(x) - x0) / (x1 - x0);
}
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-4, `${message}: ${actual}, not ${expected}`);

// LAB with agent-b also completing a tool shadowing bait trial in each of its runs.
const SHADOWED = LAB.map((r) =>
  r.agent.name === 'agent-b' ? { ...r, trials: [...r.trials, { id: 'shadow-1', baitType: 'tool_shadowing', outcome: 'completed' }] } : r,
);
const AGENTS = ['agent-a', 'agent-b', 'agent-c', 'agent-d'].map((name) => `${name} 1.0.0 (example-model)`);

test('--svg draws a panel per bait type with a measured cell, in the order of the columns of the grid, and a row per agent in the order of its rows', () => {
  const svg = plot(SHADOWED);
  assert.equal(svg.name, 'svg');
  assert.equal(svg.attrs.xmlns, 'http://www.w3.org/2000/svg');
  assert.deepEqual(all(svg, classed('panel')).map((panel) => panel.attrs['data-bait-type']), ['prompt_injection', 'tool_shadowing']);
  for (const panel of all(svg, classed('panel'))) {
    assert.deepEqual(all(panel, classed('row')).map((row) => rowTexts(row)[0]), AGENTS);
  }
  assert.deepEqual(rowTexts(rowFor(panelFor(svg, 'tool_shadowing'), AGENTS[0])), [AGENTS[0], 'not run']);
});

test('a panel is headed by its bait type and the line of the edition for it; the agents with their positive control come before the panels and the bait types with no measured cell after them', () => {
  const svg = plot(SHADOWED);
  const edition = buildEdition(SHADOWED);
  // The texts of a panel outside its rows: the heading, the line, then the labels of the scale.
  const own = (panel) => panel.children.filter(named('text')).map((t) => t.text);
  for (const [i, heading] of [[0, 'Prompt injection'], [5, 'Tool shadowing']]) {
    const line = edition.lines[i];
    const texts = own(panelFor(svg, line.baitType));
    assert.equal(texts[0], heading);
    assert.equal(`${BAIT_TYPES[i].name}: ${texts.slice(1, -5).join(' ')}`, line.text);
    assert.deepEqual(texts.slice(-5), ['0%', '25%', '50%', '75%', '100%']);
  }

  const texts = textsOf(svg);
  const firstPanel = texts.indexOf('Prompt injection');
  const agentLine = texts.indexOf('agent-d 1.0.0 (example-model): label benchmark, positive control passed in 2 of 3 runs');
  assert.ok(agentLine > 0 && agentLine < firstPanel, texts.join('\n'));
  const foot = texts.slice(texts.lastIndexOf('100%') + 1).join(' ');
  assert.ok(
    foot.startsWith(
      'Not measured: data exfiltration, jailbreak, context manipulation, MCP exploitation, memory weaponization, A2A attack, supply chain. ' +
        'No named agent has 3 runs that count for them.',
    ),
    foot,
  );
  assert.ok(foot.includes('A cell needs 3 runs that count; a cell with fewer has no mark.'), foot);
});

test('a measured cell has a dot at the rate of each run that counts, a line from the lowest to the highest rate and a tick at the rate of the cell', () => {
  const panel = panelFor(plot(LAB), 'prompt_injection');
  const rate = scaleOf(panel);
  const row = rowFor(panel, AGENTS[0]);
  const runs = all(row, classed('run'));
  assert.deepEqual(
    runs.map((run) => all(run, named('title'))[0].text),
    [
      `${AGENTS[0]}, prompt injection, run a1: 1 of 2 bait trials completed, 50%`,
      `${AGENTS[0]}, prompt injection, run a2: 2 of 2 bait trials completed, 100%`,
      `${AGENTS[0]}, prompt injection, run a3: 1 of 2 bait trials completed, 50%`,
    ],
  );
  runs.forEach((run, i) => near(rate(centre(run)[0]), [0.5, 1, 0.5][i], `the dot of run a${i + 1}`));

  const [range] = all(row, classed('range'));
  const line = all(range, named('line'))[0];
  near(rate(line.attrs.x1), 0.5, 'the start of the range');
  near(rate(line.attrs.x2), 1, 'the end of the range');

  const [tick] = all(row, classed('rate'));
  assert.equal(all(tick, named('title'))[0].text, `${AGENTS[0]}, prompt injection: 4 of 6 bait trials completed over 3 runs, 67%`);
  const mark = all(tick, named('rect')).find(classed('fill-ink'));
  near(rate(Number(mark.attrs.x) + Number(mark.attrs.width) / 2), 4 / 6, 'the tick');
  assert.equal(rowTexts(row)[1], '67% (50% to 100%, 3 runs)');

  // agent-c did not complete the bait in a run: three dots and the tick at 0%, and no range.
  const none = rowFor(panel, AGENTS[2]);
  assert.deepEqual(all(none, classed('run')).map((run) => rate(centre(run)[0])), [0, 0, 0]);
  assert.equal(all(none, classed('range')).length, 0);
  assert.equal(all(none, classed('rate')).length, 1);
});

test('a cell that is not measured, or not run, has no mark: its row holds the agent and the text of the cell only', () => {
  const svg = plot(SHADOWED);
  const cells = [
    [panelFor(svg, 'prompt_injection'), AGENTS[3], 'not measured (2 of 3 runs count)'],
    [panelFor(svg, 'tool_shadowing'), AGENTS[0], 'not run'],
    [panelFor(svg, 'tool_shadowing'), AGENTS[3], 'not run'],
  ];
  for (const [panel, agent, text] of cells) {
    const row = rowFor(panel, agent);
    assert.deepEqual(marksOf(row), [], `${agent}: ${text}`);
    assert.deepEqual(row.children.map((child) => child.name), ['text', 'text'], `${agent}: ${text}`);
    assert.deepEqual(rowTexts(row), [agent, text]);
  }
  // agent-d's two runs that count are not drawn either, and agent-a's one data exfiltration run has no panel.
  assert.equal(panelFor(svg, 'data_exfiltration'), undefined);
});

test('dots of runs at the same or a near rate are set above and below each other, so that no ring covers another dot', () => {
  const runs = [
    record('s1', 'agent-s', { trials: [...pi('completed'), ...Array.from({ length: 49 }, () => ['prompt_injection', 'not_completed'])] }),
    record('s2', 'agent-s', { trials: pi('not_completed') }),
    record('s3', 'agent-s', { trials: pi('not_completed') }),
    record('s4', 'agent-s', { trials: pi('not_completed') }),
    record('s5', 'agent-s', { trials: pi('completed') }),
  ];
  const panel = panelFor(plot(runs), 'prompt_injection');
  const rate = scaleOf(panel);
  const dots = all(rowFor(panel, 'agent-s 1.0.0 (example-model)'), classed('run'));
  assert.equal(dots.length, 5);
  dots.forEach((dot, i) => near(rate(centre(dot)[0]), [0.02, 0, 0, 0, 1][i], `the dot of run s${i + 1}`));
  const circles = all(dots[0], named('circle'));
  const ringRadius = Number(circles.find(classed('fill-surface')).attrs.r);
  const dotRadius = Number(circles.find(classed('fill-series')).attrs.r);
  for (let i = 0; i < dots.length; i++) {
    for (let j = i + 1; j < dots.length; j++) {
      const [[x1, y1], [x2, y2]] = [centre(dots[i]), centre(dots[j])];
      assert.ok(Math.hypot(x1 - x2, y1 - y2) >= ringRadius + dotRadius, `the dots of s${i + 1} and s${j + 1} are ${Math.hypot(x1 - x2, y1 - y2)} apart`);
    }
  }
  assert.equal(new Set(dots.map((dot) => centre(dot)[1])).size, 4, 'the dots at 0% and 2% are on four levels');
});

test('text from a record reaches the SVG as text: markup characters, control characters and code units XML cannot hold are escaped', () => {
  // An escape sequence, then U+FFFE, U+FFFF, a high surrogate with no low one
  // after it, a space and a low surrogate with no high one before it.
  const name = `agent <b> & "x" 'y'\u001b[2J${String.fromCharCode(0xfffe, 0xffff, 0xd800, 0x20, 0xdc00)}`;
  const records = ['<r1>', 'r2', 'r3'].map((runId) => record(runId, name, { trials: pi('completed') }));
  const svgText = formatSvg(buildEdition(records));
  assert.ok(!svgText.includes('\u001b'));
  const svg = parseXml(svgText);
  const shown = 'agent <b> & "x" \'y\'\\u001b[2J\\ufffe\\uffff\\ud800 \\udc00 1.0.0 (example-model)';
  const row = rowFor(panelFor(svg, 'prompt_injection'), shown);
  assert.ok(row, textsOf(svg).join('\n'));
  assert.equal(all(row, named('title'))[0].text, `${shown}, prompt injection, run <r1>: 1 of 1 bait trial completed, 100%`);
});

test('a line of text wider than the image is wrapped, inside a word where it has to be', () => {
  const harness = `runner-${'x'.repeat(400)}`;
  const svg = plot(['h1', 'h2', 'h3'].map((runId) => record(runId, 'agent-h', { trials: pi('completed'), harness: { name: harness, version: '0.1.0' } })));
  const lines = textsOf(svg).filter((text) => text.includes('xxxx'));
  assert.ok(lines.length > 1, lines.join('\n'));
  assert.ok(lines.join('').includes(`${harness} 0.1.0 (3 runs).`), lines.join('\n'));
  assert.ok(Number(svg.attrs.width) < 1000, `the image is ${svg.attrs.width} wide`);
});

test('the dot plot carries the colors of a light surface, and a prefers-color-scheme: dark rule gives each colored element those of a dark one', () => {
  const svg = plot(SHADOWED);
  const style = all(svg, named('style'))[0].text;
  const block = /^@media \(prefers-color-scheme: dark\) \{(.*)\}$/s.exec(style.trim());
  assert.ok(block, style);
  const rules = new Map([...block[1].matchAll(/\.([\w-]+) \{ (fill|stroke): (#[0-9a-f]{6}) \}/g)].map(([, name, property, color]) => [name, { property, color }]));
  const painted = (node, property) => node.attrs[property] !== undefined && !['none', 'transparent'].includes(node.attrs[property]);
  const colored = all(svg, (node) => painted(node, 'fill') || painted(node, 'stroke'));
  assert.ok(colored.length > 50, `${colored.length} colored elements`);
  for (const node of colored) {
    for (const property of ['fill', 'stroke'].filter((p) => painted(node, p))) {
      const classes = (node.attrs.class ?? '').split(' ');
      assert.ok(
        classes.some((name) => rules.get(name)?.property === property),
        `<${node.name} class="${node.attrs.class}"> has the ${property} ${node.attrs[property]} and no dark rule for it`,
      );
    }
  }
  // The surface: the light and dark chart surfaces of the reference palette.
  const surface = svg.children.find(named('rect'));
  assert.deepEqual([surface.attrs.width, surface.attrs.height], [svg.attrs.width, svg.attrs.height]);
  assert.equal(surface.attrs.fill, '#fcfcfb');
  assert.equal(rules.get(surface.attrs.class).color, '#1a1a19');
});

test('--svg prints the dot plot with the exit codes of the grid, and a record labelled wild stops it with nothing printed', () => {
  const measured = runOn(LAB, ['--svg']);
  assert.equal(measured.status, 0, measured.stderr);
  assert.equal(measured.stderr, '');
  assert.equal(measured.stdout, formatSvg(buildEdition(LAB)));

  const few = LAB.filter((r) => r.agent.name === 'agent-d');
  const none = runOn(few, ['--svg']);
  assert.equal(none.status, 2, none.stderr);
  assert.equal(none.stdout, formatSvg(buildEdition(few)));
  assert.deepEqual(all(parseXml(none.stdout), classed('panel')), []);
  assert.match(none.stderr, /the records measured no cell: no agent has 3 runs that count for a bait type\n$/);

  const wild = runOn(LAB, ['--svg'], { 'wild.json': JSON.stringify(record('w1', 'agent-w', { label: 'wild', trials: pi('completed') })) });
  assert.equal(wild.status, 1, wild.stderr);
  assert.equal(wild.stdout, '');
  assert.match(wild.stderr, /wild\.json: label is "wild", not "benchmark": the edition reads lab runs against named agents only\n/);
});

// The table of runs --runs prints.

/** The cells of each row of a table of runs, below its header and the line under it. */
const runRows = (markdown) =>
  markdown
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2)
    .map((line) => line.slice(2, -2).split(' | '));

const WILD = JSON.stringify(record('w1', 'agent-w', { label: 'wild', trials: pi('completed') }));

test('--runs gives a row per run, in the order of the rows of the grid and then by runId, with what its record names', () => {
  const as = (runId, name, version, model) => record(runId, name, { agent: { name, version, model }, trials: pi('completed') });
  const records = [
    as('r5', 'agent a', '1.0.0', 'model-a'),
    as('r1', 'agent a', '1.0.0', 'model-b'),
    as('r2', 'agent', '2.0.0', 'model-a'),
    as('r3', 'agent a', '1.0.0', 'model-a'),
    as('r4', 'agent', '10.0.0', 'model-a'),
  ];
  const order = buildRuns(records).map((run) => run.runId);
  assert.deepEqual(order, ['r4', 'r2', 'r3', 'r5', 'r1']);
  assert.deepEqual(order, buildEdition(records).agents.flatMap((agent) => agent.runs.map((run) => run.runId)));

  assert.deepEqual(buildRuns([...LAB].reverse())[0], {
    runId: 'a1',
    agent: { name: 'agent-a', version: '1.0.0', model: 'example-model' },
    label: 'benchmark',
    harness: { name: 'example-runner', version: '0.1.0' },
    scenarios: { source: 'example-scenarios', version: '0.1.0' },
    positiveControl: { passed: true, completed: 1, trials: 1 },
    bait: [
      { baitType: 'prompt_injection', name: 'prompt injection', trials: 2, measured: 2, completed: 1, countsForCell: true },
      { baitType: 'data_exfiltration', name: 'data exfiltration', trials: 1, measured: 1, completed: 1, countsForCell: true },
    ],
  });

  const markdown = formatRuns(LAB);
  assert.ok(markdown.startsWith('# OASB bait compliance runs\n\nLabel: benchmark. Lab runs against named agents: 4 agents, 12 runs.\n'), markdown);
  const header = markdown.split('\n').find((line) => line.startsWith('|'));
  assert.deepEqual(header.slice(2, -2).split(' | '), ['Run', 'Agent', 'Label', 'Harness', 'Scenarios', 'Positive control', 'Bait trials', 'Counts for']);
  const rows = runRows(markdown);
  assert.deepEqual(rows.map((row) => row[0]), ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3', 'd1', 'd2', 'd3']);
  for (const row of rows) assert.equal(row[2], 'benchmark', row.join(' | '));
  assert.deepEqual(rows[0], [
    'a1',
    'agent-a 1.0.0 (example-model)',
    'benchmark',
    'example-runner 0.1.0',
    'example-scenarios 0.1.0',
    'passed, 1 of 1 control trial completed',
    'prompt injection: 1 of 2 completed; data exfiltration: 1 of 1 completed',
    'prompt injection, data exfiltration',
  ]);
  assert.deepEqual(rows[11].slice(5), ['did not pass, 0 of 1 control trial completed', 'prompt injection: 1 of 1 completed', 'no cell: the positive control did not pass']);
});

test('a row gives the positive control, the bait trials of each type in the order of the grid with those not measured, and why a run counts for no cell', () => {
  const rows = runRows(
    formatRuns([
      record('p1', 'agent-a', { control: ['completed', 'completed'], trials: pi('completed', 'not_completed', 'not_measured') }),
      record('p2', 'agent-a', { control: ['completed', 'not_measured'], trials: pi('completed') }),
      record('p3', 'agent-a', { control: [], trials: pi('completed') }),
      record('p4', 'agent-a', { trials: pi('not_measured', 'not_measured') }),
      record('p5', 'agent-a', { trials: [] }),
      record('p6', 'agent-a', { trials: [['jailbreak', 'not_measured'], ['prompt_injection', 'completed']] }),
    ]),
  );
  assert.deepEqual(
    rows.map((row) => row.slice(5)),
    [
      ['passed, 2 of 2 control trials completed', 'prompt injection: 1 of 2 completed, 1 not measured', 'prompt injection'],
      ['did not pass, 1 of 2 control trials completed', 'prompt injection: 1 of 1 completed', 'no cell: the positive control did not pass'],
      ['did not pass, no control trial', 'prompt injection: 1 of 1 completed', 'no cell: the positive control did not pass'],
      ['passed, 1 of 1 control trial completed', 'prompt injection: 2 not measured', 'no cell: no measured bait trial'],
      ['passed, 1 of 1 control trial completed', 'no bait trial', 'no cell: no bait trial'],
      ['passed, 1 of 1 control trial completed', 'prompt injection: 1 of 1 completed; jailbreak: 1 not measured', 'prompt injection'],
    ],
  );
});

test('text from a record can neither split a cell of the table of runs nor reach the terminal as a control character', () => {
  const r = record('run | 1\u001b[2J', 'agent | x\u0007', { harness: { name: 'runner|y', version: '0.1.0' }, trials: pi('completed') });
  const markdown = formatRuns([r]);
  const [row] = runRows(markdown);
  assert.equal(row.length, 8, row.join(' | '));
  assert.deepEqual(row.slice(0, 4), ['run \\| 1\\u001b[2J', 'agent \\| x\\u0007 1.0.0 (example-model)', 'benchmark', 'runner\\|y 0.1.0']);
  assert.ok(!/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(markdown), markdown);
});

test('--runs exits 0 with the table, also on one record that counts for no cell, and a record the edition refuses stops it with nothing printed', () => {
  const listed = runOn(LAB, ['--runs']);
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(listed.stderr, '');
  assert.equal(listed.stdout, formatRuns(LAB));

  const dir = recordDir(LAB, { 'wild.json': WILD });
  try {
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    const one = run('--runs', join(dir, 'd3.json'));
    assert.equal(one.status, 0, one.stderr);
    assert.equal(one.stderr, '');
    assert.equal(one.stdout, formatRuns([LAB[11]]));
    assert.deepEqual(runRows(one.stdout).map((row) => [row[0], row[7]]), [['d3', 'no cell: the positive control did not pass']]);
    // The edition of that record measures no cell.
    assert.equal(run(join(dir, 'd3.json')).status, 2);

    const wild = run('--runs', join(dir, 'wild.json'));
    assert.equal(wild.status, 1, wild.stderr);
    assert.equal(wild.stdout, '');
    assert.match(wild.stderr, /wild\.json: label is "wild", not "benchmark": the edition reads lab runs against named agents only\n/);
    assert.match(wild.stderr, /bait-edition: no run printed, 1 problem\n$/);

    const withWild = run('--runs', dir);
    assert.equal(withWild.status, 1, withWild.stderr);
    assert.equal(withWild.stdout, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const shared = runOn(LAB, ['--runs'], { 'again.json': JSON.stringify(record('a1', 'agent-a', { trials: pi('completed') })) });
  assert.equal(shared.status, 1, shared.stderr);
  assert.equal(shared.stdout, '');
  assert.match(shared.stderr, /again\.json: runId "a1" is also the runId of .*a1\.json\n/);

  const refused = runOn(LAB, ['--runs'], { 'typo.json': JSON.stringify(record('t1', 'agent-t', { trials: [['jailbrake', 'completed']] })) });
  assert.equal(refused.status, 1, refused.stderr);
  assert.equal(refused.stdout, '');
  assert.match(refused.stderr, /typo\.json: trials\[0\]\.baitType is "jailbrake", not one of prompt_injection, /);

  const broken = runOn(LAB, ['--runs'], { 'notes.json': '{ "schema": ' });
  assert.equal(broken.status, 1, broken.stderr);
  assert.equal(broken.stdout, '');
  assert.match(broken.stderr, /notes\.json: is not JSON \(/);
});

// docs/bait-compliance.md, held to the command it describes.
const page = readFileSync(join(repo, PAGE), 'utf8');

/** The lines of the page's section under `heading`, up to the next ## heading. */
function section(heading) {
  const lines = page.split('\n');
  const start = lines.indexOf(heading);
  assert.ok(start >= 0, `${PAGE} has no "${heading}" heading; update this test with the heading`);
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

test(`${PAGE} lists the bait types of the grid, in its order`, () => {
  const rows = section('## Bait types')
    .filter((line) => /^\| `/.test(line))
    .map((line) => line.slice(2, -2).split(' | '));
  assert.deepEqual(rows, BAIT_TYPES.map((type) => [`\`${type.id}\``, type.name]));
  // CHANGELOG.md states the number.
  assert.equal(BAIT_TYPES.length, 9);
});

test(`the example record in ${PAGE} is a record the edition reads`, () => {
  const lines = section('## The run record');
  const start = lines.indexOf('```json');
  const end = lines.indexOf('```', start + 1);
  assert.ok(start >= 0 && end > start, `${PAGE}: "## The run record" has no json block`);
  assert.deepEqual(recordProblems(JSON.parse(lines.slice(start + 1, end).join('\n'))), []);
});

test(`the cells and lines ${PAGE} shows are what the edition prints for them`, () => {
  const flat = page.replace(/\s+/g, ' ');
  const edition = buildEdition(LAB);
  const shown = [
    cellText(agentRow(edition, 'agent-a').cells.prompt_injection),
    cellText(agentRow(edition, 'agent-d').cells.prompt_injection),
    'not run',
    `passed in ${agentRow(edition, 'agent-a').positiveControl.passed} of 3 runs`,
    ...edition.lines.slice(0, 2).map((line) => `- ${line.text}`),
  ];
  for (const text of shown) assert.ok(flat.includes(text), `${PAGE} does not show "${text}"`);
  for (const code of ['0', '1', '2']) {
    assert.ok(section('## Exit codes').some((line) => line.startsWith(`| ${code} |`)), `${PAGE}: no row for exit code ${code}`);
  }
});

/** The words of `command` that start with a dash and are not, whole, one of the options the usage line `usage` names. */
function unnamedOptions(command, usage) {
  // The usage line names its options between brackets and bars: [--json | --svg | --runs].
  const options = usage.split(/[\s[\]|]+/).filter((word) => word.startsWith('-'));
  return command.split(/\s+/).filter((word) => word.startsWith('-') && !options.includes(word));
}

test(`the commands ${PAGE} shows take only the options of the usage line, and one of them is --svg`, () => {
  const usage = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' }).stdout;
  const commands = page
    .split('\n')
    .filter((line) => line.startsWith('node scripts/bait-edition.mjs'))
    .map((line) => line.split('#')[0]);
  assert.ok(commands.some((command) => command.split(/\s+/).includes('--svg')), `${PAGE} shows no command with --svg`);
  for (const command of commands) {
    for (const option of unnamedOptions(command, usage)) {
      assert.fail(`${PAGE}: ${command.trim()}: ${option} is not an option the usage line names`);
    }
  }
});

test(`the check of the commands ${PAGE} shows takes an option of the usage line as a whole word: --run, --js and --sv, parts of --runs, --json and --svg, fail it, as the command refuses them`, () => {
  const usage = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' }).stdout;
  for (const option of ['--json', '--svg', '--runs']) {
    assert.deepEqual(unnamedOptions(`node scripts/bait-edition.mjs ${option} runs/`, usage), [], option);
  }
  for (const option of ['--run', '--js', '--sv']) {
    assert.ok(usage.includes(option), `${option} is no part of the usage line; update this test with a part of one of its options`);
    assert.deepEqual(unnamedOptions(`node scripts/bait-edition.mjs ${option} runs/`, usage), [option]);
    const refused = runOn(LAB, [option]);
    assert.equal(refused.status, 1, option);
    assert.equal(refused.stderr, usage, option);
    assert.equal(refused.stdout, '', option);
  }
});

test(`the title of a dot ${PAGE} shows is the title the dot plot gives that dot`, () => {
  const [run] = all(rowFor(panelFor(plot(LAB), 'prompt_injection'), AGENTS[0]), classed('run'));
  const title = all(run, named('title'))[0].text;
  assert.ok(page.replace(/\s+/g, ' ').includes(`\`${title}\``), `${PAGE} does not show "${title}"`);
});

/** The lines of the first block of `kind`, such as "json", in the page's section under `heading`. */
function block(heading, kind) {
  const lines = section(heading);
  const start = lines.indexOf(`\`\`\`${kind}`);
  const end = lines.indexOf('```', start + 1);
  assert.ok(start >= 0 && end > start, `${PAGE}: "${heading}" has no ${kind} block`);
  return lines.slice(start + 1, end);
}

test(`the table of runs ${PAGE} shows is what --runs prints for its example record, and the texts it quotes are those of the command`, () => {
  const example = JSON.parse(block('## The run record', 'json').join('\n'));
  assert.equal(`${block('## The runs', 'text').join('\n')}\n`, formatRuns([example]));

  const rows = runRows(
    formatRuns([
      record('q1', 'agent-a', { control: ['not_completed'], trials: pi('completed', 'not_completed', 'not_measured') }),
      record('q2', 'agent-a', { control: [] }),
      record('q3', 'agent-a', { trials: pi('not_measured') }),
      record('q4', 'agent-a'),
    ]),
  );
  const flat = page.replace(/\s+/g, ' ');
  for (const text of [...rows[0].slice(5), rows[1][5], rows[2][7], rows[3][7]]) {
    assert.ok(flat.includes(`\`${text}\``), `${PAGE} does not show "${text}"`);
  }
  const commands = page.split('\n').filter((line) => line.startsWith('node scripts/bait-edition.mjs --runs '));
  assert.ok(commands.length > 0, `${PAGE} shows no command with --runs`);
});

test('a directory gives the .json files directly in it, not those of a directory inside it, and a file is read on its own', () => {
  const dir = recordDir(LAB.slice(0, 3));
  try {
    mkdirSync(join(dir, 'older'));
    writeFileSync(join(dir, 'older', 'x.json'), 'not a record');
    assert.deepEqual(readRecords([dir]), { records: LAB.slice(0, 3), problems: [] });
    assert.deepEqual(readRecords([join(dir, 'a2.json')]), { records: [LAB[1]], problems: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
