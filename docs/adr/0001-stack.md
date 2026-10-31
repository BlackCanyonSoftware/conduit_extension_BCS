# 0001. Stack: TypeScript, esbuild, vanilla DOM

Status: accepted (pending plan approval) · Date: 2026-10-30

## Context

Conduit is a small, permission-sensitive extension. The stack should be easy to
audit, have few dependencies and work on Windows, macOS and Linux.

## Options

1. **TypeScript + esbuild + vanilla DOM** with Vitest and Playwright.
2. **WXT or Vite** with a UI framework: more structure, more dependencies.
3. **Plain JavaScript:** fewest tools, weakest guarantees on browser-API data.

## Decision

Option 1. Strict TypeScript catches shape errors in cookie, header and contract
data; esbuild keeps the build to one dependency; the UI is a handful of screens
that do not need a framework.

## Consequences

- Fewer dependencies to audit and keep current.
- We write a little more DOM code by hand; shared helpers in `src/popup/` keep it tidy.
- If the options UI outgrows this, revisit with a new ADR.
