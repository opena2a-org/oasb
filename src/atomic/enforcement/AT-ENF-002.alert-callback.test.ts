// AT-ENF-002: Alert Callback Execution
// Defensive response test: validates the product's reaction (counters Impact / AML.TA0011). Not an adversary technique.
// OWASP Agentic: ASI10 (Rogue Agents)
// Tests the alert callback mechanism in EnforcementEngine.
// Verifies that registered callbacks fire on alert actions and
// that alerts succeed even without a callback registered.

import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { SecurityEvent, EnforcementResult, SecurityProductAdapter } from '../../harness/adapter';

describeWithCapability('enforcement-alert', 'AT-ENF-002: Alert Callback Execution', () => {
  let arp: SecurityProductAdapter;

  beforeEach(async () => {
    arp = createAdapter({
      monitors: { process: false, network: false, filesystem: false },
    });
    await arp.start();
  });

  afterEach(async () => {
    await arp.stop();
  });

  it('should invoke the alert callback with event and result', async () => {
    const callbackFn = vi.fn();
    const enforcement = arp.getEnforcementEngine();
    enforcement.setAlertCallback(callbackFn);

    const mockEvent: SecurityEvent = {
      id: 'test-enf-002-1',
      timestamp: new Date().toISOString(),
      source: 'process',
      category: 'violation',
      severity: 'high',
      description: 'Unauthorized process spawn',
      data: {},
      classifiedBy: 'L0-rules',
    };

    const result = await enforcement.execute('alert', mockEvent);

    expect(result.action).toBe('alert');
    expect(result.success).toBe(true);
    expect(callbackFn).toHaveBeenCalledOnce();
    expect(callbackFn).toHaveBeenCalledWith(mockEvent, expect.objectContaining({
      action: 'alert',
      success: true,
    }));
  });

  it('should succeed without a callback registered', async () => {
    const enforcement = arp.getEnforcementEngine();
    // No callback set

    const mockEvent: SecurityEvent = {
      id: 'test-enf-002-2',
      timestamp: new Date().toISOString(),
      source: 'network',
      category: 'anomaly',
      severity: 'medium',
      description: 'Suspicious outbound connection',
      data: {},
      classifiedBy: 'L0-rules',
    };

    const result = await enforcement.execute('alert', mockEvent);

    expect(result.action).toBe('alert');
    expect(result.success).toBe(true);
  });

  it('should succeed even if the callback throws an error', async () => {
    const enforcement = arp.getEnforcementEngine();
    enforcement.setAlertCallback(() => {
      throw new Error('Callback failure');
    });

    const mockEvent: SecurityEvent = {
      id: 'test-enf-002-3',
      timestamp: new Date().toISOString(),
      source: 'filesystem',
      category: 'threat',
      severity: 'critical',
      description: 'Credential file access attempt',
      data: {},
      classifiedBy: 'L0-rules',
    };

    const result = await enforcement.execute('alert', mockEvent);

    // Callback errors should not block enforcement
    expect(result.action).toBe('alert');
    expect(result.success).toBe(true);
  });

  it('should replace a previous callback when setAlertCallback is called again', async () => {
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();
    const enforcement = arp.getEnforcementEngine();

    enforcement.setAlertCallback(firstCallback);
    enforcement.setAlertCallback(secondCallback);

    const mockEvent: SecurityEvent = {
      id: 'test-enf-002-4',
      timestamp: new Date().toISOString(),
      source: 'process',
      category: 'violation',
      severity: 'high',
      description: 'Process violation detected',
      data: {},
      classifiedBy: 'L0-rules',
    };

    await enforcement.execute('alert', mockEvent);

    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).toHaveBeenCalledOnce();
  });
});
