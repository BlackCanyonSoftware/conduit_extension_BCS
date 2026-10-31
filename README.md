# Conduit

A free, open-source browser extension for the data your own browser already holds.
Export your cookies in the format a tool wants, or set up a rule that hands exactly
the values you choose to a local application you trust. Everything stays on your
machine: no server, no account, no telemetry.

> **Status:** early development (milestone 0). Nothing is installable yet; follow
> the [roadmap](docs/ROADMAP.md).

## What it will do

- **Export cookies** as Netscape `cookies.txt`, JSON or a `Cookie:` header, per site and per cookie.
- **Bridge to local apps** through a small, documented HTTP contract any program can implement in a few lines: see [INTEGRATION-CONTRACT.md](docs/INTEGRATION-CONTRACT.md).
- **Stay readable:** every rule is one sentence (what, from where, to whom), previews are redacted until you reveal them, and a delivery log shows what was sent.

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
| `npm test`             | Unit tests (Vitest)                                              |
| `npm run lint`         | ESLint (strict, type-aware)                                      |
| `npm run typecheck`    | TypeScript `--noEmit`                                            |
| `npm run format`       | Prettier, write                                                  |
| `npm run format:check` | Prettier, check                                                  |
| `npm run check`        | Format check, lint, type check, tests and build, as CI runs them |

`npm ci` also points git at `.githooks/`, whose pre-commit hook checks formatting and lint on staged files.

## Project layout

```
src/        extension source (manifest.json, core logic, UI)
scripts/    build and tooling scripts
tests/      unit tests
docs/       PRD, roadmap, architecture, design, ADRs, handoff
```

## Documentation

[PRD](docs/PRD.md) · [Roadmap](docs/ROADMAP.md) · [Architecture](docs/ARCHITECTURE.md) · [Design](docs/DESIGN.md) · [Integration contract](docs/INTEGRATION-CONTRACT.md) · [Contributing](CONTRIBUTING.md)

## Licence

MIT, with no warranty. See [LICENSE](LICENSE).
