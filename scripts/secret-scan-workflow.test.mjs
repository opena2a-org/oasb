// Tests the secret-scan job of .github/workflows/security.yml: its token can
// only read the repository, gitleaks is a pinned release checked against a
// sha256, a push is read from its previous head to its new head, and the
// scheduled run reads the full history.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.
//
// The step scripts run here with bash and stub `curl`, `sudo` and `gitleaks`
// commands, so nothing is downloaded or installed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(join(repo, '.github', 'workflows', 'security.yml'), 'utf8');

const ZERO_SHA = '0'.repeat(40);

/** The lines of a job, from its key to the next job's key. */
function jobLines(name) {
  const lines = workflow.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `security.yml has no ${name} job`);
  const end = lines.findIndex((line, i) => i > start && /^ {2}\S/.test(line));
  return lines.slice(start, end === -1 ? undefined : end);
}

/**
 * The steps of a job as { name, if, uses, env, with, run }. Reads only the
 * shapes this workflow uses: scalar keys, `env:` and `with:` maps of scalars,
 * and a `run:` value on one line or as a `|` block.
 */
function steps(lines) {
  const out = [];
  let step = null;
  let block = null;
  for (const raw of lines) {
    const dash = raw.startsWith('      - ');
    if (dash) {
      step = { env: {}, with: {}, run: '' };
      out.push(step);
      block = null;
    }
    if (!step) continue;
    const line = dash ? `        ${raw.slice(8)}` : raw;
    const key = /^ {8}([\w-]+):(?: (.*))?$/.exec(line);
    if (key) {
      const [, k, v = ''] = key;
      block = v === '' || v === '|' ? k : null;
      if (k === 'run') step.run = v === '|' ? '' : `${v}\n`;
      else if (v !== '') step[k] = v;
      continue;
    }
    if (block === 'run' && (raw.trim() === '' || raw.startsWith(' '.repeat(10)))) {
      step.run += `${raw.slice(10)}\n`;
    } else if (block === 'env' || block === 'with') {
      const entry = /^ {10}([\w-]+): (.*)$/.exec(raw);
      if (entry) step[block][entry[1]] = entry[2];
    } else if (raw.trim() !== '') {
      block = null;
    }
  }
  return out;
}

const scanSteps = steps(jobLines('secret-scan'));

function stepWhere(condition) {
  const found = scanSteps.filter((s) => s.if === condition);
  assert.equal(found.length, 1, `secret-scan should have one step with if: ${condition}`);
  return found[0];
}

/** A scratch directory holding stub commands, removed when the test ends. */
function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'oasb-secret-scan-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'bin'));
  return dir;
}

function stub(dir, name, body) {
  const file = join(dir, 'bin', name);
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
}

/** Runs a step's script as the runner does: bash -e with pipefail. */
function runStep(step, dir, env, cwd = dir) {
  const script = join(dir, 'step.sh');
  writeFileSync(script, step.run);
  return spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], {
    cwd,
    encoding: 'utf8',
    env: { PATH: `${join(dir, 'bin')}:${process.env.PATH}`, HOME: dir, ...env },
  });
}

test('the secret-scan job token can only read the repository contents', () => {
  const lines = jobLines('secret-scan');
  const start = lines.indexOf('    permissions:');
  assert.notEqual(start, -1, 'secret-scan has no job-level permissions');
  const granted = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('      ')) break;
    granted.push(line.trim());
  }
  assert.deepEqual(granted, ['contents: read']);
});

test('no run: script of the secret-scan job expands an expression', () => {
  // Event data reaches the scripts through env:, never as text in the script.
  const expanding = scanSteps.filter((s) => s.run.includes('${{')).map((s) => s.name);
  assert.deepEqual(expanding, []);
});

test('gitleaks is pinned to 8.30.1 with the sha256 of its archive', () => {
  const install = scanSteps.find((s) => s.name === 'Install gitleaks');
  assert.ok(install, 'secret-scan has no "Install gitleaks" step');
  assert.equal(install.env.GITLEAKS_VERSION, '8.30.1');
  assert.match(install.env.GITLEAKS_SHA256 ?? '', /^[0-9a-f]{64}$/);
  assert.doesNotMatch(install.run, /releases\/latest/);
  assert.match(install.run, /releases\/download\/v\$\{GITLEAKS_VERSION\}\/gitleaks_\$\{GITLEAKS_VERSION\}_linux_x64\.tar\.gz/);
});

