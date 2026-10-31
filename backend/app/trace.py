"""Live agent trace: a stream of events the UI renders as the agent works."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Literal

from pydantic import BaseModel, Field

EventType = Literal["stage_start", "stage_done", "tool_call", "tool_result", "decision",
                    "scene_ready", "error", "done", "note"]
DecisionKind = Literal["accept", "reject", "widen", "narrow", "retry", "degrade",
                       "disambiguate", "dispute", "fallback"]


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


class Decision(BaseModel):
    kind: DecisionKind
    subject: str
    reason: str


class TraceEvent(BaseModel):
    ts: str = Field(default_factory=_now)
    stage: str
    type: EventType
    label: str
    detail: dict[str, Any] = Field(default_factory=dict)
    decision: Decision | None = None
    scene: str | None = None
    data: Any = None
    ev: list[str] = Field(default_factory=list)


class Tracer:
    def __init__(self) -> None:
        self.events: list[TraceEvent] = []
        self._queues: list[asyncio.Queue[TraceEvent | None]] = []
        self.stage = "init"
        self.closed = False

    def emit(self, type: EventType, label: str, *, stage: str | None = None,
             detail: dict[str, Any] | None = None, decision: Decision | None = None,
             scene: str | None = None, data: Any = None, ev: list[str] | None = None) -> TraceEvent:
        e = TraceEvent(stage=stage or self.stage, type=type, label=label, detail=detail or {},
                       decision=decision, scene=scene, data=data, ev=ev or [])
        self.events.append(e)
        for q in self._queues:
            q.put_nowait(e)
        return e

    def decide(self, kind: DecisionKind, subject: str, reason: str, **kw: Any) -> TraceEvent:
        return self.emit("decision", f"{kind}: {subject}", decision=Decision(kind=kind, subject=subject, reason=reason), **kw)

    def start(self, stage: str, label: str) -> None:
        self.stage = stage
        self.emit("stage_start", label, stage=stage)

    def done(self, stage: str, label: str, data: Any = None, **detail: Any) -> None:
        self.emit("stage_done", label, stage=stage, detail=detail, data=data)

    def close(self) -> None:
        self.closed = True
        for q in self._queues:
            q.put_nowait(None)

    async def subscribe(self, replay: bool = True) -> AsyncIterator[TraceEvent]:
        q: asyncio.Queue[TraceEvent | None] = asyncio.Queue()
        if replay:
            for e in self.events:
                q.put_nowait(e)
        if self.closed:
            q.put_nowait(None)
        self._queues.append(q)
        try:
            while True:
                e = await q.get()
                if e is None:
                    return
                yield e
        finally:
            self._queues.remove(q)
