# Architecture

## Stack and rationale

| Choice                            | Why                                                       | Alternative considered                                |
| --------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| TypeScript (`strict`)             | Types for browser-API payloads and the sink contract      | Plain JavaScript (fewer tools, weaker guarantees)     |
| esbuild                           | One small dependency, fast, easy to read the output       | Vite/WXT (more features than a small extension needs) |
| Vanilla DOM for popup and options | Few moving parts to audit                                 | Preact/Svelte (more dependencies)                     |
| Vitest                            | Fast unit tests that share the esbuild toolchain          | Jest                                                  |
| Playwright                        | Loads the real extension in Chromium for end-to-end tests | Puppeteer                                             |
| Brand template CSS                | Shared Black Canyon look and tested contrast              | Hand-written styles                                   |

See [ADR 0001](adr/0001-stack.md).

## Context

```mermaid
flowchart LR
  user([You]) --> ext[Conduit extension]
  browser[(Your browser: cookies, headers, storage)] --> ext
  ext -->|approved rules only| sink[Local app / sink]
  ext --> files[(Downloaded files)]
```

## Containers

```mermaid
flowchart TB
  subgraph Extension
    popup[Popup UI]
    options[Options UI]
    sw[Service worker]
    cs[Content script: storage reads]
    store[(chrome.storage.local)]
  end
  popup --> sw
  options --> sw
  cs --> sw
  sw --> store
  sw -->|fetch, approved sinks| sink[Local sink]
```

## Folder structure

```
src/
  core/          pure logic, no browser APIs (unit-tested)
    cookies/     formats: netscape, json, header string; selection
    rules/       rule model and status, one-sentence summary, validation, import/export
    capture.ts   matching, duplicate-skipping captures, the capped log
    sinks/       address and loopback rules, handshake reader, delivery queue and retry schedule
    redact.ts    first/last four preview
    extract.ts   regex / JSON-path extractors (milestone 5)
  platform/      thin wrappers over chrome.* / browser.* (the only code that touches them)
  background/    service worker: cookie-change capture, delivery queue and retries (alarms), badge
  popup/         popup UI: cookies for the active site, rules bar and kill switch
  options/       rules page: rules, approval, local apps, delivery log, capture log
  ui/            helpers shared by the pages: DOM builder, download, info toggle, theme button, shared.css
  content/       storage-reading content script (milestone 5)
  theme/         brand template CSS bundled from the brand kit (generated)
examples/        reference sink (Python, standard library only)
tests/           unit, e2e
docs/            this folder
```

Rule: `core/` imports nothing from `platform/`. Browser APIs sit behind small
interfaces so tests use fakes.

## Data model

```mermaid
erDiagram
  RULE ||--o{ CAPTURE : produces
  SINK ||--o{ RULE : receives
  RULE ||--o{ PENDING : queues
  RULE ||--o{ DELIVERY : logs
  RULE {
    string id
    string kind "cookie now; header and storage later"
    string site "main domain, subdomains included"
    string[] names
    string destination "log now; a sink in milestone 3"
    bool enabled
    datetime createdAt
    datetime approvedAt "set only by the person approving"
  }
  SINK {
    string id
    string url "base address, no trailing slash"
    string name "from the handshake"
    bool loopback
    datetime confirmedAt "typed host name, for other computers"
    string route "own delivery path, optional"
  }
  PENDING {
    string id
    string ruleId
    string sinkId
    map data "name to value, until delivered"
    int attempts
    datetime nextAttemptAt
    bool gaveUp
  }
  CAPTURE {
    string ruleId
    datetime at
    string ruleText "the rule as it read then"
    map data "name to value"
    int bytes
  }
  DELIVERY {
    string ruleId
    datetime at
    string sinkName
    int bytes
    string result "delivered | retrying | failed, never the value"
  }
```

## Delivery flow

```mermaid
sequenceDiagram
  participant B as Browser (cookie change)
  participant W as Service worker
  participant S as chrome.storage
  participant A as Alarm
  participant K as Sink (app)
  B->>W: cookie set or changed
  W->>W: rule active, changed since last sent?
  W->>S: queue the delivery (holds the value)
  W->>K: POST /conduit/deliver
  alt 204
    W->>S: remove from queue, log "delivered" (no value)
  else anything else
    W->>S: keep in queue, log "retrying" (no value)
    W->>A: wake at the next retry time
    A->>W: alarm (worker may have been stopped)
    W->>K: POST again
  end
```

Retries run 30 seconds, 2, 10 and 30 minutes after each failure; then the delivery waits for
the person (Retry now or Discard). While capture is paused nothing is sent and nothing is dropped.

## Cross-cutting

- **Service worker lifetime:** MV3 workers stop when idle, so every capture is persisted before anything else; retries use `chrome.alarms`.
- **Permissions:** host access requested per site at approval time (`optional_host_permissions`).
- **Errors:** specific error types; the UI states what happened and what to do; the log keeps details.
- **Logging:** the delivery log records time, rule, byte count and destination, never the values.
- **Security model:** nothing is captured without an approved rule; imported rules arrive disabled; non-loopback destinations require a typed confirmation; previews are redacted.
- **Configuration:** none remote. Everything ships in the package.

The wire format between Conduit and sinks is in
[INTEGRATION-CONTRACT.md](INTEGRATION-CONTRACT.md).
