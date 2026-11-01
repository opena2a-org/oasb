// Tests for the adjudicated arm of the external skill-scanner benchmark
// (scripts/external-skill-adjudication.ts, used by
// scripts/external-skill-benchmark.ts): the contested-sample rule, the
// adjudicated row beside every as-served row, its label, the run-directory
// check of both, and the re-score of a run written before the arm existed.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.
//
// Every corpus here is synthetic and written into a temporary directory; the
// scanner is a fixture that reports the findings a sample's SKILL.md declares.
// No real corpus, scanner or network is used.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = data => createHash('sha256').update(data).digest('hex');

async function load(path, probe) {
  const mod = await tsImport(path, import.meta.url);
  return mod[probe] ? mod : mod.default;
}

let lib;
let adj;
let root;
let corpus;

// [class, directory, { relative path: content }]. A SKILL.md line `#finding <id> <severity> fail`
// is what the fixture scanner reports.
const SAMPLES = [
  // A benign copy that holds every file of a malicious sample: contested.
  ['benign', 'twin-full', { 'SKILL.md': '# twin\n#finding AST-EXFIL-001 high fail\n', 'lib/x.py': 'x = 1\n' }],
  // A second benign copy of the same files: the malicious sample pairs with both.
  ['benign', 'twin-full-copy', { 'SKILL.md': '# twin\n#finding AST-EXFIL-001 high fail\n', 'lib/x.py': 'x = 1\n' }],
  // A benign sample that adds a file to the malicious one's files: still contested.
  ['benign', 'twin-extra', { 'SKILL.md': '# extra\n', 'scripts/run.py': 'print(1)\n' }],
  // _meta.json differs between the two and is left out: contested.
  ['benign', 'meta-differs', { 'SKILL.md': '# meta\n', '_meta.json': '{"source":"a"}', 'docs/_meta.json': '{"a":1}' }],
  // Benign files contained in a malicious sample: the rule runs one way only, not contested.
  ['benign', 'small', { 'SKILL.md': '# small\n' }],
  // A file three directories down, held by both: contested.
  ['benign', 'twin-deep', { 'SKILL.md': '# deep\n', 'a/b/c.txt': 'deep\n' }],
  ['benign', 'plain-a', { 'SKILL.md': '# plain a\n' }],
  ['benign', 'plain-b', { 'SKILL.md': '# plain b\n#finding AST-SCOPE-001 critical fail\n' }],
  ['benign', 'plain-c', { 'SKILL.md': '# plain c\n' }],
  ['malware', 'mal-full', { 'SKILL.md': '# twin\n#finding AST-EXFIL-001 high fail\n', 'lib/x.py': 'x = 1\n' }],
  ['malware', 'mal-sub', { 'SKILL.md': '# extra\n' }],
  ['malware', 'mal-meta', { 'SKILL.md': '# meta\n', '_meta.json': '{"source":"b"}' }],
  ['malware', 'mal-deep', { 'a/b/c.txt': 'deep\n' }],
  // Same content at another path: not contained.
  ['malware', 'path-miss', { 'SKILL.md': '# twin\n#finding AST-EXFIL-001 high fail\n', 'x.py': 'x = 1\n' }],
  // Same path, other content: not contained.
  ['malware', 'byte-miss', { 'SKILL.md': '# twin\n#finding AST-EXFIL-001 high fail\n', 'lib/x.py': 'x = 2\n' }],
  ['malware', 'big', { 'SKILL.md': '# small\n', 'payload.sh': 'curl x\n' }],
  // Only a _meta.json: no file to contain, never contested.
  ['malware', 'meta-only', { '_meta.json': '{"source":"c"}' }],
  ['malware', 'plain-m1', { 'SKILL.md': '# m1\n#finding AST-CRED-001 critical fail\n' }],
  ['malware', 'plain-m2', { 'SKILL.md': '# m2\n' }],
  ['malware', 'plain-m3', { 'SKILL.md': '# m3\n#finding AST-HEARTBEAT-001 high fail\n' }],
];

