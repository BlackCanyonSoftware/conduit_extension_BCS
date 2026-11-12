import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test as base } from '@playwright/test';
import { Marionette, startFirefox, type Element } from '../support/marionette';
import { startSink, startSite, type TestSink } from '../support/servers';

const ADDON_ID = 'conduit@blackcanyonsoftware';

/** What a person does on a Conduit page, in words: click a button, fill a field by its label. */
export class Ui {
  constructor(readonly marionette: Marionette) {}

  /** The element, once it is on the page: pages draw a moment after they open or storage answers. */
  private async need(xpath: string, what: string): Promise<Element> {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const found = await this.marionette.find(xpath);
      if (found) return found;
      if (Date.now() > deadline) throw new Error(`could not find ${what} on the page`);
      await new Promise((wait) => setTimeout(wait, 200));
    }
  }

  /** A button (or link) by its visible text or its accessible label. */
  async click(name: string): Promise<void> {
    const element = await this.need(
      `//button[normalize-space(.)="${name}" or @aria-label="${name}"] | //a[normalize-space(.)="${name}"]`,
      `the button "${name}"`,
    );
    await this.marionette.click(element);
  }

  /** A button whose accessible label starts with `prefix` (labels that end with a time, for example). */
  async clickStartingWith(prefix: string): Promise<void> {
    const element = await this.need(
      `//button[starts-with(@aria-label, "${prefix}")]`,
      `a button labelled "${prefix}..."`,
    );
    await this.marionette.click(element);
  }

  /** The button with this id, however it is labelled (the theme switch changes its label). */
  async clickId(id: string): Promise<void> {
    await this.marionette.click(await this.need(`//*[@id="${id}"]`, `the element #${id}`));
  }

  /** An attribute of the element with this id. */
  attributeOf(id: string, name: string): Promise<string | null> {
    return this.marionette.execute<string | null>(
      'return document.getElementById(arguments[0])?.getAttribute(arguments[1]) ?? null',
      [id, name],
    );
  }

  /** Types into the field whose label reads `label`. */
  async fill(label: string, value: string): Promise<void> {
    const field = await this.need(
      `//*[(self::input or self::textarea) and @id=//label[normalize-space(.)="${label}"]/@for]`,
      `the field "${label}"`,
    );
    await this.marionette.type(field, value);
  }

  /** Picks the option with this text in the drop-down with this label. */
  async choose(label: string, option: string): Promise<void> {
    await this.marionette.execute(
      `const [label, option] = arguments;
       const forId = [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === label)?.htmlFor;
       const select = document.getElementById(forId);
       const wanted = [...select.options].find((o) => o.textContent.trim() === option);
       if (!wanted) throw new Error('no option ' + option);
       select.value = wanted.value;
       select.dispatchEvent(new Event('change', { bubbles: true }));`,
      [label, option],
    );
  }

  /** Ticks the box whose label contains `text`. */
  async tick(text: string): Promise<void> {
    const box = await this.need(
      `//label[contains(normalize-space(.), "${text}")]//input[@type="checkbox"]`,
      `the tick-box "${text}"`,
    );
    await this.marionette.click(box);
  }

  pageText(): Promise<string> {
    return this.marionette.pageText();
  }

  /** The text of the page contains `text` (after a moment, because pages draw as storage answers). */
  async seen(text: string, timeout = 10_000): Promise<void> {
    await expect
      .poll(() => this.pageText(), { timeout, message: `waiting to see: ${text}` })
      .toContain(text);
  }

  async notSeen(text: string): Promise<void> {
    expect(await this.pageText()).not.toContain(text);
  }

  /** Opens one of Conduit's pages ("options/options.html" or "popup/popup.html") in a new tab. */
  open(pathname: string): Promise<string> {
    return this.marionette.openExtensionPage(ADDON_ID, pathname);
  }

  /** Opens an ordinary web page in a new tab. */
  visit(url: string): Promise<string> {
    return this.marionette.newTab(url);
  }

  switchTo(tab: string): Promise<unknown> {
    return this.marionette.switchTo(tab);
  }

  /** The value an attribute of the page's `<html>` element has. */
  htmlAttribute(name: string): Promise<string | null> {
    return this.marionette.execute<string | null>(
      'return document.documentElement.getAttribute(arguments[0])',
      [name],
    );
  }
}

interface Fixtures {
  ui: Ui;
  site: { url: string };
  testSink: TestSink;
}

interface WorkerFixtures {
  extensionDir: string;
}

/**
 * Runs each test in the Firefox installed on this computer, with a fresh profile and the Firefox
 * build of Conduit installed (the same build a person gets, with no extra site access).
 * Firefox's own prompt for site access is switched off, because a test cannot click it.
 */
export const test = base.extend<Fixtures, WorkerFixtures>({
  extensionDir: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const dir = mkdtempSync(path.join(tmpdir(), 'conduit-firefox-build-'));
      execFileSync(process.execPath, ['scripts/build.mjs', '--target', 'firefox', '--out', dir], {
        stdio: 'pipe',
      });
      await use(dir);
      rmSync(dir, { recursive: true, force: true });
    },
    { scope: 'worker' },
  ],

  ui: async ({ extensionDir }, use) => {
    const firefox = await startFirefox();
    await firefox.marionette.installTemporaryAddon(extensionDir);
    await use(new Ui(firefox.marionette));
    await firefox.stop();
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
});

export { expect };
