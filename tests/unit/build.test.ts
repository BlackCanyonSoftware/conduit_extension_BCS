import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Permissions Conduit is planned to use (docs/PRD.md, non-functional requirements).
const ALLOWED_PERMISSIONS = new Set([
  'activeTab',
  'cookies',
  'webRequest',
  'storage',
  'alarms',
  'scripting',
]);

interface Manifest {
  manifest_version: number;
  version: string;
  icons?: Record<string, string>;
  action?: { default_popup?: string; default_icon?: Record<string, string> };
  background?: { service_worker?: string };
  options_ui?: { page?: string };
  permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
}

let outDir: string;
let manifest: Manifest;

beforeAll(() => {
  outDir = mkdtempSync(path.join(tmpdir(), 'conduit-build-'));
  execFileSync(process.execPath, ['scripts/build.mjs', '--out', outDir], { stdio: 'pipe' });
  manifest = JSON.parse(readFileSync(path.join(outDir, 'manifest.json'), 'utf8')) as Manifest;
});

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('built manifest', () => {
  it('is Manifest V3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('takes its version from package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(manifest.version).toBe(pkg.version);
  });

  it('asks only for the planned permissions', () => {
    for (const permission of manifest.permissions ?? []) {
      expect(ALLOWED_PERMISSIONS.has(permission)).toBe(true);
    }
  });

  it('has no content scripts and no test-only files', () => {
    expect((manifest as { content_scripts?: unknown }).content_scripts).toBeUndefined();
    expect(existsSync(path.join(outDir, 'test'))).toBe(false);
  });

  it('names no website in the manifest, only apps on this computer; sites are asked for at runtime', () => {
    // Chrome refuses webRequest listeners from an extension with no host permission at all, which
    // shows as an error on a fresh install. Loopback is where local apps live, so it is the one.
    expect(manifest.host_permissions ?? []).toEqual(['http://127.0.0.1/*']);
    expect(manifest.optional_host_permissions ?? []).not.toContain('<all_urls>');
  });

  it('references only files that exist in the build', () => {
    const referenced = [
      ...Object.values(manifest.icons ?? {}),
      ...Object.values(manifest.action?.default_icon ?? {}),
      manifest.action?.default_popup,
      manifest.background?.service_worker,
      manifest.options_ui?.page,
    ].filter((file): file is string => file !== undefined);

    expect(referenced.length).toBeGreaterThan(0);
    for (const file of referenced) {
      expect(existsSync(path.join(outDir, file)), file).toBe(true);
    }
  });
});

describe('popup page (US-015, US-016)', () => {
  it('links only to local files that exist in the build', () => {
    const popupDir = path.join(outDir, 'popup');
    const html = readFileSync(path.join(popupDir, 'popup.html'), 'utf8');
    const links = [...html.matchAll(/(?:href|src)="([^"#]+)/g)].map((match) => match[1] ?? '');

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(existsSync(path.resolve(popupDir, link)), link).toBe(true);
    }
  });

  it('has the theme switch and an info button wired to a panel', () => {
    const html = readFileSync(path.join(outDir, 'popup', 'popup.html'), 'utf8');

    expect(html).toContain('id="bk-theme"');
    expect(html).toMatch(/data-info-toggle[\s\S]*?aria-controls="info-status"/);
    expect(html).toContain('id="info-status"');
  });
});

describe('Firefox build (US-017)', () => {
  interface FirefoxManifest extends Manifest {
    background?: { service_worker?: string; scripts?: string[]; type?: string };
    browser_specific_settings?: {
      gecko?: {
        id?: string;
        strict_min_version?: string;
        data_collection_permissions?: { required?: string[] };
      };
    };
    minimum_chrome_version?: string;
  }
  let firefoxDir: string;
  let firefox: FirefoxManifest;

  beforeAll(() => {
    firefoxDir = mkdtempSync(path.join(tmpdir(), 'conduit-firefox-'));
    execFileSync(
      process.execPath,
      ['scripts/build.mjs', '--target', 'firefox', '--out', firefoxDir],
      {
        stdio: 'pipe',
      },
    );
    firefox = JSON.parse(
      readFileSync(path.join(firefoxDir, 'manifest.json'), 'utf8'),
    ) as FirefoxManifest;
  });

  afterAll(() => {
    rmSync(firefoxDir, { recursive: true, force: true });
  });

  it('runs the background code as an event page, because Firefox has no service workers', () => {
    expect(firefox.background?.service_worker).toBeUndefined();
    expect(firefox.background?.scripts).toEqual(['background/service-worker.js']);
    expect(firefox.background?.type).toBe('module');
    expect(existsSync(path.join(firefoxDir, 'background', 'service-worker.js'))).toBe(true);
  });

  it('names the add-on and says it collects no data', () => {
    expect(firefox.browser_specific_settings?.gecko?.id).toMatch(/^[\w.-]+@[\w.-]+$/);
    expect(firefox.browser_specific_settings?.gecko?.strict_min_version).toBeDefined();
    expect(firefox.browser_specific_settings?.gecko?.data_collection_permissions?.required).toEqual(
      ['none'],
    );
    expect(firefox.minimum_chrome_version).toBeUndefined();
  });

  it('asks for the same permissions and the same access, like the Chrome build', () => {
    expect(firefox.permissions).toEqual(manifest.permissions);
    expect(firefox.optional_host_permissions).toEqual(manifest.optional_host_permissions);
    expect(firefox.host_permissions).toEqual(manifest.host_permissions);
    expect(firefox.version).toBe(manifest.version);
  });

  it('leaves the Chrome build as it was', () => {
    const chromeManifest = manifest as FirefoxManifest;
    expect(chromeManifest.background?.service_worker).toBe('background/service-worker.js');
    expect(chromeManifest.browser_specific_settings).toBeUndefined();
  });
});
