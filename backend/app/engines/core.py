"""Engines: pure functions over (peers, companies, signals) -> per-peer metrics with evidence."""
from __future__ import annotations

import math
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from app.ledger import Ledger
from app.models import Peer

SALES_FUNCS = {"Sales", "Business Development", "Customer Success and Support", "Support"}
ENG_FUNCS = {"Engineering", "Research", "Information Technology", "Quality Assurance", "Product Management"}
SALES_JOB_CATS = re.compile(r"sales|revenue|go-to-market|gtm|account|customer success|post sales|growth|partnerships|business development", re.I)
ENG_JOB_CATS = re.compile(r"engineering|product|research|applied ai|r&d|data|technical|design", re.I)
WEIGHTS = {"headcount": 0.30, "hiring": 0.20, "traffic": 0.20, "followers": 0.10, "funding": 0.20}


def _pct_rank(values: dict[int, float | None]) -> dict[int, float | None]:
    """Percentile rank 0..100 across peers (None stays None)."""
    vals = sorted(v for v in values.values() if v is not None)
    out: dict[int, float | None] = {}
    for k, v in values.items():
        if v is None or not vals:
            out[k] = None
        else:
            below = sum(1 for x in vals if x < v)
            eq = sum(1 for x in vals if x == v)
            out[k] = 100.0 * (below + 0.5 * eq) / len(vals)
    return out


def _months_since(date: str | None) -> float | None:
    if not date:
        return None
    try:
        d = datetime.fromisoformat(date[:10]).replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    return (datetime.now(timezone.utc) - d).days / 30.4


def _growth(series: list[dict[str, Any]], key: str, months: int) -> float | None:
    pts = [(x.get("date", "")[:10], x.get(key)) for x in series if x.get(key) is not None]
    if len(pts) < 2:
        return None
    last_d, last_v = pts[-1]
    target = (datetime.fromisoformat(last_d) - timedelta(days=30 * months)).strftime("%Y-%m-%d")
    base = next(((d, v) for d, v in pts if d >= target), pts[0])
    if base[1] in (0, None):
        return None
    return 100.0 * (last_v - base[1]) / base[1]


def _traffic(cd: dict[str, Any]) -> dict[str, Any] | None:
    dt = ((cd.get("web_traffic") or {}).get("domain_traffic") or {})
    return next(iter(dt.values()), None) if dt else None


