# 0009. The Public Suffix List decides what a site is

Status: accepted · Date: 2026-11-08

## Context

A rule, a permission prompt and the cookie export all work on a site: a registrable domain such as `example.co.uk`, with its subdomains (ADR 0004). Milestone 1 found it with a short list of country-style suffixes, which got `co.uk` right but treated every `*.github.io` or `*.blogspot.com` page as one site. A rule or a permission for such a site would have covered everyone else's pages on the same suffix.

## Decisions

1. **Use the Public Suffix List**, the list browsers use to decide where a site ends (its ICANN and private sections both). The registrable domain is the public suffix plus one label, by the list's own algorithm: an exception rule wins, otherwise the longest matching rule, and a name no rule matches has a one-label suffix.
2. **Ship the list as data, no dependency.** `scripts/update-public-suffixes.mjs` turns the list into `src/core/cookies/public-suffix-data.ts` (10,406 rules, lower-case ASCII with names converted to punycode, one per line, about 150 KB). The matcher in `public-suffix.ts` is about 60 lines and is tested with the list's own kinds of cases (bare suffixes, wildcards, exceptions) on a small list, and with the shipped list through the site tests. Nothing is fetched while the extension runs; the list is refreshed by running the script and committing the result.
3. **A host that is itself a public suffix is one host.** The site for `https://github.io/` is `github.io` alone, its permission pattern is `*://github.io/*`, and cookies, headers and storage from `alice.github.io` do not belong to it (`hostBelongsToSite`). Localhost, IP addresses and single-label names stay exact as before.
4. **Licence.** The list is under the Mozilla Public License 2.0. The generated file keeps the notice, the version and the commit of the list it came from, and the README's licence section says so. The rest of Conduit stays MIT.

## Consequences

- A rule for `alice.github.io` covers that tenant and its subdomains, not the whole suffix.
- The extension grows by about 150 KB in each bundle that includes site detection (the worker, the popup and the rules page).
- A suffix added to the list after the snapshot is unknown until the next refresh, and is treated as a one-label suffix.
- Existing rules keep working: a rule's site is stored as typed and normalised; a rule saved with an over-wide site (for example `github.io` made before this change) now covers that host only.
