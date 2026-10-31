# 0003. Distribution: unpacked install from GitHub releases first

Status: accepted (pending plan approval) · Date: 2026-10-30

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
