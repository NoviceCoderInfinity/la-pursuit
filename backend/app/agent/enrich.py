"""Stage 4: batched full enrichment of the peer set + cross-field truth checks."""
from __future__ import annotations

import asyncio
from typing import Any

from app.crust.client import CrustClient, CrustError
from app.crust.fields import ENRICH_FIELDS
from app.ledger import Ledger
from app.models import HQ, Candidate, Dispute, Peer
from app.trace import Tracer

BATCH = 4
GIANT = 2000          # people; these enrich slowly, so each gets its own call
ENRICH_TIMEOUT_S = 45  # past this a company keeps search-level data (shown as a degrade in the trace)


async def enrich_peers(cands: list[Candidate], client: CrustClient, tracer: Tracer, ledger: Ledger
                       ) -> tuple[list[Peer], dict[int, dict[str, Any]], dict[int, str], list[Dispute]]:
    """Returns (peers, companies by id, enrich evidence id by company id, disputes)."""
    tracer.start("enrich", f"Enriching {len(cands)} peers (batched)")
    companies: dict[int, dict[str, Any]] = {}
    ev_by_id: dict[int, str] = {}
    by_domain = {c.domain.lower(): c for c in cands if c.domain}
    domains = list(by_domain)

    async def batch(i: int, chunk: list[str]) -> list[tuple[dict[str, Any], str]]:
        try:
            data, ev = await asyncio.wait_for(
                client.enrich(chunk, ENRICH_FIELDS, label=f"enrich batch {i + 1}: {', '.join(chunk)}"), ENRICH_TIMEOUT_S)
            return [(r, ev) for r in data or []]
        except asyncio.TimeoutError:
            tracer.decide("degrade", ", ".join(chunk), f"enrichment took over {ENRICH_TIMEOUT_S}s; keeps search-level data only")
            return []
        except CrustError as e:
            tracer.decide("retry", f"enrich batch {i + 1}", f"{e.message[:120]}; splitting the batch into single-company calls")
        out: list[tuple[dict[str, Any], str]] = []
        for d in chunk:
            try:
                one, ev1 = await client.enrich([d], ENRICH_FIELDS, label=f"enrich {d}")
                out += [(r, ev1) for r in one or []]
            except CrustError as e2:
                tracer.decide("degrade", d, f"{e2.message[:120]}; keeps search-level data only")
        return out

    async def by_id() -> list[tuple[dict[str, Any], str]]:
        # candidates without a domain are enriched by id
        no_dom = [c for c in cands if not c.domain and c.company_id]
        if not no_dom:
            return []
        try:
            data, ev = await client.enrich_ids([c.company_id for c in no_dom], ENRICH_FIELDS, label=f"enrich {len(no_dom)} peers by id")  # type: ignore[misc]
            return [(r, ev) for r in data or []]
        except CrustError as e:
            tracer.decide("degrade", "enrich by id", e.message[:120])
            return []

    # Large companies take 40-60s each to enrich; batches run together (the client's gate keeps us
    # under the enrich RPM) so the stage costs about one slow batch, not the sum of all of them.
    giants = [d for d in domains if (by_domain[d].headcount or 0) >= GIANT]
    rest = [d for d in domains if d not in giants]
    chunks = [[d] for d in giants] + [rest[i:i + BATCH] for i in range(0, len(rest), BATCH)]
    results = await asyncio.gather(*(batch(i, c) for i, c in enumerate(chunks)), by_id())
    rows = [r for part in results for r in part]
    for row, ev in rows:
        ms = row.get("matches") or []
        if not ms:
            tracer.decide("degrade", str(row.get("matched_on", "?")), "no enrichment returned")
            continue
        cd = ms[0].get("company_data", {})
        cid = cd.get("crustdata_company_id")
        # map back to the candidate we asked for (by domain), so the peer id stays canonical
        asked = by_domain.get(str(row.get("matched_on", "")).lower())
        if asked and asked.company_id and asked.company_id != cid:
            tracer.decide("disambiguate", asked.name, f"enrich returned id {cid} for {asked.domain}; keeping candidate id {asked.company_id}", ev=[ev])
            cid = asked.company_id
        if cid:
            companies[cid] = cd
            ev_by_id[cid] = ev
    peers: list[Peer] = []
    disputes: list[Dispute] = []
    for c in cands:
        cd = companies.get(c.company_id or -1)
        if not cd:
            peers.append(Peer(id=c.company_id or 0, name=c.name, domain=c.domain or "", description=c.description,
                              headcount=c.headcount, raised_usd=c.raised_usd, founded=c.founded, is_seed=c.source == "seed", ev=c.ev))
            continue
        ev = ev_by_id[c.company_id]  # type: ignore[index]
        b, hc, loc, fund = cd.get("basic_info", {}), cd.get("headcount") or {}, cd.get("locations") or {}, cd.get("funding") or {}
        total, resolved_hc, disp = _headcount_truth(c.company_id, hc, b, ev, ledger, tracer)  # type: ignore[arg-type]
        if disp:
            disputes.append(disp)
        peers.append(Peer(
            id=c.company_id, name=b.get("name") or c.name, domain=b.get("primary_domain") or c.domain or "",  # type: ignore[arg-type]
            logo=b.get("logo_permalink") or None, description=b.get("description"), website=b.get("website"),
            linkedin=b.get("professional_network_url"),
            hq=HQ(city=loc.get("city"), country=loc.get("country"), label=loc.get("headquarters")),
            headcount=resolved_hc, headcount_range=b.get("employee_count_range"),
            raised_usd=fund.get("total_investment_usd"), founded=b.get("year_founded"),
            is_seed=c.source == "seed",
            ev=[ledger.cite(ev, f"[{c.domain}].headcount", resolved_hc, f"{b.get('name')} headcount"),
                ledger.cite(ev, f"[{c.domain}].funding.total_investment_usd", fund.get("total_investment_usd"), f"{b.get('name')} total raised")]))
    tracer.done("enrich", f"{len(companies)} of {len(cands)} peers fully enriched · {len(disputes)} data conflicts flagged",
                data={"peers": [p.model_dump() for p in peers]}, enriched=len(companies), disputes=len(disputes))
    return peers, companies, ev_by_id, disputes


