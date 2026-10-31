#!/usr/bin/env python3
"""A small Conduit app (a "sink"), using only the Python standard library.

It shows everything an app needs to receive values from Conduit:

  GET  /.well-known/conduit   say who you are and what you would like to receive
  POST /conduit/deliver       receive a value and answer 204 No Content

Run it, then in Conduit's rules page choose "Add app" and enter its address:

    python examples/reference_sink.py --site example.com --names sid
    python examples/reference_sink.py --site example.com --kind header --names x-api-key
    python examples/reference_sink.py --site example.com --kind storage --names session --json-path "$.token"

It listens on this computer only. It prints the names and sizes of what it
receives, never the values, because values are secrets.
"""

import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

MAX_BODY_BYTES = 64 * 1024


def make_handler(args):
    want = {
        "id": args.want_id,
        "kind": args.kind,
        "origin": f"https://*.{args.site}",
        "names": args.names,
        "why": args.why,
    }
    if args.kind == "header":
        want["direction"] = args.direction
    if args.kind == "storage":
        want["area"] = args.area
    if args.json_path:
        want["extract"] = {"type": "jsonpath", "path": args.json_path}
    elif args.pattern:
        want["extract"] = {"type": "regex", "pattern": args.pattern}
    wants = [want]
    failures_left = [args.fail_first]

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path != "/.well-known/conduit":
                self.send_error(404)
                return
            body = json.dumps({"conduit": 1, "name": args.name, "wants": wants}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if self.path != args.route:
                self.send_error(404)
                return
            length = int(self.headers.get("Content-Length", "0"))
            if length > MAX_BODY_BYTES:
                self.send_error(413)
                return
            if failures_left[0] > 0:
                failures_left[0] -= 1
                print("answering 500 on purpose (--fail-first)", flush=True)
                self.send_error(500)
                return
            try:
                message = json.loads(self.rfile.read(length))
                names = sorted(message["data"])
                print(
                    f"received {message['id']} from {message['origin']}: "
                    f"{', '.join(names)} ({length} bytes)",
                    flush=True,
                )
            except (ValueError, KeyError, TypeError):
                self.send_error(400)
                return
            self.send_response(204)
            self.end_headers()

        def log_message(self, *_):
            pass  # keep the output to the lines above

    return Handler


def main():
    parser = argparse.ArgumentParser(description="A small Conduit app for trying things out.")
    parser.add_argument("--port", type=int, default=8778, help="port to listen on (0 picks one)")
    parser.add_argument("--name", default="Reference app", help="name shown in Conduit")
    parser.add_argument("--site", default="example.com", help="site whose data to ask for")
    parser.add_argument(
        "--kind",
        choices=["cookie", "header", "storage"],
        default="cookie",
        help="what to ask for",
    )
    parser.add_argument(
        "--direction",
        choices=["request", "response"],
        default="request",
        help="for headers: the ones the browser sends or the ones it gets back",
    )
    parser.add_argument(
        "--area",
        choices=["local", "session"],
        default="local",
        help="for storage: localStorage or sessionStorage",
    )
    parser.add_argument("--json-path", help="ask for only this field of a JSON value, such as $.token")
    parser.add_argument("--pattern", help="ask for only what this regular expression matches")
    parser.add_argument("--names", nargs="+", default=["sid"], help="cookie or header names to ask for")
    parser.add_argument("--want-id", default="session", help="id of the request")
    parser.add_argument(
        "--why",
        default="This example app shows what it receives, so you can see how Conduit works.",
        help="the reason shown to you before you approve the request",
    )
    parser.add_argument("--route", default="/conduit/deliver", help="path that receives values")
    parser.add_argument("--fail-first", type=int, default=0, help="answer 500 this many times")
    args = parser.parse_args()

    server = HTTPServer(("127.0.0.1", args.port), make_handler(args))
    print(f"listening on http://127.0.0.1:{server.server_address[1]}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
