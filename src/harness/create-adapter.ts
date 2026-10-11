/**
 * Adapter factory — selects which security product adapter to use.
 *
 * Set OASB_ADAPTER env var to choose:
 *   - "arp" (default) — uses arp-guard (must be installed)
 *   - "llm-guard" — uses theRizwan/llm-guard
 *   - path to a JS/TS module that exports a class implementing SecurityProductAdapter
 *     (a relative path such as ./my-adapter.js resolves from the working directory)
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
      // Custom adapter module
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(adapterModulePath(adapterName, cwd));
      const Cls = mod.default || mod.Adapter || mod[Object.keys(mod)[0]];
      if (!Cls || typeof Cls !== 'function') {
        throw new Error(`Module "${adapterName}" does not export an adapter class`);
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
