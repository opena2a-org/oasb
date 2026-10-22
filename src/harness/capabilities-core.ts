/**
 * Capability matrix helpers that are safe to use outside a vitest run.
 *
 * Kept separate from ./capabilities (whose describeWithCapability wraps
 * vitest's describe) so the package entry point can be require()d by
 * consumers without pulling vitest into the module graph. requireCapability
 * loads vitest's suite API when it is called in a vitest run with a
 * capability the adapter lacks, and not before. vitest publishes that API
 * as an ES module only, which this file, compiled to CommonJS, loads with
 * require(): Node.js does that without a flag from 20.19.0 in 20.x and
 * from 22.12.0, the versions the engines field of package.json allows.
 */
import { createAdapter } from './create-adapter';
import type { Capability, CapabilityMatrix } from './adapter';

let _matrix: CapabilityMatrix | null = null;

function getMatrix(): CapabilityMatrix {
  if (!_matrix) {
    const adapter = createAdapter();
    _matrix = adapter.getCapabilities();
  }
  return _matrix;
}

/**
 * Check if the current adapter has a capability.
 */
export function hasCapability(cap: Capability): boolean {
  return getMatrix().capabilities.has(cap);
}

/** The fields of the vitest suite of a describe() block that requireCapability sets. */
interface DescribeBlock {
  name: string;
  mode: string;
}

/** Each block requireCapability has skipped: its title before the label, and the capabilities it lacks. */
const skippedBlocks = new WeakMap<DescribeBlock, { title: string; missing: Capability[] }>();

/**
 * The describe() block whose callback vitest is running; or why there is
 * none; or the error vitest's suite API failed with, which leaves open
 * whether there is one. vitest is required here, and not imported at the
 * top of this file, so that the file loads without it.
 */
function collectingBlock(): { block: DescribeBlock } | { none: string } | { failed: unknown } {
  if (!process.env.VITEST) return { none: 'not in a vitest run' };
  let block: DescribeBlock | undefined;
  try {
    const { getCurrentSuite } = require('vitest/suite') as { getCurrentSuite(): { suite?: DescribeBlock } };
    block = getCurrentSuite().suite;
  } catch (err) {
    return { failed: err };
  }
  // At the top of a test file, and while a test runs, the current collector
  // is vitest's default one, which has no suite.
  return block ? { block } : { none: 'not in a describe() callback' };
}

/**
 * The end of requireCapability's error where vitest's suite API failed with
 * `err`: the first line of `err`, then `instead`, what to do instead, after
 * the Node.js versions that can require() the API where this one cannot.
 */
function suiteApiFailure(err: unknown, instead: string): string {
  const detail = String((err as Error)?.message ?? err).split('\n')[0].replace(/\.+$/, '');
  const failed = `vitest's suite API, which requireCapability needs to skip a describe() block, failed: ${detail}.`;
  if ((err as NodeJS.ErrnoException)?.code !== 'ERR_REQUIRE_ESM') return `${failed} Instead, ${instead}`;
  return (
    `${failed} Node.js ${process.version} cannot require() an ES module here: run the suite on Node.js 20.19.0 ` +
    `or a later 20.x release, or on 22.12.0 or later, without --no-experimental-require-module, or ${instead}`
  );
}

/**
 * Call at the top of a describe() callback. When the adapter lacks `cap`,
 * the block is skipped: each of its tests, those of nested blocks included,
 * is reported skipped, none of its hooks runs, and its title ends in the
 * [requires: <capability>] label that describeWithCapability gives a suite
 * it skips. When the adapter has `cap`, the call does nothing.
 *
 * Where vitest is collecting no describe() block, as in a test, at the top
 * of a test file or outside a vitest run, a call for a capability the
 * adapter lacks throws an Error that names the capability and the adapter
 * and says to use describeWithCapability(cap, name, fn) instead. Where
 * vitest's suite API fails, such a call throws an Error that names the
 * capability and the adapter, quotes the first line of the API's error and
 * says to use describeWithCapability instead; when Node.js cannot require()
 * the API, an ES module, the Error names the Node.js versions that can.
 */
export function requireCapability(cap: Capability): void {
  if (hasCapability(cap)) return;
  const found = collectingBlock();
  if (!('block' in found)) {
    const lacks =
      `requireCapability('${cap}'): the adapter under test, ${getMatrix().product} ` +
      `(OASB_ADAPTER=${process.env.OASB_ADAPTER || 'arp'}), lacks ${cap}, and `;
    const instead = `use describeWithCapability('${cap}', name, fn) from src/harness/capabilities to report the suite N/A.`;
    throw new Error(
      'none' in found
        ? `${lacks}there is no describe() block to skip (${found.none}). ` +
            `Call it at the top of a describe() callback in a vitest run, or ${instead}`
        : lacks + suiteApiFailure(found.failed, instead),
    );
  }
  const { block } = found;
  const skipped = skippedBlocks.get(block) ?? { title: block.name, missing: [] };
  if (!skipped.missing.includes(cap)) skipped.missing.push(cap);
  skippedBlocks.set(block, skipped);
  // The mode describe.skip gives the suite of the block it creates.
  block.mode = 'skip';
  block.name = `${skipped.title} [requires: ${skipped.missing.join(', ')}]`;
}

/**
 * Get the full capability matrix for reporting.
 */
export function getCapabilityMatrix(): CapabilityMatrix {
  return getMatrix();
}
