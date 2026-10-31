import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test';

const EXTENSION_PATH = path.resolve('dist');

/** One POST the test app received. `status` is what it answered. */
export interface Delivered {
  path: string;
  body: unknown;
  status: number;
}

/** A small app that follows the integration contract, with controls for failing on purpose. */
export interface TestSink {
  url: string;
  port: number;
  received: Delivered[];
  /** The next `count` deliveries are answered with `status` instead of 204. */
  failNext: (count: number, status?: number) => void;
  /** What the handshake answers. Replace `wants` or the whole object. */
  handshake: Record<string, unknown>;
  /** Answer the handshake with this exact text (and status) instead. */
  answerHandshakeWith: (text: string, status?: number) => void;
  close: () => Promise<void>;
}

/** Starts a test app on this computer. Port 0 picks a free one. */
export async function startSink(port = 0): Promise<TestSink> {
  const received: Delivered[] = [];
  const failures = { count: 0, status: 500 };
  const raw: { text?: string; status: number } = { status: 200 };
  const sink: TestSink = {
    url: '',
    port: 0,
    received,
    failNext: (count, status = 500) => {
      failures.count = count;
      failures.status = status;
    },
    handshake: {
      conduit: 1,
      name: 'Test App',
      wants: [
        {
          id: 'sid-want',
          kind: 'cookie',
          origin: 'http://localhost',
          names: ['sid'],
          why: 'The test app wants the sid cookie to check delivery.',
        },
        {
          id: 'theme-want',
          kind: 'cookie',
          origin: 'http://localhost',
          names: ['theme'],
          why: 'The test app also wants the theme cookie.',
        },
      ],
    },
    answerHandshakeWith: (text, status = 200) => {
      raw.text = text;
      raw.status = status;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://app.test').pathname;
    if (request.method === 'GET' && path === '/.well-known/conduit') {
      response.statusCode = raw.status;
      response.setHeader('Content-Type', 'application/json');
      response.end(raw.text ?? JSON.stringify(sink.handshake));
      return;
    }
    if (request.method === 'POST') {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        let body: unknown;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          body = undefined;
        }
        let status = 204;
        if (failures.count > 0) {
          failures.count -= 1;
          status = failures.status;
        }
        received.push({ path, body, status });
        response.statusCode = status;
        response.end();
      });
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('test app has no port');
  sink.port = address.port;
  sink.url = `http://127.0.0.1:${String(address.port)}`;
  return sink;
}

interface Fixtures {
  context: BrowserContext;
  extensionId: string;
  popup: Page;
  /** Opens the popup as if the browser were on `siteUrl` (or on no website when omitted). */
  openPopup: (siteUrl?: string) => Promise<Page>;
  /** A local test website that sets three cookies, one of them HttpOnly. */
  site: { url: string };
  /** Opens Conduit's rules and log page in a tab. */
  openOptions: () => Promise<Page>;
  /** A test app on this computer that follows the integration contract. */
  testSink: TestSink;
}

/**
 * Runs each test in a fresh, headless Chromium with the built extension (dist/) loaded.
 * Run `npm run build` first; `npm run test:e2e` does that for you.
 */
export const test = base.extend<Fixtures>({
  // Playwright requires fixtures to destructure their dependencies, even when there are none.
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const profileDir = mkdtempSync(path.join(tmpdir(), 'conduit-e2e-'));
    const context = await chromium.launchPersistentContext(profileDir, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
    await use(context);
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  },

  extensionId: async ({ context }, use) => {
    const page = await context.newPage();
    await page.goto('chrome://extensions');
    const id = await page.evaluate(async () => {
      const all = await chrome.management.getAll();
      return all.find((extension) => extension.name === 'Conduit')?.id;
    });
    await page.close();
    if (!id) throw new Error('Conduit was not loaded: run `npm run build` first');
    await use(id);
  },

  popup: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await use(page);
  },

  openPopup: async ({ context, extensionId }, use) => {
    await use(async (siteUrl) => {
      const page = await context.newPage();
      // Playwright cannot grant clipboard access to an extension page, so record what the
      // popup asks to copy. The popup's own copy code still runs.
      await page.addInitScript(() => {
        Object.defineProperty(navigator.clipboard, 'writeText', {
          value: (text: string) => {
            (window as unknown as { copiedText?: string }).copiedText = text;
            return Promise.resolve();
          },
        });
      });
      if (siteUrl) {
        // A popup opened as a tab has no "active site", so tell it which page it was opened from.
        await page.addInitScript((url) => {
          chrome.tabs.query = () => Promise.resolve([{ id: 1, url } as chrome.tabs.Tab]);
        }, siteUrl);
      }
      await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      return page;
    });
  },

  openOptions: async ({ context, extensionId }, use) => {
    await use(async () => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/options/options.html`);
      return page;
    });
  },

  // eslint-disable-next-line no-empty-pattern
  testSink: async ({}, use) => {
    const sink = await startSink();
    await use(sink);
    await sink.close();
  },

  // eslint-disable-next-line no-empty-pattern
  site: async ({}, use) => {
    const server = createServer((request, response) => {
      const address = new URL(request.url ?? '/', 'http://localhost');
      if (address.pathname === '/favicon.ico') {
        // Browsers ask for this after a page loads; it must not touch the cookies.
        response.statusCode = 404;
        response.end();
        return;
      }
      // `?resp=value` changes the value of the x-conduit-resp header the site answers with.
      const resp = address.searchParams.get('resp') ?? 'page-response-value-1';
      if (address.pathname === '/ping') {
        // Answers the page's own fetch; sets no cookies.
        response.setHeader('X-Ping', 'pong');
        response.end('pong');
        return;
      }
      response.setHeader('X-Conduit-Resp', resp);
      response.setHeader('X-Other', 'not-asked-for');
      // `?sid=value` lets a test change the value of the sid cookie.
      const sid = address.searchParams.get('sid');
      response.setHeader('Set-Cookie', [
        `sid=${sid ?? 'abc123def456ghi789'}; Path=/; HttpOnly; SameSite=Lax`,
        'theme=dark; Path=/; Max-Age=31536000',
        'token=0123456789abcdefXYZ; Path=/app; Secure',
      ]);
      response.setHeader('Content-Type', 'text/html');
      // The page asks for /ping with a header of its own, and keeps some values in its storage.
      // `?req=`, `?local=`, `?session=` and `?tok=` change them.
      response.end(
        '<!doctype html><title>Test site</title><h1>Test site</h1><script>' +
          'const q = new URLSearchParams(location.search);' +
          "fetch('/ping', { headers: { 'X-Conduit-Req': q.get('req') ?? 'request-value-1234', 'X-Not-Asked': 'x' } });" +
          "localStorage.setItem('conduit-local', q.get('local') ?? 'local-value-1234');" +
          "localStorage.setItem('conduit-json', JSON.stringify({ token: q.get('tok') ?? 'json-token-1', visits: Date.now() }));" +
          "localStorage.setItem('conduit-other', 'not-asked-for');" +
          "sessionStorage.setItem('conduit-session', q.get('session') ?? 'session-value-1234');" +
          '</script>',
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('test server has no port');
    await use({ url: `http://localhost:${String(address.port)}/` });
    await new Promise((resolve) => server.close(resolve));
  },
});

export const { expect } = test;
