# Changelog

All notable changes are listed here, in [Keep a Changelog](https://keepachangelog.com/)
format. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Project scaffolding: TypeScript, esbuild build, Vitest, ESLint, Prettier, CI workflow.
- Rules: choose a site and cookie names, review the rule as one sentence, and approve it (the browser asks for access to that site). Approved rules save each new value of those cookies to a capture log in this browser; "Capture now" saves the current values. Switch rules off, delete them, or pause everything with one click from the toolbar popup; the toolbar icon shows OFF while paused.
- Export your rules to a file and import them elsewhere. Imported rules arrive switched off and need your approval.
- Download or clear the capture log (it keeps the newest 1,000 entries).
- Cookie export: see the cookies for the current site (including HttpOnly ones), choose which to include, and copy or download them as Netscape `cookies.txt`, JSON or a `Cookie:` header. Values are previewed redacted until you reveal them, and Conduit asks before it reads a site for the first time.
- A first popup in the Conduit brand theme, with a light/dark toggle (sun/moon icon) and an info (i) button that shows or hides explanatory text.
