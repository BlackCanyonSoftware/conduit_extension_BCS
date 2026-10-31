// Builds the unpacked extension into dist/ (or --out <dir>).
// Bundles each entry point with esbuild and writes manifest.json with the version
// taken from package.json, which is the single source of truth for it.
import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Output path (without extension) -> source file. Entries are added with the
// screens and workers that need them; see docs/ROADMAP.md.
const ENTRY_POINTS = {};

async function buildExtension(outDir) {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(root, 'src', 'manifest.json'), 'utf8'));

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify({ ...manifest, version: pkg.version }, null, 2)}\n`,
  );

  const entries = Object.entries(ENTRY_POINTS);
  if (entries.length === 0) return;
  await build({
    entryPoints: Object.fromEntries(entries.map(([out, src]) => [out, path.join(root, src)])),
    outdir: outDir,
    bundle: true,
    format: 'esm',
    target: 'chrome120',
    sourcemap: false,
    logLevel: 'warning',
  });
}

const outFlag = process.argv.indexOf('--out');
const outDir = path.resolve(
  outFlag === -1 ? path.join(root, 'dist') : (process.argv[outFlag + 1] ?? ''),
);
await buildExtension(outDir);
console.log(`Built extension to ${outDir}`);
