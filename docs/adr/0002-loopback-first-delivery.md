# 0002. Loopback-first delivery

Status: accepted (pending plan approval) · Date: 2026-10-30

## Context

Conduit moves session data from the browser to other software. Handing it to a
program on the same machine is a different operation from sending it across a
network.

## Options

1. Any destination, treated equally.
2. Loopback by default; other destinations need an extra, typed confirmation and stay marked.
3. Loopback only.

## Decision

Option 2. `127.0.0.1`, `::1` and `localhost` need no extra step. Any other host
requires typing the host name to confirm, and the UI marks it for as long as it
exists. This keeps the common case frictionless and makes the uncommon case
deliberate.

## Consequences

- The sink editor needs a confirmation step and a persistent marker.
- Tests cover host classification, including look-alike names and IPv6 forms.
- No signed handshakes in v1: on loopback the threat model is thin, and a
  half-finished signing scheme is worse than none.
