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

The main domain comes from a short list of country-style suffixes for now, with the
Public Suffix List recorded as tech debt in the roadmap.

## Consequences

- A fresh install can read no site; each site is allowed once, by the person, in the browser's own prompt.
- Sites on shared suffixes (for example `github.io`) are over-grouped until the Public Suffix List is added; the prompt always shows the exact site being asked for.
- End-to-end tests cannot click the browser's permission prompt, so they use a test build that pre-grants one local test site (`--host-permission`); release builds never do.