def compute(peers: list[Peer], companies: dict[int, dict[str, Any]], signals: dict[str, Any], ledger: Ledger,
            enrich_ev: dict[int, str]) -> dict[str, Any]:
    ids = [p.id for p in peers if p.id in companies]
    raw: dict[str, dict[int, float | None]] = {k: {} for k in ("hc_growth", "hiring", "traffic", "followers", "fund_recency",
                                                               "organic", "kw_net", "per_emp_traffic", "paid_share")}
    per: dict[int, dict[str, Any]] = {}
    now = datetime.now(timezone.utc)
    for p in peers:
        cd = companies.get(p.id)
        if not cd:
            continue
        ev = enrich_ev.get(p.id)
        hc, hiring, fund, seo, fol, rev = (cd.get("headcount") or {}, cd.get("hiring") or {}, cd.get("funding") or {},
                                           cd.get("seo") or {}, cd.get("followers") or {}, cd.get("employee_reviews") or {})
        tr = _traffic(cd) or {}
        gp = hc.get("growth_percent") or {}
        hc_g = gp.get("six_months") if gp.get("six_months") is not None else _growth(hc.get("timeseries") or [], "employee_count", 6)
        jobs = signals.get("jobs", {}).get(p.id) or {}
        oj = hiring.get("open_jobs_timeseries") or []
        hiring_v = None
        if oj:
            recent = [x.get("open_jobs") or 0 for x in oj[-3:]]
            prior = [x.get("open_jobs") or 0 for x in oj[-6:-3]] or [0]
            hiring_v = (sum(recent) / len(recent)) - (sum(prior) / len(prior))
            # relative to headcount so a 10-person company's 3 roles counts
            hiring_v = 100.0 * hiring_v / max(p.headcount or 1, 1)
        traffic_g = tr.get("qoq_pct")
        fol_g = fol.get("qoq_percent")
        ms = _months_since(fund.get("last_fundraise_date"))
        fund_recency = None if ms is None else max(0.0, 36 - ms)
        visitors = tr.get("monthly_visitors")
        paid_share = tr.get("source_paid_referral_pct")
        organic_share = None if paid_share is None else 100 - paid_share
        kw_net = None
        if seo.get("gained_ranked_seo_keywords") is not None and seo.get("lost_ranked_seo_keywords") is not None:
            kw_net = (seo["gained_ranked_seo_keywords"] - seo["lost_ranked_seo_keywords"]) / max(seo.get("total_organic_results") or 1, 1) * 100
        per_emp = None if not visitors or not p.headcount else math.log1p(visitors / max(p.headcount, 1))
        raw["hc_growth"][p.id], raw["hiring"][p.id], raw["traffic"][p.id] = hc_g, hiring_v, traffic_g
        raw["followers"][p.id], raw["fund_recency"][p.id] = fol_g, fund_recency
        raw["organic"][p.id], raw["kw_net"][p.id], raw["per_emp_traffic"][p.id], raw["paid_share"][p.id] = organic_share, kw_net, per_emp, paid_share
        per[p.id] = {
            "hc_growth_6m": hc_g, "hc_growth_yoy": gp.get("yoy"), "hiring_velocity": hiring_v, "traffic_qoq": traffic_g,
            "followers_qoq": fol_g, "months_since_round": ms, "last_round": fund.get("last_round_type"),
            "last_round_date": fund.get("last_fundraise_date"), "raised_usd": fund.get("total_investment_usd"),
            "visitors": visitors, "paid_share": paid_share, "ads_budget": seo.get("monthly_google_ads_budget"),
            "kw_gained": seo.get("gained_ranked_seo_keywords"), "kw_lost": seo.get("lost_ranked_seo_keywords"),
            "openings": hiring.get("openings_count"), "jobs_90d": jobs.get("total_90d"),
            "outlook": rev.get("business_outlook_rating"), "recommend": rev.get("recommend_to_friend_rating"),
            "ceo_rating": (rev.get("company_ceo") or {}).get("ceo_rating"),
            "overall_rating": (rev.get("overall_rating") or {}).get("rating"),
            "revenue_est": (cd.get("revenue") or {}).get("estimated") or {},
            "ev": ev,
        }

    ranks = {k: _pct_rank(v) for k, v in raw.items()}
    for pid in ids:
        comp = {"headcount": ranks["hc_growth"][pid], "hiring": ranks["hiring"][pid], "traffic": ranks["traffic"][pid],
                "followers": ranks["followers"][pid], "funding": ranks["fund_recency"][pid]}
        avail = {k: v for k, v in comp.items() if v is not None}
        wsum = sum(WEIGHTS[k] for k in avail) or 1
        momentum = sum(WEIGHTS[k] * v for k, v in avail.items()) / wsum if avail else None
        # size adjustment: a 12-person company doubling is not the same signal as a 400-person one
        hc = next((p.headcount for p in peers if p.id == pid), None) or 0
        size_conf = 0.6 + 0.4 * min(1.0, math.log1p(hc) / math.log1p(50))
        momentum = None if momentum is None else momentum * size_conf
        used_w = {k: round(WEIGHTS[k] / wsum, 2) for k in avail}
        per[pid]["size_confidence"] = round(size_conf, 2)
        pull_parts = {"organic_share": ranks["organic"][pid], "keyword_net": ranks["kw_net"][pid], "traffic_per_employee": ranks["per_emp_traffic"][pid],
                      "traffic_growth": ranks["traffic"][pid]}
        pa = [v for v in pull_parts.values() if v is not None]
        pull = sum(pa) / len(pa) if pa else None
        per[pid].update({"momentum": None if momentum is None else round(momentum, 1), "momentum_parts": comp, "momentum_weights": used_w,
                         "pull": None if pull is None else round(pull, 1), "pull_parts": pull_parts})
        per[pid]["distress"], per[pid]["distress_signals"] = _distress(per[pid], signals.get("news", {}).get(pid, {}))
        per[pid]["gtm"] = _gtm_shift(companies[pid], signals.get("jobs", {}).get(pid) or {}, per[pid])
    for p in peers:
        m = per.get(p.id)
        if m:
            p.momentum, p.distress = m["momentum"], m["distress"]
    talent = _talent(peers, companies, signals, per)
    capital = _capital(peers, companies, per)
    return {"per_peer": per, "talent": talent, "capital": capital, "weights": WEIGHTS}


