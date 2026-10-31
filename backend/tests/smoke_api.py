"""End-to-end smoke test against a running server: POST /api/run, stream SSE, fetch report, save fixture.
usage: python tests/smoke_api.py "AI voice agent platforms" [--base http://127.0.0.1:8001] [--fixture ../fixtures/voice_ai.json] [--lens investor]
"""
from __future__ import annotations

import argparse
import json
import socket
import sys
import time

import httpx


def wait_port(host: str, port: int, timeout: float = 30) -> None:
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            with socket.create_connection((host, port), timeout=1):
                return
        except OSError:
            time.sleep(0.5)
    sys.exit(f"server not listening on {host}:{port}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("query")
    ap.add_argument("--base", default="http://127.0.0.1:8001")
    ap.add_argument("--fixture", default=None)
    ap.add_argument("--lens", default=None)
    a = ap.parse_args()
    host, port = a.base.split("//")[1].split(":")
    wait_port(host, int(port))
    t0 = time.time()
    r = httpx.post(f"{a.base}/api/run", json={"query": a.query, "lens": a.lens}, timeout=10)
    r.raise_for_status()
    rid = r.json()["run_id"]
    print(f"run {rid} started in {time.time()-t0:.2f}s (must be < 4s)")
    n_events, scenes, stages = 0, [], []
    with httpx.stream("GET", f"{a.base}/api/run/{rid}/events", timeout=None) as s:
        for line in s.iter_lines():
            if not line.startswith("data:"):
                continue
            e = json.loads(line[5:].strip())
            n_events += 1
            if e["type"] == "stage_done":
                stages.append(e["stage"])
                peers = (e.get("data") or {}).get("peers") if isinstance(e.get("data"), dict) else None
                print(f"  ✓ {e['stage']:<9} {e['label'][:80]}{'  [peers:'+str(len(peers))+']' if peers else ''}")
            elif e["type"] == "scene_ready":
                scenes.append(e["scene"])
            elif e["type"] == "error":
                print("  ✗", e["label"], e.get("detail"))
            elif e["type"] == "done":
                break
    print(f"{n_events} events · stages {stages} · scenes {scenes} · {time.time()-t0:.0f}s")
    rep = httpx.get(f"{a.base}/api/run/{rid}", timeout=60).json()
    print("peers", len(rep["peers"]), "ledger", len(rep["ledger"]), "credits", rep["credits_used"], "error", rep["error"])
    d = rep["scenes"].get("deck", {})
    print("deck", d.get("lens"), [m["title"] for m in d.get("moves", [])])
    print("watches", [(w.get("id"), w.get("status")) for w in d.get("watches", [])])
    for k, v in rep["scenes"].items():
        if k == "deck":
            continue
        sizes = {kk: (len(vv) if isinstance(vv, (list, dict)) else vv) for kk, vv in v.items() if kk in ("nodes", "arcs", "pulses", "timeline", "frames", "peers", "moves", "senior_joins", "edges", "disputes", "claims", "rejected_candidates", "rejected_news", "unplaced")}
        print(f"  {k}: {sizes}")
    ev = rep["ledger"][5]["id"]
    e = httpx.get(f"{a.base}/api/run/{rid}/evidence/{ev}", timeout=30).json()
    print("evidence", ev, e["endpoint"], "raw_bytes", e.get("raw_bytes"))
    for lens in ("investor", "operator", "founder"):
        dk = httpx.post(f"{a.base}/api/run/{rid}/lens", json={"lens": lens}, timeout=60).json()
        print(f"  lens {lens}: {[m['title'][:60] for m in dk['moves']]}")
    if a.fixture:
        with open(a.fixture, "w") as f:
            json.dump(rep, f)
        print("fixture saved", a.fixture, round(len(json.dumps(rep)) / 1e6, 2), "MB")


if __name__ == "__main__":
    main()
