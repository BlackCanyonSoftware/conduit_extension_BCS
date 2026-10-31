# Handoff

## Current state

- Repo cloned from `BlackCanyonSoftware/conduit_extension_BCS` (MIT licence present).
- Planning docs written and committed locally: PRD, ROADMAP, ARCHITECTURE, DESIGN, INTEGRATION-CONTRACT, ADRs 0001 to 0003.
- No code yet. Plan awaiting product-owner approval.

## Decisions so far

- Tier: MVP.
- Stack: TypeScript strict, esbuild, vanilla DOM, Vitest, Playwright (ADR 0001).
- Browsers: Chrome and Edge first, Firefox in milestone 6.
- Distribution: unpacked install from GitHub releases first (ADR 0003).
- Licence: MIT, already in the repo.

## Waiting on

- **Brand assets.** `brands/conduit/brand.toml` exists in the Brand Logos kit but `dist/conduit` was not built. The owner is building it; do not build it without asking. Milestone 0 UI and icons wait for it. Then run `brandkit bundle conduit <repo>/src/theme` (and the readme set into `docs/brand`).
- Plan approval.

## Next steps

1. Owner approves the plan.
2. Owner confirms brand assets are ready.
3. Milestone 0: walking skeleton.

## Open questions

See PRD section 10.

## Session log

- 2026-10-30: repo cloned, planning docs written, committed locally (not pushed).