def _distress(m: dict[str, Any], news: dict[str, Any]) -> tuple[float, list[dict[str, Any]]]:
    sig: list[dict[str, Any]] = []
    g6, fq, tq, ol, msr = m.get("hc_growth_6m"), m.get("followers_qoq"), m.get("traffic_qoq"), m.get("outlook"), m.get("months_since_round")
    if g6 is not None and g6 < -5:
        sig.append({"w": 30, "text": f"headcount down {abs(g6):.0f}% in 6 months"})
    if (m.get("openings") or 0) == 0 and (m.get("jobs_90d") or 0) == 0:
        sig.append({"w": 15, "text": "no open roles and nothing posted in 90 days"})
    if fq is not None and fq < 0:
        sig.append({"w": 10, "text": f"followers shrinking ({fq:.1f}% QoQ)"})
    if tq is not None and tq < -20:
        sig.append({"w": 15, "text": f"web traffic down {abs(tq):.0f}% QoQ"})
    if ol is not None and ol < 0.5:
        sig.append({"w": 10, "text": f"employee business outlook only {ol*100:.0f}% positive"})
    if msr is not None and msr > 24 and (m.get("raised_usd") or 0) > 0:
        sig.append({"w": 15, "text": f"last round {msr/12:.1f} years ago"})
    layoffs = [n for n in news.get("kept", []) if re.search(r"layoff|lays off|cuts jobs|shuts|shut down|winds down", n["title"], re.I)]
    if layoffs:
        sig.append({"w": 25, "text": f"layoff/shutdown news: \u201c{layoffs[0]['title'][:60]}\u201d"})
    score = min(100.0, sum(s["w"] for s in sig))
    return round(score, 0), sig


def _gtm_shift(cd: dict[str, Any], jobs: dict[str, Any], m: dict[str, Any]) -> dict[str, Any] | None:
    series = ((cd.get("headcount") or {}).get("by_function_timeseries") or {}).get("CURRENT_FUNCTION") or {}
    if not series:
        return None
    dates = sorted({x["date"][:7] for pts in series.values() for x in pts})
    if len(dates) < 8:
        return None
    def share(d: str, funcs: set[str]) -> float | None:
        tot = sum(next((x.get("employee_count") or 0 for x in pts if x["date"][:7] == d), 0) for pts in series.values())
        part = sum(next((x.get("employee_count") or 0 for x in pts if x["date"][:7] == d), 0) for f, pts in series.items() if f in funcs)
        return None if tot == 0 else 100.0 * part / tot
    last, prior = dates[-1], dates[max(0, len(dates) - 7)]
    s_now, s_then = share(last, SALES_FUNCS), share(prior, SALES_FUNCS)
    e_now, e_then = share(last, ENG_FUNCS), share(prior, ENG_FUNCS)
    if None in (s_now, s_then, e_now, e_then):
        return None
    cats = jobs.get("by_category") or {}
    tot_jobs = sum(cats.values()) or 0
    sales_jobs = sum(v for k, v in cats.items() if SALES_JOB_CATS.search(k))
    sales_job_share = (100.0 * sales_jobs / tot_jobs) if tot_jobs else None
    signals = []
    if s_now - s_then >= 5:
        signals.append(f"sales+CS share of headcount up {s_now - s_then:.0f} pts since {prior}")
    if e_now - e_then <= -3:
        signals.append(f"engineering share down {abs(e_now - e_then):.0f} pts")
    if sales_job_share is not None and sales_job_share >= 35:
        signals.append(f"{sales_job_share:.0f}% of roles added in 90 days are go-to-market")
    if (m.get("ads_budget") or 0) > 5000:
        signals.append(f"paid search budget ${m['ads_budget']:,.0f}/month")
    detected = len(signals) >= 2 and (s_now - s_then >= 5 or (sales_job_share or 0) >= 35)
    return {"detected": detected, "since": prior if detected else None, "confidence": round(min(1.0, len(signals) / 4), 2),
            "reason": "; ".join(signals) if signals else "no shift signals", "sales_share_now": round(s_now, 1),
            "sales_share_then": round(s_then, 1), "eng_share_now": round(e_now, 1), "eng_share_then": round(e_then, 1),
            "sales_job_share": None if sales_job_share is None else round(sales_job_share, 1)}


def _talent(peers: list[Peer], companies: dict[int, dict[str, Any]], signals: dict[str, Any], per: dict[int, dict[str, Any]]) -> dict[str, Any]:
    ids = [p.id for p in peers if p.id in companies]
    idx = {pid: i for i, pid in enumerate(ids)}
    n = len(ids)
    matrix = [[0] * n for _ in range(n)]
    inflow, outflow = {pid: 0 for pid in ids}, {pid: 0 for pid in ids}
    pair_titles: dict[tuple[int, int], list[str]] = {}
    for mv in signals.get("moves", []):
        a, b = mv["from"], mv["to"]
        if a in idx and b in idx:
            matrix[idx[a]][idx[b]] += 1
            outflow[a] += 1
            inflow[b] += 1
            pair_titles.setdefault((a, b), []).append(mv.get("title") or "")
    rows = []
    for pid in ids:
        cd = companies[pid]
        rev = cd.get("employee_reviews") or {}
        hc = cd.get("headcount") or {}
        ga = (hc.get("growth_absolute") or {}).get("six_months")
        openings = (cd.get("hiring") or {}).get("openings_count")
        fill = None if ga is None or not openings else round(ga / openings, 2)
        rows.append({"peer_id": pid, "inflow": inflow[pid], "outflow": outflow[pid], "net_flow": inflow[pid] - outflow[pid],
                     "sentiment": rev.get("recommend_to_friend_rating"), "ceo_rating": (rev.get("company_ceo") or {}).get("ceo_rating"),
                     "fill_rate": fill})
    moves = [{"from": a, "to": b, "count": len(t), "titles": [x for x in t if x][:6]} for (a, b), t in pair_titles.items()]
    moves.sort(key=lambda x: -x["count"])
    return {"ids": ids, "matrix": matrix, "peers": rows, "moves": moves, "senior_joins": signals.get("senior_joins", []),
            "total_profiles": signals.get("moves_total", 0)}


