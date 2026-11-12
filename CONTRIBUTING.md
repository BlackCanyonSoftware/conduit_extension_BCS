# Contributing

Thanks for helping. Conduit is small on purpose: easy to read, few dependencies.

## Setup

```bash
git clone https://github.com/BlackCanyonSoftware/conduit_extension_BCS
cd conduit_extension_BCS
npm ci
npm run check
```

Node 22 or newer. Run `npm run check`, `npm run test:e2e`, `npm run test:e2e:firefox` and `npm run test:e2e:firefox-ui` (needs Firefox installed) before sending a change; the GitHub Actions workflow runs the same (install the browsers once with `npx playwright install chromium firefox`). `npm ci` installs the pre-commit hook in `.githooks/`.

## Workflow

1. Pick an item from [docs/ROADMAP.md](docs/ROADMAP.md) or open an issue first for anything larger.
2. Build the smallest version that works end to end, with tests.
3. Run `npm run check` before you commit.
4. Open a pull request describing what changed and why.

## Commits and branches

Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`) with a
message that explains why. Keep commits focused; do not mix formatting or refactoring
with behaviour changes.

## Code conventions

- TypeScript `strict`; no suppressions without a comment saying why.
- Pure logic in `src/core/`; browser APIs only in `src/platform/`.
- Validate untrusted input once, at the boundary.
- New dependencies need a reason (maintenance, size, licence); prefer the platform.
- UI: use the brand theme tokens, keep every screen keyboard-operable, design every state.

## Testing

Unit tests live in `tests/unit/` and describe behaviour through public interfaces.
Reference PRD story IDs (`US-001`) in test names where they apply. End-to-end tests
use Playwright with the built extension loaded in headless Chromium
(`tests/e2e/`); run `npx playwright install chromium` once, then `npm run test:e2e`.
They include automated accessibility checks (axe) for every screen. One test runs
`examples/reference_sink.py`, so it needs Python 3 on the path (`python` on Windows,
`python3` elsewhere) and skips itself without it. `npm run test:e2e`
builds a test copy that pre-grants site access to `localhost` (a test cannot click the
browser's permission prompt); release builds never do that.

## Definition of Done

Acceptance criteria met; tests added and passing; format, lint, type check and build
clean; UI exercised in a browser; affected docs updated; committed as a focused
Conventional Commit.

## Releasing

1. Move the changelog's _Unreleased_ entries under a new `## [X.Y.Z] - date` heading and set the same version in `package.json` (`npm version X.Y.Z --no-git-tag-version`).
2. Run `npm run check`, `npm run test:e2e` and `node scripts/package-release.mjs`; load the zip's folder unpacked and look at it.
3. Commit, then tag and push the tag: `git tag vX.Y.Z && git push origin main vX.Y.Z`. The Release workflow builds the zip and publishes it.
