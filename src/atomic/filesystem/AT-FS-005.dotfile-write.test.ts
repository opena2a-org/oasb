// AT-FS-005: Shell Config Dotfile Write Detection
// ATLAS: AML.T0081 (Modify AI Agent Configuration)
// OWASP: LLM06 (Excessive Agency)
// OWASP Agentic: ASI05 (Unexpected Code Execution (RCE))
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

describeWithCapability('filesystem-monitoring', 'AT-FS-005: Shell Config Dotfile Write Detection', () => {
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

  const shellConfigFiles = ['.bashrc', '.zshrc', '.bash_profile', '.profile', '.gitconfig'];

  for (const file of shellConfigFiles) {
    it(`should classify a write to ${file} as a high-severity violation`, async () => {
      await observe(file);

      const events = filesystemEvents();
      expect(events).toHaveLength(1);
      expect(events[0].category).toBe('violation');
      expect(events[0].severity).toBe('high');
      expect(events[0].data!.path).toBe(file);
      expect(events[0].data!.eventType).toBe('change');
      expect(events[0].data!.sensitive).toBe(true);
    });
  }

  it('should classify a write to each shell config dotfile as a violation', async () => {
    for (const file of shellConfigFiles) await observe(file);

    const violations = arp.getEventsByCategory('violation');
    expect(violations.map((e) => e.data!.path)).toEqual(shellConfigFiles);
    for (const violation of violations) {
      expect(violation.severity).toBe('high');
      expect(violation.data!.eventType).toBe('change');
    }
  });

  it('should flag a dotfile created and one written, and report which each was', async () => {
    await observe('.bashrc', 'rename');
    await observe('.bashrc', 'change');

    const events = filesystemEvents();
    expect(events).toHaveLength(2);
    for (const event of events) {
      expect(event.category).toBe('violation');
      expect(event.severity).toBe('high');
    }
    expect(events.map((e) => e.data!.eventType).sort()).toEqual(['change', 'rename']);
  });

  it('should verify newly-added sensitive paths from ARP fix are covered', async () => {
    const newlyAddedDotfiles = ['.bash_profile', '.profile', '.gitconfig'];

    for (const file of newlyAddedDotfiles) await observe(file);

    const violations = arp.getEventsByCategory('violation');
    expect(violations.map((e) => e.data!.path)).toEqual(newlyAddedDotfiles);
  });
});
