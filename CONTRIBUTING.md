# Contributing

Thanks for helping. Conduit is small on purpose: easy to read, few dependencies.

## Setup

```bash
git clone https://github.com/BlackCanyonSoftware/conduit_extension_BCS
cd conduit_extension_BCS
npm ci
npm run check
```

Node 22 or newer. `npm ci` installs the pre-commit hook in `.githooks/`.

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
They include automated accessibility checks (axe) for every screen. `npm run test:e2e`
builds a test copy that pre-grants site access to `localhost` (a test cannot click the
browser's permission prompt); release builds never do that.

## Definition of Done

Acceptance criteria met; tests added and passing; format, lint, type check and build
clean; UI exercised in a browser; affected docs updated; committed as a focused
Conventional Commit.
