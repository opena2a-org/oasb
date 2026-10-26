// Tests for the external skill-scanner benchmark runner
// (scripts/external-skill-benchmark.ts, CLI scripts/run-external-skill-benchmark.ts).
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.
//
// Every run here scans a synthetic corpus this file writes into a temporary
// directory, with fixture scanners written beside it: a fixture scanner
// reports the findings a sample's SKILL.md declares, in the JSON report shape
// of `hackmyagent check --json`. No real corpus, scanner or network is used,
// except that the offline-arm cell runs a connect attempt inside the macOS
// sandbox profile, where the sandbox refuses it before any packet leaves.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

async function load(path) {
  const mod = await tsImport(path, import.meta.url);
  // tsx loads the module as CommonJS in this package, so its exports can
  // arrive one level down.
  return mod.verdictOf ? mod : mod.default;
}

let lib;
let adapterModule;
let root;

const sha256 = text => createHash('sha256').update(text).digest('hex');

/** The sample set: each entry is [class, directory name, SKILL.md body]. */
const SAMPLES = [
  ['malware', 'exfil-helper', '#finding AST-EXFIL-001 high fail\n'],
  ['malware', 'cred-reader', '#finding AST-CRED-001 critical fail\n'],
  ['malware', 'quiet-dropper', '#finding AST-PROMPT-001 high fail\n'],
  ['malware', 'beacon', '#finding AST-HEARTBEAT-001 high fail\n#finding AST-GOV-001 high fail\n'],
  ['malware', 'garbled-output', '#emit-garbage\n'],
  ['malware', 'medium-only', '#finding AST-INJECT-001 medium fail\n'],
  ['benign', 'weather-lookup', '#finding AST-GOV-002 high fail\n'],
  ['benign', 'note-taker', '#finding AST-EXFIL-001 high fail\n'],
  ['benign', 'calendar-sync', '#finding AST-SCOPE-001 critical fail\n'],
  ['benign', 'unit-converter', '#finding AST-CRED-001 high pass\n'],
  ['benign', 'pdf-reader', ''],
  ['benign', 'slow-sample', '#hang\n'],
];

/** Writes a fixture scanner package in the layout `npm install <name>` leaves. */
function fixtureScanner(dir, name, body) {
  const pkg = join(dir, 'node_modules', name);
  mkdirSync(join(pkg, 'dist'), { recursive: true });
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  writeFileSync(join(pkg, 'dist', 'cli.js'), body);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture-install', private: true }));
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({
    name: 'fixture-install',
    lockfileVersion: 3,
    packages: { [`node_modules/${name}`]: { version: '1.0.0', integrity: `sha512-fixture-${name}` } },
  }));
  return dir;
}

// The honest fixture: reports what SKILL.md declares. It reports, as a
// critical finding, any sign that the runner leaked something to it: an
// environment variable beyond the five the runner passes, or a HOME that is
// not fresh and empty. It reports, as an info finding that never decides a
// verdict, a working directory that names the sample's class and a
// _meta.json it can read, so a test can see which arm it ran in.
const HONEST = `
const fs = require('node:fs');
const path = require('node:path');
const details = [];
const flag = id => details.push({ checkId: id, severity: 'critical', passed: false });
// macOS sets __CF_USER_TEXT_ENCODING inside every process it starts.
const allowed = new Set(['HOME', 'LANG', 'OPENA2A_TELEMETRY', 'PATH', 'TMPDIR', '__CF_USER_TEXT_ENCODING']);
if (Object.keys(process.env).some(k => !allowed.has(k))) flag('FIXTURE-ENV-LEAK');
if (fs.readdirSync(process.env.HOME).length > 0) flag('FIXTURE-HOME-NOT-EMPTY');
fs.writeFileSync(path.join(process.env.HOME, 'seen'), '1');
const info = id => details.push({ checkId: id, severity: 'info', passed: false });
if (/\\/(malware|benign)\\//.test(process.cwd() + '/')) info('FIXTURE-CLASS-PATH');
if (fs.existsSync('_meta.json')) info('FIXTURE-LABEL-FILE');
const text = fs.existsSync('SKILL.md') ? fs.readFileSync('SKILL.md', 'utf8') : '';
if (text.includes('#emit-garbage')) { process.stdout.write('scan failed'); process.exit(0); }
if (text.includes('#hang') && HANG_CHECK) setInterval(() => {}, 1000);
else {
  for (const m of text.matchAll(/^#finding (\\S+) (\\S+) (pass|fail)$/gm)) details.push({ checkId: m[1], severity: m[2], passed: m[3] === 'pass' });
  FLIP_CHECK
  process.stdout.write(JSON.stringify({ hackmyagentVersion: '1.0.0', measured: true, details }));
}
`;

