/**
 * Adapter factory — selects which security product adapter to use.
 *
 * Set OASB_ADAPTER env var to choose:
 *   - "arp" (default) — uses arp-guard (must be installed)
 *   - "llm-guard" — uses theRizwan/llm-guard
 *   - "rebuff" — uses the rebuff package's heuristic detection
 *   - path to a JS/TS module that exports a class implementing SecurityProductAdapter
 *     as its default export, as a named export "Adapter", or as module.exports = Class
 *     (a relative path such as ./my-adapter.js resolves from the working directory)
 *
 * A value that is no built-in name, no path and no module that resolves is an
 * error that names these values. A case variant of a built-in name ("ARP") is
 * refused with the name it differs from, and is never loaded as a package.
 *
 * All test files import from here instead of instantiating adapters directly.
 */
import * as path from 'path';
import type { SecurityProductAdapter, LabConfig } from './adapter';

// Eagerly resolve the adapter class at import time.
// This file is only imported by tests that need the adapter,
// so the cost is acceptable. Each wrapper handles lazy loading internally.
import { ArpWrapper } from './arp-wrapper';
import { LLMGuardWrapper } from './llm-guard-wrapper';
import { RebuffWrapper } from './rebuff-wrapper';

type AdapterConstructor = new (config?: LabConfig) => SecurityProductAdapter;

const BUILT_IN_ADAPTERS = ['arp', 'llm-guard', 'rebuff'];

const ACCEPTED_SHAPES =
  'a SecurityProductAdapter class (default export, a named export "Adapter", or module.exports = Class)';

/**
 * An error for an OASB_ADAPTER value that selects no adapter. The message is
 * the whole report, so the error carries no stack frames for the test runner
 * to print beneath it.
 */
function selectionError(message: string): Error {
  const err = new Error(message);
  err.stack = `Error: ${message}`;
  return err;
}

/** A value that names a file: it holds a path separator, starts with "." or is absolute. */
function isModulePath(adapterName: string): boolean {
  return /[\\/]/.test(adapterName) || adapterName.startsWith('.') || path.isAbsolute(adapterName);
}

/** True when `specifier` resolves to a module from this harness. */
function resolvesAsModule(specifier: string): boolean {
  try {
    require.resolve(specifier);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') return false;
    throw err;
  }
}

/**
 * The specifier to require for a custom OASB_ADAPTER value. A relative path
 * (./ or ../) resolves from `cwd`, not from this file; an absolute path or a
 * package name is returned unchanged.
 */
export function adapterModulePath(adapterName: string, cwd: string = process.cwd()): string {
  return /^\.\.?(?:[\\/]|$)/.test(adapterName) ? path.resolve(cwd, adapterName) : adapterName;
}

/** The adapter class an OASB_ADAPTER value selects. */
export function resolveAdapterClass(adapterName: string, cwd: string = process.cwd()): AdapterConstructor {
  switch (adapterName) {
    case 'arp':
      return ArpWrapper;
    case 'llm-guard':
      return LLMGuardWrapper;
    case 'rebuff':
      return RebuffWrapper;
    default: {
      const notAnAdapter =
        `OASB_ADAPTER="${adapterName}" is not an adapter. Use ${BUILT_IN_ADAPTERS.join(', ')}, ` +
        `or a path to a module that exports ${ACCEPTED_SHAPES}`;
      const builtIn = BUILT_IN_ADAPTERS.find((name) => name === adapterName.toLowerCase());
      if (builtIn) {
        throw selectionError(`${notAnAdapter}; did you mean "${builtIn}"?`);
      }
      const specifier = adapterModulePath(adapterName, cwd);
      if (!isModulePath(adapterName) && !resolvesAsModule(specifier)) {
        throw selectionError(`${notAnAdapter}.`);
      }
      // Custom adapter module
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(specifier);
      const Cls = typeof mod === 'function' ? mod : mod.default || mod.Adapter || mod[Object.keys(mod)[0]];
      if (!Cls || typeof Cls !== 'function') {
        throw selectionError(
          `Module "${adapterName}" (OASB_ADAPTER) does not export an adapter class. ` +
            `Export ${ACCEPTED_SHAPES} from it.`,
        );
      }
      return Cls;
    }
  }
}

const AdapterClass = resolveAdapterClass(process.env.OASB_ADAPTER || 'arp');

/**
 * Create a configured adapter instance.
 * Uses OASB_ADAPTER env var to select the product under test.
 */
export function createAdapter(config?: LabConfig): SecurityProductAdapter {
  return new AdapterClass(config);
}
