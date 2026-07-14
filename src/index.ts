/**
 * @opena2a/oasb — public entry point.
 *
 * The headline API is the product-agnostic adapter contract: implement
 * SecurityProductAdapter, declare capabilities, and run the suite against
 * your product (see README "Evaluating Other Products"). The scoring
 * engine and scanner-benchmark runner are exposed under `benchmark`.
 */

// Adapter contract + shared event/enforcement types
export * from './harness/adapter';
export type { TestAnnotation, TestResult, SuiteMetrics } from './harness/types';

// Capability gating (unsupported surfaces report N/A, not FAIL).
// describeWithCapability is vitest-bound and intentionally not exported
// here; test suites import it from src/harness/capabilities.
export {
  hasCapability,
  requireCapability,
  getCapabilityMatrix,
} from './harness/capabilities-core';

// Adapter selection (OASB_ADAPTER env var) and worked adapter examples.
// Wrappers lazy-require their underlying products, so importing this entry
// does not require arp-guard / llm-guard / rebuff to be installed.
export { createAdapter } from './harness/create-adapter';
export { ArpWrapper } from './harness/arp-wrapper';
export { LLMGuardWrapper } from './harness/llm-guard-wrapper';
export { RebuffWrapper } from './harness/rebuff-wrapper';

// Test-harness utilities
export { EventCollector } from './harness/event-collector';
export { MockLLMAdapter } from './harness/mock-llm-adapter';
export { computeMetrics, attackAnnotation, benignAnnotation } from './harness/metrics';

// Skills-security scoring engine + scanner benchmark runner
export * as benchmark from './benchmark/index';
