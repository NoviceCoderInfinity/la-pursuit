"""Scene builders: engine output -> the JSON payloads the frontend renders (frontend/lib/types.ts)."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

from app.engines.core import ENG_FUNCS, _growth

if TYPE_CHECKING:
    from app.pipeline import Run

FUNC_MAP = {
    "Engineering": "Engineering", "Research": "Engineering", "Information Technology": "Engineering",
    "Quality Assurance": "Engineering", "Product Management": "Engineering",
    "Sales": "Sales", "Business Development": "Sales",
    "Customer Success and Support": "Customer Success", "Support": "Customer Success",
    "Marketing": "Marketing", "Media and Communication": "Marketing", "Arts and Design": "Marketing",
    "Operations": "Operations", "Administrative": "Operations", "Human Resources": "Operations", "Finance": "Operations",
    "Accounting": "Operations", "Legal": "Operations", "Program and Project Management": "Operations",
}
BANDS = ["Engineering", "Sales", "Customer Success", "Marketing", "Operations", "Other"]


def _peer_index(run: "Run") -> dict[int, Any]:
    return {p.id: p for p in run.peers}


def globe(run: "Run") -> dict[str, Any]:
    geo, talent = run.signals.get("geo", {}), run.engines.get("talent", {})
    nodes, arcs, pulses, unplaced = [], [], [], []
    hq_of: dict[int, tuple[float, float]] = {}
    region_coords: dict[tuple[int, str], tuple[float, float]] = {}
    for p in run.peers:
        g = geo.get(p.id)
        if not g or not g.get("hq"):
            unplaced.append({"peer_id": p.id, "label": p.hq.label or "unknown HQ", "count": p.headcount or 0})
            continue
        hq_of[p.id] = (g["hq"]["lat"], g["hq"]["lng"])
        nodes.append({"peer_id": p.id, "lat": g["hq"]["lat"], "lng": g["hq"]["lng"], "size": p.headcount or 1,
                      "label": g["hq"]["label"], "ev": p.ev[:1]})
        for r in g.get("regions", []):
            region_coords[(p.id, r["label"])] = (r["lat"], r["lng"])
            if abs(r["lat"] - g["hq"]["lat"]) < 0.3 and abs(r["lng"] - g["hq"]["lng"]) < 0.3:
                continue  # same place as HQ
            arcs.append({"peer_id": p.id, "to": {"lat": r["lat"], "lng": r["lng"], "label": r["label"]}, "people": r["count"],
                         "kind": "footprint", "ev": p.ev[:1]})
        for nr in g.get("new_regions", []):
            c = region_coords.get((p.id, nr["label"]))
            if c:
                arcs.append({"peer_id": p.id, "to": {"lat": c[0], "lng": c[1], "label": nr["label"]}, "people": nr["count"],
                             "kind": "expansion", "since": nr["since"], "ev": p.ev[:1]})
        for ctry, jc in (g.get("job_countries") or {}).items():
            pulses.append({"peer_id": p.id, "country": ctry, "lat": jc["lat"], "lng": jc["lng"], "jobs_90d": jc["count"],
                           "ev": [run.signals["jobs"][p.id]["ev"]] if p.id in run.signals.get("jobs", {}) else []})
        for u in g.get("unplaced", []):
            unplaced.append({"peer_id": p.id, "label": u["label"], "count": u["count"]})
    for mv in talent.get("moves", []):
        a, b = hq_of.get(mv["from"]), hq_of.get(mv["to"])
        if a and b and a != b:
            arcs.append({"peer_id": mv["from"], "to_peer_id": mv["to"], "to": {"lat": b[0], "lng": b[1], "label": _peer_index(run)[mv["to"]].name},
                         "people": mv["count"], "kind": "talent", "ev": run.signals.get("moves_ev", [])[:1]})
    # timeline: union of monthly region counts across peers
    by_date: dict[str, list[dict[str, Any]]] = {}
    for p in run.peers:
        g = geo.get(p.id) or {}
        for frame in g.get("timeline", []):
            for label, count in frame["regions"].items():
                c = region_coords.get((p.id, label))
                if c and count:
                    by_date.setdefault(frame["date"], []).append({"peer_id": p.id, "label": label, "lat": c[0], "lng": c[1], "count": count})
    timeline = [{"date": d, "regions": by_date[d]} for d in sorted(by_date)[-24:]]
    return {"nodes": nodes, "arcs": arcs, "pulses": pulses, "timeline": timeline, "unplaced": unplaced}


def field(run: "Run") -> dict[str, Any]:
    per = run.engines["per_peer"]
    now = datetime.now(timezone.utc)
    months = [(now - timedelta(days=30 * k)).strftime("%Y-%m") for k in range(11, -1, -1)]
    frames = []
    for mth in months:
        pts = []
        for p in run.peers:
            cd, m = run.companies.get(p.id), per.get(p.id)
            if not cd or not m:
                continue
            hc_ts = [x for x in (cd.get("headcount") or {}).get("timeseries") or [] if x.get("date", "")[:7] <= mth]
            tr = ((cd.get("web_traffic") or {}).get("domain_traffic") or {})
            tr_ts = [x for x in (next(iter(tr.values()), {}) or {}).get("monthly_visitors_timeseries") or [] if x.get("date", "")[:7] <= mth]
            x = _growth(hc_ts, "employee_count", 6)
            y = _growth(tr_ts, "monthly_visitors", 3)
            if x is None and y is None:
                continue
            pts.append({"peer_id": p.id, "x": None if x is None else round(x, 1), "y": None if y is None else round(y, 1),
                        "size": p.raised_usd or 0, "momentum": m["momentum"], "distress": m["distress"], "pull": m["pull"],
                        "headcount": (hc_ts[-1]["employee_count"] if hc_ts else None)})
        frames.append({"date": mth, "points": pts})
    return {"axes": {"x": "headcount_growth_6m_pct", "y": "traffic_growth_3m_pct", "size": "raised_usd", "color": "momentum"},
            "frames": frames, "weights": run.engines["weights"],
            "ev": {p.id: [per[p.id]["ev"]] if p.id in per and per[p.id].get("ev") else [] for p in run.peers},
            "table": [{"peer_id": p.id, **{k: per[p.id].get(k) for k in ("momentum", "momentum_parts", "momentum_weights", "pull", "pull_parts",
                       "distress", "distress_signals", "hc_growth_6m", "hc_growth_yoy", "traffic_qoq", "followers_qoq", "visitors",
                       "paid_share", "ads_budget", "kw_gained", "kw_lost", "openings", "jobs_90d", "last_round", "last_round_date",
                       "months_since_round", "outlook", "recommend", "revenue_est")}} for p in run.peers if p.id in per]}


def streams(run: "Run") -> dict[str, Any]:
    out = []
    for p in run.peers:
        cd, m = run.companies.get(p.id), run.engines["per_peer"].get(p.id)
        if not cd or not m:
            continue
        series = ((cd.get("headcount") or {}).get("by_function_timeseries") or {}).get("CURRENT_FUNCTION") or {}
        by_date: dict[str, dict[str, int]] = {}
        for func, pts in series.items():
            band = FUNC_MAP.get(func, "Other")
            for x in pts[-24:]:
                d = x["date"][:7]
                by_date.setdefault(d, {b: 0 for b in BANDS})[band] += x.get("employee_count") or 0
        ser = [{"date": d, **by_date[d]} for d in sorted(by_date)]
        jobs = run.signals.get("jobs", {}).get(p.id) or {}
        g = m.get("gtm") or {}
        gtm = {"date": f"{g['since']}-01", "confidence": g["confidence"], "reason": g["reason"]} if g.get("detected") and g.get("since") else None
        ad = m.get("ads_budget") or 0
        out.append({"peer_id": p.id, "series": ser, "jobs_by_category": jobs.get("by_category") or {},
                    "jobs_90d": jobs.get("total_90d"), "recent_titles": jobs.get("titles") or [],
                    # one observation (current monthly budget), repeated so the bar strip reads as a level
                    "ad_budget_series": [{"date": x["date"] + "-01", "usd": ad} for x in ser[-6:]],
                    "ad_budget_usd": ad, "paid_clicks": (cd.get("seo") or {}).get("monthly_paid_clicks"),
                    "gtm_shift": gtm, "gtm": g or None, "ev": [e for e in [m.get("ev"), jobs.get("ev")] if e]})
    return {"peers": out, "bands": BANDS}


def chord(run: "Run") -> dict[str, Any]:
    t = run.engines["talent"]
    evs = run.signals.get("moves_ev", [])
    moves = [{**m, "ev": evs[:2]} for m in t["moves"]]
    joins = [{**j, "from_company": j.get("from_company") or "—", "ev": [j["ev"]] if isinstance(j.get("ev"), str) else (j.get("ev") or [])}
             for j in t["senior_joins"]]
    return {"peers": t["peers"], "ids": t["ids"], "matrix": t["matrix"], "moves": moves,
            "senior_joins": joins, "total_profiles": t["total_profiles"], "ev": evs}


def constellation(run: "Run") -> dict[str, Any]:
    cap = run.engines["capital"]
    pidx = _peer_index(run)
    nodes, edges = [], []
    for r in cap["rows"]:
        p = pidx[r["peer_id"]]
        nodes.append({"id": f"co:{p.id}", "type": "company", "label": p.name, "peer_id": p.id, "size": r["raised_usd"] or 0,
                      "kingmaker": False, "open_slot": False, "acquisitive": r["acquisitive"], "distress": r["distress"],
                      "capital_per_employee": r["capital_per_employee"], "last_round": r["last_round"], "last_round_date": r["last_round_date"],
                      "ev": p.ev[1:2] or p.ev[:1]})
    recent_by_inv: dict[str, bool] = {}
    for e in cap["edges"]:
        if e["recent"]:
            recent_by_inv[e["from"][4:]] = True
    # investors: all kingmakers + up to 6 per company (prefer recent)
    keep: set[str] = set(cap["kingmakers"])
    per_co: dict[int, int] = {}
    for name, info in sorted(cap["investors"].items(), key=lambda kv: (-len(kv[1]["peers"]), not recent_by_inv.get(kv[0], False))):
        for pid in info["peers"]:
            if per_co.get(pid, 0) < 6:
                keep.add(name)
                per_co[pid] = per_co.get(pid, 0) + 1
    for name in keep:
        info = cap["investors"][name]
        nodes.append({"id": f"inv:{name}", "type": "investor", "label": name, "size": len(info["peers"]), "kingmaker": info["kingmaker"],
                      "open_slot": (len(info["peers"]) == 1 and recent_by_inv.get(name, False)), "acquisitive": False, "distress": None,
                      "categories": info.get("categories") or [], "url": info.get("url"), "peers": info["peers"]})
    for e in cap["edges"]:
        if e["from"][4:] in keep:
            edges.append({**e, "ev": pidx[int(e["to"][3:])].ev[1:2]})
    # ensure every kept investor has at least a membership edge
    have = {(e["from"], e["to"]) for e in edges}
    for name in keep:
        for pid in cap["investors"][name]["peers"]:
            if (f"inv:{name}", f"co:{pid}") not in have:
                edges.append({"from": f"inv:{name}", "to": f"co:{pid}", "date": None, "amount_usd": None, "round": None, "recent": False,
                              "attributed": False, "ev": pidx[pid].ev[1:2]})
    return {"nodes": nodes, "edges": edges, "kingmakers": cap["kingmakers"], "pairs": cap["pairs"]}


# ---- Truth lens ------------------------------------------------------------------------------------
NUM = r"(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m|b|million|billion|thousand)?\+?"


def _num(s: str, unit: str | None) -> float:
    v = float(s.replace(",", ""))
    mult = {"k": 1e3, "thousand": 1e3, "m": 1e6, "million": 1e6, "b": 1e9, "billion": 1e9}.get((unit or "").lower(), 1)
    return v * mult


def claims(run: "Run") -> list[dict[str, Any]]:
    src = run.signals.get("claims_source")
    if not src:
        return []
    pid, text, ev = src["peer_id"], src["text"], src["ev"]
    evs = src.get("evs") or [ev]
    cd = run.companies.get(pid) or {}
    p = _peer_index(run)[pid]
    fund = cd.get("funding") or {}
    loc = cd.get("locations") or {}
    hiring = cd.get("hiring") or {}
    invs = [i.lower() for i in (fund.get("investors") or [])]
    amts = [x.get("amount_usd") or 0 for x in fund.get("milestones") or []]
    tot, last = fund.get("total_investment_usd") or 0, fund.get("last_round_amount_usd") or 0
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(claim: str, status: str, note: str, extra: list[str]) -> None:
        key = re.sub(r"\W+", " ", claim.lower()).strip()
        if key in seen or len(out) >= 12:
            return
        seen.add(key)
        out.append({"peer_id": pid, "claim": claim.strip(), "status": status, "note": note, "ev": evs + extra})

    def near(v: float, targets: list[float], tol: float = 0.25) -> bool:
        return any(t and abs(v - t) <= tol * max(v, t) for t in targets)

    # headquarters / based in
    for m in re.finditer(r"\b(?:headquartered|based|located)\s+in\s+([A-Z][A-Za-z.]+(?:\s[A-Z][A-Za-z.]+){0,2})", text):
        city = m.group(1).strip(".")
        hq = " ".join(x for x in [loc.get("city"), loc.get("state"), loc.get("country"), loc.get("headquarters")] if x)
        ok = bool(hq) and city.split()[0].lower() in hq.lower()
        add(m.group(0), "verified" if ok else ("contradicted" if hq else "unverifiable"), f"graph HQ: {loc.get('headquarters') or hq or 'unknown'}", p.ev[:1])
    # hiring
    if re.search(r"\b(we(?:'|’)re|we are)\s+hiring\b|\bjoin (?:our|the) team\b|\bopen (?:roles|positions)\b", text, re.I):
        n = hiring.get("openings_count")
        j90 = (run.signals.get("jobs", {}).get(pid) or {}).get("total_90d")
        ok = (n or 0) > 0 or (j90 or 0) > 0
        add("we're hiring", "verified" if ok else ("contradicted" if n is not None else "unverifiable"),
            "graph: " + ", ".join(x for x in [f"{n} open roles" if n is not None else "", f"{j90} roles added in 90 days" if j90 is not None else ""] if x)
            or "graph has no hiring data", p.ev[:1])
    # team size
    for m in re.finditer(r"(?:team of|we have|we are|we're|our team of|employs?|employing|more than|over|with)\s+" + NUM + r"\s+(employees|people on the team|team members|teammates|engineers|people)", text, re.I):
        v = _num(m.group(1), m.group(2))
        hc = p.headcount or 0
        role = m.group(3).lower()
        if role == "engineers":
            eng = ((cd.get("headcount") or {}).get("by_role_absolute") or {}).get("Engineering")
            ok = bool(eng) and near(v, [eng], 0.4)
            add(m.group(0), "verified" if ok else ("contradicted" if eng else "unverifiable"), f"graph engineering headcount: {eng}", p.ev[:1])
        else:
            ok = bool(hc) and near(v, [hc], 0.4)
            add(m.group(0), "verified" if ok else ("contradicted" if hc else "unverifiable"), f"graph headcount: {hc}", p.ev[:1])
    # funding amounts in either order
    pats = [r"(?:raised|funding of|secured|closed|announc(?:ed|ing))\s+(?:a\s+|an\s+|our\s+)?(?:\$" + NUM + r")",
            r"\$" + NUM + r"\s+(?:in\s+)?(?:series\s+[a-d]|seed|funding|round)",
            r"(?:series\s+[a-d]|seed)\s+(?:round\s+)?(?:of\s+)?\$" + NUM]
    for pat in pats:
        for m in re.finditer(pat, text, re.I):
            v = _num(m.group(1), m.group(2))
            if v < 1e5:
                continue
            ok = near(v, amts + [tot, last])
            add(m.group(0), "verified" if ok else ("contradicted" if (amts or tot) else "unverifiable"),
                f"graph: rounds {', '.join(f'${a/1e6:.0f}M' for a in amts if a) or 'none'}; total ${tot/1e6:.0f}M", p.ev[1:2])
    # investors
    for m in re.finditer(r"(?:backed by|investors include|funded by|investors like|from investors (?:including|like|such as))\s+([A-Z][\w&'.\- ]{2,40}(?:,\s*(?:and\s+)?[A-Z][\w&'.\- ]{2,40}){0,6})", text):
        for n in [x.strip(" .") for x in re.split(r",|\band\b", m.group(1)) if x.strip(" .")][:5]:
            hit = any(n.lower().split()[0] in i for i in invs)
            add(f"backed by {n}", "verified" if hit else ("contradicted" if invs else "unverifiable"),
                "on the graph's investor list" if hit else f"not among {len(invs)} investors on the graph", p.ev[1:2])
    if re.search(r"\bY ?Combinator\b|\bYC\s?[WS]\d\d\b", text) and "y combinator" not in [c["claim"].lower().replace("backed by ", "") for c in out]:
        hit = any("y combinator" in i for i in invs)
        add("Y Combinator company", "verified" if hit else ("contradicted" if invs else "unverifiable"), "YC on investor list" if hit else "YC not on investor list", p.ev[1:2])
    # founded
    for m in re.finditer(r"(?:founded|established|started)\s+in\s+((?:19|20)\d\d)", text, re.I):
        y = int(m.group(1))
        add(m.group(0), "verified" if p.founded == y else ("contradicted" if p.founded else "unverifiable"), f"graph year founded: {p.founded}", p.ev[:1])
    # scale claims the graph cannot measure: keep the largest figure per unit so pricing tiers don't flood the list
    best: dict[str, tuple[float, str]] = {}
    for m in re.finditer(NUM + r"\s+(customers|businesses|companies|enterprises|users|developers|calls|conversations|minutes|countries|languages|integrations|agents deployed)\b", text, re.I):
        v, unit = _num(m.group(1), m.group(2)), m.group(3).lower()
        if v >= 10 and (unit not in best or v > best[unit][0]):
            best[unit] = (v, m.group(0))
    for unit, (v, claim) in best.items():
        add(claim, "unverifiable", "no identity-graph field measures this", [])
    # order: contradicted, verified, unverifiable
    rank = {"contradicted": 0, "verified": 1, "unverifiable": 2}
    out.sort(key=lambda c: rank[c["status"]])
    return out[:10]


def truth(run: "Run") -> dict[str, Any]:
    news = run.signals.get("news", {})
    rejected_news = [{"peer_id": pid, "title": r["title"], "reason": r["reason"]} for pid, v in news.items() for r in v.get("rejected", [])[:3]]
    return {"ledger_count": len(run.ledger), "calls": len(run.ledger.calls()),
            "credits_used": (run.credits_start - run.credits_end) if run.credits_start and run.credits_end else None,
            "disputes": [d.model_dump() for d in run.disputes],
            "claims": claims(run),
            "rejected_candidates": [{"name": c.name, "domain": c.domain, "reason": c.reason} for c in run.candidates if c.status == "rejected"][:40],
            "rejected_news": rejected_news[:30],
            "news": {pid: v.get("kept", []) for pid, v in news.items()},
            "endpoints": sorted({e.endpoint for e in run.ledger.calls()})}


def build_all(run: "Run") -> dict[str, dict[str, Any]]:
    return {"globe": globe(run), "field": field(run), "streams": streams(run), "chord": chord(run),
            "constellation": constellation(run), "truth": truth(run)}
