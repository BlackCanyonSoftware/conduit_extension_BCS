import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { startSite } from '../support/servers';

// The other end-to-end tests run a build that is told in advance it may read `localhost`, which
// hides what a fresh install does: it has no site access at all. This one loads the build a
// person installs, with no extra access, and looks at the error list Chrome keeps for it (the
// "Errors" button on its card at chrome://extensions).

/** The part of Chrome's private extensions-page API this test uses (it has no public types). */
interface DeveloperPrivate {
  updateProfileConfiguration: (config: { inDeveloperMode: boolean }) => Promise<void>;
  reload: (id: string, options: { failQuietly: boolean }) => Promise<void>;
  getExtensionInfo: (id: string) => Promise<{
    runtimeErrors: { message: string }[];
    manifestErrors: { message: string }[];
  }>;
}

let extensionDir: string;
let profileDir: string;
let context: BrowserContext;

test.beforeAll(() => {
  extensionDir = mkdtempSync(path.join(tmpdir(), 'conduit-fresh-ext-'));
  profileDir = mkdtempSync(path.join(tmpdir(), 'conduit-fresh-profile-'));
  // A release build: no --host-permission, no test bridge.
  execFileSync(process.execPath, ['scripts/build.mjs', '--out', extensionDir], { stdio: 'pipe' });
});

test.afterAll(() => {
  rmSync(extensionDir, { recursive: true, force: true });
  rmSync(profileDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await context.close();
});

test('a fresh install, browsing a site it has not been allowed to read, has no errors', async () => {
  context = await chromium.launchPersistentContext(profileDir, {
    channel: process.env.CONDUIT_CHANNEL ?? 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });
  const site = await startSite();
  try {
    const manage = await context.newPage();
    await manage.goto('chrome://extensions');
    const id = await manage.evaluate(async () => {
      const all = await chrome.management.getAll();
      return all.find((extension) => extension.name === 'Conduit')?.id;
    });
    if (id === undefined) throw new Error('Conduit was not loaded: run npm run build first');

    // Chrome keeps an extension's errors only while Developer mode is on, which is how an
    // unpacked extension is installed. Turn it on and start Conduit's worker afresh.
    await manage.evaluate(async (extensionId) => {
      const api = (chrome as unknown as { developerPrivate: DeveloperPrivate }).developerPrivate;
      await api.updateProfileConfiguration({ inDeveloperMode: true });
      await api.reload(extensionId, { failQuietly: true });
    }, id);
    await manage.waitForTimeout(1500);

    const page = await context.newPage();
    await page.goto(site.url);
    await page.waitForTimeout(1500);

    const errors = await manage.evaluate(async (extensionId) => {
      const api = (chrome as unknown as { developerPrivate: DeveloperPrivate }).developerPrivate;
      const info = await api.getExtensionInfo(extensionId);
      return {
        runtime: info.runtimeErrors.map((error) => error.message),
        manifest: info.manifestErrors.map((error) => error.message),
      };
    }, id);
    expect(errors).toEqual({ runtime: [], manifest: [] });

    // And the worker is alive: it answers a page's message.
    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/options/options.html`);
    const reply: unknown = await options.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'capture-now', ruleId: 'no-such-rule' }),
    );
    expect(reply).toEqual({ ok: false, reason: 'That rule no longer exists.' });
  } finally {
    await site.close();
  }
});
