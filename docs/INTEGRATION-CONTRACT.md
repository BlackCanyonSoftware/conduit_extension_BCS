# Integration contract (version 1, draft)

Conduit and a local app agree on a small wire format. Any app, in any language,
can implement it in about twenty lines: no SDK, no dependency on Conduit.

## Sink

A **sink** is a local HTTP endpoint you add to Conduit, either by typing its URL
or by letting Conduit look for it on `127.0.0.1` ports.

## 1. Handshake

`GET {sink}/.well-known/conduit`

```json
{
  "conduit": 1,
  "name": "My Local App",
  "wants": [
    {
      "id": "session-header",
      "kind": "header",
      "origin": "https://*.example.com",
      "headers": ["X-Example-Token"],
      "why": "The app needs the token your browser builds to read your own account page."
    }
  ]
}
```

- `kind` is `cookie`, `header` or `storage`.
- `why` is required. Conduit shows it word for word when you approve the request.
- Nothing in `wants` is active until you approve it.

## 2. Delivery

`POST {sink}/conduit/deliver`

```json
{
  "conduit": 1,
  "id": "session-header",
  "captured_at": "2026-10-30T12:00:00Z",
  "origin": "https://www.example.com",
  "data": { "X-Example-Token": "..." }
}
```

The sink answers `204`. Any other answer is shown to you in Conduit rather than
retried silently.

## 3. Custom route (optional)

For a sink that already accepts a plain `POST` on its own path, you can set that
path on the sink in Conduit. The same JSON body is sent there instead of
`/conduit/deliver`.

## 4. Reference sink

A standard-library Python example will live in `examples/reference_sink.py`
(milestone 3). It is the first thing to point Conduit at.
