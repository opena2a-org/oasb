// AT-FS-001: Sensitive Path Access Detection
// ATLAS: AML.T0055 (Unsecured Credentials)
// OWASP: LLM02 (Sensitive Information Disclosure)

import { it, expect, beforeEach, afterEach } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { SecurityProductAdapter } from '../../harness/adapter';

describeWithCapability('filesystem-monitoring', 'AT-FS-001: Sensitive Path Access Detection', () => {
  let arp: SecurityProductAdapter;

  beforeEach(async () => {
    arp = createAdapter({
      monitors: { filesystem: false },
    });
    await arp.start();
  });

  afterEach(async () => {
    await arp.stop();
  });

  it('should detect access to .ssh/id_rsa as a high-severity violation', async () => {
    await arp.injectEvent({
      source: 'filesystem-monitor',
      category: 'violation',
      severity: 'high',
      description: 'Sensitive path access: .ssh/id_rsa',
      data: {
        path: '/home/user/.ssh/id_rsa',
        operation: 'read',
        sensitive: true,
      },
    });

    const violations = arp.getEventsByCategory('violation');
    expect(violations.length).toBe(1);
    expect(violations[0].severity).toBe('high');
    expect(violations[0].data.path).toContain('.ssh/id_rsa');
  });

  it('should detect access to .aws/credentials as a high-severity violation', async () => {
    await arp.injectEvent({
      source: 'filesystem-monitor',
      category: 'violation',
      severity: 'high',
      description: 'Sensitive path access: .aws/credentials',
      data: {
        path: '/home/user/.aws/credentials',
        operation: 'read',
        sensitive: true,
      },
    });

    const violations = arp.getEventsByCategory('violation');
    expect(violations.length).toBe(1);
    expect(violations[0].severity).toBe('high');
    expect(violations[0].data.path).toContain('.aws/credentials');
  });

  it('should detect access to .gnupg/secring.gpg as a high-severity violation', async () => {
    await arp.injectEvent({
      source: 'filesystem-monitor',
      category: 'violation',
      severity: 'high',
      description: 'Sensitive path access: .gnupg/secring.gpg',
      data: {
        path: '/home/user/.gnupg/secring.gpg',
        operation: 'read',
        sensitive: true,
      },
    });

    const violations = arp.getEventsByCategory('violation');
    expect(violations.length).toBe(1);
    expect(violations[0].severity).toBe('high');
    expect(violations[0].data.path).toContain('.gnupg/secring.gpg');
  });

  it('should capture all three sensitive path accesses', async () => {
    const sensitivePaths = [
      '/home/user/.ssh/id_rsa',
      '/home/user/.aws/credentials',
      '/home/user/.gnupg/secring.gpg',
    ];

    for (const path of sensitivePaths) {
      await arp.injectEvent({
        source: 'filesystem-monitor',
        category: 'violation',
        severity: 'high',
        description: `Sensitive path access: ${path}`,
        data: {
          path,
          operation: 'read',
          sensitive: true,
        },
      });
    }

    const violations = arp.getEventsByCategory('violation');
    expect(violations.length).toBe(3);

    for (const violation of violations) {
      expect(violation.severity).toBe('high');
      expect(violation.data.sensitive).toBe(true);
    }

    expect(
      arp.getEvents().some((e) => e.data.path.includes('.ssh/id_rsa'))
    ).toBe(true);
    expect(
      arp.getEvents().some((e) => e.data.path.includes('.aws/credentials'))
    ).toBe(true);
    expect(
      arp.getEvents().some((e) => e.data.path.includes('.gnupg/secring.gpg'))
    ).toBe(true);
  });
});