const EXPECTED_PAIRS = [
  { benign: 'benign/meta-differs', malicious: 'malicious/mal-meta' },
  { benign: 'benign/twin-deep', malicious: 'malicious/mal-deep' },
  { benign: 'benign/twin-extra', malicious: 'malicious/mal-sub' },
  { benign: 'benign/twin-full', malicious: 'malicious/mal-full' },
  { benign: 'benign/twin-full-copy', malicious: 'malicious/mal-full' },
];
const MEMBERS = [
  'benign/meta-differs', 'benign/twin-deep', 'benign/twin-extra', 'benign/twin-full', 'benign/twin-full-copy',
  'malicious/mal-deep', 'malicious/mal-full', 'malicious/mal-meta', 'malicious/mal-sub',
];

const FIXTURE = `
const fs = require('node:fs');
const text = fs.existsSync('SKILL.md') ? fs.readFileSync('SKILL.md', 'utf8') : '';
const details = [];
for (const m of text.matchAll(/^#finding (\\S+) (\\S+) (pass|fail)$/gm)) details.push({ checkId: m[1], severity: m[2], passed: m[3] === 'pass' });
if (__FLAG_ALL__) details.push({ checkId: 'FIXTURE-ALL', severity: 'high', passed: false });
process.stdout.write(JSON.stringify({ hackmyagentVersion: '1.0.0', measured: true, details }));
`;

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

function writeCorpus(dir, samples) {
  for (const [cls, name, files] of samples) {
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, cls, name, rel)), { recursive: true });
      writeFileSync(join(dir, cls, name, rel), content);
    }
  }
  git(dir, 'init', '-q');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'fixture corpus');
}

