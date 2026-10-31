import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Permissions Conduit is planned to use (docs/PRD.md, non-functional requirements).
const ALLOWED_PERMISSIONS = new Set(['cookies', 'webRequest', 'storage', 'alarms']);

interface Manifest {
  manifest_version: number;
  version: string;
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
});
