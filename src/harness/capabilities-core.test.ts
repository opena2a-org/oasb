// requireCapability under an adapter that declares prompt-input-scanning and
// no other capability. Called at the top of a describe() callback for
// mcp-scanning, it skips the block: each of its tests, a nested block's
// included, is reported skipped, none of its hooks runs, and its title ends
// in [requires: mcp-scanning], the label describeWithCapability gives; a
// block that lacks two capabilities names both in one label. For
// prompt-input-scanning the block runs. Called for mcp-scanning in a test,
// at the top of a test file or outside a vitest run, it throws an error that
// names the capability, the adapter and describeWithCapability.
//
// The fixture test files run in a child vitest process with OASB_ADAPTER
// naming the test adapter (create-adapter.ts selects the adapter when it
// loads), and each case reads that run's JSON report.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const OASB_ROOT = resolve(__dirname, '..', '..');
const VITEST = join(OASB_ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const TSX = join(OASB_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CAPABILITIES = join(__dirname, 'capabilities.ts');
const CAPABILITIES_CORE = join(__dirname, 'capabilities-core.ts');

const ADAPTER_SOURCE = `module.exports = class OneCapabilityAdapter {
  getCapabilities() {
    return { product: 'one-capability-adapter', version: '0.0.0', capabilities: new Set(['prompt-input-scanning']) };
  }
};
`;

// describe, it and the hooks are vitest globals in the child run.
const CONFIG_SOURCE = `export default { test: { include: ['*.test.ts'], globals: true, fileParallelism: false } };
`;

/** The fixture test files, by name. Each hook writes a file named after it into `dir`. */
function fixtures(dir: string): Record<string, string> {
  const mark = (name: string) => `() => writeFileSync(${JSON.stringify(join(dir, name))}, '')`;
  const imports = `import { writeFileSync } from 'node:fs';
import { requireCapability } from ${JSON.stringify(CAPABILITIES)};
`;
  return {
    'blocks.test.ts': `${imports}
describe('needs mcp-scanning', () => {
  requireCapability('mcp-scanning');
  beforeAll(${mark('missing.beforeAll')});
  beforeEach(${mark('missing.beforeEach')});
  afterEach(${mark('missing.afterEach')});
  afterAll(${mark('missing.afterAll')});
  it('first test', () => {});
  it('second test', () => {});
  describe('nested block', () => {
    it('nested test', () => {});
  });
});

describe('needs prompt-input-scanning', () => {
  requireCapability('prompt-input-scanning');
  beforeAll(${mark('present.beforeAll')});
  it('first test', () => {});
  it('second test', () => {});
});

describe('needs two capabilities the adapter lacks', () => {
  requireCapability('mcp-scanning');
  requireCapability('prompt-input-scanning');
  requireCapability('a2a-scanning');
  requireCapability('mcp-scanning');
  it('only test', () => {});
});

describe('calls requireCapability in a test', () => {
  it('for mcp-scanning', () => requireCapability('mcp-scanning'));
  it('for prompt-input-scanning', () => requireCapability('prompt-input-scanning'));
});
`,
    'top-level.test.ts': `${imports}
requireCapability('mcp-scanning');

describe('after a call at the top of the file', () => {
  it('a test', () => {});
});
`,
  };
}

interface TestResult {
  ancestorTitles: string[];
  title: string;
  status: string;
  failureMessages: string[];
}

interface FileResult {
  name: string;
  status: string;
  message: string;
  assertionResults: TestResult[];
}

/** Runs `args` with node in `cwd`, OASB_ADAPTER set to `adapter`, and returns its exit code and output. */
function runNode(args: string[], cwd: string, adapter: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  // The child is not part of this vitest run, so it gets none of the
  // variables vitest set for this worker.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST')));
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, { cwd, env: { ...env, OASB_ADAPTER: adapter } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolveRun({ code, stdout, stderr }));
  });
}

const MESSAGE_PARTS = [
  "requireCapability('mcp-scanning')",
  'one-capability-adapter',
  "describeWithCapability('mcp-scanning', name, fn)",
];

