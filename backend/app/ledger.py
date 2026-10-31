"""Evidence ledger: every Crustdata call and every number derived from one gets an id."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _snippet(obj: Any, limit: int = 1800) -> Any:
    """Keep a compact, JSON-safe preview of a response for the evidence drawer."""
    s = json.dumps(obj, default=str)
    if len(s) <= limit:
        return obj
    return {"_truncated": True, "_preview": s[:limit] + " …", "_bytes": len(s)}


class EvidenceEntry(BaseModel):
    id: str
    endpoint: str
    params: dict[str, Any] = Field(default_factory=dict)
    ts: str = Field(default_factory=_now)
    credits: float | None = None
    ms: int | None = None
    cached: bool = False
    path: str | None = None          # JSON path inside the response the value came from
    value: Any = None
    snippet: Any = None
    source_ev: str | None = None     # for derived citations: the call this came from
    label: str | None = None


class Ledger:
    def __init__(self) -> None:
        self._entries: dict[str, EvidenceEntry] = {}
        self._n = 0
        self.raw: dict[str, Any] = {}  # full responses, kept in memory for the drawer

    def _next(self) -> str:
        self._n += 1
        return f"ev_{self._n:03d}"

    def record(self, endpoint: str, params: dict[str, Any], response: Any, *,
               ms: int | None = None, cached: bool = False, label: str | None = None,
               credits: float | None = None) -> str:
        ev = self._next()
        self._entries[ev] = EvidenceEntry(
            id=ev, endpoint=endpoint, params=params, ms=ms, cached=cached,
            label=label, credits=credits, snippet=_snippet(response))
        self.raw[ev] = response
        return ev

    def cite(self, source_ev: str, path: str, value: Any, label: str | None = None) -> str:
        """Derive a citation for one value inside an earlier call's response."""
        src = self._entries[source_ev]
        ev = self._next()
        self._entries[ev] = EvidenceEntry(
            id=ev, endpoint=src.endpoint, params=src.params, ts=src.ts, cached=src.cached,
            path=path, value=value, source_ev=source_ev, label=label or src.label,
            snippet={"path": path, "value": value})
        return ev

    def get(self, ev: str) -> EvidenceEntry | None:
        return self._entries.get(ev)

    def entries(self) -> list[EvidenceEntry]:
        return list(self._entries.values())

    def calls(self) -> list[EvidenceEntry]:
        return [e for e in self._entries.values() if e.source_ev is None]

    def __len__(self) -> int:
        return len(self._entries)
