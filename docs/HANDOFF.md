# Handoff

## Current state

- Repo cloned from `BlackCanyonSoftware/conduit_extension_BCS` (MIT licence present).
- Plan approved by the owner (2026-10-30): PRD, ROADMAP, ARCHITECTURE, DESIGN, INTEGRATION-CONTRACT, ADRs 0001 to 0005.
- **Milestones 0, 1 and 2 are done.** Milestone 2 (rules and approval, US-004 to US-007) works end to end in headless Chromium.
- Brand: `src/theme/` and `docs/brand/` are generated with `brandkit bundle conduit` (never edit by hand; `brandkit check` reports drift).
- **Popup** (`src/popup/`): a rules bar (how many rules are capturing, Pause all / Resume capture, a gear button that opens the rules page) above the cookie list from milestone 1.
- **Rules page** (`src/options/`, opens as a tab): rules list with status badges, On switch, Capture now, Delete (asks first); New rule form (Site, Cookie names) with inline errors, a review step that shows the one-sentence rule, then "Approve and save", which makes the browser ask for site access; Import / Export rules; a paused notice with Resume; the capture log (newest first, values hidden until Show, Download log, Clear log asks first).
- **Service worker** (`src/background/service-worker.ts`): saves a value to the log when a named cookie changes under an active rule; answers "Capture now"; keeps the toolbar badge at OFF while paused. Writes are queued so two events cannot lose each other's entries.
- **Core** (`src/core/`): rule model and status, draft validation, import/export (imported rules always off and unapproved), matching, duplicate-skipping captures, capped log (1,000). Browser calls live in `src/platform/` (`cookies`, `storage`, `extension`).
- Manifest permissions: `activeTab`, `cookies`, `storage`; `optional_host_permissions: ["*://*/*"]`; no `host_permissions` in release builds.
- Tests: 104 unit tests and 35 end-to-end tests (real cookies from a local test site; capture on change, only named cookies, Capture now, kill switch incl. toolbar badge, off switch, delete confirm, export content, hostile import ignored, bad file refused, log download/clear, popup height, phone-width overflow, axe WCAG 2.x A/AA scans in light and dark).

## Verification so far

- `npm run check` passes. `npm run test:e2e`: 35 of 35 pass; the timing-sensitive capture tests were repeated three times with no failures.
- Screenshots of the rules page (light, dark, phone width) and the popup (rules active, paused) were viewed.
- The tests found and fixed: `hidden` buttons still showing because brand button styles set `display`; a page wider than a phone screen; a popup taller than Chrome's 600px limit.
- **Not verified:**
  - **Chrome's real permission prompt**, from the options page (tests pre-grant `localhost` through a test-only build flag; releases never do). The owner has not reported on the milestone 1 try-out either. Steps: build with `npm run build`, load `dist/` unpacked, open the rules page from the popup's gear, make a rule for a real site, approve, and confirm the browser prompt appears and the rule saves.
  - **Service worker restarts.** MV3 stops an idle worker and restarts it for the next event. The worker keeps no state in memory and registers its listeners at the top level, but a forced idle stop could not be done here (Playwright keeps the worker attached), so it is unproven.
  - The real clipboard, real `curl`/`wget`/`yt-dlp` against exported `cookies.txt`, Edge, and CI (not pushed).

## Decisions so far

- Tier: MVP. Stack: TypeScript strict, esbuild, vanilla DOM, Vitest, Playwright (ADR 0001). Chrome and Edge first, Firefox in milestone 6; unpacked distribution first (ADR 0003).
- Per-site access via optional host permissions (ADR 0004). Rules, approval and the local log (ADR 0005).
- Rules page is a full tab (`options_ui.open_in_tab`), so the browser's permission prompt cannot close it as it might a popup.
- `npm run test:e2e` builds with `--host-permission "*://localhost/*"`; plain `npm run build` never does.

## Next steps

1. A person tries the permission flow in a visible Chrome (see Not verified).
2. Milestone 3: sinks (US-008 to US-011): handshake, approval of what a sink asks for, delivery with retry via `chrome.alarms`, delivery log, typed confirmation for non-loopback hosts, custom-route option, and a reference sink in `examples/` (standard-library Python). Adds a second rule destination kind (`sink`), the sinks section on the rules page, and the `alarms` permission.
3. Owner pushes the commits; check CI.

## Tech debt and brand-kit findings

See "Tech debt" in `docs/ROADMAP.md`: Public Suffix List for site detection; partitioned cookies; three brand-kit contrast pairings overridden in `src/ui/shared.css`; a moderate dev-only `minimatch` advisory; log storage size and the clear-versus-capture race.

## Gotchas

- **Packaged-app quirk on the owner's machine:** the Claude desktop app runs as a packaged Windows app, so `npx playwright install` puts browsers in a virtualized folder Node cannot spawn from (`spawn UNKNOWN`). Workaround: a copy of `chromium-1248` in `.browsers/` (gitignored) and `export PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers"` before `npm run test:e2e`. Not needed in CI or on a normal machine.
- The shell can mangle non-ASCII characters (for example `…`) in text written through it; use the editor tools for files that contain them.
- Node 26 is installed locally; CI and `.nvmrc` use 22.
- `brandkit` is not pip-installed; run it from `C:\Users\Kpier\Documents\Brand Logos` with `PYTHONPATH=src python -m brandkit ...`.
- A hook in the owner's Claude setup requires `timeout N` as the first word of long-running commands, and rejects an env assignment before `timeout` (use `export` first).
- Show cookie names and values only through `textContent`, never `innerHTML`.
- The test site (`tests/e2e/fixtures.ts`) answers `/favicon.ico` with 404 and no cookies; otherwise Chrome's favicon request resets the cookie and adds stray captures.
- CI has not run: not verified until pushed.

## Open questions

See PRD section 10.

## Session log

- 2026-10-30 (part 5): milestone 2 built test-first: core rules and capture, storage wrapper, service worker, rules page, popup rules bar and kill switch, ADR 0005, 35 e2e tests. Fixed three layout and display bugs the tests exposed.
- 2026-10-30 (part 4): milestone 1 (cookie export), ADR 0004.
- 2026-10-30 (part 3): Playwright and axe added; milestone 0 complete.
- 2026-10-30 (part 2): brand bundled; popup with theme toggle and info button.
- 2026-10-30: repo cloned, plan approved, tooling added.
