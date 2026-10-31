# Changelog

All notable changes are listed here, in [Keep a Changelog](https://keepachangelog.com/)
format. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Project scaffolding: TypeScript, esbuild build, Vitest, ESLint, Prettier, CI workflow.
- Cookie export: see the cookies for the current site (including HttpOnly ones), choose which to include, and copy or download them as Netscape `cookies.txt`, JSON or a `Cookie:` header. Values are previewed redacted until you reveal them, and Conduit asks before it reads a site for the first time.
- A first popup in the Conduit brand theme, with a light/dark toggle (sun/moon icon) and an info (i) button that shows or hides explanatory text.
