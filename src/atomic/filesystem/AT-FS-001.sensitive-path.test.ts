// AT-FS-001: Sensitive Path Access Detection
// ATLAS: AML.T0055 (Unsecured Credentials)
// OWASP: LLM02 (Sensitive Information Disclosure)
// OWASP Agentic: ASI03 (Identity & Privilege Abuse)
//
// The filesystem monitor runs, watching a fresh temporary directory, and each
// test has its watch report the changes the test gives instead of waiting for
// the host's file events. A change carries no category or severity: the
// assertions read the classification the monitor gives it.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { it, expect, beforeEach, afterEach } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { ObservationClassification, ObservedFileChange, SecurityEvent, SecurityProductAdapter } from '../../harness/adapter';

describeWithCapability('filesystem-monitoring', 'AT-FS-001: Sensitive Path Access Detection', () => {
  let arp: SecurityProductAdapter;
  let dir: string;

  /** The watch reports `eventType` for the file at `relative` in the watched directory */
  function observe(relative: string, eventType: ObservedFileChange['eventType'] = 'change'): Promise<ObservationClassification> {
    return arp.observeFileChange!({ eventType, path: path.join(dir, relative) });
  }

  function filesystemEvents(): SecurityEvent[] {
    return arp.getEvents().filter((e) => e.source === 'filesystem');
  }

  beforeEach(async () => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'oasb-fs-')));
    arp = createAdapter({
      monitors: { filesystem: true },
      filesystemWatchPaths: [dir],
    });
    await arp.start();
    expect(arp.observeFileChange, 'the adapter declares filesystem-monitoring but has no observeFileChange()').toBeTypeOf('function');
  });

  afterEach(async () => {
    await arp.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('should classify a write to .ssh/id_rsa as a high-severity violation', async () => {
    await observe('.ssh/id_rsa');

    const events = filesystemEvents();
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('violation');
    expect(events[0].severity).toBe('high');
    expect(events[0].data!.path).toContain('.ssh/id_rsa');
  });

  it('should classify a write to .aws/credentials as a high-severity violation', async () => {
    await observe('.aws/credentials');

    const events = filesystemEvents();
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('violation');
    expect(events[0].severity).toBe('high');
    expect(events[0].data!.path).toContain('.aws/credentials');
  });

  it('should classify a write to .gnupg/secring.gpg as a high-severity violation', async () => {
    await observe('.gnupg/secring.gpg');

    const events = filesystemEvents();
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('violation');
    expect(events[0].severity).toBe('high');
    expect(events[0].data!.path).toContain('.gnupg/secring.gpg');
  });

  it('should classify each of three sensitive paths as a sensitive violation', async () => {
    const sensitivePaths = ['.ssh/id_rsa', '.aws/credentials', '.gnupg/secring.gpg'];

    for (const relative of sensitivePaths) await observe(relative);

    const violations = arp.getEventsByCategory('violation');
    expect(violations).toHaveLength(3);
    for (const violation of violations) {
      expect(violation.severity).toBe('high');
      expect(violation.data!.sensitive).toBe(true);
    }
    for (const relative of sensitivePaths) {
      expect(violations.some((e) => (e.data!.path as string).includes(relative))).toBe(true);
    }
  });
});
