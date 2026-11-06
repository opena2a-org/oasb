// E2E-003: Live Network Detection
// Proves ARP's NetworkMonitor detects real TCP connections via lsof/ss polling.
// No event injection — the monitor polls the OS network state directly.
//
// NOTE: Requires lsof (macOS) or ss (Linux) on PATH. Where the tool of the
// platform is not, the test is skipped as inconclusive (skipInconclusive in
// ../harness/filesystem-watch), so a run of the file reports NOT MEASURED and
// exits 2, as a run whose every test is skipped does, and the README count
// drift guard reports the file as not measured.
//
// ATLAS: AML.T0025 (Exfiltration via Cyber Means)
// OWASP: LLM06
// OWASP Agentic: ASI02 (Tool Misuse & Exploitation)

import { it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as net from 'net';
import * as os from 'os';
import { describeWithCapability } from '../harness/capabilities';
import { createAdapter } from '../harness/create-adapter';
import { skipInconclusive } from '../harness/filesystem-watch';
import type { SecurityProductAdapter } from '../harness/adapter';

function hasNetworkTool(): boolean {
  try {
    if (os.platform() === 'darwin') {
      execSync('which lsof', { encoding: 'utf-8', timeout: 2000 });
    } else {
      execSync('which ss', { encoding: 'utf-8', timeout: 2000 });
    }
    return true;
  } catch {
    return false;
  }
}

describeWithCapability('network-monitoring', 'E2E-003: Live Network Detection', () => {
  let networkAvailable: boolean;

  beforeAll(() => {
    networkAvailable = hasNetworkTool();
  });

  let arp: SecurityProductAdapter;
  let server: net.Server;
  let serverPort: number;
  let clientSocket: net.Socket | null = null;

  beforeEach(async () => {
    if (!networkAvailable) return;

    // Start a local TCP server on a random port
    server = net.createServer((socket) => {
      socket.on('data', (data) => socket.write(data));
      // The test ends when the monitor reports the connection, and afterEach
      // then destroys the client. Where that poll ran before this socket read
      // the client's write, the echo reaches a closed peer, which answers with
      // a reset; on macOS the next read here then fails with ECONNRESET. An
      // error of the echo connection is not an event of the product, and the
      // verdict rests on the product's event alone, so it is not left to fail
      // the run as an uncaught error.
      socket.on('error', () => {});
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });

    arp = createAdapter({
      monitors: {
        process: false,
        network: true,
        filesystem: false,
      },
      networkIntervalMs: 1000,
    });
    await arp.start();

    // Let the initial snapshot complete
    await new Promise((r) => setTimeout(r, 1100));
  });

  afterEach(async () => {
    if (!networkAvailable) return;

    if (clientSocket) {
      clientSocket.destroy();
      clientSocket = null;
    }
    await arp.stop();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should detect a new outbound TCP connection', { timeout: 20000 }, async (ctx) => {
    if (!networkAvailable) {
      skipInconclusive(ctx, 'inconclusive: lsof (macOS) or ss (Linux) is not on PATH; the test runs the network monitor only where it is');
    }

    clientSocket = net.connect({ host: '127.0.0.1', port: serverPort });

    await new Promise<void>((resolve, reject) => {
      clientSocket!.on('connect', resolve);
      clientSocket!.on('error', reject);
    });

    // Send data to ensure connection is fully active
    clientSocket.write('test-payload');

    const event = await arp.waitForEvent(
      (e) =>
        e.source === 'network' &&
        e.data!.remotePort === serverPort,
      15000,
    );

    expect(event).toBeDefined();
    expect(event.source).toBe('network');
    expect(event.data!.remotePort).toBe(serverPort);
  });
});
