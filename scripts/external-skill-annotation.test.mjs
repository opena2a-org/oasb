// Tests for the blind annotation stream of the external skill-scanner
// benchmark (scripts/external-skill-annotation.ts, the --annotation-export and
// --verify-export switches of scripts/run-external-skill-benchmark.ts).
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.
//
// The corpus is synthetic and written into a temporary directory. Each leak
// the export must not carry (a _meta.json, a class or original directory
// name, a scanner field, a corpus label) is planted into a copy of a written
// export in turn, and the export check must fail on each.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(repo, 'scripts', 'run-external-skill-benchmark.ts');
const sha256 = data => createHash('sha256').update(data).digest('hex');

let ann;
let adj;
let root;
let corpus;

// [class directory, sample directory, { relative path: content }]
const SAMPLES = [
  ['benign', 'note-taker', { 'SKILL.md': '# notes\n', '_meta.json': '{"label":"benign"}' }],
  ['benign', 'weather', { 'SKILL.md': '# weather\n', 'docs/_meta.json': '{"source":"x"}', 'docs/usage.md': 'usage\n' }],
  ['benign', 'calendar', { 'SKILL.md': '# calendar\n', 'scripts/sync.py': 'print(1)\n' }],
  ['benign', 'pdf-tools', { 'SKILL.md': '# pdf\n' }],
  ['benign', 'converter', { 'SKILL.md': '# convert\n', '_meta.json': '{}' }],
  // A sample that holds its own name inside its tree: the artifact, copied as is.
  ['benign', 'self-named', { 'SKILL.md': '# self\n', 'self-named/run.sh': 'echo self\n' }],
  ['benign', 'twin', { 'SKILL.md': '# twin\n', 'extra.txt': 'more\n' }],
  ['benign', 'flipped', { 'SKILL.md': '# flipped\n' }],
  ['malware', 'twin-m', { 'SKILL.md': '# twin\n' }],
  ['malware', 'stealer__PI_B1', { 'SKILL.md': '# steal\n' }],
  ['malware', 'beacon__CI_B2', { 'SKILL.md': '# beacon\n' }],
  ['malware', 'dropper', { 'SKILL.md': '# drop\n' }],
  ['malware', 'wiper', { 'SKILL.md': '# wipe\n' }],
  ['malware', 'miner', { 'SKILL.md': '# mine\n' }],
  ['malware', 'phisher', { 'SKILL.md': '# phish\n' }],
  ['malware', 'flipped-m', { 'SKILL.md': '# flipped m\n' }],
];
const CLASS_DIRS = { malicious: 'malware', benign: 'benign' };
const keyOf = (cls, name) => `${cls === 'malware' ? 'malicious' : 'benign'}/${name}`;

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
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

const samples = dir => SAMPLES.map(([cls, name]) => ({ key: keyOf(cls, name), label: cls === 'malware' ? 'malicious' : 'benign', name, dir: join(dir, cls, name) }));
const lookupOf = dir => new Map(samples(dir).map(s => [s.key, { dir: s.dir, name: s.name }]));
const PAIRS = [{ benign: 'benign/twin', malicious: 'malicious/twin-m' }];

before(async () => {
  ann = await tsImport('./external-skill-annotation.ts', import.meta.url).then(m => (m.writeAnnotationExport ? m : m.default));
  adj = await tsImport('./external-skill-adjudication.ts', import.meta.url).then(m => (m.contestedPairs ? m : m.default));
  root = mkdtempSync(join(tmpdir(), 'oasb-annotation-'));
  corpus = join(root, 'corpus');
  writeCorpus(corpus, SAMPLES);
  writeFileSync(join(root, 'flips.txt'), '# a unit flipped these\nbenign/flipped\nmalicious/flipped-m\n');
});

after(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function write(name, options = {}) {
  const exportDir = join(root, 'exports', name);
  const keyFile = join(root, 'keys', `${name}.json`);
  const result = ann.writeAnnotationExport({
    samples: samples(corpus),
    classRoot: corpus,
    classDirs: CLASS_DIRS,
    corpus: { commit: 'f'.repeat(40), manifestSha256: 'e'.repeat(64) },
    contested: PAIRS,
    decoys: 3,
    seed: 'seed-1',
    flipLists: [{ path: join(root, 'flips.txt'), keys: ann.readFlipList(join(root, 'flips.txt')) }],
    exportDir,
    keyFile,
    ...options,
  });
  return { exportDir, keyFile, result, key: JSON.parse(readFileSync(keyFile, 'utf8')) };
}

function walk(dir, rel = '', out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const r = rel === '' ? e.name : `${rel}/${e.name}`;
    out.push(r);
    if (e.isDirectory()) walk(join(dir, e.name), r, out);
  }
  return out;
}

