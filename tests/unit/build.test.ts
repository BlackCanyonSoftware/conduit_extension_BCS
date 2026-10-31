import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Permissions Conduit is planned to use (docs/PRD.md, non-functional requirements).
const ALLOWED_PERMISSIONS = new Set(['activeTab', 'cookies', 'webRequest', 'storage', 'alarms']);

interface Manifest {
  manifest_version: number;
  version: string;
  icons?: Record<string, string>;
  action?: { default_popup?: string; default_icon?: Record<string, string> };
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

  it('requests site access per site at runtime, not in the manifest', () => {
    expect(manifest.host_permissions ?? []).toEqual([]);
    expect(manifest.optional_host_permissions ?? []).not.toContain('<all_urls>');
  });

  it('references only files that exist in the build', () => {
    const referenced = [
      ...Object.values(manifest.icons ?? {}),
      ...Object.values(manifest.action?.default_icon ?? {}),
      manifest.action?.default_popup,
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
