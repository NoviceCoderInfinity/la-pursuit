"""Run orchestrator: one Run object per request; stages append to it and emit trace events."""
from __future__ import annotations

import asyncio
import json
import secrets
from datetime import datetime, timezone
from typing import Any

from app.agent.discover import Discovery
from app.agent.enrich import enrich_peers
from app.agent.intent import detect_intent
from app.agent.resolve import resolve_seed
from app.config import settings
from app.crust.client import CrustClient
from app.ledger import Ledger
from app.models import Candidate, Dispute, Intent, Peer
from app.trace import Tracer

STAGES = ["intent", "resolve", "discover", "enrich", "signals", "engines", "scenes", "deck", "watch"]


class Run:
    def __init__(self, query: str, lens: str | None = None, *, use_cache: bool | None = None):
        self.id = "r_" + secrets.token_hex(4)
        self.query, self.lens_override = query, lens
        self.created = datetime.now(timezone.utc).isoformat()
        self.tracer, self.ledger = Tracer(), Ledger()
        self.client = CrustClient(self.ledger, self.tracer, use_cache=use_cache)
        self.intent: Intent | None = None
        self.seed: Candidate | None = None
        self.candidates: list[Candidate] = []
        self.peers: list[Peer] = []
        self.companies: dict[int, dict[str, Any]] = {}
        self.enrich_ev: dict[int, str] = {}
        self.disputes: list[Dispute] = []
        self.signals: dict[str, Any] = {}
        self.engines: dict[str, Any] = {}
        self.scenes: dict[str, Any] = {}
        self.credits_start: float | None = None
        self.credits_end: float | None = None
        self.error: str | None = None
        self.done = False

    @property
    def lens(self) -> str:
        return self.lens_override or (self.intent.lens if self.intent else "founder")

    async def run(self, until: str | None = None) -> "Run":
        t = self.tracer
        try:
            self.credits_start = await self.client.credits()
            self.intent = await detect_intent(self.query, t, self.lens_override)
            if until == "intent": return self._finish()
            self.seed = await resolve_seed(self.intent, self.query, self.client, t)
            if until == "resolve": return self._finish()
            if self.intent.kind == "company" and not self.seed:
                # Honest failure: never build a market around a company we could not find.
                self.error = f"Could not resolve “{self.intent.seed_company_name or self.query}” on the identity graph"
                t.emit("error", self.error, stage="resolve", detail={"suggestion": "Try the company's domain, e.g. acme.ai"})
                return self._finish()
            disc = Discovery(self.intent, self.seed, self.client, t, query=self.query)
            self.peers_cands = await disc.run()
            self.candidates = list(disc.candidates.values())
            if until == "discover": return self._finish()
            self.peers, self.companies, self.enrich_ev, self.disputes = await enrich_peers(
                self.peers_cands, self.client, t, self.ledger)
            if until == "enrich": return self._finish()
            # later stages are attached in app.stages (signals, engines, scenes, deck, watch)
            from app.stages import run_later_stages
            await run_later_stages(self, until)
            return self._finish()
        except Exception as e:  # noqa: BLE001
            self.error = f"{type(e).__name__}: {e}"
            t.emit("error", "Run failed", detail={"error": self.error})
            return self._finish()
        finally:
            if not self.done:
                try:
                    self.credits_end = await self.client.credits()
                except Exception:  # noqa: BLE001
                    pass
                self._finish()

    def _finish(self) -> "Run":
        if self.done:
            return self
        self.done = True
        if not self.peers and not self.error:
            self.error = "No peers could be qualified for this request"
            self.tracer.emit("error", self.error, detail={"hint": "try a market description or a company domain"})
        self.tracer.emit("done", "Run complete", detail={"ledger": len(self.ledger), "peers": len(self.peers)})
        self.tracer.close()
        return self

    async def _close(self) -> None:
        self.credits_end = await self.client.credits()
        await self.client.aclose()

    def report(self) -> dict[str, Any]:
        return {
            "run_id": self.id, "query": self.query, "created": self.created, "lens": self.lens,
            "intent": self.intent.model_dump() if self.intent else None,
            "seed": self.seed.model_dump() if self.seed else None,
            "peers": [p.model_dump() for p in self.peers],
            "candidates": [c.model_dump() for c in self.candidates],
            "disputes": [d.model_dump() for d in self.disputes],
            "scenes": self.scenes,
            "ledger": [e.model_dump() for e in self.ledger.entries()],
            "trace": [e.model_dump() for e in self.tracer.events],
            "credits_used": round(self.credits_start - self.credits_end, 2) if (self.credits_start and self.credits_end) else 0,
            "error": self.error,
        }

    def save(self) -> str:
        p = settings.runs_dir / f"{self.id}.json"
        p.write_text(json.dumps(self.report(), default=str))
        return str(p)
