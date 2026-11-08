<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)"
            srcset="docs/brand/lockup/banner/lockup-horizontal-dark-banner.png">
    <img alt="Conduit" width="480"
         src="docs/brand/lockup/banner/lockup-horizontal-light-banner.png">
  </picture>
</p>

# Conduit

A free, open-source browser extension for the data your own browser already holds.
Export your cookies in the format a tool wants, or set up a rule that hands exactly
the values you choose to a local application you trust. Everything stays on your
machine: no server, no account, no telemetry.

> **Status:** early development (milestone 6). Cookie export, rules for cookies, headers and page storage with approval, a
> kill switch, a capture log and delivery to local apps work in a development build; there is no release yet. Follow the [roadmap](docs/ROADMAP.md).

## What it will do

- **Export cookies** as Netscape `cookies.txt`, JSON or a `Cookie:` header, per site and per cookie.
- **Capture named headers and page storage keys** the browser sends, receives or holds, with the same rules and approval as cookies, and keep only the part of a value you need (a pattern or a JSON field).
- **Bridge to local apps** through a small, documented HTTP contract any program can implement in a few lines: see [INTEGRATION-CONTRACT.md](docs/INTEGRATION-CONTRACT.md). The app says what it would like and why; you approve what you choose.
- **Stay readable:** every rule is one sentence (what, from where, to whom), previews are redacted until you reveal them, and a delivery log shows what was sent.

## Try it with the example app

`examples/reference_sink.py` is a complete app in about 100 lines of standard-library Python.

```bash
python examples/reference_sink.py --site example.com --names sid
```

In Conduit's rules page, under **Local apps**, choose **Look on this computer**, read what the app
asks for and why, and approve it. When that cookie changes, the app receives it, and Conduit's
delivery log shows the result.

## Install

Conduit ships as a zip you load unpacked in Chrome or Edge. There is nothing to sign in to and
nothing is sent anywhere.

1. Download `conduit-<version>.zip` from the [latest release](https://github.com/BlackCanyonSoftware/conduit_extension_BCS/releases/latest). The `.sha256` file beside it lets you check the download: the SHA-256 of the zip should match it.
2. Unzip it into a folder you will keep, for example `Documents\Conduit`. The browser reads the extension from that folder every time it starts, so do not delete or move it.
3. Open `chrome://extensions` (Edge: `edge://extensions`) and switch on **Developer mode**.
4. Choose **Load unpacked** and pick the folder that contains `manifest.json`.
5. Click the puzzle-piece icon in the toolbar and pin **Conduit**.

A fresh install does nothing until you create and approve a rule, and it can read no site until you
allow it. To update, download the new zip, unzip it over the old folder, and press the reload
arrow on Conduit's card in `chrome://extensions`.

**Firefox:** the release also has `conduit-<version>-firefox.zip`. Firefox only keeps add-ons that Mozilla has signed, so until that zip is signed, load it temporarily: open `about:debugging`, choose **This Firefox**, then **Load Temporary Add-on**, and pick the zip. It stays until Firefox restarts. Firefox 140 or newer.

To build the zips yourself: `npm ci && node scripts/package-release.mjs` writes `release/conduit-<version>.zip`, and adding `--target firefox` writes the Firefox one.

## Develop

Requires Node 22 or newer (`.nvmrc`).

```bash
npm ci
npm run check
```

| Script                 | What it does                                                |
| ---------------------- | ----------------------------------------------------------- |
| `npm run build`        | Builds the unpacked extension into `dist/`                  |
| `npm run dev`          | Rebuilds `dist/` whenever `src/` changes                    |
| `npm test`             | Unit tests (Vitest)                                         |
| `npm run test:e2e`     | Builds, then runs the Playwright tests in headless Chromium |
| `npm run lint`         | ESLint (strict, type-aware)                                 |
| `npm run typecheck`    | TypeScript `--noEmit`                                       |
| `npm run format`       | Prettier, write                                             |
| `npm run format:check` | Prettier, check                                             |
| `npm run check`        | Format check, lint, type check, tests and build             |

The end-to-end tests need Playwright's browsers once: `npx playwright install chromium firefox`.

`npm ci` also points git at `.githooks/`, whose pre-commit hook checks formatting and lint on staged files.

## Project layout

```
src/        extension source (manifest.json, core logic, UI)
scripts/    build and tooling scripts
tests/      unit tests (unit/) and Playwright end-to-end tests (e2e/)
docs/       PRD, roadmap, architecture, design, ADRs, handoff
```

## Documentation

[PRD](docs/PRD.md) · [Roadmap](docs/ROADMAP.md) · [Architecture](docs/ARCHITECTURE.md) · [Design](docs/DESIGN.md) · [Integration contract](docs/INTEGRATION-CONTRACT.md) · [Contributing](CONTRIBUTING.md)

## Licence

MIT, with no warranty. See [LICENSE](LICENSE).

`src/core/cookies/public-suffix-data.ts` is data from the [Public Suffix List](https://publicsuffix.org), which is under the [Mozilla Public License 2.0](https://mozilla.org/MPL/2.0/); that file keeps its notice. The brand assets in `src/theme/` and `docs/brand/` come from the Black Canyon Software brand kit, and the fonts in `src/theme/font/` carry their own licence files.
