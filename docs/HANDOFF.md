# Handoff

## Current state

- Repo cloned from `BlackCanyonSoftware/conduit_extension_BCS` (MIT licence present).
- Plan approved by the owner (2026-10-30): PRD, ROADMAP, ARCHITECTURE, DESIGN, INTEGRATION-CONTRACT, ADRs 0001 to 0006.
- **Milestones 0 to 3 are done.** Milestone 3 (apps that receive captures, US-008 to US-011) works end to end in headless Chromium, including against the Python example app.
- Brand: `src/theme/` and `docs/brand/` are generated with `brandkit bundle conduit` (never edit by hand; `brandkit check` reports drift).
- **Rules page** (`src/options/`, a tab): Rules, **Local apps** (add by address or "Look on this computer", review requests with the app's reason word for word, approve some, Refresh requests, Remove), **Delivery log** (no values; download, clear), Capture log.
- **Service worker**: cookie change to log rule or queued delivery; sends (`204` = success), logs the result, retries from `chrome.alarms` (30 s, 2, 10, 30 min), then waits for Retry now / Discard; pausing halts delivery; badge OFF while paused and `!` while a delivery is failing; a full queue (200) logs the values it pushes out instead of dropping them silently.
- **Popup**: cookie export, rules bar with Pause all / Resume and a "delivery has not gone through" note.
- **Core** (`src/core/`): `sinks/host.ts` (address, loopback, https rule, typed confirmation, delivery path), `sinks/handshake.ts`, `sinks/delivery.ts` (queue, retry schedule, digest-based "unchanged" check, stored readers), rule destinations (`log` | `sink`), exported rules leave out app rules.
- **Example app**: `examples/reference_sink.py` (standard library only). Contract: `docs/INTEGRATION-CONTRACT.md`.
- Manifest permissions: `activeTab`, `alarms`, `cookies`, `storage`; `optional_host_permissions: ["*://*/*"]`; no `host_permissions` in release builds.
- Tests: 199 unit tests and 54 end-to-end tests (cookies and popup 17, rules 18, apps 19).

## Verification so far

- `npm run check` passes (format, lint, typecheck, unit tests, build).
- `npm run test:e2e` passes in two batches (running everything at once is over two minutes locally): `cookies.spec.ts popup.spec.ts rules.spec.ts` (35) and `sinks.spec.ts` (19, including the real automatic retry at about 30 seconds).
- The tests found and fixed: the discard filter being fed its own message type, the page growing wider than a phone because of the table, a missing silent-drop report for a full queue.
- Screenshots viewed: review of requests, apps and failure alert (dark, settled), phone width (no sideways overflow).
- Security pass: all network calls are in `src/platform/sinks.ts` (no credentials, no referrer, no cache, no redirects, timeouts, capped answer size); no unsafe DOM use; no runtime dependencies; release manifest grants no sites; moderate dev-only `minimatch` advisory unchanged.
- **Not verified:**
  - **Chrome's real permission prompts** for a site (rule creation), for an app and its sites together, and for "Look on this computer". Tests pre-grant `localhost` and `127.0.0.1` through a test-only build flag; releases never do. The owner has not yet reported on a visible Chrome try-out of milestones 1 to 3.
  - **A forced idle stop of the service worker.** The alarm retry works (a failed delivery was resent about 30 seconds later), but Playwright keeps the worker attached, so a real stop and restart is unproven.
  - **An app on another computer, end to end.** Tests cover the https rule, the typed confirmation and the "not on this computer" marker, not a real remote https app.
  - The real clipboard, `curl`/`wget`/`yt-dlp` against `cookies.txt`, Edge, and CI (not pushed).

## Decisions so far

- Tier: MVP. Stack: TypeScript strict, esbuild, vanilla DOM, Vitest, Playwright (ADR 0001). Chrome and Edge first, Firefox in milestone 6; unpacked distribution first (ADR 0003).
- Per-site access (ADR 0004); rules, approval and the local log (ADR 0005); apps, delivery and retry (ADR 0006); loopback first (ADR 0002, extended: other computers need https and a typed host name).
- Rules that send to an app are never exported, and a rules file can never name an app.
- `npm run test:e2e` builds with `--host-permission "*://localhost/*" --host-permission "*://127.0.0.1/*"`.

## Next steps

1. A person tries the permission flows in a visible Chrome and, if possible, runs the example app: `python examples/reference_sink.py --site <a site you use> --names <a cookie name>`, then Local apps, Look on this computer.
2. Milestone 4: header capture (US-012): a new rule kind on the same rules, approval, queue and delivery log; adds the `webRequest` permission and a way to approve header requests from the handshake (they are shown today as "not supported yet").
3. Owner pushes the commits; check CI (it runs the e2e tests, including the example app, which needs Python on the runner; ubuntu-latest has it).

## Tech debt and brand-kit findings

See "Tech debt" in `docs/ROADMAP.md`: Public Suffix List for site detection; partitioned cookies; three brand-kit contrast pairings overridden in `src/ui/shared.css`; a moderate dev-only `minimatch` advisory; log storage size and the clear-versus-capture race; one delivery per cookie change; values wait in storage until delivered.

## Gotchas

- **Packaged-app quirk on the owner's machine:** the Claude desktop app runs as a packaged Windows app, so `npx playwright install` puts browsers in a virtualized folder Node cannot spawn from (`spawn UNKNOWN`). Workaround: a copy of `chromium-1248` in `.browsers/` (gitignored) and `export PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers"` before `npm run test:e2e`. Not needed in CI or on a normal machine.
- Playwright's text locators match substrings: "Back" also matches "Switch to a dark background". Use `exact: true` or a more specific locator.
- Writing long scripts through the shell here sometimes fails to parse and can mangle non-ASCII text; put patch scripts in a file first, and use the editor tools for text with characters like the ellipsis.
- Node 26 is installed locally; CI and `.nvmrc` use 22.
- `brandkit` is not pip-installed; run it from `C:\Users\Kpier\Documents\Brand Logos` with `PYTHONPATH=src python -m brandkit ...`.
- A hook in the owner's Claude setup requires `timeout N` as the first word of long-running commands, and rejects an env assignment before `timeout` (use `export` first). Tool timeouts over two minutes are refused, so split long test runs.
- Show names and values only through `textContent`, never `innerHTML`.
- The test site answers `/favicon.ico` with 404 and no cookies; otherwise Chrome's favicon request resets the cookie and adds stray captures.
- CI has not run: not verified until pushed.

## Open questions

See PRD section 10.

## Session log

- 2026-10-30 (part 6): milestone 3 built test-first: address and loopback rules, handshake reader, queue and retry schedule, worker delivery with alarms, Local apps and Delivery log on the rules page, example app, contract and ADR 0006, 54 e2e tests.
- 2026-10-30 (part 5): milestone 2 (rules, approval, log, kill switch).
- 2026-10-30 (part 4): milestone 1 (cookie export), ADR 0004.
- 2026-10-30 (part 3): Playwright and axe added; milestone 0 complete.
- 2026-10-30 (part 2): brand bundled; popup with theme toggle and info button.
- 2026-10-30: repo cloned, plan approved, tooling added.
