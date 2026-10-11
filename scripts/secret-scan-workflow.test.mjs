// Tests the secret-scan job of .github/workflows/security.yml: the workflow
// runs it on pull requests and pushes to main and on a weekly schedule, the
// job has no condition of its own and a gitleaks finding fails it, its token
// can only read the repository, gitleaks is downloaded from its GitHub
// release at a pinned version and checked against the archive's sha256, a
// pull request is read from its base to its head and a push from its
// previous head to its new head, and the scheduled run reads the full
// history. The last test makes each of those changes to a copy of the
// workflow and checks that one of the other tests then fails.
// It does not check the workflow's concurrency settings, under which a later
// run can cancel one before its scan finishes, or which version of the
// checkout action the job uses.
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
const workflowText = readFileSync(join(repo, '.github', 'workflows', 'security.yml'), 'utf8');

const ZERO_SHA = '0'.repeat(40);
const GITLEAKS_VERSION = '8.30.1';
// sha256 of gitleaks_8.30.1_linux_x64.tar.gz, from gitleaks_8.30.1_checksums.txt
const GITLEAKS_SHA256 = '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb';
// The download URL as the install script writes it, before bash expands it.
const GITLEAKS_URL = 'https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz';

/** The workflow's events, each with the trimmed lines of its settings. */
function triggers(lines) {
  const start = lines.indexOf('on:');
  assert.notEqual(start, -1, 'security.yml has no on: block');
  const events = {};
  let event = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const key = /^ {2}([\w-]+):$/.exec(line);
    if (key) events[(event = key[1])] = [];
    else if (event && line.trim() !== '') events[event].push(line.trim());
  }
  return events;
}

