# 0003. Distribution: unpacked install from GitHub releases first

Status: accepted · Date: 2026-10-30 · Release packaging added 2026-11-08

## Context

A tool that reads cookies and headers should expect a long store review. Users
of this tool are mostly developers comfortable loading an unpacked extension.

## Options

1. Chrome Web Store from the start.
2. Unpacked install from a GitHub release; store submission later.

## Decision

Option 2. The README is written for the load-unpacked path first, with a release
zip per version. Store listings follow once the permission story and privacy
text are settled.

## Consequences

- README gets clear step-by-step install instructions for Chrome and Edge.
- Release workflow builds and attaches the zip.
- Store-specific assets (screenshots, privacy policy page) are deferred.

## How a release is made

- `package.json` holds the version; the build copies it into `manifest.json`.
- `node scripts/package-release.mjs` makes a clean build (never with the end-to-end tests' granted sites), checks that the manifest has the same version, grants no sites and does not ask for `<all_urls>`, and writes `release/conduit-<version>.zip` plus a `.sha256` file. The zip is written by the script itself, in sorted order with fixed timestamps, so the same source gives the same bytes and no packaging dependency is needed.
- Pushing a tag `vX.Y.Z` runs `.github/workflows/release.yml`: it checks the tag against `package.json`, runs `npm run check`, packages, and attaches the zip and checksum to a GitHub release, with the changelog section for that version as the notes. The end-to-end tests are not part of that job.
- The README's Install section is the step-by-step for Chrome and Edge.
