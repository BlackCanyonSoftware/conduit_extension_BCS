# 0010. Firefox

Status: accepted · Date: 2026-11-08

## Context

US-017 asks for Conduit to work the same in Firefox. The code is written against the `chrome.*` extension APIs, which Firefox also provides (with promises, in Manifest V3). Three things differ: Firefox has no service workers, a few options are Chrome-specific, and Playwright, which the end-to-end tests use, can start Firefox but cannot load an extension into it or open an extension's own pages.

## Decisions

1. **One source, two manifests.** `node scripts/build.mjs --target firefox` writes `dist-firefox/`. Its manifest runs the same bundled background file as an event page (`background.scripts`, no service worker), drops `minimum_chrome_version`, and adds `browser_specific_settings.gecko`: the add-on id `conduit@blackcanyonsoftware`, a minimum Firefox of 140, and `data_collection_permissions: { required: ["none"] }` (Conduit sends nothing anywhere the person has not approved). Permissions and the site-access model (`optional_host_permissions`, asked per site at run time) are the same as in Chrome.
2. **Tolerate what Firefox refuses.** The header listeners ask for `extraHeaders` (Chrome needs it to show the Cookie header and others) and ask again without it when the browser rejects it; Firefox shows those headers anyway. A request is recognised as Conduit's own by Chrome's `initiator` or Firefox's `originUrl`.
3. **Install for tests the way `web-ext` does.** The Firefox tests start Playwright's Firefox with its debugging server on and install `dist-firefox/` as a temporary add-on through that server (`tests/support/firefox.ts`, a small client for the debugging protocol, no dependency).
4. **Reach the extension through a page, because its own pages cannot be opened.** Playwright's Firefox hangs on any privileged page, extension pages included. A Firefox test build (`--test-bridge`) therefore adds one content script on `localhost` pages (`tests/support/bridge-content.ts`) that lets a test read and write Conduit's storage and send the messages a Conduit page sends its worker. The bridge exists only in that build: the release packaging refuses a manifest with a content script, and a unit test checks that neither build contains it.
5. **What the Firefox tests cover, and what they do not.** 16 tests check the background in Firefox: cookie capture, off/unapproved/paused rules, "Capture now", pattern extraction, request and response headers, localStorage and sessionStorage reads and JSON-field extraction, delivery to an app, a failed delivery kept and sent with "Retry now", the automatic retry from an alarm, and pausing. The popup and rules page are the same code as in Chrome but are not opened by any test in Firefox; `docs/MANUAL-CHECKS.md` has the steps for a person, starting from how to install the build.
6. **Release.** The release workflow also attaches `conduit-<version>-firefox.zip` and its checksum. Firefox only installs signed add-ons permanently, so the zip is what Mozilla's add-on site signs; until it is signed, Firefox loads it temporarily from `about:debugging`. Signing needs the owner's add-on site account and keys and is not set up.

## Consequences

- The Firefox suite runs in about 90 seconds (one test waits for a real retry alarm) and runs as a second CI job.
- The tests ran on Playwright's Firefox build (version 157), not on the release or ESR channels.
- A change to a `chrome.*` call that Firefox handles differently shows up in the background tests; one that only the popup or rules page uses does not, and relies on the manual checks.
