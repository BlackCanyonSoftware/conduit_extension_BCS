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
    sinks/       contract types, handshake parsing, loopback check (milestone 3)
    redact.ts    first/last four preview
    extract.ts   regex / JSON-path extractors (milestone 5)
  platform/      thin wrappers over chrome.* / browser.* (the only code that touches them)
  background/    service worker: cookie-change capture, capture now, badge; alarms and delivery queue in milestone 3
  popup/         popup UI: cookies for the active site, rules bar and kill switch
  options/       rules page: rules, approval, log; sinks in milestone 3
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
    string url
    string name
    bool loopback
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
    int bytes
    int status
  }
```

## Delivery flow

```mermaid
sequenceDiagram
  participant B as Browser event
  participant W as Service worker
  participant S as chrome.storage
  participant K as Sink
  B->>W: matching request / cookie change
  W->>W: rule enabled and approved?
  W->>S: write capture immediately
  W->>K: POST /conduit/deliver
  alt 204
    W->>S: log success
  else anything else
    W->>S: log error, show in UI, schedule alarm retry
  end
```

## Cross-cutting

- **Service worker lifetime:** MV3 workers stop when idle, so every capture is persisted before anything else; retries use `chrome.alarms`.
- **Permissions:** host access requested per site at approval time (`optional_host_permissions`).
- **Errors:** specific error types; the UI states what happened and what to do; the log keeps details.
- **Logging:** the delivery log records time, rule, byte count and destination, never the values.
- **Security model:** nothing is captured without an approved rule; imported rules arrive disabled; non-loopback destinations require a typed confirmation; previews are redacted.
- **Configuration:** none remote. Everything ships in the package.

The wire format between Conduit and sinks is in
[INTEGRATION-CONTRACT.md](INTEGRATION-CONTRACT.md).
