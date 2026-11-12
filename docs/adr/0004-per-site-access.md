# 0004. Per-site access and how a site is defined

Status: accepted · Date: 2026-10-30

## Context

Conduit reads cookies only for sites the person chooses. The browser requires host
permission for every cookie it returns, including cookies set on a parent domain
(a cookie on `.example.com` is sent to `www.example.com`). We need to ask for exactly
as much access as the person's request needs, at the moment they make it, and still
show the cookies they expect to see.

## Options

1. **Declare all sites up front** (`host_permissions`): simple, but every install can read every site. Rejected: it contradicts the goal that a fresh install does nothing.
2. **Ask for the exact host only** (`www.example.com`): the narrowest request, but cookies set on `.example.com` would be filtered out of the list.
3. **Ask for the main domain and its subdomains** (`*://*.example.com/*`), computed from the page address when the person clicks Conduit.

## Decision

Option 3. The manifest lists `*://*/*` only under `optional_host_permissions`, so
nothing is granted at install. When the person opens Conduit on a page (`activeTab`
supplies its address), Conduit works out the site and asks the browser to show its
own permission prompt for that site and its subdomains. The cookie list is
`chrome.cookies.getAll({ domain })`, which matches the same scope. Localhost, IP
addresses and single-label hosts use the exact host.

The main domain comes from the Public Suffix List (see [ADR 0009](0009-public-suffix-list.md);
it began as a short list of country-style suffixes).

## Consequences

- A fresh install can read no website; each site is allowed once, by the person, in the browser's own prompt. (The one standing access is to this computer's loopback address; see the amendment below.)
- Sites on shared suffixes (for example `github.io`) are their own sites, one per tenant; the prompt always shows the exact site being asked for.
- End-to-end tests cannot click the browser's permission prompt, so they use a test build that pre-grants one local test site (`--host-permission`); release builds never do.

## Amendment, 2026-11-12: the loopback address is in the manifest

`host_permissions` holds exactly one entry, `http://127.0.0.1/*`, the address of this computer.

**Why.** Chrome will not register `webRequest` listeners for an extension that holds no host permission at all, and says so as an error on the extension's card ("You need to request host permissions in the manifest file in order to be notified about requests from the webRequest API"). Header rules (ADR 0007) need those listeners registered when the worker starts, so a fresh install with no site raised that error every time. Registering them later, after the first approval, would lose the requests that wake a stopped worker, because only listeners added while the worker first starts are kept for waking it. A test (`tests/e2e/release-build.spec.ts`) loads the release build with Developer mode on and fails if the card has any error.

**What it means.** A fresh install can read no _website_ until the person allows it, as before. It can reach apps on 127.0.0.1 without asking, which is where local apps live and which the person still approves app by app (ADR 0006). A web page served from 127.0.0.1 is the one website Conduit can read from the start. The permission is loopback only: the packaging script refuses a manifest whose `host_permissions` is anything else, and `<all_urls>` is still never in it.

**Rejected:** keeping the manifest empty and accepting the error until the first approval. The error is visible on the card (with Developer mode on, which an unpacked install needs) and header capture would not start until the worker restarted after the first approval.
