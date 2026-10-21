/**
 * Capability-aware test helpers.
 *
 * Tests call requireCapability() at the top of a describe() callback, or
 * wrap the suite in describeWithCapability(), to skip the suite when the
 * adapter under test doesn't support a given feature. The skipped suite's
 * title ends in [requires: <capability>], and the report counts its tests
 * in a scenario file as not applicable. Called in a test, at the top of a
 * test file or outside a vitest run for a capability the adapter lacks,
 * requireCapability() throws.
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
 * lacks a required capability. Produces N/A in the scorecard.
 *
 * A suite that spans several surfaces (an integration chain that injects
 * process and network events and asserts a kill) passes them all; it runs
 * only when the adapter has every one.
 *
 * @example
 *   describeWithCapability('mcp-scanning', 'MCP Tool Scanning', () => {
 *     it('should detect path traversal', () => { ... });
 *   });
 *   describeWithCapability(['network-monitoring', 'enforcement-kill'], 'Exfil chain', () => { ... });
 */
export const describeWithCapability = (
  caps: Capability | readonly Capability[],
  name: string,
  fn: () => void,
) => {
  const missing = (typeof caps === 'string' ? [caps] : caps).filter((cap) => !hasCapability(cap));
  if (missing.length === 0) {
    describe(name, fn);
  } else {
    describe.skip(`${name} [requires: ${missing.join(', ')}]`, fn);
  }
};
