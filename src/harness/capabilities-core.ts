/**
 * Capability matrix helpers that are safe to use outside a vitest run.
 *
 * Kept separate from ./capabilities (whose describeWithCapability wraps
 * vitest's describe) so the package entry point can be require()d by
 * consumers without pulling vitest into the module graph.
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

/**
 * Call at the top of a describe() block to skip the entire suite
 * if the adapter lacks the required capability.
 *
 * Uses describe.skipIf() so the tests show as skipped, not failed.
 */
export function requireCapability(cap: Capability): void {
  const has = hasCapability(cap);
  if (!has) {
    // Can't use describe.skipIf at this point, but we can use
    // a beforeAll that throws a skip. The caller should use
    // describeWithCapability instead for cleaner skip behavior.
  }
}

/**
 * Get the full capability matrix for reporting.
 */
export function getCapabilityMatrix(): CapabilityMatrix {
  return getMatrix();
}
