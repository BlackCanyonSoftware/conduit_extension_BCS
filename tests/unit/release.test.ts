import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface ZipEntry {
  name: string;
  data: Buffer;
  crc: number;
}

/** Reads a zip file the way an unzip tool does: from the central directory at the end. */
function readZip(zip: Buffer): ZipEntry[] {
  const endAt = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt === -1) throw new Error('no end-of-central-directory record');
  const count = zip.readUInt16LE(endAt + 10);
  let at = zip.readUInt32LE(endAt + 16);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('bad central directory entry');
    const method = zip.readUInt16LE(at + 10);
    const crc = zip.readUInt32LE(at + 16);
    const packedSize = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const localAt = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    const dataAt = localAt + 30 + zip.readUInt16LE(localAt + 26) + zip.readUInt16LE(localAt + 28);
    const packed = zip.subarray(dataAt, dataAt + packedSize);
    const data = method === 8 ? inflateRawSync(packed) : Buffer.from(packed);
    expect(data.length, name).toBe(size);
    entries.push({ name, data, crc });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let first: string;
let second: string;
let version: string;

beforeAll(() => {
  version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  first = mkdtempSync(path.join(tmpdir(), 'conduit-release-a-'));
  second = mkdtempSync(path.join(tmpdir(), 'conduit-release-b-'));
  for (const out of [first, second]) {
    execFileSync(process.execPath, ['scripts/package-release.mjs', '--out', out], {
      stdio: 'pipe',
    });
  }
}, 60_000);

afterAll(() => {
  rmSync(first, { recursive: true, force: true });
  rmSync(second, { recursive: true, force: true });
});

describe('the release zip', () => {
  const zipPath = (dir: string): string => path.join(dir, `conduit-${version}.zip`);

  it('is a readable zip with the extension at its top level, and every file intact', () => {
    const entries = readZip(readFileSync(zipPath(first)));
    const names = entries.map((entry) => entry.name);

    expect(names).toContain('manifest.json');
    expect(names).toContain('background/service-worker.js');
    expect(names).toContain('popup/popup.html');
    expect(names).toContain('options/options.html');
    expect(names.some((name) => name.startsWith('theme/font/') && name.endsWith('.woff'))).toBe(
      true,
    );
    expect(names.every((name) => !name.startsWith('/') && !name.includes('\\'))).toBe(true);
    for (const entry of entries) expect(crc32(entry.data), entry.name).toBe(entry.crc);
  });

  it('holds a release manifest: the package version, no granted sites, no <all_urls>', () => {
    const entry = readZip(readFileSync(zipPath(first))).find(
      (item) => item.name === 'manifest.json',
    );
    const manifest = JSON.parse(entry?.data.toString('utf8') ?? '{}') as Record<string, unknown>;

    expect(manifest.version).toBe(version);
    expect(manifest.host_permissions).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
  });

  it('holds only what the extension runs: no source maps, no test or brand-kit templates', () => {
    const names = readZip(readFileSync(zipPath(first))).map((entry) => entry.name);

    expect(names.filter((name) => name.endsWith('.map'))).toEqual([]);
    expect(names.filter((name) => name.endsWith('.ts') || name.startsWith('tests/'))).toEqual([]);
    expect(names.filter((name) => name.endsWith('.html')).sort()).toEqual([
      'options/options.html',
      'popup/popup.html',
    ]);
  });

  it('is the same bytes every time, and has a checksum file that matches', () => {
    const a = readFileSync(zipPath(first));
    const b = readFileSync(zipPath(second));
    const sums = readFileSync(`${zipPath(first)}.sha256`, 'utf8');

    expect(a.equals(b)).toBe(true);
    expect(sums).toBe(`${createHash('sha256').update(a).digest('hex')}  conduit-${version}.zip\n`);
  });
});
