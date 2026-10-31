"""Stage 8-9: Decision Deck (rule-based, cited) per lens + Watchtower registration."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

from app.crust.client import CrustError

if TYPE_CHECKING:
    from app.pipeline import Run


def _fmt_usd(v: float | None) -> str:
    if not v:
        return "undisclosed"
    return f"${v/1e9:.1f}B" if v >= 1e9 else (f"${v/1e6:.0f}M" if v >= 1e6 else f"${v/1e3:.0f}K")


def _people_links(run: "Run", pid: int, limit: int = 3) -> list[dict[str, str]]:
    cd = run.companies.get(pid) or {}
    people = cd.get("people") or {}
    out = []
    for grp in ("founders", "cxos", "decision_makers"):
        for person in people.get(grp) or []:
            bp = person.get("basic_profile") or {}
            pn = person.get("professional_network") or {}
            url = next((v for k, v in pn.items() if isinstance(v, str) and "linkedin.com/in" in v), None)
            if not url:
                continue
            label = f"{bp.get('name')} · {bp.get('current_title') or bp.get('headline') or grp[:-1]}"
            if label not in {o["label"] for o in out}:
                out.append({"label": label, "url": url})
            if len(out) >= limit:
                return out
    return out


def build_deck(run: "Run", lens: str) -> dict[str, Any]:
    per, talent, cap = run.engines["per_peer"], run.engines["talent"], run.engines["capital"]
    pidx = {p.id: p for p in run.peers}
    ranked = sorted((p for p in run.peers if p.id in per and per[p.id]["momentum"] is not None), key=lambda p: -per[p.id]["momentum"])
    seed = next((p for p in run.peers if p.is_seed and p.id in per and per[p.id].get("momentum") is not None), None)
    target = seed or (ranked[0] if ranked else None)
    moves: list[dict[str, Any]] = []

    def mv(title: str, why: str, conf: float, ev: list[str], scene: str, links: list[dict[str, str]] | None = None) -> None:
        moves.append({"title": title, "why": why, "confidence": round(conf, 2), "ev": [e for e in ev if e], "scene": scene, "links": links or []})

    gtm_hits = [p for p in run.peers if (per.get(p.id, {}).get("gtm") or {}).get("detected")]
    distressed = sorted((p for p in run.peers if (per.get(p.id, {}).get("distress") or 0) >= 30 and not p.is_seed),
                        key=lambda p: -per[p.id]["distress"])
    tal = {r["peer_id"]: r for r in talent["peers"]}
    net_winners = sorted(talent["peers"], key=lambda r: -r["net_flow"])
    kingmakers = cap["kingmakers"]

    if lens == "investor" and target:
        m = per[target.id]
        rank = next((i + 1 for i, p in enumerate(ranked) if p.id == target.id), None)
        pull_txt = f"organic pull {m['pull']:.0f}/100" if m.get("pull") is not None else "organic pull unknown"
        verdict = "Strong — dig in" if (m["momentum"] or 0) >= 70 and (m["distress"] or 0) < 30 else ("Pass for now" if (m["distress"] or 0) >= 40 else "Dig deeper")
        mv(f"{verdict}: {target.name} ranks #{rank or '?'} of {len(ranked)} on momentum",
           f"Momentum {m['momentum'] or 0:.0f}/100 (headcount {m['hc_growth_6m'] or 0:+.0f}% in 6 months, traffic {m['traffic_qoq'] or 0:+.0f}% QoQ, "
           f"last round {m['last_round'] or 'n/a'} {m['last_round_date'] or ''}); {pull_txt}; distress {m['distress'] or 0:.0f}/100.",
           0.8 if rank else 0.5, [m.get("ev")] + target.ev, "field", _people_links(run, target.id))
        if ranked:
            rival = next((p for p in ranked if p.id != target.id), None)
            if rival:
                rm = per[rival.id]
                mv(f"Price the competition: {rival.name} is the fastest-moving peer",
                   f"{rival.name} momentum {rm['momentum']:.0f}/100 with {_fmt_usd(rival.raised_usd)} raised and {rival.headcount or '?'} people"
                   f"{' and a GTM shift detected ' + str(rm['gtm'].get('since')) if (rm.get('gtm') or {}).get('detected') else ''}.",
                   0.7, [rm.get("ev")] + rival.ev, "streams" if (rm.get("gtm") or {}).get("detected") else "field")
        if kingmakers:
            inv = kingmakers[0]
            backed = [pidx[i].name for i in cap["investors"][inv]["peers"] if i in pidx]
            mv(f"Syndicate check: {inv} already backs {len(backed)} peers",
               f"{inv} is in {', '.join(backed[:4])}. Expect them in any round here; ask who they would double down on.",
               0.7, [pidx[i].ev[1] for i in cap["investors"][inv]["peers"] if i in pidx and len(pidx[i].ev) > 1][:3], "constellation")
        q = ["What drives the gap between headcount growth and web traffic growth?",
             "Which customers account for the recent hiring in go-to-market roles?",
             "How much of monthly traffic is paid versus earned, and at what CAC?",
             "Who are the senior hires from the last six months and why did they join?",
             "Which peer would you least like to see raise next, and why?"]
        return {"lens": lens, "target_id": target.id, "moves": moves[:3], "diligence_questions": q, "watches": [], "alerts": []}

    if lens == "operator":
        me = seed or (ranked[0] if ranked else None)
        rivals = [p for p in ranked if not me or p.id != me.id]
        if rivals:
            r, rm = rivals[0], per[rivals[0].id]
            mv(f"Threat #1: {r.name} is accelerating fastest",
               f"Momentum {rm['momentum']:.0f}/100: headcount {rm['hc_growth_6m'] or 0:+.0f}% in 6 months, {rm['jobs_90d'] or 0} roles added in 90 days, "
               f"{_fmt_usd(r.raised_usd)} raised{', GTM shift detected since ' + str(rm['gtm']['since']) if (rm.get('gtm') or {}).get('detected') else ''}.",
               0.8, [rm.get("ev")] + r.ev, "field")
        if gtm_hits:
            g = gtm_hits[0]
            gm = per[g.id]["gtm"]
            mv(f"Brace for account competition from {g.name}",
               f"{gm['reason']}. Sales+CS share went {gm['sales_share_then']:.0f}% → {gm['sales_share_now']:.0f}%.",
               gm["confidence"], [per[g.id].get("ev")] + g.ev, "streams")
        # geography: rivals' newest regions
        geo = run.signals.get("geo", {})
        exp = [(p, nr) for p in run.peers for nr in (geo.get(p.id) or {}).get("new_regions", []) if not me or p.id != me.id]
        if exp:
            p, nr = exp[0]
            mv(f"Defend {nr['label']}: {p.name} started hiring there in {nr['since'][:7]}",
               f"{p.name} now has {nr['count']} people in {nr['label']} (new since {nr['since']}). " +
               (f"{len(exp)} new-region moves detected across rivals." if len(exp) > 1 else ""), 0.65, p.ev[:1], "globe")
        leak = [r for r in talent["peers"] if r["net_flow"] < 0 and (not me or r["peer_id"] != me.id)]
        if leak:
            r = sorted(leak, key=lambda x: x["net_flow"])[0]
            p = pidx[r["peer_id"]]
            sent = f"; recommend-to-friend {r['sentiment']*100:.0f}%" if r.get("sentiment") is not None else ""
            mv(f"Recruit from {p.name}: net talent loser in this market",
               f"{r['outflow']} people left {p.name} for peers vs {r['inflow']} joined{sent}. Senior hires there are reachable.",
               0.6, run.signals.get("moves_ev", [])[:1] + p.ev[:1], "chord", _people_links(run, p.id, 2))
        return {"lens": lens, "target_id": me.id if me else None, "moves": moves[:3], "watches": [], "alerts": []}

    # founder lens
    n = len(run.peers)
    funded = [p for p in run.peers if (p.raised_usd or 0) >= 5e6]
    young = [p for p in run.peers if p.founded and p.founded >= datetime.now().year - 3]
    stage = "consolidating" if len(funded) >= n * 0.5 and distressed else ("growing" if len(young) >= n * 0.3 else "nascent" if n < 8 else "established")
    crowd = min(100, int(100 * (0.5 * len(funded) / max(n, 1) + 0.5 * min(n, 15) / 15)))
    mv(f"Market is {stage}: crowdedness {crowd}/100",
       f"{n} qualified peers; {len(funded)} have raised $5M+; {len(young)} founded in the last 3 years; "
       f"{len(distressed)} show distress signals. Total raised {_fmt_usd(sum(p.raised_usd or 0 for p in run.peers))}.",
       0.7, [p.ev[1] for p in run.peers if len(p.ev) > 1][:3], "field")
    if kingmakers:
        inv = kingmakers[0]
        backed = [pidx[i].name for i in cap["investors"][inv]["peers"] if i in pidx]
        open_slots = [n_ for n_, nd in cap["investors"].items() if len(nd["peers"]) == 1]
        mv(f"Pitch {inv} first: they back {len(backed)} peers",
           f"{inv} is in {', '.join(backed[:4])}. {len(kingmakers)} investors have ≥2 bets here; {len(open_slots)} have one bet and room for a second.",
           0.7, [pidx[i].ev[1] for i in cap["investors"][inv]["peers"] if i in pidx and len(pidx[i].ev) > 1][:3], "constellation")
    if distressed:
        d = distressed[0]
        mv(f"Wedge: {d.name}'s customers — it is weakening",
           f"Distress {per[d.id]['distress']:.0f}/100: " + "; ".join(s["text"] for s in per[d.id]["distress_signals"][:3]) + ".",
           0.6, [per[d.id].get("ev")] + d.ev, "field")
    elif ranked:
        top = ranked[0]
        mv(f"Incumbent to avoid head-on: {top.name}",
           f"Momentum {per[top.id]['momentum']:.0f}/100, {top.headcount or '?'} people, {_fmt_usd(top.raised_usd)} raised. Position around it, not against it.",
           0.6, [per[top.id].get("ev")] + top.ev, "field", _people_links(run, top.id, 2))
    return {"lens": lens, "target_id": None, "moves": moves[:3], "watches": [], "alerts": [],
            "market_stage": stage, "crowdedness": crowd}


async def register_watches(run: "Run") -> list[dict[str, Any]]:
    t = run.tracer
    t.start("watch", "Registering Watchtower on every peer")
    domains = [p.domain for p in run.peers if p.domain and p.id in run.companies]
    create = os.getenv("VANTAGE_CREATE_WATCHES", "1") != "0"
    expires = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")
    out: list[dict[str, Any]] = []
    body = {"entities": {"domains": domains},
            "track": {"op": "or", "conditions": [{"field": "headcount.total", "type": "changed"},
                                                 {"field": "funding.num_funding_rounds", "type": "increased"},
                                                 {"field": "hiring.openings_count", "type": "changed"}]},
            "fields": ["basic_info", "headcount", "funding", "hiring"],
            "config": {"trigger": {"type": "interval", "every_hours": 168}, "max_results_per_run": 50, "expires_at": expires},
            "notifications": []}
    try:
        prev, ev = await run.client.watch_company(body, preview=True, label=f"watch/company preview · {len(domains)} peers")
        sample = (prev.get("sample") or [None])[0]
        t.emit("note", f"Preview: {prev.get('resolved')} of {len(domains)} peers resolvable, {len(prev.get('unresolved') or [])} unresolved", ev=[ev])
        rec: dict[str, Any] = {"id": "preview", "kind": "entity", "dataset": "company", "track": "headcount.total changed · funding rounds increased · openings changed",
                               "entities": len(domains), "resolved": prev.get("resolved"), "preview_sample": sample, "status": "preview", "ev": [ev]}
        if create and prev.get("can_create"):
            created, ev2 = await run.client.watch_company(body, preview=False, label="watch/company create")
            rec.update({"id": created.get("id"), "status": created.get("status"), "created_at": created.get("created_at"), "ev": [ev, ev2]})
            t.emit("note", f"Entity watch created: {created.get('id')} ({created.get('status')})", ev=[ev2])
        out.append(rec)
    except CrustError as e:
        t.decide("degrade", "entity watch", e.message)
    # discovery watch: new entrants matching the market definition
    # keywords from the market definition, never the raw query (a company query would yield its own name)
    from app.textutil import tokens
    seed_name = {t for t in tokens(run.seed.name)} if run.seed else set()
    kw = [k for k in sorted(tokens(run.intent.market_description if run.intent else ""), key=len, reverse=True)
          if len(k) > 3 and k not in seed_name][:2]
    if kw:
        dbody = {"filters": {"op": "and", "conditions": [{"field": "basic_info.description", "type": "(.)", "value": " ".join(kw)},
                                                          {"field": "headcount.total", "type": "=>", "value": 10}]},
                 "config": {"trigger": {"type": "interval", "every_hours": 168}, "max_results_per_run": 25, "expires_at": expires},
                 "notifications": []}
        try:
            prev, ev = await run.client.watch_company_discovery(dbody, preview=True, label=f"watch/company/search preview · new entrants “{' '.join(kw)}”")
            rec = {"id": "preview", "kind": "discovery", "dataset": "company", "track": f"new companies matching “{' '.join(kw)}”, headcount ≥ 10",
                   "status": "preview", "preview_sample": (prev.get("sample") or [None])[0] if isinstance(prev, dict) else None, "ev": [ev]}
            if create and isinstance(prev, dict) and prev.get("can_create"):
                created, ev2 = await run.client.watch_company_discovery(dbody, preview=False, label="watch/company/search create")
                rec.update({"id": created.get("id"), "status": created.get("status"), "ev": [ev, ev2]})
            out.append(rec)
        except CrustError as e:
            t.decide("degrade", "discovery watch", e.message)
    t.done("watch", f"{sum(1 for w in out if w.get('id') and w.get('id') != 'preview')} watches live · {len(out)} configured", watches=len(out))
    return out
