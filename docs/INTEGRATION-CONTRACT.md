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

| Field               | Meaning                                                                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conduit`           | Contract version. Always `1`.                                                                                                                                                                      |
| `name`              | What to call the app. Up to 80 characters.                                                                                                                                                         |
| `wants`             | The requests, up to 50. May be empty.                                                                                                                                                              |
| `wants[].id`        | Your id for the request: letters, digits, `.`, `_`, `-`, up to 64 characters, unique in the list. It comes back in every delivery.                                                                 |
| `wants[].kind`      | `cookie`, `header` or `storage`. Any other kind is shown to the person with a note that Conduit cannot approve it.                                                                                 |
| `wants[].origin`    | The site, as a bare domain or an address; a `*.` prefix is allowed. Conduit works with the main domain and its subdomains, so `https://api.example.com` and `example.com` both mean `example.com`. |
| `wants[].names`     | For `cookie`: the cookie names, up to 50. For `header`: the header names, up to 50. Header names are not case sensitive; Conduit shows and delivers them in lower case.                            |
| `wants[].area`      | For `storage` only: `local` (localStorage; the default) or `session` (sessionStorage). For `storage`, `names` are the keys, which are case sensitive.                                              |
| `wants[].extract`   | Optional, any kind. Keep only part of each value: `{ "type": "regex", "pattern": "id=(\\d+)" }` (the first group, or the whole match) or `{ "type": "jsonpath", "path": "$.user.token" }`.         |
| `wants[].direction` | For `header` only: `request` (what the browser sends; the default) or `response` (what it gets back).                                                                                              |
| `wants[].why`       | **Required.** One or two plain sentences, up to 500 characters. Conduit shows it word for word when you approve the request. A request without one cannot be approved.                             |

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
- `origin` is where the cookie was set (`https` if the cookie is Secure, otherwise `http`), or, for a header, the scheme, host and port of the request.
- `data` holds the cookie that changed, or the header that was seen, for example `{ "authorization": "..." }` (names in lower case). Each change is its own delivery. Only the headers named in the approved request are ever read; a header that appears twice in one message arrives as one value joined with `, `.

A header or storage value is delivered when it is new: the same value seen again is not sent again.

### Extractors

When a request has an `extract`, the app receives only what it keeps, in the same `data` field, under the same name. Conduit shows the extractor in the sentence the person approves (for example "keeping only the field $.user.token"). If the extractor finds nothing in a value (the pattern does not match, the value is not JSON, the field is missing), that value is not captured at all.

- **`regex`**: a JavaScript regular expression, up to 200 characters. With a group in brackets the first group is kept, otherwise the whole match. Back-references and a repeated repeat such as `(a+)+` are refused, and values over 20,000 characters are not matched.
- **`jsonpath`**: `$.a.b`, `$.list[0]`, `$['a key']`. A string is kept as it is, a number or boolean as text, an object or list as JSON text.

### Storage requests

For a `storage` request Conduit reads the named keys of the page's localStorage or sessionStorage (top frame only) when a page on that site finishes loading, and when the person presses "Capture now". `origin` in the delivery is the page's scheme, host and port.

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
