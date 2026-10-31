# 0008. Storage reads and extractors

Status: accepted · Date: 2026-10-30

## Context

Milestone 5 adds two things. First, a rule can capture values a page keeps in its localStorage or sessionStorage (US-013). Second, any rule can keep only part of a value, so a log or an app receives one field rather than a whole blob (US-014). Page storage can only be read from inside the page, and an extractor runs text the person (or an app they approve) wrote, so both need limits.

## Decisions

1. **A storage rule is a rule.** Kind `storage`, an area (`local` or `session`), a site, keys and a destination, with the same approval, switch, kill switch, log, queue and delivery log as every other rule (ADR 0005, 0006, 0007). Keys are case sensitive and kept as typed.
2. **Read on demand, never injected everywhere.** Conduit uses `chrome.scripting.executeScript` with a function and the key names, run in the top frame of a tab. There is no content script on every page. The page is asked for the keys the active rules for its site name, and nothing else; the function returns only those keys.
3. **When storage is read:** when a tab finishes loading a page on a rule's site, and when the person presses "Capture now" (every open tab on the site, ten at most). Storage a page writes later is picked up on the next load or "Capture now". This is a documented limit, not a hidden one (roadmap).
4. **One new permission, `scripting`.** It needs no extra prompt on its own. Reading a page still needs the person's access to that site (ADR 0004); a page the person has not allowed cannot be read. The release manifest still grants no sites.
5. **Extractors are part of the rule and of its sentence.** `{regex}` or `{jsonpath}`, shown as "keeping only what matches /…/" or "keeping only the field $.a.b", so approval covers what is kept. A rules file or an app request can carry one; it is validated like everything else from outside, and imported rules arrive off and unapproved as before.
6. **Extraction happens before anything is stored or sent.** It is applied where a rule picks its values out of cookies, headers or storage, so the capture log, the delivery queue, the "unchanged" check and the app all see only the extracted part. A change elsewhere in a value is not a new capture.
7. **A value the extractor cannot be applied to is not captured**: the pattern does not match, the value is not JSON, or the field is absent. That is normal on pages that only sometimes hold the value, so it is not shown as a failure.
8. **Patterns are bounded.** Up to 200 characters, no back-references, no repeated repeat such as `(a+)+` (checked when the rule is made, imported, or requested by an app and again before use), and values over 20,000 characters are not matched. JSON paths are a small subset (`$.a.b`, `[0]`, `['key']`), up to 20 steps, and look only at an object's own properties, so `$.constructor` finds nothing.
9. **Apps can ask for both.** A handshake request may have `kind: "storage"` with an `area`, and an `extract`, on any kind. Requests that cannot be approved are shown with the reason, as before.

## Consequences

- A tab closed before the load event is handled is missed; a page that fills storage after it loads is read on the next load or by "Capture now".
- Regular expressions run in the service worker. The limits make the common slow patterns impossible but cannot rule out every slow one; the roadmap notes moving extraction into a timed worker if patterns ever come from a less trusted source.
- Storage values wait in extension storage like cookie and header values (log, queue).
- Firefox (milestone 6) needs `browser.scripting` and a look at its optional host permissions.
