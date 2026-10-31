"""Stage 5: signals beyond enrichment — jobs (90d), talent flow, senior joins, news relevance, geocoding, seed homepage."""
from __future__ import annotations

import asyncio
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from app.crust.client import CrustClient, CrustError
import app.geocode as geocode_mod
from app.geocode import COUNTRY_CENTROID, ISO3, US_STATES, geocode
from app.ledger import Ledger
from app.models import Peer
from app.textutil import tokens
from app.trace import Tracer

PERSON_FIELDS = ["basic_profile.name", "basic_profile.current_title", "basic_profile.location",
                 "experience.employment_details.current", "experience.employment_details.past"]
GENERIC = {"ai", "inc", "labs", "technologies", "technology", "software", "group", "the", "company", "co", "ltd", "llc", "voice", "cloud"}


def _iso(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")


async def collect_signals(peers: list[Peer], companies: dict[int, dict[str, Any]], client: CrustClient,
                          tracer: Tracer, ledger: Ledger, seed_id: int | None, lens: str) -> dict[str, Any]:
    tracer.start("signals", "Collecting hiring, talent, news and location signals")
    now = datetime.now(timezone.utc)
    out: dict[str, Any] = {"jobs": {}, "moves": [], "moves_total": 0, "senior_joins": [], "news": {},
                           "geo": {}, "claims_source": None}
    live = [p for p in peers if p.id in companies]

    # Jobs, talent, homepage and geocoding hit different endpoints/hosts with their own rate gates,
    # so they run side by side; within each, calls are issued together and the gate spaces them.
    await asyncio.gather(_jobs(live, client, tracer, ledger, out, now),
                         _talent(live, client, tracer, out, now),
                         _homepage(peers, live, client, tracer, out, seed_id),
                         _geo(live, companies, out, now))

    # Job countries are country names: offline centroids, no network.
    for p in live:
        job_countries = {}
        for ctry, n in (out["jobs"].get(p.id, {}).get("by_country") or {}).items():
            g = await geocode(ctry, network=False)
            if g:
                job_countries[ctry] = {"count": n, "lat": g["lat"], "lng": g["lng"]}
        out["geo"][p.id]["job_countries"] = job_countries

    _news(live, companies, tracer, out)

    tracer.done("signals", f"jobs for {len(out['jobs'])} peers · {len(out['moves'])} talent moves · "
                f"{len(out['senior_joins'])} senior joins · {sum(len(v['kept']) for v in out['news'].values())} relevant news items",
                data={"peers": [p.model_dump() for p in peers]}, jobs=len(out["jobs"]), moves=len(out["moves"]))
    return out


async def _jobs(live: list[Peer], client: CrustClient, tracer: Tracer, ledger: Ledger, out: dict[str, Any], now: datetime) -> None:
    """Roles added in the last 90 days per peer, one aggregation call each."""
    since = _iso(now - timedelta(days=90))

    async def one(p: Peer) -> None:
        body = {"filters": {"op": "and", "conditions": [
                    {"field": "company.basic_info.company_id", "type": "=", "value": p.id},
                    {"field": "metadata.date_added", "type": "=>", "value": since}]},
                "limit": 8, "fields": ["job_details.title", "job_details.category", "location.country", "metadata.date_added"],
                "sorts": [{"field": "metadata.date_added", "order": "desc"}],
                "aggregations": [{"type": "count"},
                                 {"type": "group_by", "field": "job_details.category", "agg": "count", "size": 30},
                                 {"type": "group_by", "field": "location.country", "agg": "count", "size": 30}]}
        try:
            data, ev = await client.search_jobs(body, label=f"job/search {p.name} · last 90 days")
        except CrustError as e:
            tracer.decide("degrade", f"jobs for {p.name}", e.message)
            return
        aggs = {a.get("field") or a.get("type"): a for a in data.get("aggregations", [])}
        total = next((a.get("value") for a in data.get("aggregations", []) if a.get("type") == "count"), None)
        if total is None:
            total = data.get("total_count")
        out["jobs"][p.id] = {
            "total_90d": total or 0,
            "by_category": {b["key"]: b["count"] for b in (aggs.get("job_details.category", {}).get("buckets") or [])},
            "by_country": {b["key"]: b["count"] for b in (aggs.get("location.country", {}).get("buckets") or []) if b.get("key")},
            "titles": [{"title": j.get("job_details", {}).get("title"), "category": j.get("job_details", {}).get("category"),
                        "country": (j.get("location") or {}).get("country"), "date": (j.get("metadata") or {}).get("date_added", "")[:10]}
                       for j in data.get("job_listings", [])],
            "ev": ledger.cite(ev, "aggregations.count", total, f"{p.name} roles added in 90 days"),
        }

    await asyncio.gather(*(one(p) for p in live))


async def _talent(live: list[Peer], client: CrustClient, tracer: Tracer, out: dict[str, Any], now: datetime) -> None:
    """Cross-peer moves (one query per peer so only cross-company moves come back) and senior joins."""
    ids = [p.id for p in live]
    peer_ids = set(ids)
    if len(ids) < 2:
        return

    async def into(p: Peer) -> tuple[str | None, int, list[dict[str, Any]]]:
        others = [i for i in ids if i != p.id]
        body: dict[str, Any] = {"filters": {"op": "and", "conditions": [
            {"field": "experience.employment_details.current.company_id", "type": "=", "value": p.id},
            {"field": "experience.employment_details.past.company_id", "type": "in", "value": others}]},
            "fields": PERSON_FIELDS, "limit": 40}
        try:
            data, ev = await client.search_people(body, label=f"person/search joined {p.name} from a peer")
        except CrustError as e:
            tracer.decide("degrade", f"talent flow into {p.name}", e.message)
            return None, 0, []
        moves = []
        for pr in data.get("profiles", []):
            ed = (pr.get("experience") or {}).get("employment_details") or {}
            cur = next((c for c in (ed.get("current") or []) if c.get("crustdata_company_id") == p.id), None)
            if not cur:
                continue
            past = [x for x in (ed.get("past") or []) if x.get("crustdata_company_id") in peer_ids and x.get("crustdata_company_id") != p.id]
            if not past:
                continue
            past.sort(key=lambda x: x.get("end_date") or "", reverse=True)
            px = past[0]
            moves.append({"from": px["crustdata_company_id"], "to": p.id, "title": cur.get("title"),
                          "seniority": cur.get("seniority_level"), "function": cur.get("function_category"),
                          "date": (cur.get("start_date") or "")[:10], "name": (pr.get("basic_profile") or {}).get("name"),
                          "from_title": px.get("title")})
        return ev, data.get("total_count") or 0, moves

    async def senior() -> None:
        since6 = _iso(now - timedelta(days=183))
        body = {"filters": {"op": "and", "conditions": [
                    {"field": "experience.employment_details.current.company_id", "type": "in", "value": ids},
                    {"field": "experience.employment_details.current.seniority_level", "type": "in", "value": ["CXO", "Vice President", "Director"]},
                    {"field": "experience.employment_details.current.start_date", "type": "=>", "value": since6}]},
                "fields": PERSON_FIELDS, "limit": 60}
        try:
            data, ev = await client.search_people(body, label="person/search senior joins · last 6 months")
        except CrustError as e:
            tracer.decide("degrade", "senior joins", e.message)
            return
        for pr in data.get("profiles", []):
            ed = (pr.get("experience") or {}).get("employment_details") or {}
            cur = next((c for c in (ed.get("current") or []) if c.get("crustdata_company_id") in peer_ids), None)
            if not cur:
                continue
            past = sorted((ed.get("past") or []), key=lambda x: x.get("end_date") or "", reverse=True)
            past = [x for x in past if x.get("crustdata_company_id") != cur.get("crustdata_company_id")]
            out["senior_joins"].append({
                "peer_id": cur["crustdata_company_id"], "title": cur.get("title"), "seniority": cur.get("seniority_level"),
                "from_company": past[0].get("name") if past else None, "from_company_id": past[0].get("crustdata_company_id") if past else None,
                "date": (cur.get("start_date") or "")[:10], "name": (pr.get("basic_profile") or {}).get("name"), "ev": ev})
        tracer.emit("note", f"{len(out['senior_joins'])} senior joins (CXO/VP/Director) across peers in 6 months", ev=[ev])

    results, _ = await asyncio.gather(asyncio.gather(*(into(p) for p in live)), senior())
    ev_ids = [ev for ev, _, _ in results if ev]
    out["moves"] = [m for _, _, ms in results for m in ms]
    out["moves_total"] = sum(n for _, n, _ in results)
    out["moves_ev"] = ev_ids
    tracer.emit("note", f"{len(out['moves'])} cross-company moves among peers ({out['moves_total']} matching profiles)", ev=ev_ids[:3])


def _news(live: list[Peer], companies: dict[int, dict[str, Any]], tracer: Tracer, out: dict[str, Any]) -> None:
    """News relevance (entity disambiguation); no network, the items came with enrich."""
    for p in live:
        cd = companies[p.id]
        kept, rejected = [], []
        name_toks = {t for t in tokens(p.name) if t not in GENERIC} or {p.name.lower()}
        desc_toks = tokens(cd.get("basic_info", {}).get("description"))
        for n in cd.get("news") or []:
            title = n.get("article_title") or ""
            tl = title.lower()
            if not any(t in tl for t in name_toks):
                rejected.append({"title": title, "reason": "headline does not mention the company"})
                continue
            if re.search(r"\b(hotel|resort|restaurant|village|municipal|district|temple|weather|cricket|football|recipe)\b", tl) \
                    and not (tokens(title) & desc_toks):
                rejected.append({"title": title, "reason": "same name, different entity (headline is about a place or unrelated topic)"})
                continue
            kept.append({"title": title, "url": n.get("article_url"), "date": n.get("article_publish_date"),
                         "publisher": n.get("article_publisher_name"), "confidence": n.get("confidence_score")})
        kept.sort(key=lambda x: x.get("date") or "", reverse=True)
        out["news"][p.id] = {"kept": kept[:12], "rejected": rejected[:8], "rejected_count": len(rejected), "ev": p.ev[0] if p.ev else None}
        if rejected:
            tracer.decide("reject", f"{len(rejected)} news items for {p.name}", rejected[0]["reason"] + f" — e.g. “{rejected[0]['title'][:70]}”")


GEO_NETWORK_BUDGET = 30  # Nominatim allows 1 req/s; beyond this, regions fall back to cache or "unplaced"


async def _geo(live: list[Peer], companies: dict[int, dict[str, Any]], out: dict[str, Any], now: datetime) -> None:
    """HQ + people regions. HQs first, then the biggest offices across all peers, under a network budget."""
    start = geocode_mod.live_requests

    async def look(raw: str, hint: str | None) -> dict[str, Any] | None:
        return await geocode(raw, hint, network=geocode_mod.live_requests - start < GEO_NETWORK_BUDGET)

    hints: dict[int, str | None] = {}
    for p in live:
        cd = companies[p.id]
        loc = cd.get("locations") or {}
        hc = cd.get("headcount") or {}
        hints[p.id] = hc.get("largest_headcount_country") or loc.get("country")
        hq_raw = loc.get("headquarters") or ", ".join(x for x in [loc.get("city"), loc.get("state"), loc.get("country")] if x)
        hq = await look(hq_raw, hints[p.id]) if hq_raw else None
        if not hq:
            for label, _cnt in sorted((hc.get("by_region_absolute") or {}).items(), key=lambda kv: -kv[1]):
                if not _is_country_or_state(label):
                    hq = await look(label, hints[p.id])
                    if hq:
                        hq = {**hq, "label": hq["label"] + " (largest office)"}
                        break
        if hq:
            p.hq.lat, p.hq.lng, p.hq.label = hq["lat"], hq["lng"], hq["label"]
            p.hq.city, p.hq.country = loc.get("city") or hq["label"].split(",")[0], ISO3.get(loc.get("country") or "", loc.get("country"))
        out["geo"][p.id] = {"hq": hq, "regions": [], "unplaced": [], "new_regions": [], "job_countries": {},
                            "timeline": _region_timeline((hc.get("by_function_timeseries") or {}).get("GEO_REGION") or {})}

    todo = [(p.id, label, count) for p in live
            for label, count in sorted(((companies[p.id].get("headcount") or {}).get("by_region_absolute") or {}).items(), key=lambda kv: -kv[1])[:14]
            if not _is_country_or_state(label)]
    for pid, label, count in sorted(todo, key=lambda t: -t[2]):
        g = await look(label, hints[pid])
        if g and g["source"] != "country-fallback":
            out["geo"][pid]["regions"].append({"label": label, "count": count, "lat": round(g["lat"], 2), "lng": round(g["lng"], 2)})
        else:
            out["geo"][pid]["unplaced"].append({"label": label, "count": count})

    cutoff = _iso(now - timedelta(days=183))
    for p in live:
        geo = out["geo"][p.id]
        geo["regions"] = _dedupe_regions(geo["regions"])
        series = ((companies[p.id].get("headcount") or {}).get("by_function_timeseries") or {}).get("GEO_REGION") or {}
        for label, pts in series.items():
            pts = [x for x in pts if x.get("employee_count")]
            if pts and pts[0]["date"][:10] >= cutoff and not _is_country_or_state(label):
                geo["new_regions"].append({"label": label, "since": pts[0]["date"][:10], "count": pts[-1]["employee_count"]})


HOMEPAGE_TIMEOUT_S = 40  # runs alongside jobs/talent/geo, which take ~30-40s anyway


async def _homepage(peers: list[Peer], live: list[Peer], client: CrustClient, tracer: Tracer, out: dict[str, Any], seed_id: int | None) -> None:
    """Seed (or best-funded peer) homepage for the claim check; capped so it can't stall the run."""
    target = next((p for p in peers if p.id == seed_id), None) if seed_id else None
    if not (target or peers):
        return
    tp = target or max(live, key=lambda p: (p.raised_usd or 0, p.headcount or 0), default=peers[0])
    url = tp.website or f"https://{tp.domain}"
    try:
        data, ev = await asyncio.wait_for(client.web_fetch([url], label=f"web/fetch {tp.name} homepage (claims)"), HOMEPAGE_TIMEOUT_S)
        html = (data[0].get("content") or "") if data else ""
        out["claims_source"] = {"peer_id": tp.id, "url": url, "text": _html_to_text(html)[:20000], "ev": ev}
    except asyncio.TimeoutError:
        tracer.decide("degrade", "homepage fetch", f"no response in {HOMEPAGE_TIMEOUT_S}s; claims left unverifiable")
    except CrustError as e:
        tracer.decide("degrade", "homepage fetch", e.message)


def _is_country_or_state(label: str) -> bool:
    l = label.strip()
    if l in COUNTRY_CENTROID or l in ISO3 or l in ISO3.values():
        return True
    parts = [x.strip() for x in l.split(",")]
    if len(parts) == 2 and parts[1] in ("United States", "India", "Canada", "Australia", "Brazil", "Germany", "United Kingdom") \
            and parts[0].upper() not in US_STATES and not re.search(r"\b(area|metropolitan|city)\b", parts[0], re.I):
        # "California, United States" / "Gujarat, India" are states; "New York, United States" is ambiguous -> treat as state
        return True
    return False


def _dedupe_regions(regions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: dict[tuple[float, float], dict[str, Any]] = {}
    for r in regions:
        k = (round(r["lat"], 1), round(r["lng"], 1))
        if k not in seen or r["count"] > seen[k]["count"]:
            seen[k] = r
    return sorted(seen.values(), key=lambda r: -r["count"])[:8]


def _region_timeline(series: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Monthly region counts for the last 24 months (city/metro level only)."""
    by_date: dict[str, dict[str, int]] = {}
    for label, pts in series.items():
        if _is_country_or_state(label):
            continue
        for x in pts[-24:]:
            d = x["date"][:7]
            by_date.setdefault(d, {})[label] = x.get("employee_count") or 0
    return [{"date": d, "regions": by_date[d]} for d in sorted(by_date)[-24:]]


def _html_to_text(html: str) -> str:
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        for t in soup(["script", "style", "noscript", "svg"]):
            t.decompose()
        text = soup.get_text(" ")
    except Exception:
        text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text).strip()
