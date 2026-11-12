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
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

MAX_BODY_BYTES = 64 * 1024

# Conduit's "Look on this computer" checks these ports, so with no --port the app takes the first free one.
PORTS = range(8778, 8788)


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


class Server(HTTPServer):
    # On Windows, address reuse lets a second copy bind a port the first is already using, so it
    # would sit there receiving nothing. Elsewhere reuse only skips the wait after a restart.
    allow_reuse_address = os.name != "nt"


def open_server(args):
    """Listens on the port asked for, or on the first free one in PORTS."""
    ports = [args.port] if args.port is not None else list(PORTS)
    handler = make_handler(args)
    for port in ports:
        try:
            return Server(("127.0.0.1", port), handler)
        except OSError as error:  # an address in use, or one Windows keeps back, is an OSError
            reason = error.strerror or str(error)
            print(f"port {port} is not free ({reason}); another program is using it.", flush=True)
    if args.port is not None:
        raise SystemExit(f"Try another port, for example: --port {PORTS[-1]}")
    raise SystemExit(
        f"No free port from {PORTS[0]} to {PORTS[-1]}. Free one of them, or choose a port "
        "with --port N (add the app in Conduit by its address; 'Look on this computer' only checks those ports)."
    )


def main():
    parser = argparse.ArgumentParser(description="A small Conduit app for trying things out.")
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="port to listen on (0 picks any); by default the first free one from 8778 to 8787",
    )
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

    server = open_server(args)
    print(f"listening on http://127.0.0.1:{server.server_address[1]}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