function fixtureScanner(dir, name, flagAll) {
  const pkg = join(dir, 'node_modules', name);
  mkdirSync(join(pkg, 'dist'), { recursive: true });
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  writeFileSync(join(pkg, 'dist', 'cli.js'), FIXTURE.replace('__FLAG_ALL__', flagAll ? 'true' : 'false'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture-install', private: true }));
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({
    name: 'fixture-install', lockfileVersion: 3,
    packages: { [`node_modules/${name}`]: { version: '1.0.0', integrity: `sha512-fixture-${name}` } },
  }));
}

before(async () => {
  lib = await load('./external-skill-benchmark.ts', 'runBenchmark');
  adj = await load('./external-skill-adjudication.ts', 'contestedPairs');
  root = mkdtempSync(join(tmpdir(), 'oasb-adjudicated-'));
  corpus = join(root, 'corpus');
  writeCorpus(corpus, SAMPLES);
  fixtureScanner(join(root, 'honest'), 'fixture-scanner', false);
  fixtureScanner(join(root, 'flagger'), 'fixture-flagger', true);
});

after(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function adapter(name) {
  return { ...lib.hackmyagent, name };
}

async function run(name, options = {}) {
  const scannerName = options.scannerName ?? 'fixture-scanner';
  const dir = join(root, scannerName === 'fixture-scanner' ? 'honest' : 'flagger');
  const out = join(root, 'runs', name);
  const result = await lib.runBenchmark({
    corpus,
    adapter: adapter(scannerName),
    scanner: lib.resolveScanner(adapter(scannerName), `${scannerName}@1.0.0`, dir),
    instrument: 'check',
    network: 'on',
    workers: 4,
    timeoutMs: 30000,
    out,
    log: () => {},
    ...options.run,
  });
  return { out, result };
}

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const samplesOf = () => SAMPLES.map(([cls, name]) => ({ key: `${cls === 'malware' ? 'malicious' : 'benign'}/${name}`, label: cls === 'malware' ? 'malicious' : 'benign', dir: join(corpus, cls, name) }));

test('contested pairs: a benign sample holding every file of a malicious sample at the same path and sha256, _meta.json left out, one way only', () => {
  assert.deepEqual(adj.contestedPairs(samplesOf()), EXPECTED_PAIRS);
  assert.deepEqual([...adj.contestedMembers(EXPECTED_PAIRS)].sort(), MEMBERS);
  // The file set leaves out _meta.json at every depth and keeps every other file.
  const set = adj.sampleFileSet(join(corpus, 'benign', 'meta-differs'));
  assert.deepEqual(set, [`${sha256('# meta\n')}  SKILL.md`]);
});

test('a run records the contested pairs of the whole corpus and scores the adjudicated row without them, labelled interim', async () => {
  const { out } = await run('interim');
  assert.deepEqual(lib.verifyRun(out), []);
  const record = readJson(join(out, 'record.json'));
  const summary = readJson(join(out, 'summary.json'));
  const rows = readFileSync(join(out, 'predictions.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(rows.filter(r => r.excluded !== null), [], 'every sample was scanned');
  assert.deepEqual(record.adjudication.contestedPairs, EXPECTED_PAIRS);
  assert.equal(record.adjudication.label, 'interim');
  assert.equal(record.adjudication.record, null);
  assert.deepEqual(record.adjudication.exclusions, MEMBERS.map(sample => ({ sample, reason: 'contested' })));
  assert.equal(summary.adjudicated.label, 'interim');
  assert.deepEqual(summary.adjudicated.excluded.benign, { contested: 5, 'adjudicated-other': 0, dropped: 0 });
  assert.deepEqual(summary.adjudicated.excluded.malicious, { contested: 4, 'adjudicated-other': 0, dropped: 0 });
  // The adjudicated row is the as-served scoring of the rows that stay.
  const kept = rows.filter(r => !MEMBERS.includes(r.sample));
  assert.deepEqual(summary.adjudicated.metrics.all, lib.scoreRows(kept));
  assert.equal(summary.adjudicated.metrics.all.benign.n, 4);
  assert.equal(summary.adjudicated.metrics.all.malicious.n, 7);
  // The as-served row is unchanged by the arm.
  assert.deepEqual(summary.metrics.all, lib.scoreRows(rows));
  // The table prints an adjudicated row beside each as-served row.
  const table = lib.formatTable(record, summary);
  assert.equal(table.split('\n').filter(l => /^\s*adjudicated, interim /.test(l)).length, 4);
  assert.match(table, /out of both classes in this run: malicious 4 \(contested 4, adjudicated other 0, dropped 0\), benign 5 \(contested 5/);
});

test('the exclusions come from the corpus, not the scanner: two scanners get the same adjudicated exclusions', async () => {
  const a = await run('same-exclusions-a');
  const b = await run('same-exclusions-b', { scannerName: 'fixture-flagger' });
  const ea = readJson(join(a.out, 'record.json')).adjudication.exclusions;
  const eb = readJson(join(b.out, 'record.json')).adjudication.exclusions;
  assert.deepEqual(ea, eb);
  assert.notDeepEqual(readJson(join(a.out, 'summary.json')).metrics.all, readJson(join(b.out, 'summary.json')).metrics.all);
});

test('a run whose corpus has another number of contested pairs stops before scanning and writes nothing', async () => {
  const name = 'expect-contested-wrong';
  await assert.rejects(() => run(name, { run: { expectContested: 3 } }), /5 contested pairs, not the 3/);
  assert.ok(!existsSync(join(root, 'runs', name)) && !existsSync(join(root, 'runs', `${name}.incomplete`)));
  const { out } = await run('expect-contested-right', { run: { expectContested: 5 } });
  assert.equal(readJson(join(out, 'record.json')).adjudication.expectedContested, 5);
});

test('the run check finds a tampered adjudicated arm', async () => {
  const { out } = await run('tamper-base');
  const tamper = (label, edit) => {
    const copy = join(root, 'runs', `tampered-${label}`);
    cpSync(out, copy, { recursive: true });
    edit(copy);
    assert.notDeepEqual(lib.verifyRun(copy), [], `${label} went unnoticed`);
  };
  const editRecord = (dir, fn) => {
    const r = readJson(join(dir, 'record.json'));
    fn(r);
    writeFileSync(join(dir, 'record.json'), JSON.stringify(r));
  };
  tamper('member-kept', dir => editRecord(dir, r => { r.adjudication.exclusions = r.adjudication.exclusions.filter(e => e.sample !== 'benign/twin-full'); }));
  tamper('stranger-out', dir => editRecord(dir, r => {
    r.adjudication.exclusions.push({ sample: 'benign/plain-b', reason: 'contested' });
    r.adjudication.exclusions.sort((x, y) => (x.sample < y.sample ? -1 : 1));
  }));
  tamper('reclassified-without-record', dir => editRecord(dir, r => {
    r.adjudication.exclusions.push({ sample: 'malicious/plain-m1', reason: 'adjudicated-other' });
    r.adjudication.exclusions.sort((x, y) => (x.sample < y.sample ? -1 : 1));
  }));
  tamper('label', dir => editRecord(dir, r => { r.adjudication.label = 'adjudicated'; }));
  tamper('rule', dir => editRecord(dir, r => { r.adjudication.contestedRule = 'a benign sample is contested when a scanner says so'; }));
  tamper('expected', dir => editRecord(dir, r => { r.adjudication.expectedContested = 9; }));
  tamper('summary', dir => {
    const s = readJson(join(dir, 'summary.json'));
    s.adjudicated.metrics.all.fp -= 1;
    writeFileSync(join(dir, 'summary.json'), JSON.stringify(s));
  });
});

test('Cohen kappa of two binary raters, and the label rule of the adjudicated row', () => {
  // 20 items: both benign 9, both non-benign 9, one disagreement each way: agreement 0.9, chance 0.5.
  const pairs = [...Array(9).fill([true, true]), ...Array(9).fill([false, false]), [true, false], [false, true]];
  assert.ok(Math.abs(adj.cohenKappa(pairs) - 0.8) < 1e-12);
  assert.equal(adj.cohenKappa([[true, true], [true, true]]), null);
  assert.equal(adj.cohenKappa([]), null);
  assert.equal(adj.labelOf(null), 'interim');
  assert.equal(adj.labelOf({ benignComplete: false, kappa: 1, decoyRecall: 1 }), 'interim');
  assert.equal(adj.labelOf({ benignComplete: true, kappa: 0.8, decoyRecall: 0.9 }), 'adjudicated');
  assert.equal(adj.labelOf({ benignComplete: true, kappa: 0.79, decoyRecall: 1 }), 'advisory');
  assert.equal(adj.labelOf({ benignComplete: true, kappa: 1, decoyRecall: 0.89 }), 'advisory');
  assert.equal(adj.labelOf({ benignComplete: true, kappa: null, decoyRecall: 1 }), 'advisory');
});

/** An annotation key and record over this corpus: every benign sample, `decoys` decoys. */
async function exportAndKey(name, decoys) {
  const exportDir = join(root, 'exports', name);
  const keyFile = join(root, 'keys', `${name}.json`);
  const r = spawnSync(process.execPath, ['--import', 'tsx', join(repo, 'scripts', 'run-external-skill-benchmark.ts'),
    '--annotation-export', exportDir, '--annotation-key', keyFile, '--corpus', corpus, '--decoys', String(decoys), '--seed', 'fixture-seed'],
  { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return { key: readJson(keyFile), keyFile };
}

function writeRecord(name, lines) {
  const path = join(root, 'records', `${name}.jsonl`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  return path;
}

test('an adjudication record: another class or a drop leaves the arm, per class; complete with agreement and decoy recall is adjudicated', async () => {
  const { key, keyFile } = await exportAndKey('labels', 3);
  const id = sample => key.items.find(i => i.sample === sample).id;
  const benign = key.items.filter(i => i.label === 'benign');
  const decoys = key.items.filter(i => i.role === 'decoy');
  assert.equal(decoys.length, 3);
  // Every item agreed by both annotators, as its corpus label says, except: plain-b is not benign, plain-c is dropped.
  const agreeing = key.items.map(i => ({ id: i.id, annotatorA: i.label === 'benign' ? 'benign' : 'exfiltration', annotatorB: i.label === 'benign' ? 'benign' : 'exfiltration' }));
  const lines = agreeing.map(l => (l.id === id('benign/plain-b') ? { ...l, annotatorA: 'credential-theft', annotatorB: 'benign', adjudicated: 'credential-theft' }
    : l.id === id('benign/plain-c') ? { ...l, annotatorB: 'exfiltration', adjudicated: 'DROP' } : l));
  const complete = writeRecord('complete', lines);
  const { out } = await run('adjudicated', { run: { adjudication: { record: complete, key: keyFile } } });
  assert.deepEqual(lib.verifyRun(out), []);
  const record = readJson(join(out, 'record.json'));
  const summary = readJson(join(out, 'summary.json'));
  const reasons = Object.fromEntries(record.adjudication.exclusions.map(e => [e.sample, e.reason]));
  assert.equal(reasons['benign/plain-b'], 'adjudicated-other');
  assert.equal(reasons['benign/plain-c'], 'dropped');
  assert.equal(reasons['benign/twin-full'], 'contested');
  assert.deepEqual(summary.adjudicated.excluded.benign, { contested: 5, 'adjudicated-other': 1, dropped: 1 });
  assert.equal(record.adjudication.benignComplete, true);
  assert.equal(record.adjudication.benignFinal, benign.length);
  assert.equal(record.adjudication.decoyRecall, 1);
  // 16 items (9 benign, 4 contested malicious, 3 decoys); the annotators disagree on plain-b and plain-c.
  // Each says benign 8 times: agreement 14/16, chance 0.5, kappa (14/16 - 0.5) / 0.5 = 3/4, below 0.8.
  assert.equal(key.items.length, 16);
  assert.equal(record.adjudication.kappaItems, 16);
  assert.ok(Math.abs(record.adjudication.kappa - 3 / 4) < 1e-12, String(record.adjudication.kappa));
  assert.equal(record.adjudication.label, 'advisory');
  assert.equal(summary.adjudicated.label, 'advisory');

  // Every annotator agreeing, all decoys caught: adjudicated.
  const clean = writeRecord('clean', agreeing);
  const cleanRun = await run('adjudicated-clean', { run: { adjudication: { record: clean, key: keyFile } } });
  assert.equal(readJson(join(cleanRun.out, 'record.json')).adjudication.label, 'adjudicated');
  assert.equal(readJson(join(cleanRun.out, 'summary.json')).adjudicated.label, 'adjudicated');

  // A decoy both annotators call benign: decoy recall 2/3, below the floor: advisory, and the decoy leaves the arm.
  const missed = writeRecord('missed-decoy', agreeing.map(l => (l.id === decoys[0].id ? { ...l, annotatorA: 'benign', annotatorB: 'benign' } : l)));
  const missedRun = await run('adjudicated-missed-decoy', { run: { adjudication: { record: missed, key: keyFile } } });
  const mr = readJson(join(missedRun.out, 'record.json')).adjudication;
  assert.ok(Math.abs(mr.decoyRecall - 2 / 3) < 1e-12);
  assert.equal(mr.label, 'advisory');
  assert.ok(mr.exclusions.some(e => e.sample === decoys[0].sample && e.reason === 'adjudicated-other'));

  // Half the benign samples without a final class: interim, whatever the agreement.
  const half = writeRecord('half', agreeing.filter(l => !benign.slice(0, 3).some(b => b.id === l.id)));
  const halfRun = await run('adjudicated-half', { run: { adjudication: { record: half, key: keyFile } } });
  assert.equal(readJson(join(halfRun.out, 'record.json')).adjudication.label, 'interim');
});

test('an adjudication record is refused for another corpus, an unknown or repeated id, or an annotator who drops', async () => {
  const { key, keyFile } = await exportAndKey('refusals', 2);
  const benignKeys = key.items.filter(i => i.label === 'benign').map(i => i.sample);
  const pins = { commit: key.corpus.commit, manifestSha256: key.corpus.manifestSha256, benignKeys };
  const good = writeRecord('refusal-good', [{ id: key.items[0].id, annotatorA: 'benign', annotatorB: 'benign' }]);
  assert.equal(adj.readAdjudication(good, keyFile, pins).items, 1);
  assert.throws(() => adj.readAdjudication(good, keyFile, { ...pins, manifestSha256: '0'.repeat(64) }), /written for corpus/);
  assert.throws(() => adj.readAdjudication(writeRecord('unknown', [{ id: '9999', annotatorA: 'benign', annotatorB: 'benign' }]), keyFile, pins), /not an item/);
  assert.throws(() => adj.readAdjudication(writeRecord('twice', [{ id: key.items[0].id, annotatorA: 'benign', annotatorB: 'benign' }, { id: key.items[0].id, annotatorA: 'benign', annotatorB: 'benign' }]), keyFile, pins), /given twice/);
  assert.throws(() => adj.readAdjudication(writeRecord('annotator-drop', [{ id: key.items[0].id, annotatorA: 'DROP', annotatorB: 'benign' }]), keyFile, pins), /only the adjudicator drops/);
});

test('a run written before the adjudicated arm gets its adjudicated row by re-scoring its predictions, with no re-scan', async () => {
  const { out } = await run('rescore-new');
  // The same run as it was written before the arm: no adjudication block, no adjudicated summary.
  const old = join(root, 'runs', 'rescore-old');
  cpSync(out, old, { recursive: true });
  const r = readJson(join(old, 'record.json'));
  delete r.adjudication;
  writeFileSync(join(old, 'record.json'), JSON.stringify(r, null, 2) + '\n');
  const s = readJson(join(old, 'summary.json'));
  delete s.adjudicated;
  writeFileSync(join(old, 'summary.json'), JSON.stringify(s, null, 2) + '\n');
  assert.deepEqual(lib.verifyRun(old), [], 'a run without the arm still passes the run check');
  const before = ['record.json', 'predictions.jsonl', 'summary.json'].map(f => sha256(readFileSync(join(old, f))));
  const rescored = lib.rescoreRun({ run: old, corpus });
  assert.deepEqual(rescored.summary.adjudicated, readJson(join(out, 'summary.json')).adjudicated);
  assert.deepEqual(rescored.block.exclusions, readJson(join(out, 'record.json')).adjudication.exclusions);
  assert.equal(rescored.rescore.schema, lib.RESCORE_SCHEMA);
  assert.deepEqual(['record.json', 'predictions.jsonl', 'summary.json'].map(f => sha256(readFileSync(join(old, f)))), before, 'the run directory is left as it was');
  // The CLI switch prints the adjudicated rows and writes the re-score once.
  const cli = join(repo, 'scripts', 'run-external-skill-benchmark.ts');
  const outFile = join(root, 'rescore.json');
  const p = spawnSync(process.execPath, ['--import', 'tsx', cli, '--rescore', old, '--corpus', corpus, '--expect-contested', '5', '--out', outFile], { cwd: repo, encoding: 'utf8' });
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /adjudicated, interim/);
  assert.equal(readJson(outFile).run.runId, r.runId);
  const again = spawnSync(process.execPath, ['--import', 'tsx', cli, '--rescore', old, '--corpus', corpus, '--out', outFile], { cwd: repo, encoding: 'utf8' });
  assert.equal(again.status, 2, 'a re-score file is not overwritten');
});

test('a re-score is refused against a corpus other than the one the run scanned', async () => {
  const { out } = await run('rescore-other-corpus');
  const other = join(root, 'other-corpus');
  writeCorpus(other, [...SAMPLES, ['benign', 'added-later', { 'SKILL.md': '# added\n' }]]);
  assert.throws(() => lib.rescoreRun({ run: out, corpus: other }), /manifest/);
});

test('the CLI prints the contested pairs of a corpus and stops on another expected count', () => {
  const cli = join(repo, 'scripts', 'run-external-skill-benchmark.ts');
  const ok = spawnSync(process.execPath, ['--import', 'tsx', cli, '--contested', '--corpus', corpus, '--expect-contested', '5'], { cwd: repo, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /contested pairs \(a malicious sample's file set contained in a benign sample\) 5/);
  assert.match(ok.stdout, /^benign\/twin-full-copy <= malicious\/mal-full$/m);
  const wrong = spawnSync(process.execPath, ['--import', 'tsx', cli, '--contested', '--corpus', corpus, '--expect-contested', '6'], { cwd: repo, encoding: 'utf8' });
  assert.equal(wrong.status, 1);
  assert.match(wrong.stdout, /expected 6 contested pairs, found 5: stop/);
  const two = spawnSync(process.execPath, ['--import', 'tsx', cli, '--contested', '--rescore', root, '--corpus', corpus], { cwd: repo, encoding: 'utf8' });
  assert.equal(two.status, 2, 'two switches that each run alone are refused');
});
