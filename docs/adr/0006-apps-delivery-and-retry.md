# 0006. Apps, delivery and retry

Status: accepted · Date: 2026-10-30

## Context

Milestone 3 lets another program receive what a rule captures. That program is often a
daemon the person runs themselves, but the same mechanism has to be safe when the address
is typed wrongly, when the program misbehaves, and when the extension's service worker is
stopped between events.

## Decisions

1. **The app proposes, the person approves.** The handshake lists requests with a mandatory reason. Each approved request becomes an ordinary rule (destination: the app and the request id); a rules file can never carry one (ADR 0005). A later "Refresh requests" only offers what is new.
2. **Where an app may be.** On this computer (`localhost`, `127.x.x.x`, `::1`) nothing extra is needed. Anywhere else the address must be `https` and the person types its host name; it stays marked "not on this computer" and rule sentences say so (extends ADR 0002). Look-alike names (`localhost.example.test`) are not on this computer.
3. **One approval covers what it needs.** Adding an app asks the browser for access to that app's address and to the sites of the approved requests, in one prompt. Access to an app is by match pattern (`http://127.0.0.1/*`), which the browser applies to every port.
4. **A delivery is a queue entry until it is delivered.** Each changed cookie becomes one queued delivery holding the value, so it survives the worker stopping. On success it is removed and a line (time, rule, app, size, result, never the value) is added to the delivery log.
5. **Failures are visible first, retried second.** A failed try is shown at once (page, popup, toolbar `!`) and logged. Retries follow a fixed schedule (30 s, 2 min, 10 min, 30 min) driven by `chrome.alarms`, which outlive the worker; afterwards the delivery waits for the person (Retry now / Discard).
6. **Pausing halts delivery** as well as capture. Queued items are kept and sent after resuming. A queued item whose rule was switched off or deleted, or whose app was removed, is dropped rather than sent.
7. **Unchanged values are not sent twice.** The worker remembers a SHA-256 digest of each value sent per rule, not the value, to tell "changed" from "same". "Send now" sends regardless.
8. **Narrow network behaviour.** Requests carry no credentials, no referrer, no cache, follow no redirects, time out (5 s handshake, 10 s delivery), and read at most 100,000 characters of an answer. The success answer is `204`; anything else is a failure.
9. **Bounded storage.** The queue holds up to 200 deliveries and the delivery log 500 lines.

## Consequences

- An app that is down for a long time loses nothing until the queue cap, and the person is told.
- A repeated value after a failure is possible; the contract tells app authors to handle repeats.
- The alarm minimum for released extensions is 30 seconds, which is why the first retry waits 30 seconds.
- Header and storage requests (milestones 4 and 5) reuse the handshake, queue and log unchanged.
