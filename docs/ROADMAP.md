# Roadmap

Sizes: S (about a day), M (a few days), L (a week or more). Status: not started,
in progress, done.

## Milestones

| #   | Milestone                                                                                                                                                                    | Stories                        | Size | Status                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---- | ---------------------------------------------------------------------------- |
| 0   | **Walking skeleton:** TypeScript + esbuild build, loadable MV3 popup in the Conduit brand theme with light/dark toggle, lint, type check, unit test, one Playwright test, CI | US-015, US-016                 | M    | done                                                                         |
| 1   | **Cookie export:** per-site list, per-cookie selection, three formats, copy and download, redacted previews                                                                  | US-001, US-002, US-003         | M    | done (browser permission prompt not yet seen by a person)                    |
| 2   | **Rules and approval:** rule model, one-sentence summaries, approval UI, kill switch, local capture log, rules import/export (arrive disabled)                               | US-004, US-005, US-006, US-007 | L    | done (permission prompt not yet seen by a person)                            |
| 3   | **Sinks:** handshake, approval of what a sink asks for, delivery with retry via alarms, delivery log, non-loopback confirmation, custom-route option, reference sink script  | US-008, US-009, US-010, US-011 | L    | done (permission prompts and a run with a real app not yet seen by a person) |
| 4   | **Header capture:** header rule kind on top of the rules engine                                                                                                              | US-012                         | M    | not started                                                                  |
| 5   | **Storage and extractors:** storage reads, regex/JSON-path extractors                                                                                                        | US-013, US-014                 | M    | not started                                                                  |
| 6   | **Firefox:** compatibility layer, signed XPI route                                                                                                                           | US-017                         | M    | not started                                                                  |

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

Every `TODO` in code must be listed here.

- **Site detection uses a short list of country-style suffixes** (`co.uk`, `com.au`, ...) rather than the Public Suffix List, so sites on shared suffixes such as `github.io` are treated as one site. Replace with the Public Suffix List (a small, audited dependency) before the first public release. (`src/core/cookies/site.ts`)
- **Partitioned (CHIPS) cookies and other cookie stores** (incognito, containers) are not listed yet.
- **Brand kit contrast:** three brand pairings measure just under WCAG AA and are overridden in `src/popup/popup.css`: `.seg` inactive labels (4.31:1 light), badge text on the hover surface (4.02:1 dark) and a hovered ghost button (4.46:1 dark). Fix in the brand kit, then remove the overrides.
- **`npm audit`: one moderate advisory in `minimatch` (<11.0.1), reached only through the lint toolchain** (ESLint 10, typescript-eslint). The extension has no runtime dependencies, and the suggested `npm audit fix --force` would downgrade ESLint. Re-check when ESLint or typescript-eslint publish a release that depends on `minimatch` 11 or later (found 2026-10-30).
- **Log storage:** the log holds captured values in `chrome.storage.local` (about 4 KB per value at most, 1,000 entries, against a 10 MB quota). Values are not encrypted at rest; the page says the log stays in this browser and the download warns. Revisit if entries ever carry larger data.
- **Clear versus capture race:** clearing the log from the page and a capture arriving in the same instant could bring one entry back. It is harmless; fix by routing "clear" through the service worker's queue if it ever matters.
- **Idea, not planned:** a "Create rule from selected cookies" button in the popup that opens the rule form pre-filled (still needing approval).
- **One delivery per cookie change.** Each changed cookie is its own POST. Batching several cookies into one delivery can come with header and storage requests if an app needs it.
- **Values wait in storage until delivered.** A queued delivery holds its value in extension storage (up to 200 of them) until it is sent or discarded. The delivery log never holds values.
- **Apps on other computers** are covered by tests up to the typed confirmation and by seeded-state tests of the marker; a full run against a real https app on another machine has not been done.
