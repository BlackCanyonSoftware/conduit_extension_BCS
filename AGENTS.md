# AGENTS.md

Guide for AI coding assistants. People: see [CONTRIBUTING.md](CONTRIBUTING.md).

Conduit is a free browser extension (Manifest V3) that exports a user's own cookies
and delivers user-approved data to local apps. Rigor tier: **MVP**.

## Session routine

1. Read `docs/HANDOFF.md` first.
2. Work one roadmap slice at a time (`docs/ROADMAP.md`).
3. At the end: update `docs/HANDOFF.md` and the roadmap status, then report.

## Commands

```bash
npm ci                 # install; also sets git hooks
npm run check          # format check, lint, typecheck, tests, build
npm test               # unit tests (Vitest)
npm run test:e2e       # builds, then Playwright in headless Chromium
npm run dev            # rebuild dist/ on change
npm run build          # unpacked extension into dist/
npm run format         # Prettier, write
```

## Map

- `src/manifest.json`: manifest without a version (the build takes it from `package.json`).
- `src/core/`: pure logic, no browser APIs (`cookies/` formats and site scope, `redact.ts`).
- `src/platform/`: the only code that touches `chrome.*` (pages and the worker call it).
- `src/background/` service worker, `src/popup/` and `src/options/` pages, `src/ui/` helpers shared by pages.
- `scripts/build.mjs`: esbuild entry points live in `ENTRY_POINTS`.
- `tests/unit/`: Vitest. Name tests after PRD story IDs (`US-001`).
- `docs/`: PRD, ROADMAP, ARCHITECTURE, DESIGN, INTEGRATION-CONTRACT, `adr/`, HANDOFF.

## Conventions

- TypeScript `strict`; fix warnings rather than suppress them, and comment any suppression.
- Validate untrusted input once at the boundary and pass typed data inward.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), small and focused.
- Match the surrounding code; reuse before creating; justify new dependencies and verify the exact package name and publisher before installing.
- Public-facing text (README, docs, UI, commits) describes Conduit as a local tool for a person's own browser data, in plain, positive terms.

## Product rules (from the PRD)

- Nothing is captured until the user has approved a rule; a fresh install does nothing.
- Every rule reads as one sentence: what, from which origin, to which destination.
- Loopback destinations by default; other hosts need a typed confirmation and stay marked.
- Imported rules arrive disabled and need the same approval as a hand-made one.
- Site access is requested per site at runtime; never `<all_urls>` in the manifest.
- Captures are written to extension storage immediately; retries use `chrome.alarms`.
- No telemetry, no remote config, no remote code, no bundled destinations.
- Previews are redacted (first and last four characters) until revealed.
- UI: light/dark toggle with a sun/moon icon; info (i) buttons hide extra text; theme comes from the Conduit brand bundle in `src/theme/`, never one-off colours.

## Working agreements

- Report only what you ran and observed; mark anything unverified.
- Never weaken, skip or delete a test, or bypass a hook, to get a passing run.
- Label placeholders and list them in `docs/HANDOFF.md`.
- Stay in scope; note other ideas in the roadmap.
- Ask before changing the stack, adding paid services, or changing the security model.
- **Commit locally, never push.** The owner reviews and pushes.
- Do not build or modify files in the separate Brand Logos kit without asking.

## Definition of Done

1. Meets the acceptance criteria.
2. Tests added and the whole suite passes.
3. Format, lint and typecheck clean; build passes.
4. UI changes exercised in a browser (keyboard, light and dark, mobile and desktop widths).
5. Security rules above hold.
6. Affected docs updated (README, ROADMAP, ADR, DESIGN, CHANGELOG).
7. No leftover debug code or untracked TODOs.
8. Committed locally as a Conventional Commit.

## Report format

Summary · Done · Verification (actual results) · Try it · Decisions · Deviations ·
Known issues · Next · Needs you.
