import path from 'node:path';
import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { launchFirefoxWith } from '../support/firefox';
import { startSink, startSite, type TestSink } from '../support/servers';

/** The extension, reached through a test-only content script on a page of the local test site. */
export interface Extension {
  /** What Conduit has in its storage (`rules`, `log`, `queue`, `deliveries`, ...). */
  get: (keys?: string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  clear: () => Promise<void>;
  /** A message a Conduit page sends its worker (capture-now, retry-deliveries, ...). */
  worker: (message: Record<string, unknown>) => Promise<unknown>;
}

interface Fixtures {
  context: BrowserContext;
  site: { url: string };
  testSink: TestSink;
  extension: Extension;
  /** Opens a page on the test site and leaves it open, as a person browsing does. */
  visit: (query?: string) => Promise<Page>;
}

const EXTENSION_PATH = path.resolve('dist-firefox');

/**
 * Runs each test in a fresh Firefox with the Firefox build (dist-firefox/, built with
 * `--test-bridge`) installed. `npm run test:e2e:firefox` builds it first.
 */
export const test = base.extend<Fixtures>({
  // Playwright requires fixtures to destructure their dependencies, even when there are none.
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const { context, dispose } = await launchFirefoxWith(EXTENSION_PATH);
    await use(context);
    await dispose();
  },

  // eslint-disable-next-line no-empty-pattern
  site: async ({}, use) => {
    const site = await startSite();
    await use({ url: site.url });
    await site.close();
  },

  // eslint-disable-next-line no-empty-pattern
  testSink: async ({}, use) => {
    const sink = await startSink();
    await use(sink);
    await sink.close();
  },

  extension: async ({ context, site }, use) => {
    // /ping sets no cookies, so using it does not disturb what a test captures.
    const page = await context.newPage();
    await page.goto(`${site.url}ping`);

    const call = (command: string, extra: Record<string, unknown> = {}): Promise<unknown> =>
      page.evaluate(
        ({ command, extra }) =>
          new Promise<unknown>((resolve, reject) => {
            const id = Math.floor(Math.random() * 1e9);
            const timer = setTimeout(() => {
              reject(new Error(`the extension did not answer ${command}`));
            }, 5000);
            const listener = (event: MessageEvent): void => {
              const data = event.data as {
                conduitTest?: string;
                id?: number;
                result?: unknown;
                error?: string;
              };
              if (data.conduitTest !== 'response' || data.id !== id) return;
              window.removeEventListener('message', listener);
              clearTimeout(timer);
              if (data.error === undefined) resolve(data.result);
              else reject(new Error(data.error));
            };
            window.addEventListener('message', listener);
            window.postMessage({ conduitTest: 'request', id, command, ...extra }, '*');
          }),
        { command, extra },
      );

    await use({
      get: async (keys) =>
        (await call('storage-get', keys ? { keys } : {})) as Record<string, unknown>,
      set: async (items) => {
        await call('storage-set', { items });
      },
      clear: async () => {
        await call('storage-clear');
      },
      worker: (message) => call('worker', { message }),
    });
    await page.close();
  },

  visit: async ({ context, site }, use) => {
    await use(async (query = '') => {
      const page = await context.newPage();
      await page.goto(`${site.url}${query}`);
      return page;
    });
  },
});

export const { expect } = test;