// The planted label reader: trusts a sample that carries _meta.json, the
// label channel a corpus may hold, and otherwise flags every sample.
const LABEL_READER = `
const fs = require('node:fs');
const details = fs.existsSync('_meta.json') ? [] : [{ checkId: 'FIXTURE-UNTRUSTED', severity: 'high', passed: false }];
process.stdout.write(JSON.stringify({ hackmyagentVersion: '1.0.0', measured: true, details }));
`;

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

let flipFile;
let hangFile;

before(async () => {
  lib = await load('./external-skill-benchmark.ts');
  adapterModule = await load('../src/benchmark/hma-pipeline-adapter.ts');
  root = mkdtempSync(join(tmpdir(), 'oasb-external-bench-'));
  const corpus = join(root, 'corpus');
  for (const [cls, name, body] of SAMPLES) {
    const dir = join(corpus, 'skills', cls, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `# ${name}\n${body}`);
    if (cls === 'benign') writeFileSync(join(dir, '_meta.json'), JSON.stringify({ source: 'fixture' }));
  }
  writeFileSync(join(corpus, 'skills', 'malware', 'inventory.txt'), 'not a sample\n');
  git(corpus, 'init', '-q');
  git(corpus, 'add', '.');
  git(corpus, 'commit', '-q', '-m', 'fixture corpus');
  flipFile = join(root, 'flip');
  hangFile = join(root, 'hang');
  const honest = HONEST
    .replace('FLIP_CHECK', `if (fs.existsSync(${JSON.stringify(flipFile)})) flag('FIXTURE-FLIP');`)
    .replace('HANG_CHECK', `fs.existsSync(${JSON.stringify(hangFile)})`);
  fixtureScanner(join(root, 'honest'), 'fixture-scanner', honest);
  fixtureScanner(join(root, 'reader'), 'fixture-label-reader', LABEL_READER);
});