test('the gitleaks archive is unpacked only when its sha256 matches the pinned one', (t) => {
  if (spawnSync('sha256sum', ['--version']).error) {
    t.skip('sha256sum is not installed here; the runner has it');
    return;
  }
  const install = scanSteps.find((s) => s.name === 'Install gitleaks');
  const dir = scratch(t);
  // An archive holding a file named gitleaks that is not the real release.
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'gitleaks'), 'not the gitleaks release\n');
  const archive = join(dir, 'served.tar.gz');
  assert.equal(spawnSync('tar', ['-czf', archive, '-C', join(dir, 'src'), 'gitleaks']).status, 0);
  const servedSum = spawnSync('sha256sum', [archive], { encoding: 'utf8' }).stdout.split(' ')[0];
  stub(dir, 'curl', 'while [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then cp "$SERVED" "$2"; exit 0; fi; shift; done; exit 1');
  stub(dir, 'sudo', 'echo "sudo $*" >> "$RUNNER_TEMP/sudo.log"');
  stub(dir, 'gitleaks', 'exit 0');

  const runner = join(dir, 'runner');
  mkdirSync(runner);
  const tampered = runStep(install, dir, { ...install.env, SERVED: archive, RUNNER_TEMP: runner });
  assert.equal(tampered.status, 1, tampered.stderr);
  assert.match(tampered.stderr, /expected [0-9a-f]{64}/);
  assert.equal(existsSync(join(runner, 'gitleaks')), false, 'a tampered archive was unpacked');
  assert.equal(existsSync(join(runner, 'sudo.log')), false, 'a tampered archive was installed');

  rmSync(runner, { recursive: true });
  mkdirSync(runner);
  const matching = runStep(install, dir, { ...install.env, GITLEAKS_SHA256: servedSum, SERVED: archive, RUNNER_TEMP: runner });
  assert.equal(matching.status, 0, matching.stderr);
  assert.equal(existsSync(join(runner, 'gitleaks')), true);
  assert.match(readFileSync(join(runner, 'sudo.log'), 'utf8'), /install -m 0755 .*\/gitleaks \/usr\/local\/bin\/gitleaks/);
});

test('every event has its own gitleaks scan step', () => {
  const scans = scanSteps.filter((s) => s.run.includes('gitleaks detect')).map((s) => s.if);
  assert.deepEqual(scans.sort(), [
    "github.event_name == 'pull_request'",
    "github.event_name == 'push'",
    "github.event_name == 'schedule'",
  ]);
});

test('the checkout fetches the full history every scan range needs', () => {
  const checkout = scanSteps.find((s) => s.uses?.startsWith('actions/checkout@'));
  assert.ok(checkout, 'secret-scan has no checkout step');
  assert.equal(checkout.with['fetch-depth'], '0');
});

test('a push is scanned from its previous head to its new head', (t) => {
  const push = stepWhere("github.event_name == 'push'");
  assert.equal(push.env.BEFORE_SHA, '${{ github.event.before }}');
  assert.equal(push.env.AFTER_SHA, '${{ github.sha }}');

  const dir = scratch(t);
  const work = join(dir, 'work');
  mkdirSync(work);
  const git = (...args) => {
    const r = spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
      cwd: work,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: dir, GIT_CONFIG_NOSYSTEM: '1' },
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git('init', '-q');
  const commits = [1, 2, 3, 4].map((n) => {
    git('commit', '-q', '--allow-empty', '-m', `commit ${n}`);
    return git('rev-parse', 'HEAD');
  });
  stub(dir, 'gitleaks', 'printf "%s\\n" "$@" > "$ARGS_FILE"');
  const argsFile = join(dir, 'gitleaks-args');
  const logOpts = (before) => {
    const r = runStep(push, dir, { BEFORE_SHA: before, AFTER_SHA: commits[3], ARGS_FILE: argsFile }, work);
    assert.equal(r.status, 0, r.stderr);
    const args = readFileSync(argsFile, 'utf8').split('\n');
    return args[args.indexOf('--log-opts') + 1];
  };

  // A push of three commits reads all three, not only its head.
  const range = logOpts(commits[0]);
  assert.equal(range, `${commits[0]}..${commits[3]}`);
  assert.equal(git('rev-list', '--count', range), '3');
  // A push that creates the branch has no previous head: all history.
  assert.equal(logOpts(ZERO_SHA), commits[3]);
  // A force push whose previous head is not in the history: all history.
  assert.equal(logOpts('1'.repeat(40)), commits[3]);
});

test('the scheduled run scans the full history', () => {
  const schedule = stepWhere("github.event_name == 'schedule'");
  assert.match(schedule.run, /gitleaks detect /);
  // Without --log-opts gitleaks reads every commit of every fetched ref.
  assert.doesNotMatch(schedule.run, /--log-opts/);
});
