# 0007. Header capture

Status: accepted · Date: 2026-10-30

## Context

Milestone 4 lets a rule capture HTTP headers (for example the `Authorization` header a page sends to its own API) as well as cookies. A header can carry a long-lived secret, and a browser sends dozens of headers with every request, so the rule must name exactly the headers it wants and nothing else may leave the browser's request.

## Decisions

1. **A header rule is a rule.** It has a kind (`header`), a direction (`request` or `response`), a site, header names and a destination, and goes through the same approval, switch, kill switch, capture log, delivery queue, retries and delivery log as a cookie rule (ADR 0005, ADR 0006). The sentence reads "Save the request header authorization from example.com to Conduit's local log."
2. **Only named headers are read.** The matcher copies the named headers out of a request or response and nothing else. Every other header, the path and the query string are never stored or sent; the origin recorded is scheme, host and port only.
3. **Observe only.** Conduit adds the `webRequest` permission and listens with `onSendHeaders` and `onHeadersReceived`. It never blocks or changes a request. The browser reports requests only to sites the person has allowed (ADR 0004), so a fresh install sees no website's requests, and Conduit's own extension requests are skipped. Chrome will only register these listeners for an extension that holds some host permission, which is why the manifest holds the loopback address (ADR 0004, amendment).
4. **Direction is part of the rule.** Request and response headers share names (`content-type`), so a rule picks one and a capture says which.
5. **Names are lower case.** Header names are not case sensitive; Conduit stores, shows and delivers them in lower case, and checks them against the characters HTTP allows in a name.
6. **A header seen twice in one message is joined** with `, `, as HTTP defines it, so one message gives one value per name.
7. **A value is recorded when it is new.** Headers repeat on every request, so a value equal to the last one recorded (log) or sent (app) for that rule and name is skipped.
8. **An app asks with `kind: "header"`**, a `direction` (default `request`), names and a required reason, exactly like a cookie request. A rules file may carry header rules; they arrive switched off and unapproved like any other.
9. **There is no "Capture now"** for a header rule: headers exist only while a request is in flight, so nothing can be read on demand.
10. **Cheap on every request.** The worker keeps the active header rules in memory until storage changes (the worker is restarted whenever it was idle) and reads the full state only when a request matches a rule.

## Consequences

- Header values wait in extension storage in the same way as cookie values (capture log, delivery queue); the page says so.
- `extraHeaders` is Chrome-specific; the Firefox milestone needs a compatibility step for it.
- Response bodies are not captured.
- A page that sends the same header on many requests costs one storage read per matching request; if that ever matters, deduplicate before the read.
