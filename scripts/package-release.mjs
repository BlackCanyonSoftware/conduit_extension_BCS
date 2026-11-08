// Builds the release zip: a clean build (never with the test-only host permissions) packed as
// release/conduit-<version>.zip, with a SHA-256 file beside it.
//
//   node scripts/package-release.mjs            writes into release/
//   node scripts/package-release.mjs --out dir  writes into dir
//
// The zip is the unpacked extension: unzip it, then load the folder in Chrome or Edge from
// chrome://extensions / edge://extensions with developer mode on. The zip is written by hand
// below (stored paths sorted, fixed timestamps), so the same build gives the same bytes and no
// packaging dependency is needed.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// 1980-01-01 00:00:00, the earliest time a zip can hold.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** A zip file holding these `{ name, data }` entries, in the order given. */
function createZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + packed.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** Every file under a folder, as `{ name, data }` with forward-slash names, sorted. */
async function readTree(dir, prefix = '') {
  const found = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const name = prefix + entry.name;
    if (entry.isDirectory())
      found.push(...(await readTree(path.join(dir, entry.name), `${name}/`)));
    else found.push({ name, data: await readFile(path.join(dir, entry.name)) });
  }
  return found;
}

const outFlag = process.argv.indexOf('--out');
const outDir = path.resolve(
  outFlag === -1 ? path.join(root, 'release') : (process.argv[outFlag + 1] ?? ''),
);

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const staging = await mkdtemp(path.join(tmpdir(), 'conduit-release-'));
try {
  // A release build never carries the test-only host permissions: no --host-permission here.
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build.mjs'), '--out', staging], {
    stdio: 'pipe',
  });
  const manifest = JSON.parse(await readFile(path.join(staging, 'manifest.json'), 'utf8'));
  if (manifest.version !== pkg.version) {
    throw new Error(`manifest version ${manifest.version} is not package.json's ${pkg.version}`);
  }
  if (manifest.host_permissions !== undefined) {
    throw new Error('the release manifest grants sites; a release must not');
  }
  if ((manifest.optional_host_permissions ?? []).includes('<all_urls>')) {
    throw new Error('the release manifest asks for <all_urls>');
  }

  const files = await readTree(staging);
  await mkdir(outDir, { recursive: true });
  const zipName = `conduit-${pkg.version}.zip`;
  const zip = createZip(files);
  await writeFile(path.join(outDir, zipName), zip);
  const sha = createHash('sha256').update(zip).digest('hex');
  await writeFile(path.join(outDir, `${zipName}.sha256`), `${sha}  ${zipName}\n`);
  console.log(
    `Wrote ${path.join(outDir, zipName)} (${String(files.length)} files, ${String(zip.length)} bytes)`,
  );
  console.log(`SHA-256 ${sha}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
