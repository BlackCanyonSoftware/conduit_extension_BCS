import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test';

const EXTENSION_PATH = path.resolve('dist');

interface Fixtures {
  context: BrowserContext;
  extensionId: string;
  popup: Page;
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
});

export const { expect } = test;
