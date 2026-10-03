#!/usr/bin/env python3
"""Work with feedback notes left through the app's Feedback button.

  python3 tools/feedback.py pull                 copy notes + screenshots from the server into ./feedback
  python3 tools/feedback.py list [--all]         open notes (newest last); --all includes resolved ones
  python3 tools/feedback.py show <id-prefix>     everything about one note (+ screenshot path)
  python3 tools/feedback.py resolve <id-prefix> "what changed" [--state fixed|wontfix|answered]
                                                 mark a note resolved on the server (the app shows it)

Notes written while running serve.py locally land in ./feedback directly.
The server comes from deploy/local.env (DEPLOY_HOST = ssh alias of the Proxmox host, DEPLOY_CT = container id).
"""
import json, os, re, subprocess, sys, tarfile, io
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "feedback"
ENV = Path(__file__).resolve().parent.parent / "deploy" / "local.env"
CONF = dict(os.environ)
if ENV.exists():
    for line in ENV.read_text().splitlines():
        m = re.match(r"^\s*([A-Z_]+)=([^#\s]*)", line)
        if m:
            CONF.setdefault(m.group(1), m.group(2))
HOST, CT = CONF.get("DEPLOY_HOST"), CONF.get("DEPLOY_CT")
REMOTE = "/var/lib/jazz-feedback"
UUID_RE = re.compile(r"^[0-9a-f-]{36}$")


def remote(cmd, data=None):
    if not HOST or not CT:
        sys.exit("Set DEPLOY_HOST and DEPLOY_CT in deploy/local.env (see deploy/local.env.example)")
    return subprocess.run(["ssh", "-o", "BatchMode=yes", HOST, f"pct exec {CT} -- {cmd}"],
                          input=data, capture_output=True, check=True).stdout


def pull():
    blob = remote(f"tar -C {REMOTE} -czf - records status")
    ROOT.mkdir(exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as t:
        t.extractall(ROOT, filter="data")
    print(f"pulled into {ROOT}")
    list_notes(False)


def load():
    notes = []
    for f in sorted((ROOT / "records").glob("*.json")):
        r = json.loads(f.read_text())
        st = ROOT / "status" / f"{r['id']}.json"
        r["_status"] = json.loads(st.read_text()) if st.exists() else {"state": "open"}
        notes.append(r)
    return sorted(notes, key=lambda r: r["createdAt"])


def summary(r):
    el = r.get("element", {}); ctx = r.get("context", {}); p = ctx.get("practice") or {}
    where = el.get("area", "?")
    if el.get("score"):
        s = el["score"]; where += f" bar {s['bar']} beat {s['beat']}"
    elif el.get("label"):
        where += f" {el['label'][:40]}"
    view = ctx.get("view", "")
    if p:
        view += f" bars {p.get('from')}-{p.get('to')} {p.get('hands')} {p.get('mode')} {round(100 * p.get('tempo', 0))}%"
    tags = ",".join(r.get("tags", []))
    return f"{r['id'][:8]}  {r['createdAt'][:16].replace('T', ' ')}  [{r['_status']['state']}] {where} | {view} {('#' + tags) if tags else ''}\n          {r['note'][:200]}"


def list_notes(show_all):
    notes = [r for r in load() if show_all or r["_status"]["state"] == "open"]
    print(f"{len(notes)} {'notes' if show_all else 'open notes'}")
    for r in notes:
        print(summary(r))


def find(prefix):
    hits = [r for r in load() if r["id"].startswith(prefix)]
    if len(hits) != 1:
        sys.exit(f"{len(hits)} notes match {prefix!r}")
    return hits[0]


def show(prefix):
    r = find(prefix)
    print(json.dumps({k: v for k, v in r.items() if not k.startswith("_")}, indent=1, ensure_ascii=False))
    print("status:", r["_status"])
    if r.get("screenshot"):
        print("screenshot:", ROOT / "records" / r["screenshot"])


def resolve(prefix, message, state):
    r = find(prefix)
    if not UUID_RE.match(r["id"]):
        sys.exit("bad id")
    st = {"state": state, "message": message, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    data = json.dumps(st, ensure_ascii=False).encode()
    remote(f"sh -c 'mkdir -p {REMOTE}/status && cat > {REMOTE}/status/{r['id']}.json && chown -R jazzfb:jazzfb {REMOTE}/status'", data)
    (ROOT / "status").mkdir(parents=True, exist_ok=True)
    (ROOT / "status" / f"{r['id']}.json").write_bytes(data)
    print(f"{r['id'][:8]} -> {state}: {message}")


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] in ("-h", "--help"):
        print(__doc__); sys.exit(0)
    if a[0] == "pull": pull()
    elif a[0] == "list": list_notes("--all" in a)
    elif a[0] == "show" and len(a) > 1: show(a[1])
    elif a[0] == "resolve" and len(a) > 2:
        state = a[a.index("--state") + 1] if "--state" in a else "fixed"
        resolve(a[1], a[2], state)
    else:
        print(__doc__); sys.exit(1)
