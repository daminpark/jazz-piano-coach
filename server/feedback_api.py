#!/usr/bin/env python3
"""Feedback API for the jazz piano coach (stdlib only).

  POST /api/feedback              save a note (+ optional JPEG screenshot) -> {"id": ...}
  GET  /api/feedback/status?ids=  status of your own notes, by id ("open" unless resolved)
  GET  /healthz

Storage (CLAIR_FEEDBACK_DIR, default ./feedback):
  records/<id>.json   the note, picked element and app context
  records/<id>.jpg    screenshot of the picked area (optional)
  status/<id>.json    written when a note is resolved (tools/feedback.py resolve)

Run standalone:  CLAIR_FEEDBACK_DIR=/var/lib/clair-feedback PORT=8090 python3 feedback_api.py
serve.py imports api_route() so local development gets the same endpoints.
"""
import base64, json, os, re, uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

MAX_BODY = 5 * 1024 * 1024
MAX_IMAGE = 3 * 1024 * 1024
MAX_META = 64 * 1024
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
DATA_URL_RE = re.compile(r"^data:image/(jpeg|png);base64,([A-Za-z0-9+/=]+)$")


def _reply(h, code, obj):
    body = json.dumps(obj).encode()
    h.send_response(code)
    h.send_header("Content-Type", "application/json")
    h.send_header("Cache-Control", "no-store")
    h.send_header("Content-Length", str(len(body)))
    h.end_headers()
    h.wfile.write(body)
    return True


def _clean_tags(tags):
    if not isinstance(tags, list):
        return []
    return [str(t)[:40] for t in tags[:6] if isinstance(t, (str, int))]


def _bounded(obj, name):
    if obj is None:
        return {}
    if not isinstance(obj, dict):
        raise ValueError(f"{name} must be an object")
    if len(json.dumps(obj)) > MAX_META:
        raise ValueError(f"{name} too large")
    return obj


def save_feedback(payload, root):
    note = payload.get("note")
    if not isinstance(note, str) or not note.strip():
        raise ValueError("note is required")
    if len(note) > 5000:
        raise ValueError("note too long (5000 characters max)")
    record = {
        "id": str(uuid.uuid4()),
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "note": note.strip(),
        "tags": _clean_tags(payload.get("tags")),
        "element": _bounded(payload.get("element"), "element"),
        "context": _bounded(payload.get("context"), "context"),
        "screenshot": None,
    }
    image = None
    shot = payload.get("screenshot")
    if shot:
        m = DATA_URL_RE.match(shot) if isinstance(shot, str) else None
        if not m:
            raise ValueError("screenshot must be a base64 JPEG/PNG data URL")
        image = base64.b64decode(m.group(2), validate=True)
        if len(image) > MAX_IMAGE:
            raise ValueError("screenshot too large")
        record["screenshot"] = f"{record['id']}.{'jpg' if m.group(1) == 'jpeg' else 'png'}"
    records = Path(root) / "records"
    records.mkdir(parents=True, exist_ok=True)
    if image:
        (records / record["screenshot"]).write_bytes(image)
    tmp = records / f".{record['id']}.json.tmp"
    tmp.write_text(json.dumps(record, ensure_ascii=False, indent=1))
    tmp.replace(records / f"{record['id']}.json")
    return record


def read_statuses(ids, root):
    out = {}
    for i in ids[:100]:
        if not UUID_RE.match(i):
            continue
        p = Path(root) / "status" / f"{i}.json"
        if p.exists():
            try:
                out[i] = json.loads(p.read_text())
            except ValueError:
                out[i] = {"state": "open"}
        elif (Path(root) / "records" / f"{i}.json").exists():
            out[i] = {"state": "open"}
    return out


def api_route(h, root):
    """Handle /api/feedback* and /healthz on a BaseHTTPRequestHandler. Returns False if not ours."""
    url = urlparse(h.path)
    if h.command == "GET" and url.path == "/healthz":
        return _reply(h, 200, {"ok": True})
    if h.command == "GET" and url.path == "/api/feedback/status":
        ids = ",".join(parse_qs(url.query).get("ids", [""])).split(",")
        return _reply(h, 200, read_statuses([i.strip() for i in ids if i.strip()], root))
    if url.path == "/api/feedback":
        if h.command != "POST":
            return _reply(h, 405, {"error": "POST only"})
        try:
            length = int(h.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            return _reply(h, 413, {"error": "body missing or too large"})
        try:
            payload = json.loads(h.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("expected a JSON object")
            rec = save_feedback(payload, root)
        except (ValueError, base64.binascii.Error) as e:
            return _reply(h, 400, {"error": str(e)})
        return _reply(h, 201, {"id": rec["id"], "createdAt": rec["createdAt"]})
    return False


class Handler(BaseHTTPRequestHandler):
    root = os.environ.get("CLAIR_FEEDBACK_DIR", "feedback")

    def do_GET(self):
        if not api_route(self, self.root):
            _reply(self, 404, {"error": "not found"})

    def do_POST(self):
        if not api_route(self, self.root):
            _reply(self, 404, {"error": "not found"})

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8090))
    Path(Handler.root, "records").mkdir(parents=True, exist_ok=True)
    Path(Handler.root, "status").mkdir(parents=True, exist_ok=True)
    print(f"feedback api on 127.0.0.1:{port}, data in {Handler.root}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
