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

> **Status:** early development (milestone 5). Cookie export, rules for cookies, headers and page storage with approval, a
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

Releases will ship as a zip you load unpacked in Chrome or Edge. Instructions arrive
with the first release (see [ADR 0003](docs/adr/0003-unpacked-first-distribution.md)).

## Develop

Requires Node 22 or newer (`.nvmrc`).

```bash
npm ci
npm run check
```

| Script                 | What it does                                                     |
| ---------------------- | ---------------------------------------------------------------- |
| `npm run build`        | Builds the unpacked extension into `dist/`                       |
| `npm run dev`          | Rebuilds `dist/` whenever `src/` changes                         |
| `npm test`             | Unit tests (Vitest)                                              |
| `npm run test:e2e`     | Builds, then runs the Playwright tests in headless Chromium      |
| `npm run lint`         | ESLint (strict, type-aware)                                      |
| `npm run typecheck`    | TypeScript `--noEmit`                                            |
| `npm run format`       | Prettier, write                                                  |
| `npm run format:check` | Prettier, check                                                  |
| `npm run check`        | Format check, lint, type check, tests and build, as CI runs them |

The end-to-end tests need Playwright's Chromium once: `npx playwright install chromium`.

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
