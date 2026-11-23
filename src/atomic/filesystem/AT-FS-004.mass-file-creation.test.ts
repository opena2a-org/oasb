// AT-FS-004: Mass File Creation Detection
// ATLAS: AML.T0034.002 (Agentic Resource Consumption)
// OWASP: LLM10 (Unbounded Consumption)
// OWASP Agentic: ASI10 (Rogue Agents)
//
// The filesystem monitor runs, watching a fresh temporary directory, and each
// test has its watch report the changes the test gives instead of waiting for
// the host's file events. A change carries no category or severity: the
// assertions read the classification the monitor gives it. The reference
// product reports each file created as normal activity and has no check on
// the rate of creation, so these tests read what it reports for each file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { it, expect, beforeEach, afterEach } from 'vitest';
import { describeWithCapability } from '../../harness/capabilities';
import { createAdapter } from '../../harness/create-adapter';
import type { ObservedFileChange, SecurityEvent, SecurityProductAdapter } from '../../harness/adapter';

describeWithCapability('filesystem-monitoring', 'AT-FS-004: Mass File Creation Detection', () => {
  let arp: SecurityProductAdapter;
  let dir: string;
  const fileCount = 20;

  /** The watch reports `eventType` for the file at `relative` in the watched directory */
  function observe(relative: string, eventType: ObservedFileChange['eventType'] = 'rename'): Promise<void> {
    return arp.observeFileChange!({ eventType, path: path.join(dir, relative) });
  }

  /** The watch reports fileCount files created in output/, in order */
  async function createFiles(): Promise<void> {
    for (let i = 0; i < fileCount; i++) await observe(`output/file-${i}.txt`);
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

  it('should report each of 20 files created in quick succession', async () => {
    await createFiles();

    expect(filesystemEvents()).toHaveLength(fileCount);
  });

  it('should report the files created in the order they were created', async () => {
    await createFiles();

    expect(filesystemEvents().map((e) => e.data!.path)).toEqual(
      Array.from({ length: fileCount }, (_, i) => path.join('output', `file-${i}.txt`)),
    );
  });

  it('should classify each mass-created ordinary file as normal', async () => {
    await createFiles();

    const events = filesystemEvents();
    expect(events.filter((e) => e.category === 'normal')).toHaveLength(fileCount);
    expect(events.filter((e) => e.severity === 'info')).toHaveLength(fileCount);
    expect(arp.getEventsByCategory('violation')).toEqual([]);
    expect(arp.getEventsByCategory('anomaly')).toEqual([]);
  });

  it('should single out a sensitive file among the mass-created ones', async () => {
    await createFiles();
    await observe('.ssh/id_rsa', 'change');

    expect(filesystemEvents()).toHaveLength(fileCount + 1);
    expect(arp.getEventsByCategory('normal')).toHaveLength(fileCount);

    const violations = arp.getEventsByCategory('violation');
    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('high');
    expect(violations[0].data!.path).toBe(path.join('.ssh', 'id_rsa'));
  });
});
