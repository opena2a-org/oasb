// OASB_ADAPTER module loading: a relative path names a module in the
// directory the command runs from, the way the README documents it
// (OASB_ADAPTER=./my-adapter.js npm test), not one next to this harness.

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

describe('OASB_ADAPTER module paths', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'oasb-adapter-'));
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'my-adapter.js'), ADAPTER_SOURCE);
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
});
