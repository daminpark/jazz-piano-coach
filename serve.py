#!/usr/bin/env python3
"""Serve the jazz piano coach on http://localhost:8643 and open it in Chrome.

Web MIDI needs a secure context, which includes localhost, so this works with a USB/Bluetooth keyboard.
Feedback notes sent from the app are saved under ./feedback (same API as the server).
Usage:  python3 serve.py          (Ctrl+C to stop)
"""
import http.server, json, os, socketserver, subprocess, sys, threading, webbrowser

PORT = int(os.environ.get("PORT", 8643))
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
sys.path.insert(0, os.path.join(HERE, "server"))
from feedback_api import api_route  # noqa: E402

FEEDBACK_DIR = os.environ.get("CLAIR_FEEDBACK_DIR", os.path.join(HERE, "feedback"))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith("/api/") or self.path == "/healthz":
            if api_route(self, FEEDBACK_DIR):
                return
        if self.path.split("?")[0] == "/version.json":
            return self.send_version()
        super().do_GET()

    def send_version(self):
        def git(*args):
            try:
                return subprocess.run(["git", *args], cwd=HERE, capture_output=True, text=True, timeout=3).stdout.strip()
            except (OSError, subprocess.SubprocessError):
                return ""
        body = json.dumps({"commit": git("rev-parse", "--short", "HEAD") or "local", "dirty": bool(git("status", "--porcelain"))}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if not api_route(self, FEEDBACK_DIR):
            self.send_error(404)

    def log_message(self, *args):
        pass


def open_browser():
    url = f"http://localhost:{PORT}/"
    if sys.platform == "darwin" and "--no-open" not in sys.argv:
        for app in ("Google Chrome", "Microsoft Edge", "Brave Browser"):
            if subprocess.call(["open", "-Ra", app], stderr=subprocess.DEVNULL) == 0:
                subprocess.call(["open", "-a", app, url]); return
    if "--no-open" not in sys.argv:
        webbrowser.open(url)


socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"Clair de Lune coach running at http://localhost:{PORT}/  (Ctrl+C to stop)")
    threading.Timer(0.6, open_browser).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
