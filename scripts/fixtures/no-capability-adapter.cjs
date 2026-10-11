// An adapter that declares no capabilities, for scripts/adapter-gating.test.mjs.
//
// With it selected (OASB_ADAPTER=<absolute path to this file>), every scenario
// suite is N/A. Every contract method other than getCapabilities() throws, so a
// scenario that reaches the product outside its capability gate fails instead
// of passing on the reference adapter's behaviour.

const CONTRACT_METHODS = [
  'start',
  'stop',
  'injectEvent',
  'waitForEvent',
  'getEvents',
  'getEventsByCategory',
  'getEnforcements',
  'getEnforcementsByAction',
  'resetCollector',
  'getEventEngine',
  'getEnforcementEngine',
  'createPromptScanner',
  'createMCPScanner',
  'createA2AScanner',
  'createPatternScanner',
  'createBudgetManager',
  'createAnomalyScorer',
];

class NoCapabilityAdapter {
  getCapabilities() {
    return { product: 'no-capability-fixture', version: '0.0.0', capabilities: new Set() };
  }
}

for (const name of CONTRACT_METHODS) {
  NoCapabilityAdapter.prototype[name] = function () {
    throw new Error(`${name}() was called on an adapter that declares no capabilities`);
  };
}

module.exports = { NoCapabilityAdapter };
