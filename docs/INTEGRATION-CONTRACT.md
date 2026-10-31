# Integration contract (version 1)

Conduit and a local app agree on a small wire format. Any app, in any language, can
implement it in about twenty lines: no SDK, no dependency on Conduit. A complete
example in Python, using only its standard library, is in
[`examples/reference_sink.py`](../examples/reference_sink.py).

## The idea

A **sink** is an app that receives values from Conduit. You add it to Conduit by its
address. The app says who it is and what it would like (the handshake). You choose which
requests to approve; each approved request becomes a rule you can switch off at any time.
When a value changes, Conduit sends it to the app (the delivery).

Nothing an app asks for is active until you approve it.

## 1. Handshake

`GET {sink}/.well-known/conduit`

`{sink}` is the address you added, for example `http://127.0.0.1:8778`. Answer `200` with JSON:

```json
{
  "conduit": 1,
  "name": "My Local App",
  "wants": [
    {
      "id": "session",
      "kind": "cookie",
      "origin": "https://*.example.com",
      "names": ["sid"],
      "why": "The app reads your own account page, and needs your session cookie to do it."
    }
  ]
}
```

| Field            | Meaning                                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conduit`        | Contract version. Always `1`.                                                                                                                                                                      |
| `name`           | What to call the app. Up to 80 characters.                                                                                                                                                         |
| `wants`          | The requests, up to 50. May be empty.                                                                                                                                                              |
| `wants[].id`     | Your id for the request: letters, digits, `.`, `_`, `-`, up to 64 characters, unique in the list. It comes back in every delivery.                                                                 |
| `wants[].kind`   | `cookie` today. `header` and `storage` are reserved for later versions; Conduit shows such requests and says it cannot approve them yet.                                                           |
| `wants[].origin` | The site, as a bare domain or an address; a `*.` prefix is allowed. Conduit works with the main domain and its subdomains, so `https://api.example.com` and `example.com` both mean `example.com`. |
| `wants[].names`  | For `cookie`: the cookie names, up to 50.                                                                                                                                                          |
| `wants[].why`    | **Required.** One or two plain sentences, up to 500 characters. Conduit shows it word for word when you approve the request. A request without one cannot be approved.                             |

The answer should be small: Conduit reads at most 100,000 characters and waits 5 seconds.

## 2. Delivery

`POST {sink}/conduit/deliver` with `Content-Type: application/json`:

```json
{
  "conduit": 1,
  "id": "session",
  "captured_at": "2026-11-01T09:00:00.000Z",
  "origin": "https://www.example.com",
  "data": { "sid": "..." }
}
```

- `id` is the `id` of the request this belongs to.
- `origin` is where the cookie was set: `https` if the cookie is Secure, otherwise `http`.
- `data` holds the cookie that changed. Each change is its own delivery.

Answer **`204 No Content`** when you have it. Anything else counts as a failure.

## 3. When a delivery does not go through

A failure is never hidden. Conduit shows it straight away on its rules page, in its popup
and with a `!` on its toolbar icon, and records it in the delivery log (without the value).
It then tries again automatically, after 30 seconds, 2 minutes, 10 minutes and 30 minutes.
If all of those fail it stops and waits for you to choose **Retry now** or **Discard**.
Pausing capture in Conduit pauses delivery too.

Conduit does not follow redirects, sends no cookies or credentials, and waits 10 seconds
for an answer. Because a value is sent again after a failure, handle repeats gracefully.

## 4. Your own delivery path (optional)

If your app already accepts a plain `POST` on its own path, set that path when you add the
app in Conduit (for example `/api/integrity`). The same JSON body is sent there instead of
`/conduit/deliver`.

## 5. Where the app can be

- **On this computer** (`localhost`, `127.0.0.1`, `::1`): needs nothing extra. `http` is fine.
- **On another computer:** the address must use `https`, and you confirm it by typing its
  host name. Conduit keeps it marked as not on this computer.

Conduit can also look on this computer's ports 8778 to 8787 for an app that answers the
handshake.

## 6. Trying it

```bash
python examples/reference_sink.py --site example.com --names sid
```

Then in Conduit's rules page, under **Local apps**, choose **Look on this computer** (or
**Add app** and enter `http://127.0.0.1:8778`). The example prints the names and sizes of
what it receives, never the values.
