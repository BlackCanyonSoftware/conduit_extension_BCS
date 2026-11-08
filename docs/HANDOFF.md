# Handoff

## Current state

- Repo cloned from `BlackCanyonSoftware/conduit_extension_BCS` (MIT licence present).
- Plan approved by the owner (2026-10-30): PRD, ROADMAP, ARCHITECTURE, DESIGN, INTEGRATION-CONTRACT, ADRs 0001 to 0006.
- **Milestones 0 to 5 are done.** Milestone 5 (storage reads and extractors, US-013 and US-014) adds a storage rule kind (localStorage or sessionStorage keys, read when a page finishes loading and on "Capture now") and an optional extractor on any rule (what a pattern matches, or one JSON field), with apps able to ask for both (ADR 0008). Milestone 3 (apps that receive captures, US-008 to US-011) works end to end in headless Chromium, including against the Python example app. Milestone 4 (header capture, US-012) adds a header rule kind: request or response headers, named one by one, on the same approval, switch, log, queue and delivery log; apps can ask for headers (ADR 0007).
- Brand: `src/theme/` and `docs/brand/` are generated with `brandkit bundle conduit` (never edit by hand; `brandkit check` reports drift). The interface is built to **IBM Carbon** (see DESIGN.md).
- Brand last checked: 2026-11-06 · brandkit 1.56.1 · Brand Logos commit eef776be (dirty) · set: app (`src/theme`) and readme (`docs/brand`) · result: re-synced; UI brought to the Carbon design standard (rollout kit 1.56.0)
- **Rules page** (`src/options/`, a tab): Rules, **Local apps** (add by address or "Look on this computer", review requests with the app's reason word for word, approve some, Refresh requests, Remove), **Delivery log** (no values; download, clear), Capture log.
- **Service worker**: cookie change to log rule or queued delivery; sends (`204` = success), logs the result, retries from `chrome.alarms` (30 s, 2, 10, 30 min), then waits for Retry now / Discard; pausing halts delivery; badge OFF while paused and `!` while a delivery is failing; a full queue (200) logs the values it pushes out instead of dropping them silently.
- **Popup**: cookie export, rules bar with Pause all / Resume and a "delivery has not gone through" note.
- **Core** (`src/core/`): `sinks/host.ts` (address, loopback, https rule, typed confirmation, delivery path), `sinks/handshake.ts`, `sinks/delivery.ts` (queue, retry schedule, digest-based "unchanged" check, stored readers), rule destinations (`log` | `sink`), exported rules leave out app rules.
- **Example app**: `examples/reference_sink.py` (standard library only). Contract: `docs/INTEGRATION-CONTRACT.md`.
- **Header rules** (milestone 4): the new-rule form has a "What to capture" choice (Cookies, Request headers, Response headers). `src/core/headers.ts` picks only the named headers out of a request or response (`matchRuleHeaders`); `src/platform/headers.ts` is the only `webRequest` code (observe-only `onSendHeaders` / `onHeadersReceived`, skips Conduit's own requests); the worker keeps the active header rules in memory until storage changes, and reads the full state only on a match. Header rules have no "Capture now". Header names are stored lower case.
- **Storage rules and extractors** (milestone 5): `src/core/page-storage.ts` (`matchRuleStorage`, `storageNeeds`: which keys a page is asked for, never more), `src/core/extract.ts` (checking, applying, describing extractors; used by cookie, header and storage matching alike), `src/platform/page-storage.ts` (the only `chrome.scripting` code: reads named keys with `executeScript`, plus open-tab lookup and the page-loaded event), `src/core/sinks/want.ts` (request to rule fields). The new `scripting` permission needs no extra prompt; site access is still per site.
- Manifest permissions: `activeTab`, `alarms`, `cookies`, `scripting`, `storage`, `webRequest`; `optional_host_permissions: ["*://*/*"]`; no `host_permissions` in release builds.
- Tests: 306 unit tests and 82 end-to-end tests (cookies and popup 17, rules 18, apps 19, headers 12, storage and extractors 16).

## Verification so far

- `npm run check` passes (format, lint, typecheck, unit tests, build).
- `npm run test:e2e` passes in batches (running everything at once is over two minutes locally): `cookies.spec.ts popup.spec.ts rules.spec.ts` (35), `sinks.spec.ts` (19, including the real automatic retry at about 30 seconds) and `headers.spec.ts` (12: only the named request or response header is recorded, other headers and the other direction are not, switching a rule off stops it, an app receives only its requested header, export and re-import, accessibility in light and dark).
- Milestones 4 and 5 changed earlier tests on purpose: header and then storage requests used to be shown as "not supported yet", so the app tests now use an unknown kind (`indexeddb`) as the unsupported example.
- `storage.spec.ts` (16) keeps its test page open while the page loads (a person browsing does the same): Conduit reads a page's storage after it finishes loading, and a tab closed before that read is missed.
- The tests found and fixed: the discard filter being fed its own message type, the page growing wider than a phone because of the table, a missing silent-drop report for a full queue.
- Screenshots viewed: review of requests, apps and failure alert (dark, settled), phone width (no sideways overflow).
- Security pass: all network calls are in `src/platform/sinks.ts` (no credentials, no referrer, no cache, no redirects, timeouts, capped answer size); no unsafe DOM use; no runtime dependencies; release manifest grants no sites; moderate dev-only `minimatch` advisory unchanged.
- **Not verified:**
  - **Chrome's real permission prompts** for a site (rule creation), for an app and its sites together, and for "Look on this computer". Tests pre-grant `localhost` and `127.0.0.1` through a test-only build flag; releases never do. The owner has not yet reported on a visible Chrome try-out of milestones 1 to 3.
  - **A forced idle stop of the service worker.** The alarm retry works (a failed delivery was resent about 30 seconds later), but Playwright keeps the worker attached, so a real stop and restart is unproven.
  - **An app on another computer, end to end.** Tests cover the https rule, the typed confirmation and the "not on this computer" marker, not a real remote https app.
  - **Header capture on a real site with Chrome's real prompt.** Tests pre-grant `localhost` and `127.0.0.1`. That a release build (no granted sites) receives no `webRequest` events at all, and that the single site prompt is enough for headers, rests on Chrome's documented behaviour and has not been seen.
  - **Storage reads on a real site with Chrome's real prompts**, and live behaviour on single-page apps that write storage after loading (see the roadmap).
  - The real clipboard, `curl`/`wget`/`yt-dlp` against `cookies.txt`, and Edge.

## Decisions so far

- Tier: MVP. Stack: TypeScript strict, esbuild, vanilla DOM, Vitest, Playwright (ADR 0001). Chrome and Edge first, Firefox in milestone 6; unpacked distribution first (ADR 0003).
- Per-site access (ADR 0004); rules, approval and the local log (ADR 0005); apps, delivery and retry (ADR 0006); loopback first (ADR 0002, extended: other computers need https and a typed host name).
- Rules that send to an app are never exported, and a rules file can never name an app.
- `npm run test:e2e` builds with `--host-permission "*://localhost/*" --host-permission "*://127.0.0.1/*"`.

## Next steps

1. A person tries the permission flows in a visible Chrome and, if possible, runs the example app: `python examples/reference_sink.py --site <a site you use> --names <a cookie name>`, then Local apps, Look on this computer.
2. Owner: the visible-browser checks in `docs/MANUAL-CHECKS.md` (Chrome, Edge, and section 9 for Firefox). Then: signing the Firefox zip through Mozilla's add-on site (needs the owner's account and keys), and a first release (`git tag v0.1.0`).
3. Owner pushes the commits; CI is on again (see the Gotchas entry about it) and should finish in a few minutes. If a run goes over 10 minutes, disable the workflow and run locally.

## Tech debt and brand-kit findings

See "Tech debt" in `docs/ROADMAP.md`: partitioned cookies; three brand-kit contrast pairings overridden in `src/ui/shared.css`; a moderate dev-only `minimatch` advisory; log storage size and the clear-versus-capture race; one delivery per cookie change; values wait in storage until delivered.

## Gotchas

- **Packaged-app quirk on the owner's machine:** the Claude desktop app runs as a packaged Windows app, so `npx playwright install` puts browsers in a virtualized folder Node cannot spawn from (`spawn UNKNOWN`). Workaround: a copy of `chromium-1248` in `.browsers/` (gitignored) and `export PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers"` before `npm run test:e2e`. Not needed in CI or on a normal machine.
- Playwright's text locators match substrings: "Back" also matches "Switch to a dark background". Use `exact: true` or a more specific locator.
- Writing long scripts through the shell here sometimes fails to parse and can mangle non-ASCII text; put patch scripts in a file first, and use the editor tools for text with characters like the ellipsis.
- Node 26 is installed locally; `.nvmrc` and the workflow use 22.
- `brandkit` is not pip-installed; run it from `C:\Users\Kpier\Documents\Brand Logos` with `PYTHONPATH=src python -m brandkit ...`.
- A hook in the owner's Claude setup requires `timeout N` as the first word of long-running commands, and rejects an env assignment before `timeout` (use `export` first). Tool timeouts over two minutes are refused, so split long test runs.
- Show names and values only through `textContent`, never `innerHTML`.
- The test site answers `/favicon.ico` with 404 and no cookies; otherwise Chrome's favicon request resets the cookie and adds stray captures.
- **CI** (`.github/workflows/ci.yml`) was disabled for a day (2026-11-07) because its e2e step took about 20 minutes and failed: each of 32 tests passed, then hung 30 s in the `site` fixture's teardown, because `server.close()` waits for the browser's keep-alive connections. The fixtures now call `server.closeAllConnections()`, the whole suite passes locally in 2.7 minutes, and the workflow was re-enabled on the owner's say-so (2026-11-07). **Not yet seen on a GitHub runner with the fix** (it is not pushed). The rule: a CI run over 10 minutes is disabled and run locally. Playwright `workers` stays at 1: a few tests use fixed ports and the real-alarm test needs a quiet machine.

## Open questions

See PRD section 10.

## Session log

- 2026-11-08: milestone 6 (Firefox, ADR 0010): `--target firefox` build, header listener fallback and own-request check for Firefox, `--test-bridge` content script for tests, a small debugging-protocol client to install the add-on into Playwright's Firefox, 16 Firefox tests, `package-release.mjs --target firefox`, CI jobs with a 10-minute timeout. The popup and rules page have not been opened in Firefox; the release zip is unsigned.
- 2026-11-08: first release prepared (0.1.0): `scripts/package-release.mjs` (clean build, manifest checks, deterministic zip, SHA-256), `.github/workflows/release.yml` (on a `v*` tag), README install steps for Chrome and Edge, release steps in CONTRIBUTING. Not tagged or pushed: the owner tags `v0.1.0` when ready.
- 2026-11-08: Public Suffix List (ADR 0009): `public-suffix.ts` matcher, generated `public-suffix-data.ts` (list 2026-11-06), `hostBelongsToSite`, exact-host rule for a host that is itself a suffix; tech debt entry replaced by a "refresh the snapshot" note.
- 2026-11-01: brand re-synced from brandkit 1.49.0 (`brandkit bundle conduit src/theme` and `--set readme docs/brand`): typeface changed from Nunito to Sora. Old Nunito files removed by hand (bundle does not delete them). Our CSS names no font family (only `var(--mono)`); full e2e (82) and unit (306) tests pass.
- 2026-10-30 (part 8): milestone 5 built test-first: extractors (pattern or JSON path, checked and bounded), storage rule kind read with `chrome.scripting`, new `scripting` permission, form choices for storage and "Keep", handshake `storage` kind and `extract`, example app options, ADR 0008, 16 e2e tests.
- 2026-10-30 (part 7): milestone 4 built test-first: header rule kind (request or response, lower-case names), observe-only `webRequest` capture, handshake `header` requests with a direction, form choice, ADR 0007, example app `--kind header`, 12 e2e tests.
- 2026-10-30 (part 6): milestone 3 built test-first: address and loopback rules, handshake reader, queue and retry schedule, worker delivery with alarms, Local apps and Delivery log on the rules page, example app, contract and ADR 0006, 54 e2e tests.
- 2026-10-30 (part 5): milestone 2 (rules, approval, log, kill switch).
- 2026-10-30 (part 4): milestone 1 (cookie export), ADR 0004.
- 2026-10-30 (part 3): Playwright and axe added; milestone 0 complete.
- 2026-10-30 (part 2): brand bundled; popup with theme toggle and info button.
- 2026-10-30: repo cloned, plan approved, tooling added.
