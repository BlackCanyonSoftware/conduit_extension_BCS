// Builds the unpacked extension into dist/ (or --out <dir>).
// Bundles each entry point with esbuild and writes manifest.json with the version
// taken from package.json, which is the single source of truth for it.
import { build } from 'esbuild';
import { watch } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Output path (without extension) -> source file. Entries are added with the
// screens and workers that need them; see docs/ROADMAP.md.
const ENTRY_POINTS = { 'popup/popup': 'src/popup/popup.ts' };

// Files copied as they are: source path -> path inside the extension.
const STATIC_FILES = {
  'src/popup/popup.html': 'popup/popup.html',
  'src/popup/popup.css': 'popup/popup.css',
};

// The parts of the brand bundle (src/theme) the extension pages use. The page
// partials (*.html) are templates for other projects and are left out.
const THEME_DIRS = ['font', 'icon', 'mark', 'template', 'theme', 'ui', 'wordmark'];

async function buildExtension(outDir) {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(root, 'src', 'manifest.json'), 'utf8'));

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify({ ...manifest, version: pkg.version }, null, 2)}\n`,
  );

  for (const [from, to] of Object.entries(STATIC_FILES)) {
    await mkdir(path.dirname(path.join(outDir, to)), { recursive: true });
    await cp(path.join(root, from), path.join(outDir, to));
  }
  for (const dir of THEME_DIRS) {
    await cp(path.join(root, 'src', 'theme', dir), path.join(outDir, 'theme', dir), {
      recursive: true,
      filter: (source) => !source.endsWith('.html'),
    });
  }

  await build({
    entryPoints: Object.fromEntries(
      Object.entries(ENTRY_POINTS).map(([out, src]) => [out, path.join(root, src)]),
    ),
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

// --watch: rebuild whenever something under src/ changes. Reload the extension in
// chrome://extensions afterwards to pick the change up.
if (process.argv.includes('--watch')) {
  let timer;
  watch(path.join(root, 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      buildExtension(outDir).then(
        () => console.log(`Rebuilt ${new Date().toLocaleTimeString()}`),
        (error) => console.error(error),
      );
    }, 150);
  });
  console.log('Watching src/ for changes. Press Ctrl+C to stop.');
}
