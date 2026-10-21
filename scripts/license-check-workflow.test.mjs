// Tests that the license-check job of .github/workflows/security.yml runs the
// license-checker version package.json pins. The job's step runs
// `npm install` and then `npx license-checker`, and npx runs the
// license-checker that the install put in node_modules; when node_modules
// holds none, npx downloads one from the registry. So license-checker is a
// devDependency at an exact version, which package-lock.json locks with its
// integrity hash, though no script in package.json runs it.
// The first four tests check the pin, the lock entry, that the job installs
// the devDependencies before it runs license-checker, and that it runs
// license-checker through npx at no other version. The next one runs
// `npx license-checker --help` offline with an empty npm cache and checks
// that it names the pinned version. The last test makes each change in its
// list to a copy of the workflow or of the package files and checks that
// one of the first four tests then fails.
// It does not check that the install succeeds: the step ignores a failed
// `npm install` (`|| true`), and npx then downloads license-checker from the
// registry when node_modules holds none. It does not check the versions of
// the actions the job uses.
// Run with: npm run test:scripts (node --test). Kept outside src/ so the
// vitest totals the README claims stay a count of benchmark tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...path) => readFileSync(join(repo, ...path), 'utf8');
const workflowText = read('.github', 'workflows', 'security.yml');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

const NAME = 'license-checker';
const LOCK_KEY = `node_modules/${NAME}`;
// npx, the flags it may take before the package that leave which
// license-checker it runs as it is, and license-checker with an optional
// @<version>.
const NPX_RUN = /\bnpx\s+(?:(?:--no|--no-install|--offline|--yes|-y)\s+)*license-checker(?:@(\S+))?(?=\s|$)/;
const NPM_INSTALL = /\bnpm\s+(?:install|i|ci|clean-install)(?=\s|$)/;
// A flag of npm install or npm ci with which npm installs no devDependencies.
const OMIT_DEV_FLAG = /--omit[=\s]+dev\b|--production\b|--only[=\s]+prod/;
// A setting in the environment with which npm installs no devDependencies.
const OMIT_DEV_ENV = /\bNODE_ENV\b.*\bproduction\b|\bnpm_config_(?:omit|only|production)\b/i;

/** The start and end of a job's lines, from its key to the next job's key. */
function jobSpan(lines, name) {
  const start = lines.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `security.yml has no ${name} job`);
  const end = lines.findIndex((line, i) => i > start && /^ {2}\S/.test(line));
  return [start, end === -1 ? lines.length : end];
}

function jobLines(lines, name) {
  return lines.slice(...jobSpan(lines, name));
}

/**
 * The workflow with a change made to the text of the license-check job
 * only: the dependency-audit job runs the same npm install line.
 */
function inJob(text, change) {
  const lines = text.split('\n');
  const [start, end] = jobSpan(lines, 'license-check');
  return [...lines.slice(0, start), change(lines.slice(start, end).join('\n')), ...lines.slice(end)].join('\n');
}

/** The workflow's lines, the license-check job's lines and the package files. */
function stateOf(text, pkgJson, lockJson) {
  const lines = text.split('\n');
  return { lines, job: jobLines(lines, 'license-check'), pkg: pkgJson, lock: lockJson };
}

const pinOf = (pkgJson) => pkgJson.devDependencies?.[NAME];

/** The job's lines that name license-checker, outside comments, with their index in the job. */
function runsOf(job) {
  const runs = job.flatMap((line, i) => (line.includes(NAME) && !line.trim().startsWith('#') ? [{ line: line.trim(), i }] : []));
  assert.notDeepEqual(runs, [], `the license-check job does not run ${NAME}`);
  return runs;
}

const checks = [
  {
    name: 'package.json pins license-checker as a devDependency at an exact version',
    run({ pkg }) {
      const pin = pinOf(pkg);
      assert.ok(pin, `package.json has no ${NAME} devDependency, so the license-check job's npx ${NAME} downloads one from the registry`);
      assert.match(pin, /^\d+\.\d+\.\d+$/, `package.json gives ${NAME} the range "${pin}", not one version`);
    },
  },
  {
    name: 'package-lock.json locks the pinned version from the npm registry with an integrity hash',
    run({ pkg, lock }) {
      const pin = pinOf(pkg);
      const root = lock.packages?.['']?.devDependencies?.[NAME];
      assert.equal(root, pin, `package-lock.json was written for ${NAME} "${root}", and package.json pins "${pin}"`);
      const entry = lock.packages?.[LOCK_KEY];
      assert.ok(entry, `package-lock.json has no ${LOCK_KEY}`);
      assert.equal(entry.version, pin, `package-lock.json locks ${NAME} ${entry.version}`);
      assert.equal(entry.resolved, `https://registry.npmjs.org/${NAME}/-/${NAME}-${pin}.tgz`);
      assert.match(entry.integrity ?? '', /^sha512-[A-Za-z0-9+/]{86}==$/, `${LOCK_KEY} has no sha512 integrity hash`);
    },
  },
  {
    name: 'the license-check job installs the devDependencies before it runs license-checker',
    run({ lines, job }) {
      const first = runsOf(job)[0].i;
      const installs = job.slice(0, first).filter((line) => NPM_INSTALL.test(line));
      assert.notDeepEqual(installs, [], `the license-check job runs ${NAME} before any npm install`);
      const top = lines.slice(0, lines.indexOf('jobs:'));
      const omitting = [
        ...installs.filter((line) => OMIT_DEV_FLAG.test(line)),
        ...[...top, ...job].filter((line) => OMIT_DEV_ENV.test(line)),
      ].map((line) => line.trim());
      assert.deepEqual(omitting, [], `npm installs no devDependencies here, so npx downloads ${NAME} from the registry`);
    },
  },
  {
    name: 'the license-check job runs license-checker through npx at no other version',
    run({ job, pkg }) {
      for (const { line } of runsOf(job)) {
        const m = NPX_RUN.exec(line);
        assert.ok(m, `the license-check job runs ${NAME} in a way this test does not read: ${line}`);
        if (m[1] !== undefined) {
          assert.equal(m[1], pinOf(pkg), `the license-check job runs ${NAME}@${m[1]}, and package.json pins ${pinOf(pkg)}`);
        }
      }
    },
  },
];

