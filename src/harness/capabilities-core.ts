/**
 * Capability matrix helpers that are safe to use outside a vitest run.
 *
 * Kept separate from ./capabilities (whose describeWithCapability wraps
 * vitest's describe) so the package entry point can be require()d by
 * consumers without pulling vitest into the module graph. requireCapability
 * loads vitest's suite API when it is called in a vitest run with a
 * capability the adapter lacks, and not before.
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
 * The describe() block whose callback vitest is running, or why there is
 * none. vitest is required here, and not imported at the top of this file,
 * so that the file loads without it.
 */
function collectingBlock(): DescribeBlock | string {
  if (!process.env.VITEST) return 'not in a vitest run';
  try {
    const { getCurrentSuite } = require('vitest/suite') as { getCurrentSuite(): { suite?: DescribeBlock } };
    // At the top of a test file, and while a test runs, the current collector
    // is vitest's default one, which has no suite.
    return getCurrentSuite().suite ?? 'not in a describe() callback';
  } catch (err) {
    return `vitest's suite API failed: ${String((err as Error)?.message ?? err).split('\n')[0]}`;
  }
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
 * and says to use describeWithCapability(cap, name, fn) instead.
 */
export function requireCapability(cap: Capability): void {
  if (hasCapability(cap)) return;
  const block = collectingBlock();
  if (typeof block === 'string') {
    throw new Error(
      `requireCapability('${cap}'): the adapter under test, ${getMatrix().product} ` +
        `(OASB_ADAPTER=${process.env.OASB_ADAPTER || 'arp'}), lacks ${cap}, and there is no describe() ` +
        `block to skip (${block}). Call it at the top of a describe() callback in a vitest run, or use ` +
        `describeWithCapability('${cap}', name, fn) from src/harness/capabilities to report the suite N/A.`,
    );
  }
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
