// OASB_ADAPTER module loading: a relative path names a module in the
// directory the command runs from, the way the README documents it
// (OASB_ADAPTER=./my-adapter.js npm test), not one next to this harness.
// The module may export its class as module.exports = Class, and a value that
// selects no adapter stops the run with one line that names what is accepted.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { adapterModulePath, resolveAdapterClass } from './create-adapter';

const ADAPTER_SOURCE = `class TempDirAdapter {
  getCapabilities() {
    return { product: 'temp-dir-adapter', version: '0.0.0', capabilities: new Set(['prompt-input-scanning']) };
  }
}
module.exports = { TempDirAdapter };
`;

// The class itself as the module's export, the common CommonJS shape.
const DIRECT_EXPORT_SOURCE = `module.exports = class DirectExportAdapter {
  getCapabilities() {
    return { product: 'direct-export-adapter', version: '0.0.0', capabilities: new Set(['prompt-input-scanning']) };
  }
};
`;

const NO_CLASS_SOURCE = `module.exports = { version: '0.0.0' };
`;

const ACCEPTED_SHAPES = '(default export, a named export "Adapter", or module.exports = Class)';

/** The error resolveAdapterClass throws for an OASB_ADAPTER value. */
function selectionError(value: string, cwd?: string): Error {
  try {
    resolveAdapterClass(value, cwd);
  } catch (err) {
    return err as Error;
  }
  throw new Error(`resolveAdapterClass("${value}") returned an adapter class`);
}

describe('OASB_ADAPTER module paths', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'oasb-adapter-'));
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'my-adapter.js'), ADAPTER_SOURCE);
    writeFileSync(join(dir, 'direct-export.cjs'), DIRECT_EXPORT_SOURCE);
    writeFileSync(join(dir, 'no-class.cjs'), NO_CLASS_SOURCE);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads ./my-adapter.js from the working directory', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    const Cls = resolveAdapterClass('./my-adapter.js');
    expect(Cls.name).toBe('TempDirAdapter');
    expect(new Cls().getCapabilities().product).toBe('temp-dir-adapter');
  });

  it('loads ../my-adapter.js from the parent of the working directory', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(join(dir, 'sub'));
    expect(resolveAdapterClass('../my-adapter.js').name).toBe('TempDirAdapter');
  });

  it('loads an absolute path and leaves absolute paths and package names unchanged', () => {
    const absolute = join(dir, 'my-adapter.js');
    expect(resolveAdapterClass(absolute, join(dir, 'sub')).name).toBe('TempDirAdapter');
    expect(adapterModulePath(absolute, join(dir, 'sub'))).toBe(absolute);
    expect(adapterModulePath('my-adapter-package', dir)).toBe('my-adapter-package');
    expect(adapterModulePath('./my-adapter.js', dir)).toBe(resolve(dir, 'my-adapter.js'));
  });

  it('loads a module that assigns its class to module.exports', () => {
    const Cls = resolveAdapterClass('./direct-export.cjs', dir);
    expect(Cls.name).toBe('DirectExportAdapter');
    expect(new Cls().getCapabilities().product).toBe('direct-export-adapter');
  });

  it('names the accepted values on one line, with no stack, for a value that is no adapter', () => {
    const err = selectionError('bogus-product', dir);
    expect(err.message).toBe(
      'OASB_ADAPTER="bogus-product" is not an adapter. Use arp, llm-guard, rebuff, or a path to a module ' +
        `that exports a SecurityProductAdapter class ${ACCEPTED_SHAPES}.`,
    );
    expect(err.message).not.toContain('Require stack');
    expect(err.message).not.toContain('\n');
    expect(err.stack).not.toMatch(/\n\s+at /);
  });

  it('suggests the built-in name for a case variant of it, and never loads it as a package', () => {
    for (const [value, name] of [
      ['ARP', 'arp'],
      ['Llm-Guard', 'llm-guard'],
      ['REBUFF', 'rebuff'],
    ]) {
      const err = selectionError(value, dir);
      expect(err.message).toMatch(new RegExp(`^OASB_ADAPTER="${value}" is not an adapter\\. Use arp, llm-guard, rebuff`));
      expect(err.message).toContain(ACCEPTED_SHAPES);
      expect(err.message).toContain(`did you mean "${name}"?`);
      expect(err.stack).not.toMatch(/\n\s+at /);
    }
  });

  it('names the accepted export shapes for a module that exports no class', () => {
    const err = selectionError('./no-class.cjs', dir);
    expect(err.message).toContain('"./no-class.cjs"');
    expect(err.message).toContain('does not export an adapter class');
    expect(err.message).toContain(`SecurityProductAdapter class ${ACCEPTED_SHAPES}`);
  });
});
