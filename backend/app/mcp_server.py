"""MCP server: exposes the Vantage pipeline as tools for Claude Code / Claude Desktop.
Run: python -m app.mcp_server   (stdio transport)
Register in Claude Code: claude mcp add vantage -- /path/to/backend/.venv/bin/python -m app.mcp_server
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

try:  # mcp 2.x
    from mcp.server.mcpserver import MCPServer as _Server
except ImportError:  # mcp 1.x
    from mcp.server.fastmcp import FastMCP as _Server  # type: ignore[no-redef]

from app.crust.client import CrustClient
from app.ledger import Ledger
from app.pipeline import Run
from app.textutil import find_domain
from app.trace import Tracer

mcp = _Server("vantage", instructions="Market intelligence on Crustdata's identity graph. Every number carries an evidence id (ev_xxx) that maps to the API call that produced it.")


def _client() -> CrustClient:
    return CrustClient(Ledger(), Tracer())


@mcp.tool()
async def market_map(query: str, lens: str | None = None) -> dict[str, Any]:
    """Run the full Vantage pipeline on a company, market or idea. Returns peers with momentum/distress,
    the decision deck for the lens (operator|investor|founder), truth-lens disputes and claims, and the run id."""
    run = Run(query, lens)
    await run.run()
    await run._close()
    per = run.engines.get("per_peer", {}) if run.engines else {}
    return {
        "run_id": run.id, "lens": run.lens, "error": run.error,
        "intent": run.intent.model_dump() if run.intent else None,
        "peers": [{"name": p.name, "domain": p.domain, "headcount": p.headcount, "raised_usd": p.raised_usd,
                   "momentum": p.momentum, "distress": p.distress, "hq": p.hq.label,
                   "gtm_shift": (per.get(p.id, {}).get("gtm") or {}).get("detected"), "ev": p.ev} for p in run.peers],
        "deck": run.scenes.get("deck"),
        "truth": {k: v for k, v in (run.scenes.get("truth") or {}).items() if k in ("disputes", "claims", "rejected_candidates", "ledger_count")},
        "talent_moves": (run.scenes.get("chord") or {}).get("moves"),
        "kingmakers": (run.scenes.get("constellation") or {}).get("kingmakers"),
        "credits_used": run.report()["credits_used"],
    }


@mcp.tool()
async def identify_company(name_or_domain: str) -> dict[str, Any]:
    """Resolve a messy company name or domain to canonical Crustdata ids with confidence scores."""
    c = _client()
    try:
        d = find_domain(name_or_domain)
        data, ev = await (c.identify(domains=[d]) if d else c.identify(names=[name_or_domain]))
        out = []
        for m in (data[0].get("matches") or [])[:6] if data else []:
            b = m["company_data"]["basic_info"]
            out.append({"confidence": m["confidence_score"], "name": b.get("name"), "domain": b.get("primary_domain"),
                        "crustdata_company_id": b.get("crustdata_company_id"), "size": b.get("employee_count_range"),
                        "industries": b.get("industries"), "description": (b.get("description") or "")[:200]})
        return {"matches": out, "ev": ev}
    finally:
        await c.aclose()


@mcp.tool()
async def talent_flow(domains: list[str]) -> dict[str, Any]:
    """People who moved between the given companies (current employer in the set, past employer in the set)."""
    c = _client()
    try:
        data, ev = await c.enrich(domains, ["basic_info.name", "basic_info.primary_domain"])
        ids: dict[int, str] = {}
        for row in data or []:
            for m in row.get("matches") or []:
                cd = m["company_data"]
                ids[cd["crustdata_company_id"]] = cd["basic_info"]["name"]
        moves = []
        for pid, name in ids.items():
            others = [i for i in ids if i != pid]
            if not others:
                continue
            body = {"filters": {"op": "and", "conditions": [
                {"field": "experience.employment_details.current.company_id", "type": "=", "value": pid},
                {"field": "experience.employment_details.past.company_id", "type": "in", "value": others}]},
                "fields": ["basic_profile.current_title", "experience.employment_details.current", "experience.employment_details.past"], "limit": 40}
            res, ev2 = await c.search_people(body)
            for pr in res.get("profiles", []):
                ed = pr.get("experience", {}).get("employment_details", {})
                past = [x for x in (ed.get("past") or []) if x.get("crustdata_company_id") in ids and x.get("crustdata_company_id") != pid]
                if past:
                    moves.append({"from": ids[past[0]["crustdata_company_id"]], "to": name, "title": pr.get("basic_profile", {}).get("current_title"), "ev": ev2})
        return {"companies": list(ids.values()), "moves": moves, "count": len(moves)}
    finally:
        await c.aclose()


@mcp.tool()
async def hiring_intent(domains: list[str], days: int = 90) -> dict[str, Any]:
    """Roles added in the last N days per company, grouped by job category and country."""
    c = _client()
    try:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        body = {"filters": {"op": "and", "conditions": [
                    {"field": "company.basic_info.primary_domain", "type": "in", "value": domains},
                    {"field": "metadata.date_added", "type": "=>", "value": since}]},
                "limit": 0, "aggregations": [{"type": "group_by", "field": "company.basic_info.primary_domain", "agg": "count"},
                                             {"type": "group_by", "field": "job_details.category", "agg": "count"},
                                             {"type": "group_by", "field": "location.country", "agg": "count"}]}
        data, ev = await c.search_jobs(body)
        aggs = {a.get("field"): {b["key"]: b["count"] for b in a.get("buckets", [])} for a in data.get("aggregations", []) if a.get("field")}
        return {"since": since, "total": data.get("total_count"), "by_company": aggs.get("company.basic_info.primary_domain"),
                "by_category": aggs.get("job_details.category"), "by_country": aggs.get("location.country"), "ev": ev}
    finally:
        await c.aclose()


if __name__ == "__main__":
    mcp.run()