const state = stateOf(workflowText, pkg, lock);
for (const check of checks) {
  test(check.name, () => check.run(state));
}

test('npx license-checker, offline with an empty npm cache, runs the pinned version', (t) => {
  const cache = mkdtempSync(join(tmpdir(), 'oasb-npx-cache-'));
  t.after(() => rmSync(cache, { recursive: true, force: true }));
  // license-checker --help names its version on stderr and exits 0;
  // --version prints it and exits 1.
  const r = spawnSync('npx', [NAME, '--help'], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, npm_config_cache: cache, npm_config_offline: 'true' },
  });
  assert.equal(r.status, 0, `npx ${NAME} --help exited ${r.status} (run npm ci first): ${r.error ?? r.stderr}`);
  assert.equal(r.stderr.split('\n')[0], `${NAME}@${pinOf(pkg)}`);
});

const INSTALL = '          npm install --ignore-scripts 2>/dev/null || true\n';
const RUN = '          npx license-checker ';

// Each change undoes the pin, and one of the first four tests must fail on
// the files it leaves. A change to the workflow is made to the text of the
// license-check job.
const weakenings = [
  ['license-checker is not a devDependency', { pkg: (p) => delete p.devDependencies[NAME] }],
  ['package.json gives license-checker a range', { pkg: (p) => (p.devDependencies[NAME] = `^${p.devDependencies[NAME]}`) }],
  ['package-lock.json was not written for the pin', { lock: (l) => delete l.packages[LOCK_KEY] }],
  ['package-lock.json was written for another package.json', { lock: (l) => (l.packages[''].devDependencies[NAME] = '^0.0.0') }],
  ['package-lock.json locks another version', { lock: (l) => (l.packages[LOCK_KEY].version = '0.0.0') }],
  ['package-lock.json resolves license-checker from another host', { lock: (l) => (l.packages[LOCK_KEY].resolved = l.packages[LOCK_KEY].resolved.replace('https://registry.npmjs.org/', 'https://mirror.example.invalid/')) }],
  ['package-lock.json holds no integrity hash', { lock: (l) => delete l.packages[LOCK_KEY].integrity }],
  ['the job installs no packages', { workflow: (s) => s.replace(INSTALL, '') }],
  ['the job runs license-checker before it installs', { workflow: (s) => s.replace(INSTALL, '').replace(/^( {10}npx license-checker .*\n)/m, `$1${INSTALL}`) }],
  ['the install leaves out the devDependencies', { workflow: (s) => s.replace('npm install --ignore-scripts', 'npm install --omit=dev --ignore-scripts') }],
  ['the job installs the production dependencies only', { workflow: (s) => s.replace('npm install --ignore-scripts', 'npm ci --production --ignore-scripts') }],
  ['the job sets NODE_ENV to production', { workflow: (s) => s.replace('    name: License Compliance\n', '    name: License Compliance\n    env:\n      NODE_ENV: production\n') }],
  ['npx runs the latest license-checker', { workflow: (s) => s.replace(RUN, '          npx license-checker@latest ') }],
  ['npx runs another version', { workflow: (s) => s.replace(RUN, '          npx license-checker@0.0.0 ') }],
  ['the job installs the latest license-checker', { workflow: (s) => s.replace(RUN, `          npm install --no-save ${NAME}@latest\n${RUN}`) }],
];

test('each change that undoes the pin fails one of the first four tests', () => {
  const missed = [];
  for (const [what, change] of weakenings) {
    const text = change.workflow ? inJob(workflowText, change.workflow) : workflowText;
    const pkgCopy = structuredClone(pkg);
    const lockCopy = structuredClone(lock);
    change.pkg?.(pkgCopy);
    change.lock?.(lockCopy);
    const changed = text !== workflowText
      || JSON.stringify(pkgCopy) !== JSON.stringify(pkg)
      || JSON.stringify(lockCopy) !== JSON.stringify(lock);
    assert.ok(changed, `the change "${what}" does not apply`);
    const caught = checks.some((check) => {
      try {
        check.run(stateOf(text, pkgCopy, lockCopy));
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
