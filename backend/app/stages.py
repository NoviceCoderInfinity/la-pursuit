"""Later stages: signals -> engines -> scenes -> deck -> watch."""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.agent.deck import build_deck, register_watches
from app.agent.signals import collect_signals
from app.engines.core import compute
from app.scenes.build import build_all

if TYPE_CHECKING:
    from app.pipeline import Run

SCENE_ORDER = ["globe", "field", "streams", "chord", "constellation", "truth"]


async def run_later_stages(run: "Run", until: str | None) -> None:
    t = run.tracer
    seed_id = run.seed.company_id if run.seed else None
    run.signals = await collect_signals(run.peers, run.companies, run.client, t, run.ledger, seed_id, run.lens)
    if until == "signals":
        return
    t.start("engines", "Scoring momentum, pull, distress, GTM shift, talent and capital")
    run.engines = compute(run.peers, run.companies, run.signals, run.ledger, run.enrich_ev)
    per = run.engines["per_peer"]
    top = sorted(run.peers, key=lambda p: -(p.momentum or 0))[:3]
    t.done("engines", "Top momentum: " + ", ".join(f"{p.name} {p.momentum:.0f}" for p in top if p.momentum is not None),
           gtm=[p.name for p in run.peers if (per.get(p.id, {}).get("gtm") or {}).get("detected")],
           distressed=[p.name for p in run.peers if (per.get(p.id, {}).get("distress") or 0) >= 30])
    if until == "engines":
        return
    t.start("scenes", "Rendering scenes")
    run.credits_end = await run.client.credits()
    scenes = build_all(run)
    for name in SCENE_ORDER:
        run.scenes[name] = scenes[name]
        t.emit("scene_ready", f"Scene ready: {name}", scene=name, data=scenes[name])
    t.done("scenes", f"{len(SCENE_ORDER)} scenes rendered")
    if until == "scenes":
        return
    t.start("deck", f"Writing the decision deck ({run.lens} lens)")
    run.scenes["deck"] = build_deck(run, run.lens)
    t.emit("scene_ready", "Scene ready: deck", scene="deck", data=run.scenes["deck"])
    t.done("deck", f"{len(run.scenes['deck']['moves'])} moves")
    if until == "deck":
        return
    run.scenes["deck"]["watches"] = await register_watches(run)
    t.emit("scene_ready", "Scene ready: deck", scene="deck", data=run.scenes["deck"])
