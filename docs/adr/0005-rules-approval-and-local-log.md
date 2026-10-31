# 0005. Rules, approval and the local capture log

Status: accepted · Date: 2026-10-30

## Context

Milestone 2 introduces rules: the one thing that lets Conduit capture anything. They
need to be understandable, deliberate to create, easy to stop, and safe to share as
files, before any local application can receive data (milestone 3).

## Decisions

1. **A rule is a site plus cookie names plus a destination.** The site is the main domain and its subdomains (ADR 0004). The only destination for now is Conduit's own capture log; local applications arrive in milestone 3 as a second destination kind.
2. **A rule reads as one sentence** ("Save the cookies sid and theme from example.com to Conduit's local log."), shown before approval and stored beside each capture, so the log still makes sense after a rule is edited or deleted.
3. **Approval is a separate, explicit step on a full-page screen.** Creating a rule shows the sentence and asks for approval; approving asks the browser for site access with its own prompt. A rule is saved only after both. Only the page's own approval code sets `approvedAt`.
4. **Capture is event-driven:** the service worker saves a rule's cookie when the browser reports it changed, and on request ("Capture now"). A value identical to the last one captured for that rule and cookie is skipped.
5. **One kill switch** (a flag in storage) stops every rule, is visible in the popup, on the rules page and as an OFF badge on the toolbar icon, and does not change any rule's own on/off state.
6. **Rule files carry what a rule does, never its approval.** Importing always produces rules that are off and unapproved, whatever the file says. The import is all-or-nothing and size-limited.
7. **The log keeps the newest 1,000 entries** in extension storage. Values are hidden until the person shows them; the downloaded log contains the values and says so.

## Consequences

- Nothing is captured on a fresh install, after an import, or while paused.
- Anyone reading the browser profile on disk could read stored captures, since extension storage is not encrypted; the interface says the log stays in this browser.
- The data model leaves room for header and storage rules and for sink destinations without changing existing records' meaning.
- Stored records are validated when read, so a damaged or hand-edited record is skipped rather than trusted.