describe('requireCapability', () => {
  let dir: string;
  let adapter: string;
  let files: FileResult[];

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'oasb-require-capability-'));
    adapter = join(dir, 'adapter.cjs');
    writeFileSync(adapter, ADAPTER_SOURCE);
    writeFileSync(join(dir, 'vitest.config.mjs'), CONFIG_SOURCE);
    for (const [name, source] of Object.entries(fixtures(dir))) writeFileSync(join(dir, name), source);
    const report = join(dir, 'report.json');
    const run = await runNode(
      [VITEST, 'run', '--root', dir, '--config', join(dir, 'vitest.config.mjs'), '--reporter=json', `--outputFile=${report}`],
      dir,
      adapter,
    );
    if (!existsSync(report)) throw new Error(`vitest wrote no report (exit ${run.code}):\n${run.stderr.slice(-2000)}`);
    files = JSON.parse(readFileSync(report, 'utf8')).testResults;
  }, 120_000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function file(name: string): FileResult {
    const found = files.find((f) => f.name.endsWith(`/${name}`));
    if (!found) throw new Error(`the report holds no ${name}`);
    return found;
  }

  /** The results of the tests under the top-level block whose title starts with `title`. */
  function block(title: string): TestResult[] {
    return file('blocks.test.ts').assertionResults.filter((t) => t.ancestorTitles[0]?.startsWith(title));
  }

  it('reports every test of a block whose capability the adapter lacks as skipped', () => {
    expect(block('needs mcp-scanning').map((t) => [t.title, t.status])).toEqual([
      ['first test', 'skipped'],
      ['second test', 'skipped'],
      ['nested test', 'skipped'],
    ]);
  });

  it('labels that block [requires: <capability>], as describeWithCapability does', () => {
    expect(block('needs mcp-scanning').map((t) => t.ancestorTitles[0])).toEqual(
      Array(3).fill('needs mcp-scanning [requires: mcp-scanning]'),
    );
  });

  it('names each capability a block lacks once in its label, in the order of the calls', () => {
    expect(block('needs two capabilities').map((t) => [t.ancestorTitles[0], t.title, t.status])).toEqual([
      ['needs two capabilities the adapter lacks [requires: mcp-scanning, a2a-scanning]', 'only test', 'skipped'],
    ]);
  });

  it('runs none of the hooks of a block whose capability the adapter lacks', () => {
    const ran = ['beforeAll', 'beforeEach', 'afterEach', 'afterAll'].filter((hook) =>
      existsSync(join(dir, `missing.${hook}`)),
    );
    expect(ran).toEqual([]);
  });

  it('runs a block whose capability the adapter has', () => {
    expect(block('needs prompt-input-scanning').map((t) => [t.ancestorTitles[0], t.title, t.status])).toEqual([
      ['needs prompt-input-scanning', 'first test', 'passed'],
      ['needs prompt-input-scanning', 'second test', 'passed'],
    ]);
    expect(existsSync(join(dir, 'present.beforeAll'))).toBe(true);
  });

  it('throws in a test, naming the capability, the adapter and describeWithCapability', () => {
    const [missing, present] = block('calls requireCapability in a test');
    expect(missing.status).toBe('failed');
    for (const part of MESSAGE_PARTS) expect(missing.failureMessages.join('\n')).toContain(part);
    expect(missing.failureMessages.join('\n')).toContain('(not in a describe() callback)');
    expect(present.status).toBe('passed');
  });

  it('throws at the top of a test file, so the file runs no test', () => {
    const topLevel = file('top-level.test.ts');
    expect(topLevel.status).toBe('failed');
    for (const part of MESSAGE_PARTS) expect(topLevel.message).toContain(part);
    expect(topLevel.message).toContain('(not in a describe() callback)');
    expect(topLevel.assertionResults.filter((t) => t.status === 'passed')).toEqual([]);
  });

  it('throws outside a vitest run, naming the capability and the adapter', async () => {
    const script = join(dir, 'outside-vitest.ts');
    writeFileSync(
      script,
      `import { requireCapability } from ${JSON.stringify(CAPABILITIES_CORE)};
requireCapability('prompt-input-scanning');
try {
  requireCapability('mcp-scanning');
  console.log('requireCapability returned');
} catch (err) {
  console.log((err as Error).message);
}
`,
    );
    const run = await runNode([TSX, script], dir, adapter);
    expect(run.code, run.stderr).toBe(0);
    for (const part of MESSAGE_PARTS) expect(run.stdout).toContain(part);
    expect(run.stdout).toContain('(not in a vitest run)');
  }, 60_000);
});