test('the contested pairs of the fixture corpus are the twin and its copy', () => {
  assert.deepEqual(adj.contestedPairs(samples(corpus)), PAIRS);
});

test('the stream: contested samples first, then the flip list, then every other benign sample and the decoys, under position ids', () => {
  const { exportDir, keyFile, key, result } = write('stream');
  assert.ok(!keyFile.startsWith(exportDir), 'the key is outside the export');
  const roles = key.items.map(i => i.role);
  assert.deepEqual(roles.slice(0, 2), ['contested', 'contested']);
  assert.deepEqual(new Set(key.items.slice(0, 2).map(i => i.sample)), new Set(['benign/twin', 'malicious/twin-m']));
  assert.deepEqual(roles.slice(2, 4), ['flip', 'flip']);
  assert.deepEqual(new Set(key.items.slice(2, 4).map(i => i.sample)), new Set(['benign/flipped', 'malicious/flipped-m']));
  assert.ok(roles.slice(4).every(r => r === 'benign' || r === 'decoy'));
  // Every benign sample is in the stream once; three decoys, none contested or flipped.
  const benign = SAMPLES.filter(s => s[0] === 'benign').map(s => keyOf(...s));
  assert.deepEqual(key.items.filter(i => i.label === 'benign').map(i => i.sample).sort(), benign.sort());
  const decoys = key.items.filter(i => i.role === 'decoy').map(i => i.sample);
  assert.equal(decoys.length, 3);
  assert.ok(decoys.every(d => d.startsWith('malicious/') && d !== 'malicious/twin-m' && d !== 'malicious/flipped-m'));
  assert.deepEqual(result.roles, { contested: 2, flip: 2, benign: 6, decoy: 3 });
  // Position ids, four digits, listed in stream.txt in order.
  assert.deepEqual(key.items.map(i => i.id), key.items.map((_, n) => String(n + 1).padStart(4, '0')));
  assert.equal(readFileSync(join(exportDir, 'stream.txt'), 'utf8'), key.items.map(i => i.id).join('\n') + '\n');
  assert.deepEqual(readdirSync(exportDir).sort(), [...key.items.map(i => i.id), 'stream.txt'].sort());
  assert.deepEqual(ann.verifyAnnotationExport(exportDir, key, lookupOf(corpus), CLASS_DIRS), []);
});

test('the copies hold each sample byte for byte, with every _meta.json left out and no class or directory name added', () => {
  const { exportDir, key } = write('copies');
  const all = walk(exportDir);
  assert.deepEqual(all.filter(p => p.endsWith('_meta.json')), []);
  for (const p of all) {
    for (const part of p.split('/')) {
      assert.ok(!['benign', 'malware', 'malicious'].includes(part.toLowerCase()), `${p} names a class`);
      assert.ok(!SAMPLES.some(([, name]) => name !== 'self-named' && name.toLowerCase() === part.toLowerCase()), `${p} names a sample directory`);
    }
  }
  const weather = key.items.find(i => i.sample === 'benign/weather');
  assert.deepEqual(walk(join(exportDir, weather.id)).sort(), ['SKILL.md', 'docs', 'docs/usage.md']);
  assert.equal(sha256(readFileSync(join(exportDir, weather.id, 'docs', 'usage.md'))), sha256('usage\n'));
  // The sample's own inner directory of its own name is the artifact, and the check accepts it.
  const self = key.items.find(i => i.sample === 'benign/self-named');
  assert.ok(existsSync(join(exportDir, self.id, 'self-named', 'run.sh')));
  // No scanner field and no corpus label in the files the export writes itself.
  const stream = readFileSync(join(exportDir, 'stream.txt'), 'utf8');
  assert.match(stream, /^(\d{4}\n)+$/);
});

test('the order and the decoys are seeded: the same seed gives the same stream, another seed another order', () => {
  const a = write('seed-a').key.items;
  const b = write('seed-b').key.items;
  const c = write('seed-c', { seed: 'seed-2' }).key.items;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map(i => i.sample), c.map(i => i.sample));
});

/** Plants one leak into a copy of a written export and returns the check's problems. */
function plant(base, label, edit) {
  const copy = join(root, 'planted', label);
  cpSync(base.exportDir, copy, { recursive: true });
  edit(copy, base.key);
  return ann.verifyAnnotationExport(copy, base.key, lookupOf(corpus), CLASS_DIRS);
}

