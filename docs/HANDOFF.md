# Handoff

## Current state

- Repo cloned from `BlackCanyonSoftware/conduit_extension_BCS` (MIT licence present).
- Plan approved by the owner (2026-10-30): PRD, ROADMAP, ARCHITECTURE, DESIGN, INTEGRATION-CONTRACT, ADRs 0001 to 0004.
- **Milestones 0 and 1 are done.** Milestone 1 (cookie export, US-001 to US-003) works end to end in headless Chromium against real cookies.
- Brand: `src/theme/` and `docs/brand/` are generated with `brandkit bundle conduit` (never edit by hand; `brandkit check` reports drift, including on a fresh clone).
- Popup (`src/popup/`): cookies for the active site; states for loading, not a website, needs access (permission), no cookies, error, and ready. Ready view has select all and per-cookie selection, redacted values with Show/Hide, a format control (cookies.txt, JSON, Cookie header), Copy, Download.
- Core logic (`src/core/`): cookie formats with golden files (`tests/fixtures/`), site scope from a page address, redaction, ordering. Browser calls are in `src/platform/cookies.ts`.
- Manifest permissions: `activeTab`, `cookies`; `optional_host_permissions: ["*://*/*"]`; no `host_permissions` in release builds (ADR 0004).
- Tests: 40 unit tests and 17 end-to-end tests (extension in real Chromium: listing incl. HttpOnly, redaction, selection, copy, Netscape and JSON downloads, empty/permission/not-a-website states, axe WCAG 2.x A/AA scans in light and dark in every state).

## Verification so far

- `npm run check` (format, lint, typecheck, unit tests, build) passes. `npm run test:e2e`: 17 of 17 pass.
- Screenshots of the ready and permission states were viewed in light and dark (popup width 380px).
- **Not verified:**
  - The browser's own permission prompt (`chrome.permissions.request`). Tests pre-grant `localhost` through a test-only build flag because a test cannot click the prompt. Need a person to try it in a visible Chrome: click Conduit on a real site, "Allow access", confirm the prompt. In particular check the popup stays open while the prompt shows; if it closes, the flow needs to move to a full-tab page.
  - The real clipboard (tests record the text passed to `clipboard.writeText`; Playwright cannot grant clipboard access to an extension page).
  - The `cookies.txt` output with the real tools it targets (curl, wget, yt-dlp); the format follows their documented conventions and golden files, but no tool was run against it.
  - CI (not pushed); Edge.

## Decisions so far

- Tier: MVP. Stack: TypeScript strict, esbuild, vanilla DOM, Vitest, Playwright (ADR 0001). Chrome and Edge first, Firefox in milestone 6; unpacked distribution first (ADR 0003).
- Per-site access via optional host permissions, site = main domain and subdomains (ADR 0004).
- JSON export follows the EditThisCookie shape (no `expirationDate` for session cookies); Netscape marks HttpOnly with `#HttpOnly_`; values with tabs or line breaks are refused rather than written wrongly.
- Redaction: first and last four characters for values of 12 or more characters; shorter values are fully masked.
- `npm run test:e2e` builds with `--host-permission "*://localhost/*"`; plain `npm run build` never does.

## Next steps

1. A person tries the permission flow in a visible Chrome (see Not verified) and reports back.
2. Milestone 2: rules and approval (US-004 to US-007): rule model, one-sentence summaries, approval UI, kill switch, local capture log, rule import/export (arrives disabled). Needs the `storage` permission and an options page; the service worker arrives here.
3. Owner pushes the commits; check CI.

## Tech debt and brand-kit findings

See "Tech debt" in `docs/ROADMAP.md`. Notable: three brand-kit component pairings measure just under WCAG AA (`.seg` inactive labels, badge text on `hover`, hovered ghost button) and are overridden in `src/popup/popup.css`; worth fixing in the brand kit so every product benefits. Site detection should move to the Public Suffix List before release.

## Gotchas

- **Packaged-app quirk on the owner's machine:** the Claude desktop app runs as a packaged Windows app, so `npx playwright install` puts browsers in a virtualized folder Node cannot spawn from (`spawn UNKNOWN`). Workaround: a copy of `chromium-1248` in `.browsers/` (gitignored) and `export PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers"` before `npm run test:e2e`. Not needed in CI or on a normal machine. Copy the new `chromium-NNNN` folder if the Playwright version changes.
- Node 26 is installed locally; CI and `.nvmrc` use 22.
- `brandkit` is not pip-installed; run it from `C:\Users\Kpier\Documents\Brand Logos` with `PYTHONPATH=src python -m brandkit ...`.
- A hook in the owner's Claude setup requires `timeout N` as the first word of long-running commands, and rejects an env assignment before `timeout` (use `export` first).
- Cookie values are shown only through `textContent`; keep it that way (never `innerHTML`).
- CI has not run: not verified until pushed.

## Open questions

See PRD section 10.

## Session log

- 2026-10-30 (part 4): milestone 1 built test-first (formats, site scope, redaction), popup cookie panel, ADR 0004, 17 e2e tests with axe; found and worked around three brand-kit contrast pairings.
- 2026-10-30 (part 3): Playwright and axe added; milestone 0 complete.
- 2026-10-30 (part 2): brand bundled; popup with theme toggle and info button.
- 2026-10-30: repo cloned, plan approved, tooling added.