def _names(raw: Any) -> list[str]:
    """Investor lists arrive as lists or comma-separated strings; never iterate a string's characters."""
    if not raw:
        return []
    if isinstance(raw, str):
        return [s.strip() for s in raw.split(",") if s.strip()]
    return [str(n).strip() for n in raw if isinstance(n, (str, int)) and str(n).strip()]


def _capital(peers: list[Peer], companies: dict[int, dict[str, Any]], per: dict[int, dict[str, Any]]) -> dict[str, Any]:
    inv_peers: dict[str, set[int]] = {}
    inv_meta: dict[str, dict[str, Any]] = {}
    edges = []
    cutoff = (datetime.now(timezone.utc) - timedelta(days=365)).strftime("%Y-%m-%d")
    for p in peers:
        cd = companies.get(p.id)
        if not cd:
            continue
        fund = cd.get("funding") or {}
        names = _names(fund.get("investors")) or [n.get("name") for n in (fund.get("investors_detailed") or []) if n.get("name")]
        for det in fund.get("investors_detailed") or []:
            if det.get("name"):
                inv_meta[det["name"]] = {"categories": det.get("categories") or [], "url": det.get("crunchbase_profile_url")}
        for name in names:
            inv_peers.setdefault(name, set()).add(p.id)
        for ms in fund.get("milestones") or []:
            if ms.get("is_fund"):
                continue
            leads = _names(ms.get("lead_investors")) or _names(ms.get("investors"))
            d = (ms.get("funding_date") or ms.get("date") or "")[:10]
            for name in (leads if leads else names[:1]):
                edges.append({"from": f"inv:{name}", "to": f"co:{p.id}", "date": d or None, "amount_usd": ms.get("amount_usd"),
                              "round": ms.get("round_type"), "recent": bool(d and d >= cutoff), "attributed": bool(leads)})
    kingmakers = sorted(((n, s) for n, s in inv_peers.items() if len(s) >= 2), key=lambda t: -len(t[1]))
    rows = []
    for p in peers:
        m = per.get(p.id) or {}
        cd = companies.get(p.id) or {}
        fund = cd.get("funding") or {}
        acq = fund.get("acquisitions") or []
        eff = None if not p.headcount or not p.raised_usd else round(p.raised_usd / p.headcount)
        rows.append({"peer_id": p.id, "raised_usd": p.raised_usd, "capital_per_employee": eff, "acquisitive": len(acq) > 0,
                     "acquisitions": len(acq), "acquired_by": fund.get("acquired_by") or None,
                     "last_round": m.get("last_round"), "last_round_date": m.get("last_round_date"), "distress": m.get("distress")})
    # consolidation pairs: big/acquisitive peers x distressed or stale-funded peers
    acquirers = [r for r in rows if r["acquisitive"] or (r["raised_usd"] or 0) >= 1e8 or (next((p.headcount for p in peers if p.id == r["peer_id"]), 0) or 0) >= 500]
    targets = [r for r in rows if (r["distress"] or 0) >= 30 and r["peer_id"] not in {a["peer_id"] for a in acquirers}]
    pairs = []
    for a in acquirers[:4]:
        for t in sorted(targets, key=lambda r: -(r["distress"] or 0))[:3]:
            pairs.append({"acquirer": a["peer_id"], "target": t["peer_id"], "score": round((t["distress"] or 0) * (1 + a["acquisitions"]) / 100, 2),
                          "reason": f"target distress {t['distress']:.0f}; acquirer has {a['acquisitions']} past acquisitions and ${(a['raised_usd'] or 0)/1e6:.0f}M raised"})
    pairs.sort(key=lambda x: -x["score"])
    return {"investors": {n: {"peers": sorted(s), "kingmaker": len(s) >= 2, **inv_meta.get(n, {})} for n, s in inv_peers.items()},
            "kingmakers": [n for n, _ in kingmakers], "edges": edges, "rows": rows, "pairs": pairs[:5]}
