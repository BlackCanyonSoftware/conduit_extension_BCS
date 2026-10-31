import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test';

const EXTENSION_PATH = path.resolve('dist');

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
  site: async ({}, use) => {
    const server = createServer((request, response) => {
      const address = new URL(request.url ?? '/', 'http://localhost');
      if (address.pathname === '/favicon.ico') {
        // Browsers ask for this after a page loads; it must not touch the cookies.
        response.statusCode = 404;
        response.end();
        return;
      }
      // `?sid=value` lets a test change the value of the sid cookie.
      const sid = address.searchParams.get('sid');
      response.setHeader('Set-Cookie', [
        `sid=${sid ?? 'abc123def456ghi789'}; Path=/; HttpOnly; SameSite=Lax`,
        'theme=dark; Path=/; Max-Age=31536000',
        'token=0123456789abcdefXYZ; Path=/app; Secure',
      ]);
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Test site</title><h1>Test site</h1>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('test server has no port');
    await use({ url: `http://localhost:${String(address.port)}/` });
    await new Promise((resolve) => server.close(resolve));
  },
});

export const { expect } = test;
