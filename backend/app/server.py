"""FastAPI + SSE surface (PRD §8.1). Runs execute in the background; the trace streams live."""
from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.agent.deck import build_deck
from app.crust.client import CrustClient
from app.ledger import Ledger
from app.pipeline import Run
from app.trace import Tracer

app = FastAPI(title="Vantage")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
RUNS: dict[str, Run] = {}
TASKS: dict[str, asyncio.Task[Any]] = {}


class RunIn(BaseModel):
    query: str
    lens: str | None = None


class LensIn(BaseModel):
    lens: str


@app.post("/api/run")
async def start_run(body: RunIn) -> dict[str, str]:
    run = Run(body.query.strip(), body.lens)
    RUNS[run.id] = run
    TASKS[run.id] = asyncio.create_task(run.run())
    return {"run_id": run.id}


def _get(run_id: str) -> Run:
    run = RUNS.get(run_id)
    if not run:
        raise HTTPException(404, "run not found")
    return run


@app.get("/api/run/{run_id}/events")
async def events(run_id: str):
    run = _get(run_id)

    async def gen():
        async for e in run.tracer.subscribe():
            # ensure_ascii: U+2028/U+2029 and friends inside company text must not break line-based SSE clients
            yield {"data": json.dumps(e.model_dump(), ensure_ascii=True, default=str)}
            if e.type == "done":
                return
    return EventSourceResponse(gen(), ping=15)


@app.get("/api/run/{run_id}")
async def report(run_id: str) -> dict[str, Any]:
    return _get(run_id).report()


@app.get("/api/run/{run_id}/evidence/{ev_id}")
async def evidence(run_id: str, ev_id: str) -> dict[str, Any]:
    run = _get(run_id)
    e = run.ledger.get(ev_id)
    if not e:
        raise HTTPException(404, "evidence not found")
    d = e.model_dump()
    d["credits"] = d.get("credits") or 0
    d["path"] = d.get("path") or ""
    raw = run.ledger.raw.get(e.source_ev or e.id)
    d["raw_bytes"] = len(json.dumps(raw, default=str)) if raw is not None else None
    return d


@app.post("/api/run/{run_id}/lens")
async def set_lens(run_id: str, body: LensIn) -> dict[str, Any]:
    run = _get(run_id)
    if body.lens not in ("operator", "investor", "founder"):
        raise HTTPException(400, "bad lens")
    run.lens_override = body.lens
    if not run.engines:
        raise HTTPException(409, "run not ready")
    deck = build_deck(run, body.lens)
    deck["watches"] = (run.scenes.get("deck") or {}).get("watches", [])
    run.scenes["deck"] = deck
    return deck


@app.get("/api/run/{run_id}/watch")
async def watch_status(run_id: str) -> list[dict[str, Any]]:
    """Live status of the watches this run registered: the watch object + its runs (baseline first)."""
    run = _get(run_id)
    out: list[dict[str, Any]] = []
    for w in (run.scenes.get("deck") or {}).get("watches", []):
        wid = w.get("id")
        if not wid or wid == "preview":
            out.append({**w, "runs": []})
            continue
        base = f"/watch/company/search/{wid}" if w.get("kind") == "discovery" else f"/watch/company/{wid}"
        try:
            obj, ev1 = await run.client.call("GET", base, None, label=f"watch status #{wid}", cacheable=False)
            runs, ev2 = await run.client.call("GET", f"/watch/company/{wid}/runs", None, label=f"watch runs #{wid}", cacheable=False)
            out.append({**w, "status": obj.get("status", w.get("status")), "last_run_at": obj.get("last_run_at"),
                        "notifications_count": obj.get("notifications_count"), "credits_consumed": obj.get("credits_consumed"),
                        "runs": [{"id": r.get("id"), "status": r.get("status"), "started_at": r.get("started_at"), "completed_at": r.get("completed_at"),
                                  "records_searched": r.get("records_searched"), "records_matched": r.get("records_matched"),
                                  "new_records_count": r.get("new_records_count"), "credits_deducted": r.get("credits_deducted")}
                                 for r in (runs.get("runs") or [])],
                        "ev": (w.get("ev") or []) + [ev1, ev2]})
        except Exception as e:  # noqa: BLE001
            out.append({**w, "runs": [], "error": str(e)[:160]})
    return out


@app.get("/api/credits")
async def credits() -> dict[str, Any]:
    c = CrustClient(Ledger(), Tracer())
    try:
        return {"credits": await c.credits()}
    finally:
        await c.aclose()


@app.get("/api/runs")
async def runs() -> list[dict[str, Any]]:
    return [{"run_id": r.id, "query": r.query, "lens": r.lens, "done": r.done, "peers": len(r.peers), "error": r.error} for r in RUNS.values()]
