# Handoff

## Current state

- Repo cloned from `BlackCanyonSoftware/conduit_extension_BCS` (MIT licence present).
- Plan approved by the owner (2026-10-30): PRD, ROADMAP, ARCHITECTURE, DESIGN, INTEGRATION-CONTRACT, ADRs 0001 to 0003.
- **Milestone 0 is partly done.** Tooling is in place: TypeScript (strict), esbuild build script, Vitest, ESLint, Prettier, pre-commit hook (`.githooks/`), CI workflow, README, AGENTS.md, CLAUDE.md, CONTRIBUTING.md, CHANGELOG.md.
- The build currently produces only `dist/manifest.json` (no entry points yet). One unit-test file checks the built manifest (MV3, version from `package.json`, planned permissions only, no site access in the manifest).

## Decisions so far

- Tier: MVP. Stack: TypeScript strict, esbuild, vanilla DOM, Vitest, Playwright (ADR 0001).
- Browsers: Chrome and Edge first, Firefox in milestone 6. Distribution: unpacked from GitHub releases first (ADR 0003).
- Version lives in `package.json` only; the build writes it into the manifest.
- Permissions are added to the manifest when the feature that needs them lands.

## Waiting on

- **Brand assets.** `brands/conduit/brand.toml` exists in the Brand Logos kit but `dist/conduit` was not built when last checked. The owner is building it and will say when it is ready. Do not build it without asking. Then run `brandkit bundle conduit <repo>/src/theme` and the readme set into `docs/brand`.

## Not yet done in milestone 0 (needs the brand)

- Popup page in the Conduit theme with the sun/moon toggle and an info (i) button.
- Extension icons.
- Playwright (`@playwright/test`), `npm run test:e2e` and one end-to-end test that loads the extension.
- `npm run dev` (watch build) once there are entry points.
- Fill in `docs/DESIGN.md` from the generated BRAND.md.

## Gotchas

- Node 26 is installed locally; CI and `.nvmrc` use 22.
- A hook in the owner's Claude setup requires `timeout N` on commands with long tool timeouts.
- CI has not run: not verified until pushed.

## Open questions

See PRD section 10.

## Session log

- 2026-10-30: repo cloned, plan written and approved, milestone 0 tooling added and verified locally (format, lint, typecheck, 4 unit tests, build). Committed locally, not pushed.
