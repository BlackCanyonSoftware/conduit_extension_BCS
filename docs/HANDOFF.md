# Handoff

## Current state

- Repo cloned from `BlackCanyonSoftware/conduit_extension_BCS` (MIT licence present).
- Plan approved by the owner (2026-10-30): PRD, ROADMAP, ARCHITECTURE, DESIGN, INTEGRATION-CONTRACT, ADRs 0001 to 0003.
- **Milestone 0 (walking skeleton) is complete.** Tooling, CI workflow, docs, brand bundle, popup, unit tests, Playwright end-to-end tests, and `npm run dev`.
- Brand: `src/theme/` (app set) and `docs/brand/` (README banner set) generated with `brandkit bundle conduit`; `brandkit check` reports both as matching, including on a fresh clone. They are stored byte-for-byte (`-text` in `.gitattributes`) and excluded from Prettier and ESLint. Never edit them by hand.
- Popup (`src/popup/`): brand header, sun/moon theme toggle, info (i) button revealing a short explanation, status text. **The status text ("Conduit is set up", "No rules yet...") is skeleton content, not a feature**; milestones 1 and 2 replace it with real screens.
- Tests: 9 unit tests (built manifest, popup links, theme button state) and 6 end-to-end tests (extension loads in real Chromium, no console errors, theme toggle and persistence, theme button state on a dark first load, info button by keyboard, axe WCAG 2.x A/AA scan in light and dark with the info panel open).

## Verification so far

- `npm run check` (format, lint, typecheck, unit tests, build) passes locally.
- `npm run test:e2e`: 6 of 6 pass locally in headless Chromium 1248. A deliberate regression (removing the theme-button sync) made the matching test fail, so the test does guard it.
- The built popup was also viewed in the in-app browser (dark and light).
- **Not verified:** CI (not pushed; it now also installs Chromium and runs the e2e tests); Edge; a visible, headed run of the extension toolbar icon.

## Decisions so far

- Tier: MVP. Stack: TypeScript strict, esbuild, vanilla DOM, Vitest, Playwright (ADR 0001).
- Browsers: Chrome and Edge first, Firefox in milestone 6. Distribution: unpacked from GitHub releases first (ADR 0003).
- Version lives in `package.json` only; the build writes it into the manifest.
- Permissions are added to the manifest when the feature that needs them lands.
- E2E uses Playwright's bundled Chromium (`channel: 'chromium'`, headless), because branded Chrome and Edge ignore `--load-extension`.
- Axe accessibility scanning (`@axe-core/playwright`, published by Deque) is part of every screen's e2e tests.

## Next steps

1. Milestone 1: cookie export (US-001 to US-003). Add the `cookies` permission and per-site host access request when the first feature needs them; add a `src/platform/` wrapper and `src/core/cookies/` formats with golden-file tests.
2. Owner pushes the commits; check CI, then record the result here.

## Gotchas

- **Packaged-app quirk on the owner's machine:** the Claude desktop app runs as a packaged Windows app, so `npx playwright install` puts browsers in a virtualized folder (`...\AppData\Local\Packages\Claude_...\LocalCache\Local\ms-playwright`) that Node cannot spawn from (`spawn UNKNOWN`). Workaround used here: a copy of `chromium-1248` in `.browsers/` (gitignored) and `PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers"` on the command line. This is not needed in CI or on a normal machine. If the Playwright version changes, copy the new `chromium-NNNN` folder across.
- The same install also pruned older browser folders from that virtualized cache; they live in the app's private storage and are re-downloaded on demand.
- Node 26 is installed locally; CI and `.nvmrc` use 22.
- `brandkit` is not pip-installed; run it from `C:\Users\Kpier\Documents\Brand Logos` with `PYTHONPATH=src python -m brandkit ...`.
- A hook in the owner's Claude setup requires `timeout N` on commands with long tool timeouts.
- CI has not run: not verified until pushed.

## Open questions

See PRD section 10.

## Session log

- 2026-10-30 (part 3): downloaded Playwright Chromium with the owner's approval; added the e2e suite with axe checks, `test:e2e`, the CI step and `npm run dev`; milestone 0 complete.
- 2026-10-30 (part 2): brand built by the owner; bundled it; built the popup with theme toggle and info button; fixed the theme button's initial label; added build tests.
- 2026-10-30: repo cloned, plan written and approved, milestone 0 tooling added and verified locally. Committed locally, not pushed.
