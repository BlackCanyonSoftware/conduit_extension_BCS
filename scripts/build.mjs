// Builds the unpacked extension into dist/ (or --out <dir>); --target firefox builds the
// Firefox version (into dist-firefox/ unless --out is given).
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
const ENTRY_POINTS = {
  'popup/popup': 'src/popup/popup.ts',
  'options/options': 'src/options/options.ts',
  'background/service-worker': 'src/background/service-worker.ts',
};

// Files copied as they are: source path -> path inside the extension.
const STATIC_FILES = {
  'src/ui/shared.css': 'ui/shared.css',
  'src/popup/popup.html': 'popup/popup.html',
  'src/popup/popup.css': 'popup/popup.css',
  'src/options/options.html': 'options/options.html',
  'src/options/options.css': 'options/options.css',
};

// The parts of the brand bundle (src/theme) the extension pages use. The page
// partials (*.html) are templates for other projects and are left out.
const THEME_DIRS = ['font', 'icon', 'mark', 'template', 'theme', 'ui', 'wordmark'];

// --test-bridge adds a content script on the local test site that lets an end-to-end test reach
// the extension from a page (tests/support/bridge-content.ts). The Firefox tests use it because
// Playwright's Firefox cannot open an extension's own pages. Releases never pass it.
const withTestBridge = process.argv.includes('--test-bridge');

// --host-permission <pattern> (repeatable) pre-grants site access in the built manifest.
// Only the end-to-end tests use it, because a test cannot click the browser's own
// permission prompt. Release builds never pass it.
const grantedHosts = process.argv.flatMap((arg, index) =>
  arg === '--host-permission' ? [process.argv[index + 1] ?? ''] : [],
);

const targetFlag = process.argv.indexOf('--target');
const target = targetFlag === -1 ? 'chrome' : (process.argv[targetFlag + 1] ?? '');
if (target !== 'chrome' && target !== 'firefox') {
  throw new Error(`--target must be chrome or firefox, not "${target}"`);
}

// Firefox runs the background code as an event page (it has no service workers), wants an
// add-on id, and says what data the add-on collects. Everything else in the manifest is shared.
const FIREFOX_ID = 'conduit@blackcanyonsoftware';
const FIREFOX_MIN_VERSION = '140.0';

function forTarget(manifest) {
  if (target === 'chrome') return manifest;
  const { background, ...shared } = manifest;
  delete shared.minimum_chrome_version;
  return {
    ...shared,
    background: { scripts: [background.service_worker], type: background.type },
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_ID,
        strict_min_version: FIREFOX_MIN_VERSION,
        data_collection_permissions: { required: ['none'] },
      },
    },
  };
}

async function buildExtension(outDir) {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const manifest = forTarget(
    JSON.parse(await readFile(path.join(root, 'src', 'manifest.json'), 'utf8')),
  );
  const hostPermissions = grantedHosts.length > 0 ? { host_permissions: grantedHosts } : {};
  const bridge = withTestBridge
    ? {
        content_scripts: [
          {
            matches: ['http://localhost/*', 'http://127.0.0.1/*'],
            js: ['test/bridge-content.js'],
            run_at: 'document_start',
          },
        ],
      }
    : {};

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify({ ...manifest, ...hostPermissions, ...bridge, version: pkg.version }, null, 2)}\n`,
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
      Object.entries({
        ...ENTRY_POINTS,
        ...(withTestBridge ? { 'test/bridge-content': 'tests/support/bridge-content.ts' } : {}),
      }).map(([out, src]) => [out, path.join(root, src)]),
    ),
    outdir: outDir,
    bundle: true,
    format: 'esm',
    target: target === 'firefox' ? 'firefox140' : 'chrome120',
    sourcemap: false,
    logLevel: 'warning',
  });
}

const outFlag = process.argv.indexOf('--out');
const outDir = path.resolve(
  outFlag === -1
    ? path.join(root, target === 'firefox' ? 'dist-firefox' : 'dist')
    : (process.argv[outFlag + 1] ?? ''),
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
