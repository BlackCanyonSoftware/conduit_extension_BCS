import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Playwright's Firefox cannot open an extension's own pages (the popup and the rules page). The
// Firefox that is installed on the computer can: it speaks Marionette, the protocol geckodriver
// uses. This is a small client for it (no dependency): it starts the installed Firefox with a
// fresh profile, installs the extension temporarily, and gives a few calls for finding, clicking
// and typing, enough to drive Conduit's own pages.

const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';

/** Where Firefox is, on each system, unless FIREFOX_BIN says otherwise. */
export function findFirefox(): string {
  const fromEnv = process.env.FIREFOX_BIN;
  if (fromEnv) return fromEnv;
  if (process.platform === 'win32') return 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
  if (process.platform === 'darwin') return '/Applications/Firefox.app/Contents/MacOS/firefox';
  return 'firefox';
}

interface Reply {
  error: { error: string; message: string } | null;
  result: unknown;
}

/** One element on the page, as Marionette names it. */
export interface Element {
  readonly id: string;
}

export class Marionette {
  private readonly pending = new Map<number, (reply: Reply) => void>();
  private buffer = Buffer.alloc(0);
  private next = 1;

  private constructor(private readonly socket: net.Socket) {
    socket.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      for (;;) {
        const colon = this.buffer.indexOf(':');
        if (colon === -1) return;
        const length = Number(this.buffer.subarray(0, colon).toString());
        if (this.buffer.length < colon + 1 + length) return;
        const packet = JSON.parse(
          this.buffer.subarray(colon + 1, colon + 1 + length).toString('utf8'),
        ) as unknown;
        this.buffer = this.buffer.subarray(colon + 1 + length);
        // A reply is [1, id, error, result]; the greeting is an object and is ignored here.
        if (Array.isArray(packet) && packet[0] === 1) {
          const [, id, error, result] = packet as [number, number, Reply['error'], unknown];
          this.pending.get(id)?.({ error, result });
          this.pending.delete(id);
        }
      }
    });
  }

  static async connect(port: number): Promise<Marionette> {
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const attempt = net.connect(port, '127.0.0.1');
      attempt.once('connect', () => {
        resolve(attempt);
      });
      attempt.once('error', reject);
    });
    const client = new Marionette(socket);
    await client.command('WebDriver:NewSession', { capabilities: {} });
    return client;
  }

  command(name: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.next;
    this.next += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Firefox did not answer ${name}`));
      }, 30_000);
      this.pending.set(id, (reply) => {
        clearTimeout(timer);
        if (reply.error) reject(new Error(`${name}: ${reply.error.message}`));
        else resolve(reply.result);
      });
      const text = JSON.stringify([0, id, name, params]);
      this.socket.write(`${String(Buffer.byteLength(text))}:${text}`);
    });
  }

  close(): void {
    this.socket.end();
  }

  installTemporaryAddon(folder: string): Promise<unknown> {
    return this.command('Addon:Install', { path: path.resolve(folder), temporary: true });
  }

  async navigate(url: string): Promise<void> {
    await this.command('WebDriver:Navigate', { url });
  }

  /** Runs `script` in the page with `args`, and returns what it returns. */
  async execute<T = unknown>(script: string, args: unknown[] = []): Promise<T> {
    const result = (await this.command('WebDriver:ExecuteScript', { script, args })) as {
      value: T;
    };
    return result.value;
  }

  /**
   * Opens one of the extension's own pages in a new tab and switches to it. Marionette refuses to
   * navigate to an extension address, so the tab is opened from the browser's own side, with the
   * same privileges as a link in Firefox's add-ons page.
   */
  async openExtensionPage(addonId: string, pathname: string): Promise<string> {
    const before = (await this.command('WebDriver:GetWindowHandles')) as string[];
    await this.command('Marionette:SetContext', { value: 'chrome' });
    try {
      await this.execute(
        `const [id, pathname] = arguments;
         const uuids = JSON.parse(Services.prefs.getStringPref('extensions.webextensions.uuids'));
         const win = Services.wm.getMostRecentWindow('navigator:browser');
         const tab = win.gBrowser.addTrustedTab('moz-extension://' + uuids[id] + '/' + pathname);
         win.gBrowser.selectedTab = tab;`,
        [addonId, pathname],
      );
    } finally {
      await this.command('Marionette:SetContext', { value: 'content' });
    }
    // The new tab shows up in the list of windows a moment later.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const handles = (await this.command('WebDriver:GetWindowHandles')) as string[];
      const added = handles.find((handle) => !before.includes(handle));
      if (added !== undefined) {
        await this.switchTo(added);
        return added;
      }
      await new Promise((wait) => setTimeout(wait, 250));
    }
    throw new Error('the extension page did not open');
  }

  async newTab(url: string): Promise<string> {
    const result = (await this.command('WebDriver:NewWindow', { type: 'tab' })) as {
      handle: string;
    };
    await this.command('WebDriver:SwitchToWindow', { handle: result.handle });
    await this.navigate(url);
    return result.handle;
  }

  switchTo(handle: string): Promise<unknown> {
    return this.command('WebDriver:SwitchToWindow', { handle });
  }

  async url(): Promise<string> {
    const result = (await this.command('WebDriver:GetCurrentURL')) as { value: string };
    return result.value;
  }

  /** The first element matching the XPath, or undefined. */
  async find(xpath: string): Promise<Element | undefined> {
    try {
      const result = (await this.command('WebDriver:FindElement', {
        using: 'xpath',
        value: xpath,
      })) as { value: Record<string, string> };
      const id = result.value[ELEMENT_KEY];
      return id === undefined ? undefined : { id };
    } catch (error) {
      if (String(error).includes('Unable to locate element')) return undefined;
      throw error;
    }
  }

  async click(element: Element): Promise<void> {
    await this.command('WebDriver:ElementClick', { id: element.id });
  }

  async type(element: Element, text: string): Promise<void> {
    await this.command('WebDriver:ElementClear', { id: element.id });
    await this.command('WebDriver:ElementSendKeys', { id: element.id, text });
  }

  async text(element: Element): Promise<string> {
    const result = (await this.command('WebDriver:GetElementText', { id: element.id })) as {
      value: string;
    };
    return result.value;
  }

  /** The visible text of the whole page. */
  pageText(): Promise<string> {
    return this.execute<string>('return document.body.innerText');
  }
}

/** The installed Firefox, started with a fresh profile and Marionette on a free port. */
export interface RunningFirefox {
  marionette: Marionette;
  stop: () => Promise<void>;
}

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

export async function startFirefox(
  extraPrefs: Record<string, string | number | boolean> = {},
): Promise<RunningFirefox> {
  const profile = mkdtempSync(path.join(tmpdir(), 'conduit-ff-ui-'));
  mkdirSync(profile, { recursive: true });
  const port = await freePort();
  const prefs: Record<string, string | number | boolean> = {
    'marionette.port': port,
    'browser.shell.checkDefaultBrowser': false,
    'browser.startup.homepage_override.mstone': 'ignore',
    'datareporting.policy.dataSubmissionEnabled': false,
    'toolkit.telemetry.reportingpolicy.firstRun': false,
    'app.update.auto': false,
    'app.update.enabled': false,
    // Skip Firefox's own prompt when an add-on asks for a site: the test cannot click it.
    'extensions.webextOptionalPermissionPrompts': false,
    ...extraPrefs,
  };
  writeFileSync(
    path.join(profile, 'user.js'),
    Object.entries(prefs)
      .map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`)
      .join('\n'),
  );
  const child: ChildProcess = spawn(
    findFirefox(),
    ['-marionette', '-headless', '-no-remote', '-profile', profile, 'about:blank'],
    // Firefox allows a test to use its privileged side (to open an extension page) only when asked.
    { stdio: 'ignore', env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' } },
  );

  let marionette: Marionette | undefined;
  for (let attempt = 0; attempt < 60 && !marionette; attempt += 1) {
    try {
      marionette = await Marionette.connect(port);
    } catch {
      await new Promise((wait) => setTimeout(wait, 500));
    }
  }
  if (!marionette) {
    child.kill();
    throw new Error('Firefox did not start Marionette');
  }
  const connected = marionette;
  return {
    marionette: connected,
    stop: async () => {
      try {
        await connected.command('Marionette:Quit', { flags: ['eForceQuit'] });
      } catch {
        // Firefox closes the connection as it quits.
      }
      connected.close();
      child.kill();
      await new Promise((wait) => setTimeout(wait, 500));
      rmSync(profile, { recursive: true, force: true });
    },
  };
}
