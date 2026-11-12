# Changelog

All notable changes are listed here, in [Keep a Changelog](https://keepachangelog.com/)
format. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-08

The first release: a zip to load unpacked in Chrome or Edge.

### Fixed

- The example app starts on a computer where something else already uses port 8778 (Docker Desktop does on some machines): with no `--port` it takes the first free port from 8778 to 8787 and says which ports it skipped, and on Windows a second copy can no longer share a port with the first.
- Chrome showed "You need to request host permissions in the manifest file in order to be notified about requests from the webRequest API" on the extension's card after a fresh install. The manifest now holds the loopback address `http://127.0.0.1/*` (this computer, where local apps live); every website still needs your approval. A test loads the release build and checks the card has no errors.

### Changed

- Sites are found with the Public Suffix List, so `alice.github.io` and `carol.blogspot.com` are sites of their own instead of being grouped under `github.io` and `blogspot.com`, and a rule or permission for one covers that site only. The list is refreshed with `node scripts/update-public-suffixes.mjs`.
- The interface follows the IBM Carbon design standard from the brand kit (1.56.1): square corners, layered backgrounds instead of borders and shadows, regular-weight text in the standard's type scale, 40 px controls. The body face is now Public Sans, with Sora kept for headings and the name.
- Brand assets re-synced from brandkit 1.49.0: the typeface is now Sora, loaded through the brand's `fonts.css` with the `sora.woff` file shipped beside it.

### Added

- Firefox (140 or newer): `conduit-<version>-firefox.zip` in each release, loaded temporarily from `about:debugging` until Mozilla signs it. The same rules, approval, capture, headers, page storage, extractors and delivery. `node scripts/build.mjs --target firefox` builds it; the background is tested in Firefox with `npm run test:e2e:firefox`.
- A release zip: `node scripts/package-release.mjs` builds it (with a checksum), and pushing a `vX.Y.Z` tag publishes it as a GitHub release. The README has the install steps for Chrome and Edge.
- Storage reads: a rule can capture named localStorage or sessionStorage keys from a site, read when a page finishes loading and on "Capture now". Only the keys you name are read.
- Extractors: any rule can keep only part of a value, what a pattern matches or one field of JSON, so a log or an app receives just that part. The rule's sentence says what is kept. Apps can ask for storage keys and extractors in their handshake.
- Header capture: a rule can capture named request or response headers from a site, with the same approval, switch, log and delivery to apps as a cookie rule. Only the headers you name are read; everything else in the request is left alone. Apps can ask for headers in their handshake.
- Project scaffolding: TypeScript, esbuild build, Vitest, ESLint, Prettier, CI workflow.
- Local apps: add a program that receives values from Conduit by its address, or let Conduit look on this computer. The app tells Conduit what it would like and why; you approve the requests you choose and each becomes a rule. Apps on other computers must use https and you confirm them by typing their name. An app can have its own delivery path.
- A delivery log (time, rule, app, size, result; never the values). A delivery that fails is shown at once on the rules page, in the popup and with a ! on the toolbar icon, retried automatically after 30 seconds, 2, 10 and 30 minutes, and can be retried or discarded by hand. Pausing capture pauses delivery.
- An example app in `examples/` and the integration contract in `docs/INTEGRATION-CONTRACT.md`.
- Rules: choose a site and cookie names, review the rule as one sentence, and approve it (the browser asks for access to that site). Approved rules save each new value of those cookies to a capture log in this browser; "Capture now" saves the current values. Switch rules off, delete them, or pause everything with one click from the toolbar popup; the toolbar icon shows OFF while paused.
- Export your rules to a file and import them elsewhere. Imported rules arrive switched off and need your approval.
- Download or clear the capture log (it keeps the newest 1,000 entries).
- Cookie export: see the cookies for the current site (including HttpOnly ones), choose which to include, and copy or download them as Netscape `cookies.txt`, JSON or a `Cookie:` header. Values are previewed redacted until you reveal them, and Conduit asks before it reads a site for the first time.
- A first popup in the Conduit brand theme, with a light/dark toggle (sun/moon icon) and an info (i) button that shows or hides explanatory text.