after(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function adapter(name) {
  return { ...lib.hackmyagent, name };
}

/** Runs the fixture benchmark and returns the run directory and result. */
async function run(name, options = {}) {
  const scannerName = options.scannerName ?? 'fixture-scanner';
  const installDir = join(root, scannerName === 'fixture-scanner' ? 'honest' : 'reader');
  const out = join(root, 'runs', name);
  const result = await lib.runBenchmark({
    corpus: join(root, 'corpus'),
    adapter: adapter(scannerName),
    scanner: lib.resolveScanner(adapter(scannerName), `${scannerName}@1.0.0`, installDir),
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

function predictions(dir) {
  return readFileSync(join(dir, 'predictions.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
}

test('the verdict rule excludes exactly the nine posture checks the published OASB rule excludes, imported, not retyped', () => {
  assert.ok(adapterModule.HARDENING_CHECK_IDS instanceof Set, 'src/benchmark/hma-pipeline-adapter.ts exports HARDENING_CHECK_IDS');
  assert.deepEqual([...lib.RULE_EXCLUSIONS].sort(), [...adapterModule.HARDENING_CHECK_IDS].sort());
  assert.equal(lib.RULE_EXCLUSIONS.size, 9);
  const source = readFileSync(join(repo, 'scripts', 'external-skill-benchmark.ts'), 'utf8');
  assert.match(source, /^import \{ HARDENING_CHECK_IDS \} from '\.\.\/src\/benchmark\/hma-pipeline-adapter\.js';$/m);
  assert.match(source, /^export const RULE_EXCLUSIONS: ReadonlySet<string> = HARDENING_CHECK_IDS;$/m);
  for (const id of lib.RULE_EXCLUSIONS) assert.ok(!source.includes(`'${id}'`), `${id} is retyped in the runner`);
});

test('the verdict rule: each excluded check alone gives benign, at high and at critical', () => {
  for (const id of adapterModule.HARDENING_CHECK_IDS) {
    for (const severity of ['high', 'critical']) {
      assert.equal(lib.verdictOf([{ checkId: id, severity, passed: false }]), 'benign', `${id} ${severity}`);
    }
  }
});

test('the verdict rule: a failed high or critical finding of any other check gives malicious', () => {
  for (const id of ['AST-EXFIL-001', 'AST-SCOPE-003', 'SKILL-MEM-001', 'ANY-OTHER-001']) {
    for (const severity of ['high', 'critical']) {
      assert.equal(lib.verdictOf([{ checkId: id, severity, passed: false }]), 'malicious', `${id} ${severity}`);
      assert.equal(lib.verdictOf([{ checkId: 'AST-GOV-003', severity: 'critical', passed: false }, { checkId: id, severity, passed: false }]), 'malicious');
    }
  }
});

test('the verdict rule: a passed finding, or a failed finding below high, gives benign', () => {
  assert.equal(lib.verdictOf([{ checkId: 'AST-EXFIL-001', severity: 'high', passed: true }]), 'benign');
  for (const severity of ['medium', 'low', 'info']) {
    assert.equal(lib.verdictOf([{ checkId: 'AST-EXFIL-001', severity, passed: false }]), 'benign', severity);
  }
  assert.equal(lib.verdictOf([]), 'benign');
});

test('the adapter parses the check report (details[]) and the secure report (findings[]), and refuses any other output', () => {
  const finding = { checkId: 'AST-EXFIL-001', severity: 'high', passed: false };
  assert.deepEqual(lib.hackmyagent.parse(JSON.stringify({ findings: 1, details: [finding] })).findings, [finding]);
  assert.deepEqual(lib.hackmyagent.parse(JSON.stringify({ findings: [finding], allFindings: [] })).findings, [finding]);
  for (const bad of ['', 'scan failed', '[]', '{}', JSON.stringify({ details: [{ checkId: 'X', severity: 'high' }] }), JSON.stringify({ details: [{ severity: 'high', passed: false }] })]) {
    assert.throws(() => lib.hackmyagent.parse(bad), `${JSON.stringify(bad)} parsed`);
  }
  assert.deepEqual(lib.hackmyagent.instruments.check, ['check', '.', '--json', '--no-registry']);
  assert.deepEqual(lib.hackmyagent.instruments.secure, ['secure', '.', '--json', '--ci', '--no-registry', '--no-contribute']);
});

test('the dev and held-out halves are the first hex digit of sha256 of the directory name, 0-7 and 8-f', () => {
  for (const name of ['exfil-helper__CI_B3', 'weather-lookup', 'a', 'b', 'c', 'd', 'e', 'f', 'g']) {
    const digit = parseInt(sha256(name)[0], 16);
    assert.equal(lib.splitOf(name), digit < 8 ? 'dev' : 'held-out', name);
  }
});

test('a seeded selection is the same for the same seed and differs for another', () => {
  const keys = Array.from({ length: 200 }, (_, i) => `benign/s${i}`);
  const a = lib.selectSeeded(keys, 50, '20261021');
  assert.equal(a.length, 50);
  assert.deepEqual(lib.selectSeeded([...keys].reverse(), 50, '20261021'), a);
  assert.notDeepEqual(lib.selectSeeded(keys, 50, '1'), a);
});

test('the offline arm runs the scanner in a network-denied child process', () => {
  const darwin = lib.offlineWrapper('darwin');
  assert.equal(darwin[0], '/usr/bin/sandbox-exec');
  assert.ok(darwin.join(' ').includes('(deny network-outbound (remote ip))'));
  assert.deepEqual(lib.offlineWrapper('linux').slice(0, 1), ['unshare']);
  assert.ok(lib.offlineWrapper('linux').includes('--net'));
  assert.throws(() => lib.offlineWrapper('win32'));
  if (process.platform !== 'darwin') return;
  const probe = "require('node:net').connect(443, '1.1.1.1').on('connect', () => { console.log('connected'); process.exit(0); }).on('error', e => { console.log('refused ' + e.code); process.exit(0); });";
  const r = spawnSync(darwin[0], [...darwin.slice(1), process.execPath, '-e', probe], { encoding: 'utf8', timeout: 15000 });
  assert.match(r.stdout, /^refused /, r.stdout + r.stderr);
});

test('the scanner gets the minimal environment and a fresh empty HOME per sample, with no credential variable', async () => {
  assert.deepEqual(Object.keys(lib.scannerEnv('/h', '/t')).sort(), ['HOME', 'LANG', 'OPENA2A_TELEMETRY', 'PATH', 'TMPDIR']);
  assert.equal(lib.scannerEnv('/h', '/t').OPENA2A_TELEMETRY, 'off');
  process.env.OASB_FIXTURE_API_TOKEN = 'placeholder-not-a-credential';
  try {
    const { out } = await run('environment');
    const rows = predictions(out);
    assert.equal(rows.length, SAMPLES.length);
    for (const row of rows) {
      assert.ok(!row.failed.some(f => f.startsWith('FIXTURE-ENV-LEAK') || f.startsWith('FIXTURE-HOME-NOT-EMPTY')), `${row.sample}: ${row.failed}`);
    }
    const record = JSON.parse(readFileSync(join(out, 'record.json'), 'utf8'));
    assert.deepEqual(record.environment.names, ['HOME', 'LANG', 'OPENA2A_TELEMETRY', 'PATH', 'TMPDIR']);
    assert.equal(record.environment.home, 'fresh-empty-per-sample');
  } finally {
    delete process.env.OASB_FIXTURE_API_TOKEN;
  }
});

test('an unparsed or timed-out sample lands in the excluded column and is never dropped', async () => {
  writeFileSync(hangFile, '1');
  let out;
  try {
    ({ out } = await run('excluded', { run: { timeoutMs: 3000 } }));
  } finally {
    rmSync(hangFile, { force: true });
  }
  const rows = predictions(out);
  const byName = Object.fromEntries(rows.map(r => [r.sample.split('/')[1], r]));
  assert.equal(byName['garbled-output'].excluded, 'unparsed');
  assert.equal(byName['garbled-output'].verdict, null);
  assert.equal(byName['slow-sample'].excluded, 'timeout');
  assert.equal(byName['slow-sample'].verdict, null);
  const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
  const all = summary.metrics.all;
  assert.equal(all.malicious.n, 6);
  assert.equal(all.benign.n, 6);
  assert.equal(all.malicious.excluded, 1);
  assert.equal(all.benign.excluded, 1);
  assert.equal(all.tp + all.fn, 5);
  assert.equal(all.fp + all.tn, 5);
  // exfil-helper, cred-reader, beacon flag; quiet-dropper (posture only) and medium-only do not.
  assert.deepEqual([all.tp, all.fn, all.fp, all.tn], [3, 2, 1, 4]);
  assert.equal(all.precision, 3 / 4);
  assert.equal(all.recall, 3 / 5);
  assert.equal(all.fpr, 1 / 5);
});

test('runs of record: a run directory holds the files the runner writes, names every pinned input, and its summary is the one its predictions give', async () => {
  const { out } = await run('of-record');
  assert.deepEqual(lib.verifyRun(out), []);
  const record = JSON.parse(readFileSync(join(out, 'record.json'), 'utf8'));
  assert.equal(record.schema, lib.RUN_SCHEMA);
  assert.match(record.harness.commit, /^[0-9a-f]{40}$/);
  assert.match(record.corpus.commit, /^[0-9a-f]{40}$/);
  assert.match(record.corpus.manifestSha256, /^[0-9a-f]{64}$/);
  assert.equal(record.corpus.ignoredEntries, 1);
  assert.deepEqual(record.counts, { malicious: 6, benign: 6, excluded: 1 });
  assert.equal(record.scanner.integrity, 'sha512-fixture-fixture-scanner');
  assert.match(record.scanner.lockSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(record.argv.slice(1), ['node_modules/fixture-scanner/dist/cli.js', 'check', '.', '--json', '--no-registry']);
  assert.equal(record.network.arm, 'online');
  assert.deepEqual(record.rule.exclusions, [...adapterModule.HARDENING_CHECK_IDS].sort());
  assert.ok(!JSON.stringify(record).includes(root), 'the record holds no local path');

  // Each way a run can disagree with itself is found.
  const tamper = (label, edit) => {
    const copy = join(root, 'runs', `tampered-${label}`);
    cpSync(out, copy, { recursive: true });
    edit(copy);
    assert.notDeepEqual(lib.verifyRun(copy), [], `${label} went unnoticed`);
  };
  tamper('summary', dir => {
    const s = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
    s.metrics.all.tp += 1;
    writeFileSync(join(dir, 'summary.json'), JSON.stringify(s));
  });
  tamper('dropped-row', dir => {
    const lines = readFileSync(join(dir, 'predictions.jsonl'), 'utf8').trim().split('\n');
    writeFileSync(join(dir, 'predictions.jsonl'), lines.filter(l => !l.includes('garbled-output')).join('\n') + '\n');
  });
  tamper('verdict', dir => {
    const lines = readFileSync(join(dir, 'predictions.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const row = lines.find(r => r.sample.endsWith('/quiet-dropper'));
    row.verdict = 'malicious';
    writeFileSync(join(dir, 'predictions.jsonl'), lines.map(r => JSON.stringify(r)).join('\n') + '\n');
  });
  tamper('exclusions', dir => {
    const r = JSON.parse(readFileSync(join(dir, 'record.json'), 'utf8'));
    r.rule.exclusions = r.rule.exclusions.slice(1);
    writeFileSync(join(dir, 'record.json'), JSON.stringify(r));
  });
  tamper('extra-file', dir => writeFileSync(join(dir, 'notes.txt'), 'x'));
  tamper('no-integrity', dir => {
    const r = JSON.parse(readFileSync(join(dir, 'record.json'), 'utf8'));
    r.scanner.integrity = null;
    writeFileSync(join(dir, 'record.json'), JSON.stringify(r));
  });
});

test('runs of record: every committed external run under results/ passes the same check', () => {
  // The pinned-run cell leaves to this cell the directories whose record has this schema.
  const pinned = readFileSync(join(repo, 'src', 'benchmark', 'pinned', 'runs-of-record.test.ts'), 'utf8');
  assert.ok(pinned.includes(`const EXTERNAL_RUN_SCHEMA = '${lib.RUN_SCHEMA}';`), 'the pinned-run cell names another external schema');
  const results = join(repo, 'results');
  const runs = existsSync(results)
    ? readdirSync(results).filter(name => {
      const record = join(results, name, 'record.json');
      return existsSync(record) && JSON.parse(readFileSync(record, 'utf8')).schema === lib.RUN_SCHEMA;
    })
    : [];
  for (const name of runs) {
    const dir = join(results, name);
    assert.deepEqual(lib.verifyRun(dir, { requireCleanHarness: true }), [], name);
    const record = JSON.parse(readFileSync(join(dir, 'record.json'), 'utf8'));
    const ancestor = spawnSync('git', ['-C', repo, 'merge-base', '--is-ancestor', record.harness.commit, 'HEAD']);
    const shallow = spawnSync('git', ['-C', repo, 'rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).stdout.trim();
    if (shallow === 'false') assert.equal(ancestor.status, 0, `${name}: harness commit is not in this history`);
  }
});

test('a completed run is not run again, and an incomplete one is re-run whole', async () => {
  const first = await run('resume');
  const again = await run('resume');
  assert.equal(again.result.status, 'already-complete');
  assert.equal(JSON.parse(readFileSync(join(first.out, 'record.json'), 'utf8')).runId, JSON.parse(readFileSync(join(again.out, 'record.json'), 'utf8')).runId);
  const partial = join(root, 'runs', 'partial');
  mkdirSync(`${partial}.incomplete`, { recursive: true });
  writeFileSync(join(`${partial}.incomplete`, lib.INCOMPLETE_MARKER), '');
  writeFileSync(join(`${partial}.incomplete`, 'predictions.jsonl'), '{"half":"a row"}\n');
  const whole = await run('partial');
  assert.deepEqual(lib.verifyRun(whole.out), []);
  assert.ok(!existsSync(`${partial}.incomplete`));
  const foreign = join(root, 'runs', 'foreign');
  mkdirSync(foreign, { recursive: true });
  await assert.rejects(() => run('foreign'));
});

test('determinism: a re-run of the same samples must agree on every verdict and check set', async () => {
  const { out } = await run('determinism-base');
  const same = await run('determinism-same', { run: { determinismOf: out } });
  assert.equal(same.result.ok, true);
  const record = JSON.parse(readFileSync(join(same.out, 'record.json'), 'utf8'));
  assert.equal(record.determinism.compared, 12);
  assert.equal(record.determinism.verdictAgree, 12);
  assert.equal(record.determinism.identicalCheckSet, 12);
  assert.equal(record.determinism.pass, true);
  writeFileSync(flipFile, '1');
  try {
    const flipped = await run('determinism-flipped', { run: { determinismOf: out } });
    assert.equal(flipped.result.ok, false);
    const r = JSON.parse(readFileSync(join(flipped.out, 'record.json'), 'utf8'));
    assert.equal(r.determinism.pass, false);
    assert.ok(r.determinism.identicalCheckSet < r.determinism.compared);
  } finally {
    rmSync(flipFile, { force: true });
  }
});

test('the neutralised arm scans each sample under a neutral id without _meta.json, and an honest scanner passes it', async () => {
  const { out } = await run('neutral-base');
  const neutral = await run('neutral', { run: { neutral: true, compareTo: out } });
  assert.equal(neutral.result.ok, true);
  const published = predictions(out);
  assert.ok(published.filter(r => !r.excluded).every(r => r.failed.includes('FIXTURE-CLASS-PATH:info')));
  assert.equal(published.filter(r => r.failed.includes('FIXTURE-LABEL-FILE:info')).length, 6);
  const rows = predictions(neutral.out);
  assert.equal(rows.length, SAMPLES.length);
  for (const row of rows) {
    assert.match(row.neutralId, /^n-[0-9a-f]{16}$/);
    assert.ok(!row.failed.includes('FIXTURE-CLASS-PATH:info'), row.sample);
    assert.ok(!row.failed.includes('FIXTURE-LABEL-FILE:info'), row.sample);
  }
  const record = JSON.parse(readFileSync(join(neutral.out, 'record.json'), 'utf8'));
  assert.equal(record.neutral.enabled, true);
  assert.deepEqual(record.neutral.dropped, ['_meta.json']);
  assert.equal(record.neutral.droppedFiles, 6);
  assert.equal(record.comparison.gap, 0);
  assert.equal(record.comparison.pass, true);
});

test('a scanner that reads the label file fails the neutralised-arm check', async () => {
  const published = await run('reader-published', { scannerName: 'fixture-label-reader' });
  const neutral = await run('reader-neutral', { scannerName: 'fixture-label-reader', run: { neutral: true, compareTo: published.out } });
  assert.equal(neutral.result.ok, false);
  const record = JSON.parse(readFileSync(join(neutral.out, 'record.json'), 'utf8'));
  assert.ok(record.comparison.gap > lib.NEUTRAL_GAP_LIMIT, String(record.comparison.gap));
  assert.equal(record.comparison.pass, false);
});

test('the CLI prints its usage, and refuses a run with no corpus or no scanner', () => {
  const cli = join(repo, 'scripts', 'run-external-skill-benchmark.ts');
  const help = spawnSync(process.execPath, ['--import', 'tsx', cli, '--help'], { cwd: repo, encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--corpus <dir>/);
  assert.match(help.stdout, /--scanner <name>@<version>/);
  const missing = spawnSync(process.execPath, ['--import', 'tsx', cli, '--scanner', 'hackmyagent@0.33.2'], { cwd: repo, encoding: 'utf8' });
  assert.equal(missing.status, 2);
  const unknown = spawnSync(process.execPath, ['--import', 'tsx', cli, '--corpus', root, '--scanner', 'no-such-scanner@1.0.0'], { cwd: repo, encoding: 'utf8' });
  assert.equal(unknown.status, 2);
});
