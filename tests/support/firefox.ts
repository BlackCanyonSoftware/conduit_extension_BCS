import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { firefox, type BrowserContext } from '@playwright/test';

// Playwright can start Firefox but has no way to load an extension into it, and cannot open an
// extension's own pages. So the extension is installed the way Mozilla's own `web-ext` does it:
// through Firefox's remote debugging server, as a temporary add-on.

/** A minimal client for Firefox's debugging protocol: each packet is `<length>:<json>`. */
interface DebuggerClient {
  request: (
    message: { to: string; type: string } & Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  close: () => void;
}

function connect(port: number): Promise<DebuggerClient> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let buffer = Buffer.alloc(0);
    const waiting: ((packet: Record<string, unknown>) => void)[] = [];
    const arrived: Record<string, unknown>[] = [];

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const colon = buffer.indexOf(':');
        if (colon === -1) return;
        const length = Number(buffer.subarray(0, colon).toString());
        if (buffer.length < colon + 1 + length) return;
        const packet = JSON.parse(
          buffer.subarray(colon + 1, colon + 1 + length).toString('utf8'),
        ) as Record<string, unknown>;
        buffer = buffer.subarray(colon + 1 + length);
        const next = waiting.shift();
        if (next) next(packet);
        else arrived.push(packet);
      }
    });
    socket.on('error', reject);

    const nextPacket = (): Promise<Record<string, unknown>> => {
      const early = arrived.shift();
      return early
        ? Promise.resolve(early)
        : new Promise((done) => {
            waiting.push(done);
          });
    };
    socket.once('connect', () => {
      void nextPacket().then(() => {
        // The first packet is the server's greeting.
        resolve({
          async request(message) {
            const text = JSON.stringify(message);
            socket.write(`${String(Buffer.byteLength(text))}:${text}`);
            for (;;) {
              const reply = await nextPacket();
              if (reply.from === message.to) return reply;
            }
          },
          close: () => socket.end(),
        });
      });
    });
  });
}

/** A port nothing is listening on. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

/** Starts Firefox with a fresh profile and installs the extension in `extensionDir` into it. */
export async function launchFirefoxWith(
  extensionDir: string,
): Promise<{ context: BrowserContext; dispose: () => Promise<void> }> {
  const profile = mkdtempSync(path.join(tmpdir(), 'conduit-firefox-'));
  const port = await freePort();
  const context = await firefox.launchPersistentContext(profile, {
    headless: true,
    args: ['-start-debugger-server', String(port)],
    firefoxUserPrefs: {
      'devtools.debugger.remote-enabled': true,
      'devtools.debugger.prompt-connection': false,
      'devtools.chrome.enabled': true,
      'xpinstall.signatures.required': false,
    },
  });

  let client: DebuggerClient | undefined;
  for (let attempt = 0; attempt < 40 && !client; attempt += 1) {
    try {
      client = await connect(port);
    } catch {
      await new Promise((wait) => setTimeout(wait, 250));
    }
  }
  if (!client) throw new Error('Firefox did not start its debugging server');
  try {
    const root = await client.request({ to: 'root', type: 'getRoot' });
    const reply = await client.request({
      to: String(root.addonsActor),
      type: 'installTemporaryAddon',
      addonPath: path.resolve(extensionDir),
      openDevTools: false,
    });
    if (reply.error !== undefined) {
      throw new Error(`Firefox would not install the extension: ${JSON.stringify(reply)}`);
    }
  } finally {
    client.close();
  }
  return {
    context,
    dispose: async () => {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}