test('the export check fails on a planted _meta.json, at the item root and below it', () => {
  const base = write('plant-meta');
  const id = base.key.items[5].id;
  const atRoot = plant(base, 'meta-root', dir => writeFileSync(join(dir, id, '_meta.json'), '{"source":"fixture"}'));
  assert.ok(atRoot.some(p => /carries a _meta\.json/.test(p)), atRoot.join('\n'));
  const below = plant(base, 'meta-below', dir => {
    mkdirSync(join(dir, id, 'nested'), { recursive: true });
    writeFileSync(join(dir, id, 'nested', '_meta.json'), '{}');
  });
  assert.ok(below.some(p => /carries a _meta\.json/.test(p)), below.join('\n'));
});

test('the export check fails on a planted class or original directory name', () => {
  const base = write('plant-name');
  const item = base.key.items.find(i => i.sample === 'benign/calendar');
  const renamed = plant(base, 'name-item-dir', dir => renameSync(join(dir, item.id), join(dir, 'calendar')));
  assert.ok(renamed.some(p => /top-level entry calendar .*class or original directory name/.test(p)), renamed.join('\n'));
  const classDir = plant(base, 'name-class-dir', dir => {
    mkdirSync(join(dir, item.id, 'benign'));
    writeFileSync(join(dir, item.id, 'benign', 'x.md'), 'x\n');
  });
  assert.ok(classDir.some(p => /class or original directory name \(benign\)/.test(p)), classDir.join('\n'));
  const emptyClassDir = plant(base, 'name-empty-class-dir', dir => mkdirSync(join(dir, item.id, 'malware')));
  assert.ok(emptyClassDir.some(p => /class or original directory name \(malware\)/.test(p)), emptyClassDir.join('\n'));
  const topClass = plant(base, 'name-top-class', dir => mkdirSync(join(dir, 'malware')));
  assert.ok(topClass.some(p => /top-level entry malware .*class or original directory name/.test(p)), topClass.join('\n'));
  const ownName = plant(base, 'name-own', dir => writeFileSync(join(dir, item.id, 'calendar.md'), 'x\n'));
  assert.ok(ownName.some(p => /calendar\.md: .*class or original directory name/.test(p)), ownName.join('\n'));
  const inStream = plant(base, 'name-stream', dir => {
    const lines = readFileSync(join(dir, 'stream.txt'), 'utf8').split('\n');
    lines[0] = `${lines[0]} stealer__PI_B1`;
    writeFileSync(join(dir, 'stream.txt'), lines.join('\n'));
  });
  assert.ok(inStream.some(p => /stream\.txt line 1 .*class or original directory name/.test(p)), inStream.join('\n'));
});

test('the export check fails on a planted scanner field', () => {
  const base = write('plant-scanner');
  const id = base.key.items[4].id;
  const inStream = plant(base, 'scanner-stream', dir => {
    const lines = readFileSync(join(dir, 'stream.txt'), 'utf8').split('\n');
    lines[2] = `${lines[2]} {"verdict":"malicious","flaggedBy":["AST-EXFIL-001"]}`;
    writeFileSync(join(dir, 'stream.txt'), lines.join('\n'));
  });
  assert.ok(inStream.some(p => /stream\.txt line 3 .*scanner field/.test(p)), inStream.join('\n'));
  const inItem = plant(base, 'scanner-item', dir => writeFileSync(join(dir, id, 'scan.json'), JSON.stringify({ checkId: 'AST-EXFIL-001', severity: 'high', passed: false })));
  assert.ok(inItem.some(p => /scan\.json: .*scanner field/.test(p)), inItem.join('\n'));
  const atTop = plant(base, 'scanner-top', dir => writeFileSync(join(dir, 'predictions.jsonl'), '{"sample":"x","verdict":"benign"}\n'));
  assert.ok(atTop.some(p => /top-level entry predictions\.jsonl .*scanner field/.test(p)), atTop.join('\n'));
});

