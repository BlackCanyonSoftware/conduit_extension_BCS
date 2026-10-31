# Handoff

## Current state

- Repo cloned from `BlackCanyonSoftware/conduit_extension_BCS` (MIT licence present).
- Plan approved by the owner (2026-10-30): PRD, ROADMAP, ARCHITECTURE, DESIGN, INTEGRATION-CONTRACT, ADRs 0001 to 0003.
- **Milestone 0 is almost done.** Tooling, CI workflow, docs, the brand bundle and a first popup are in place. Remaining: the Playwright end-to-end test (see Waiting on) and `npm run dev`.
- Brand: `src/theme/` (app set) and `docs/brand/` (README banner set) were generated with `brandkit bundle conduit` and verified with `brandkit check` (both "match"). The README uses the banner pair.
- Popup (`src/popup/`): brand header, sun/moon theme toggle, info (i) button revealing a short explanation, status text. **The status text ("Conduit is set up", "No rules yet...") is skeleton content, not a feature**; it is replaced by real screens in milestones 1 and 2.
- The build copies the popup, the used parts of the brand bundle, and icons into `dist/`, and writes the manifest (version from `package.json`).
- Tests: 9 unit tests (built manifest checks, popup links resolve, theme button state).

## Verification so far

- `npm run check` (format, lint, typecheck, tests, build): all pass locally.
- The built popup was viewed over a local static server in the in-app browser: renders in dark and light, info button and theme toggle work, no console errors, theme button label correct on load.
- **Not verified:** loading the real unpacked extension in Chrome or Edge (toolbar icon, popup inside the browser); CI (not pushed).

## Decisions so far

- Tier: MVP. Stack: TypeScript strict, esbuild, vanilla DOM, Vitest, Playwright (ADR 0001).
- Browsers: Chrome and Edge first, Firefox in milestone 6. Distribution: unpacked from GitHub releases first (ADR 0003).
- Version lives in `package.json` only; the build writes it into the manifest.
- Permissions are added to the manifest when the feature that needs them lands.
- Brand files are generated: never edit `src/theme/` or `docs/brand/`; excluded from Prettier and ESLint.

## Waiting on

- **Playwright browser download.** The e2e test needs Playwright's bundled Chromium (about 150 MB from Playwright's CDN), because current branded Chrome and Edge no longer allow loading an unpacked extension from the command line. The owner is asked before it is downloaded. Then: add `@playwright/test`, `npm run test:e2e`, and a test that loads `dist/`, opens the popup, toggles the theme and the info panel, and runs an automated accessibility check.

## Next steps

1. Owner decides on the Playwright download; finish milestone 0 (e2e test, `npm run dev`), update the roadmap.
2. Milestone 1: cookie export.

## Gotchas

- Node 26 is installed locally; CI and `.nvmrc` use 22.
- `brandkit` is not pip-installed; run it from `C:\Users\Kpier\Documents\Brand Logos` with `PYTHONPATH=src python -m brandkit ...`.
- A hook in the owner's Claude setup requires `timeout N` on commands with long tool timeouts.
- CI has not run: not verified until pushed.

## Open questions

See PRD section 10.

## Session log

- 2026-10-30 (second session part): brand built by the owner; bundled it; built the popup with theme toggle and info button; fixed the theme button's initial label; added build tests.
- 2026-10-30: repo cloned, plan written and approved, milestone 0 tooling added and verified locally (format, lint, typecheck, unit tests, build). Committed locally, not pushed.
