# Roadmap

Sizes: S (about a day), M (a few days), L (a week or more). Status: not started,
in progress, done.

## Milestones

| #   | Milestone                                                                                                                                                                    | Stories                        | Size | Status                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---- | ------------------------------------- |
| 0   | **Walking skeleton:** TypeScript + esbuild build, loadable MV3 popup in the Conduit brand theme with light/dark toggle, lint, type check, unit test, one Playwright test, CI | US-015, US-016                 | M    | not started (waiting on brand assets) |
| 1   | **Cookie export:** per-site list, per-cookie selection, three formats, copy and download, redacted previews                                                                  | US-001, US-002, US-003         | M    | not started                           |
| 2   | **Rules and approval:** rule model, one-sentence summaries, approval UI, kill switch, local capture log, rules import/export (arrive disabled)                               | US-004, US-005, US-006, US-007 | L    | not started                           |
| 3   | **Sinks:** handshake, approval of what a sink asks for, delivery with retry via alarms, delivery log, non-loopback confirmation, custom-route option, reference sink script  | US-008, US-009, US-010, US-011 | L    | not started                           |
| 4   | **Header capture:** header rule kind on top of the rules engine                                                                                                              | US-012                         | M    | not started                           |
| 5   | **Storage and extractors:** storage reads, regex/JSON-path extractors                                                                                                        | US-013, US-014                 | M    | not started                           |
| 6   | **Firefox:** compatibility layer, signed XPI route                                                                                                                           | US-017                         | M    | not started                           |

Each milestone ends with: tests green, lint/type check/build green, a security pass
against the OWASP Top 10 (as it applies to an extension), an accessibility pass,
docs updated and a `HANDOFF.md` entry.

Exit criteria per milestone:

- **0:** a fresh clone builds with `npm run build`, loads unpacked in Chrome, the popup renders in both themes, `npm test` and `npm run test:e2e` pass.
- **1:** exports from a test site match golden files for each format; `httpOnly` cookies are included.
- **2:** a fresh install captures nothing; every rule has an approval record; kill switch stops capture in a test.
- **3:** the reference sink (a short Python script in `examples/`) receives a delivery end to end; a broken sink shows an error in the UI.
- **4:** only the named headers appear in captures; no other header is stored.
- **5:** an extractor reduces a captured blob to one field before delivery.
- **6:** the same end-to-end tests pass on Firefox.

## Now / Next / Later

- **Now:** plan approval, brand assets, milestone 0.
- **Next:** milestones 1 and 2.
- **Later:** milestones 3 to 6; evaluate response-body capture via the debugger API; optional store submissions.

## Tech debt

None yet. Every `TODO` in code must be listed here.