test('the export check fails on a planted corpus label', () => {
  const base = write('plant-label');
  const id = base.key.items[6].id;
  const inStream = plant(base, 'label-stream', dir => {
    const lines = readFileSync(join(dir, 'stream.txt'), 'utf8').split('\n');
    lines[3] = `${lines[3]} benign`;
    writeFileSync(join(dir, 'stream.txt'), lines.join('\n'));
  });
  assert.ok(inStream.some(p => /stream\.txt line 4 .*corpus label/.test(p)), inStream.join('\n'));
  const inItem = plant(base, 'label-item', dir => writeFileSync(join(dir, id, 'notes.txt'), 'class: malicious\n'));
  assert.ok(inItem.some(p => /notes\.txt: .*corpus label/.test(p)), inItem.join('\n'));
  const edited = plant(base, 'label-edited', dir => writeFileSync(join(dir, id, 'SKILL.md'), readFileSync(join(dir, id, 'SKILL.md'), 'utf8') + 'label: benign\n'));
  assert.ok(edited.some(p => /SKILL\.md: differs from the sample/.test(p)), edited.join('\n'));
  const keyInside = plant(base, 'label-key-inside', dir => cpSync(base.keyFile, join(dir, 'key.json')));
  assert.ok(keyInside.some(p => /top-level entry key\.json .*(corpus label|scanner field)/.test(p)), keyInside.join('\n'));
});

test('the writer refuses: a key inside the export, an export inside the corpus, a written export, too many decoys, an unknown flip-list sample, a symlink', () => {
  const exportDir = join(root, 'exports', 'refuse');
  assert.throws(() => write('refuse-key-inside', { exportDir, keyFile: join(exportDir, 'key.json') }), /outside the export/);
  assert.throws(() => write('refuse-in-corpus', { exportDir: join(corpus, 'benign', 'export') }), /outside the corpus/);
  write('refuse-twice');
  assert.throws(() => write('refuse-twice'), /exists/);
  assert.throws(() => write('refuse-decoys', { decoys: 100 }), /100 decoys asked for/);
  assert.throws(() => write('refuse-flip', { flipLists: [{ path: 'flips', keys: ['benign/not-in-corpus'] }] }), /not a sample of the corpus/);
  assert.ok(!existsSync(join(root, 'exports', 'refuse-decoys')) && !existsSync(join(root, 'exports', 'refuse-decoys.incomplete')));
  const linked = join(root, 'linked-corpus');
  writeCorpus(linked, SAMPLES);
  symlinkSync('/etc/hosts', join(linked, 'benign', 'pdf-tools', 'hosts'));
  assert.throws(() => ann.writeAnnotationExport({
    samples: samples(linked), classRoot: linked, classDirs: CLASS_DIRS, corpus: { commit: null, manifestSha256: 'e'.repeat(64) },
    contested: PAIRS, decoys: 1, seed: 's', flipLists: [], exportDir: join(root, 'exports', 'refuse-link'), keyFile: join(root, 'keys', 'refuse-link.json'),
  }), /symlink or special file/);
  assert.ok(!existsSync(join(root, 'exports', 'refuse-link')) && !existsSync(join(root, 'exports', 'refuse-link.incomplete')));
});

test('the CLI writes the export and its key, and --verify-export passes it and fails a planted copy', () => {
  const exportDir = join(root, 'cli-export');
  const keyFile = join(root, 'cli-key.json');
  const w = spawnSync(process.execPath, ['--import', 'tsx', cli, '--annotation-export', exportDir, '--annotation-key', keyFile, '--corpus', corpus,
    '--decoys', '2', '--seed', 'cli-seed', '--flip-list', join(root, 'flips.txt'), '--expect-contested', '1'], { cwd: repo, encoding: 'utf8' });
  assert.equal(w.status, 0, w.stdout + w.stderr);
  assert.match(w.stdout, /annotation stream: 12 items \(contested 2, flip list 2, benign 6, decoys 2\)/);
  const v = spawnSync(process.execPath, ['--import', 'tsx', cli, '--verify-export', exportDir, '--annotation-key', keyFile, '--corpus', corpus], { cwd: repo, encoding: 'utf8' });
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.match(v.stdout, /consistent with its key and the corpus/);
  const key = JSON.parse(readFileSync(keyFile, 'utf8'));
  writeFileSync(join(exportDir, key.items[0].id, '_meta.json'), '{}');
  const bad = spawnSync(process.execPath, ['--import', 'tsx', cli, '--verify-export', exportDir, '--annotation-key', keyFile, '--corpus', corpus], { cwd: repo, encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /carries a _meta\.json/);
  const missing = spawnSync(process.execPath, ['--import', 'tsx', cli, '--annotation-export', join(root, 'cli-export-2'), '--corpus', corpus, '--decoys', '2', '--seed', 's'], { cwd: repo, encoding: 'utf8' });
  assert.equal(missing.status, 2, 'an export needs --annotation-key');
});
