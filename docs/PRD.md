# Conduit: product requirements

Status: draft for approval · Tier: MVP · Last updated: 2026-10-30

## 1. Problem and vision

The data your own browser holds (cookies, the headers it sends and receives,
what a page keeps in storage) is often exactly what a local tool needs. Today
people reach for a different extension for each job, or copy values out of
developer tools by hand.

**Conduit is one free, open-source extension that gives you that data in the form
you need and hands it to local applications you choose.** You decide what is
shared, with whom, and can see every delivery. It works entirely on your own
machine: no server, no account, no telemetry.

Two ways to use it:

1. **Export.** Pick a site, pick cookies, copy or download them as `cookies.txt`,
   JSON or a `Cookie:` header.
2. **Bridge.** Create a rule ("send these headers from this site to this local
   app") and Conduit delivers them through a small, documented HTTP contract that
   any application can implement in a few lines.

## 2. Target users

- **Developers and power users** running local tools (command-line downloaders,
  scripts, home-lab apps, test harnesses) that need a value only their signed-in
  browser has.
- **App authors** who want their local tool to ask the browser for data without
  shipping their own extension.

## 3. Goals

| ID | Goal |
|---|---|
| G1 | Cookie export in the common formats works on day one, with no setup. |
| G2 | Every share of data is something the user explicitly set up and can read in one sentence. |
| G3 | A local app can integrate by implementing two HTTP routes, with no SDK. |
| G4 | The extension asks for the minimum browser permissions, per site, at the moment they are needed. |
| G5 | The project is easy to audit: small, dependency-light, no remote code. |

## 4. Scope boundaries

Conduit is local-first by design. These keep the product small and trustworthy:

- Everything it handles is data already present in the user's own browser.
- No backend, accounts, analytics or remote configuration.
- No bundled destinations: every sink is added by the user.
- Response bodies (via the debugger API) are evaluated after v1.
- The farming/automation side of any consuming app lives in that app, not here.

## 5. User stories

Priority uses MoSCoW. Milestones are in [ROADMAP.md](ROADMAP.md).

### Export

**US-001 (Must): Export cookies for a site**
- Given I am on a site and have opened Conduit
- When I choose a format (Netscape `cookies.txt`, JSON, or `Cookie:` header string)
- Then I can copy it or download it, and it includes `httpOnly` cookies.

**US-002 (Must): Choose individual cookies**
- Given the cookie list for a site is showing
- When I tick specific cookies
- Then the export contains only those cookies.

**US-003 (Must): Redacted previews**
- Given a value is shown in the UI
- When it is displayed
- Then only the first and last four characters are visible until I click reveal.

### Rules

**US-004 (Must): Create a rule**
- Given I want to share data with a local app
- When I choose what (cookies / headers / storage keys), from which origin, to which destination
- Then Conduit shows one sentence describing the rule and saves it only after I approve it.

**US-005 (Must): Manage rules and the kill switch**
- Given rules exist
- When I disable or delete one, or press the toolbar kill switch
- Then capture and delivery stop immediately, and a fresh install does nothing until a rule exists.

**US-006 (Must): Local capture log**
- Given a rule has captured data
- When I open the log
- Then I see time, rule, size and destination, and can download the log.

**US-007 (Should): Import and export rules**
- Given I receive a rules file
- When I import it
- Then every rule arrives disabled and needs my approval like a hand-made one.

### Sinks

**US-008 (Must): Connect a local app**
- Given a local app is running and implements the contract
- When I add its URL or let Conduit look on loopback ports
- Then I see its name and what it asks for, with its `why` text shown verbatim, and I choose which requests to approve.

**US-009 (Must): Deliver and see the result**
- Given an approved rule has captured data
- When Conduit delivers it to the sink
- Then the delivery is logged, and any answer other than `204` is shown to me rather than retried silently.

**US-010 (Must): Loopback by default, other destinations confirmed**
- Given I add a destination
- When it is `127.0.0.1`, `::1` or `localhost`
- Then no extra step is needed; any other host needs a typed confirmation and stays marked in the UI.

**US-011 (Should): Compatible with simple existing receivers**
- Given a sink that accepts a plain `POST` on its own route
- When I enable that sink's "custom route" option
- Then Conduit posts the data there instead of `/conduit/deliver`.

### Capture kinds

**US-012 (Must): Header capture**
- Given a rule names an origin and specific header names
- When the browser sends or receives matching requests
- Then only those named headers are recorded, never the full request.

**US-013 (Could): Storage reads**
- Given a rule names an origin and storage keys
- When I run it or the page loads
- Then those `localStorage` / `sessionStorage` values are captured.

**US-014 (Could): Derived values**
- Given a rule has an extractor (regex or JSON path)
- When data is captured
- Then the sink receives only the extracted field.

### Experience

**US-015 (Must): Light and dark mode**
- Given any Conduit screen
- When I press the sun/moon toggle
- Then the theme switches and my choice is remembered.

**US-016 (Must): Quiet interface**
- Given a screen with explanatory text
- When I want detail
- Then an info (i) button reveals it; by default the screen stays uncluttered.

**US-017 (Should): Firefox support**
- Given Firefox
- When I install Conduit
- Then US-001 to US-012 work the same.

## 6. Non-functional requirements

- **Privacy:** no network requests other than deliveries the user approved.
- **Permissions:** `cookies`, `webRequest`, `storage`, `alarms`; host access requested per site via `optional_host_permissions`, never `<all_urls>` in the manifest.
- **Reliability:** captures are written to extension storage immediately; delivery retries run from `chrome.alarms` and survive a service-worker restart.
- **Accessibility:** WCAG 2.2 AA, fully keyboard operable, `prefers-reduced-motion` respected.
- **Supply chain:** no remote code; production dependencies kept to a minimum and listed in the README.
- **Performance:** popup interactive in under 200 ms for a site with 200 cookies.

## 7. Success metrics

No telemetry is collected, so metrics are public ones: GitHub stars and downloads,
issues opened, and third-party apps listing Conduit support.

## 8. Assumptions

- A1: Users are comfortable loading an unpacked extension at first (see ADR 0003).
- A2: Chrome and Edge share one build; Firefox follows in milestone 6.
- A3: `webRequest` in observe-only mode is sufficient for header capture under MV3.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Store review of a cookie/header tool is slow | Ship unpacked from GitHub releases first; keep the permission story short and visible |
| Service worker is stopped between events | Persist every capture immediately; alarms for retries |
| Users approve a rule without reading it | One-sentence rule summaries, verbatim `why` text, redacted previews |
| Name clash on stores | Check namespaces before milestone 1 release (open question Q1) |

## 10. Open questions

- Q1: Final public name and store namespaces ("Conduit" is the working name).
- Q2: Brand assets for Conduit are being built; milestone 0 UI work waits on them.
- Q3: Should the log be capped by size or age by default? (Proposal: 1,000 entries.)

## 11. Glossary

| Term | Meaning |
|---|---|
| **Rule** | One approved statement of origin + data + destination. |
| **Sink** | A local HTTP endpoint that receives deliveries. |
| **Handshake** | The `GET /.well-known/conduit` exchange where a sink says who it is and what it wants. |
| **Delivery** | One `POST /conduit/deliver` of captured data to a sink. |
| **Capture** | A value recorded because a rule matched. |
| **Kill switch** | One-click toolbar control that halts capture and delivery. |