/** The lines of a job, from its key to the next job's key. */
function jobLines(lines, name) {
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

/** A workflow's lines, its secret-scan job's lines and that job's steps. */
function parse(text) {
  const lines = text.split('\n');
  const job = jobLines(lines, 'secret-scan');
  return { lines, job, steps: steps(job) };
}

function stepWhere(wf, condition) {
  const found = wf.steps.filter((s) => s.if === condition);
  assert.equal(found.length, 1, `secret-scan should have one step with if: ${condition}`);
  return found[0];
}

const scanStepsOf = (wf) => wf.steps.filter((s) => s.run.includes('gitleaks detect'));

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

/**
 * Runs a step's script as the runner runs a `run:` step that names no
 * shell: bash -e, without pipefail (GitHub Actions `defaults.run.shell`).
 */
function runStep(step, dir, env, cwd = dir) {
  const script = join(dir, 'step.sh');
  writeFileSync(script, step.run);
  return spawnSync('bash', ['-e', script], {
    cwd,
    encoding: 'utf8',
    env: { PATH: `${join(dir, 'bin')}:${process.env.PATH}`, HOME: dir, ...env },
  });
}

/**
 * Runs a scan step with a stub gitleaks that exits with GITLEAKS_EXIT
 * (default 0) and returns the step's result and the arguments gitleaks got.
 */
function runScan(step, dir, env, cwd = dir) {
  stub(dir, 'gitleaks', 'printf "%s\\n" "$@" > "$ARGS_FILE"; exit "${GITLEAKS_EXIT:-0}"');
  const argsFile = join(dir, 'gitleaks-args');
  rmSync(argsFile, { force: true });
  const result = runStep(step, dir, { ...env, ARGS_FILE: argsFile }, cwd);
  assert.ok(existsSync(argsFile), `the step "${step.name}" did not run gitleaks: ${result.stderr}`);
  return { result, args: readFileSync(argsFile, 'utf8').split('\n').slice(0, -1) };
}

function logOpts(args) {
  const i = args.indexOf('--log-opts');
  assert.notEqual(i, -1, `gitleaks ran without --log-opts: ${args.join(' ')}`);
  return args[i + 1];
}

const hasSha256sum = !spawnSync('sha256sum', ['--version']).error;

const checks = [
  {
    name: 'the workflow runs on pull requests and pushes to main and every Monday',
    run(wf) {
      const on = triggers(wf.lines);
      assert.deepEqual(on.pull_request, ['branches: [main]']);
      assert.deepEqual(on.push, ['branches: [main]']);
      assert.deepEqual(on.schedule, ['- cron: "0 6 * * 1"']);
    },
  },
  {
    name: 'the secret-scan job has no condition of its own',
    run(wf) {
      // A job-level if: skips the job, and every scan in it, on other events.
      assert.deepEqual(wf.job.filter((line) => /^ {4}if:/.test(line)), []);
    },
  },
  {
    name: 'a gitleaks finding fails the secret-scan job',
    run(wf, t) {
      const ignoring = wf.job.filter((line) => /^\s+(?:- )?continue-on-error:/.test(line));
      assert.deepEqual(ignoring, [], 'continue-on-error lets a failed scan pass the job');
      const dir = scratch(t);
      for (const step of scanStepsOf(wf)) {
        const env = Object.fromEntries(Object.keys(step.env).map((k) => [k, 'f'.repeat(40)]));
        const { result, args } = runScan(step, dir, { ...env, GITLEAKS_EXIT: '1' });
        assert.equal(result.status, 1, `"${step.name}" passed when gitleaks reported a leak`);
        assert.deepEqual(args.filter((a) => a.startsWith('--exit-code')), [], `"${step.name}" sets the exit code`);
      }
    },
  },
  {
    name: 'the secret-scan job token can only read the repository contents',
    run(wf) {
      const start = wf.job.indexOf('    permissions:');
      assert.notEqual(start, -1, 'secret-scan has no job-level permissions');
      const granted = [];
      for (const line of wf.job.slice(start + 1)) {
        if (!line.startsWith('      ')) break;
        granted.push(line.trim());
      }
      assert.deepEqual(granted, ['contents: read']);
    },
  },
  {
    name: 'no run: script of the secret-scan job expands an expression',
    run(wf) {
      // Event data reaches the scripts through env:, never as text in the script.
      const expanding = wf.steps.filter((s) => s.run.includes('${{')).map((s) => s.name);
      assert.deepEqual(expanding, []);
    },
  },
  {
    name: 'every step runs in the runner default shell, as these tests run it',
    run(wf) {
      assert.deepEqual(wf.steps.filter((s) => s.shell).map((s) => s.name), []);
      assert.deepEqual(wf.lines.filter((line) => /^\s*defaults:/.test(line)), []);
    },
  },
  {
    name: 'gitleaks is pinned to 8.30.1 from its GitHub release with the sha256 of its archive',
    run(wf) {
      const install = wf.steps.find((s) => s.name === 'Install gitleaks');
      assert.ok(install, 'secret-scan has no "Install gitleaks" step');
      assert.equal(install.env.GITLEAKS_VERSION, GITLEAKS_VERSION);
      assert.equal(install.env.GITLEAKS_SHA256, GITLEAKS_SHA256);
      assert.deepEqual(install.run.match(/https?:\/\/[^\s"']+/g), [GITLEAKS_URL]);
    },
  },
  {
    name: 'the gitleaks archive is unpacked only when its sha256 matches the pinned one',
    skip: !hasSha256sum && 'sha256sum is not installed here; the runner has it',
    run(wf, t) {
      const install = wf.steps.find((s) => s.name === 'Install gitleaks');
      assert.ok(install, 'secret-scan has no "Install gitleaks" step');
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
    },
  },
  {
    name: 'every event has its own gitleaks scan step',
    run(wf) {
      const scans = scanStepsOf(wf).map((s) => s.if);
      assert.deepEqual(scans.sort(), [
        "github.event_name == 'pull_request'",
        "github.event_name == 'push'",
        "github.event_name == 'schedule'",
      ]);
    },
  },
  {
    name: 'the checkout fetches the full history every scan range needs',
    run(wf) {
      const checkout = wf.steps.find((s) => s.uses?.startsWith('actions/checkout@'));
      assert.ok(checkout, 'secret-scan has no checkout step');
      assert.equal(checkout.with['fetch-depth'], '0');
    },
  },
  {
    name: 'a pull request is scanned from its base to its head',
    run(wf, t) {
      const pr = stepWhere(wf, "github.event_name == 'pull_request'");
      assert.equal(pr.env.BASE_SHA, '${{ github.event.pull_request.base.sha }}');
      assert.equal(pr.env.HEAD_SHA, '${{ github.event.pull_request.head.sha }}');
      const base = 'b'.repeat(40);
      const head = 'c'.repeat(40);
      const { result, args } = runScan(pr, scratch(t), { BASE_SHA: base, HEAD_SHA: head });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(logOpts(args), `${base}..${head}`);
    },
  },
  {
    name: 'a push is scanned from its previous head to its new head',
    run(wf, t) {
      const push = stepWhere(wf, "github.event_name == 'push'");
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
      const rangeFrom = (before) => {
        const { result, args } = runScan(push, dir, { BEFORE_SHA: before, AFTER_SHA: commits[3] }, work);
        assert.equal(result.status, 0, result.stderr);
        return logOpts(args);
      };

      // A push of three commits reads all three, not only its head.
      const range = rangeFrom(commits[0]);
      assert.equal(range, `${commits[0]}..${commits[3]}`);
      assert.equal(git('rev-list', '--count', range), '3');
      // A push that creates the branch has no previous head: all history.
      assert.equal(rangeFrom(ZERO_SHA), commits[3]);
      // A force push whose previous head is not in the history: all history.
      assert.equal(rangeFrom('1'.repeat(40)), commits[3]);
    },
  },
  {
    name: 'the scheduled run scans the full history',
    run(wf, t) {
      const schedule = stepWhere(wf, "github.event_name == 'schedule'");
      const { result, args } = runScan(schedule, scratch(t), {});
      assert.equal(result.status, 0, result.stderr);
      assert.equal(args[0], 'detect');
      // Without --log-opts gitleaks reads every commit of every fetched ref;
      // --no-git reads the files of the checkout and no history at all.
      assert.deepEqual(args.filter((a) => /^--(?:log-opts|no-git)\b/.test(a)), []);
    },
  },
];

const wf = parse(workflowText);
for (const check of checks) {
  test(check.name, { skip: check.skip }, (t) => check.run(wf, t));
}

// Each change weakens the secret scan, and one of the tests above must fail
// on the workflow it leaves.
const weakenings = [
  ['the push trigger is removed', '  push:\n    branches: [main]\n', ''],
  ['the schedule trigger is removed', '  schedule:\n    - cron: "0 6 * * 1"\n', ''],
  ['the job runs only for pull requests', '    name: Secret Detection\n', "    name: Secret Detection\n    if: github.event_name == 'pull_request'\n"],
  ['the job may fail without failing the workflow', '    name: Secret Detection\n', '    name: Secret Detection\n    continue-on-error: true\n'],
  ['the push scan may fail without failing the job', "        if: github.event_name == 'push'\n", "        if: github.event_name == 'push'\n        continue-on-error: true\n"],
  ['the push scan ignores its exit status', '--log-opts "$range" -v --redact', '--log-opts "$range" -v --redact || true'],
  ['the pull request scan sets its exit code to 0', '--log-opts "${BASE_SHA}..${HEAD_SHA}"', '--exit-code 0 --log-opts "${BASE_SHA}..${HEAD_SHA}"'],
  ['the pull request scan reads only its head commit', '"${BASE_SHA}..${HEAD_SHA}"', '"${HEAD_SHA}~1..${HEAD_SHA}"'],
  ['the scheduled scan reads no history', 'run: gitleaks detect ', 'run: gitleaks detect --no-git '],
  ['gitleaks is downloaded from another host', 'https://github.com/', 'https://mirror.example.invalid/'],
  ['the pinned sha256 is another value', /(GITLEAKS_SHA256: )[0-9a-f]{64}/, `$1${'a'.repeat(64)}`],
  ['a step runs in another shell', "        if: github.event_name == 'schedule'\n", "        if: github.event_name == 'schedule'\n        shell: sh\n"],
];

test('each weakening of the secret scan fails one of the tests above', (t) => {
  const missed = [];
  for (const [what, from, to] of weakenings) {
    const text = workflowText.replace(from, to);
    assert.notEqual(text, workflowText, `the change "${what}" does not apply to security.yml`);
    const caught = checks.filter((check) => !check.skip).some((check) => {
      try {
        check.run(parse(text), t);
        return false;
      } catch (err) {
        if (err instanceof assert.AssertionError) return true;
        throw err;
      }
    });
    if (!caught) missed.push(what);
  }
  assert.deepEqual(missed, []);
});
