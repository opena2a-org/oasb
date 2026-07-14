/**
 * Capability-aware test helpers.
 *
 * Tests call requireCapability() to skip gracefully when the
 * adapter under test doesn't support a given feature. This produces
 * an honest scorecard: N/A instead of FAIL.
 *
 * @example
 *   import { requireCapability } from '../harness/capabilities';
 *
 *   describe('MCP Tool Scanning', () => {
 *     requireCapability('mcp-scanning');
 *     // tests only run if adapter has mcp-scanning
 *   });
 */
import { describe } from 'vitest';
import type { Capability } from './adapter';
import { hasCapability } from './capabilities-core';

// Vitest-free helpers live in capabilities-core so the package entry point
// can be require()d without vitest; re-exported here so test files keep
// importing everything from './capabilities'.
export { hasCapability, requireCapability, getCapabilityMatrix } from './capabilities-core';

/**
 * A describe() wrapper that skips the entire suite if the adapter
 * lacks the required capability. Produces N/A in the scorecard.
 *
 * @example
 *   describeWithCapability('mcp-scanning', 'MCP Tool Scanning', () => {
 *     it('should detect path traversal', () => { ... });
 *   });
 */
export const describeWithCapability = (
  cap: Capability,
  name: string,
  fn: () => void,
) => {
  const has = hasCapability(cap);
  if (has) {
    describe(name, fn);
  } else {
    describe.skip(`${name} [requires: ${cap}]`, fn);
  }
};
