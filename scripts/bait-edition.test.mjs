// Tests for scripts/bait-edition.mjs, which reads the records of lab runs
// against named agents into a grid of agents by bait type, and for the page
// that describes it, docs/bait-compliance.md.
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
  cellText,
  formatEdition,
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

test('--help exits 0, and no path or an option the command does not take exits 1 with the usage line', () => {
  const usage = 'Usage: node scripts/bait-edition.mjs [--json] <record.json | directory>...\n';
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  const help = run('--help');
  assert.equal(help.status, 0);
  assert.equal(help.stdout, usage);
  for (const args of [[], ['--json'], ['--csv', 'runs']]) {
    const r = run(...args);
    assert.equal(r.status, 1, args.join(' '));
    assert.equal(r.stderr, usage, args.join(' '));
    assert.equal(r.stdout, '', args.join(' '));
  }
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
