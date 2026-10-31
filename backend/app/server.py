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
            yield {"data": e.model_dump_json()}
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