def _headcount_truth(cid: int, hc: dict[str, Any], b: dict[str, Any], ev: str, ledger: Ledger, tracer: Tracer
                     ) -> tuple[int | None, int | None, Dispute | None]:
    """headcount.total vs the last timeseries point vs the declared range. Prefer the timeseries."""
    total = hc.get("total")
    ts = hc.get("timeseries") or []
    last = ts[-1].get("employee_count") if ts else None
    rng = b.get("employee_count_range")
    lo, hi = _range_bounds(rng)
    resolved = last if last is not None else total
    conflict = total is not None and last is not None and abs(total - last) > max(5, 0.25 * max(total, last))
    out_of_range = resolved is not None and lo is not None and hi is not None and not (lo / 2 <= resolved <= hi * 2)
    if conflict:
        vals = [{"source": "headcount.total", "value": total, "ev": ledger.cite(ev, "headcount.total", total)},
                {"source": "headcount.timeseries[-1]", "value": last, "ev": ledger.cite(ev, "headcount.timeseries[-1].employee_count", last)},
                {"source": "basic_info.employee_count_range", "value": rng, "ev": ledger.cite(ev, "basic_info.employee_count_range", rng)}]
        rule = "prefer the most recent timeseries point when it disagrees with headcount.total by >25%; check against the declared range"
        res = f"using {resolved} from the timeseries" if last is not None else f"using headcount.total={total}"
        tracer.decide("dispute", b.get("name") or str(cid), f"headcount.total={total} vs timeseries={last} vs range={rng}; {res}", ev=[ev])
        return total, resolved, Dispute(peer_id=cid, field="headcount", values=vals, rule=rule, resolution=res, severity="high")
    if out_of_range:
        vals = [{"source": "headcount (observed)", "value": resolved, "ev": ledger.cite(ev, "headcount.timeseries[-1].employee_count", resolved)},
                {"source": "basic_info.employee_count_range (self-declared)", "value": rng, "ev": ledger.cite(ev, "basic_info.employee_count_range", rng)}]
        rule = "self-declared size band vs observed profile count; flag when they differ by more than 2x"
        res = f"using observed {resolved}; declared band {rng} looks stale"
        tracer.decide("dispute", b.get("name") or str(cid), f"observed headcount {resolved} vs declared band {rng}; {res}", ev=[ev])
        return total, resolved, Dispute(peer_id=cid, field="headcount_declared_range", values=vals, rule=rule, resolution=res, severity="low")
    return total, resolved, None


def _range_bounds(r: str | None) -> tuple[int | None, int | None]:
    if not r:
        return None, None
    if r.endswith("+"):
        return int(r[:-1]), 10**7
    try:
        lo, hi = r.split("-")
        return int(lo), int(hi)
    except ValueError:
        return None, None
