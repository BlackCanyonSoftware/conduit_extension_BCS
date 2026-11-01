# Changelog

All notable changes are listed here, in [Keep a Changelog](https://keepachangelog.com/)
format. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Brand assets re-synced from brandkit 1.49.0: the typeface is now Sora, loaded through the brand's `fonts.css` with the `sora.woff` file shipped beside it.

### Added

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
