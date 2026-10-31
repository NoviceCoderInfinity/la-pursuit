"""Stage 2: resolve the seed company to a canonical Crustdata id, resolving ambiguity by context."""
from __future__ import annotations

import re
from typing import Any

from app.crust.client import CrustClient, CrustError
from app.models import Candidate, Intent
from app.textutil import overlap, tokens
from app.trace import Tracer


def _cand_from_match(m: dict[str, Any], source: str, ev: str) -> Candidate:
    cd = m.get("company_data", {})
    b = cd.get("basic_info", {})
    return Candidate(company_id=cd.get("crustdata_company_id") or b.get("crustdata_company_id"),
                     name=b.get("name") or "?", domain=b.get("primary_domain"),
                     description=b.get("description"), founded=b.get("year_founded"),
                     headcount=None, categories=b.get("industries") or [], source=source, ev=[ev])


async def resolve_seed(intent: Intent, query: str, client: CrustClient, tracer: Tracer) -> Candidate | None:
    if intent.kind != "company" or not (intent.seed_company_name or intent.seed_domain):
        return None
    tracer.start("resolve", f"Resolving “{intent.seed_company_name or intent.seed_domain}” on the identity graph")
    try:
        if intent.seed_domain:
            data, ev = await client.identify(domains=[intent.seed_domain], label="identify seed by domain")
        else:
            data, ev = await client.identify(names=[intent.seed_company_name or ""], label="identify seed by name")
    except CrustError as e:
        tracer.decide("degrade", "resolve", f"identify failed: {e.message}")
        tracer.done("resolve", "Could not resolve the seed company")
        return None
    matches = (data[0].get("matches") if data else None) or []
    if not matches:
        tracer.decide("degrade", intent.seed_company_name or "", "no match on the identity graph")
        tracer.done("resolve", "No match")
        return None
    cands = [_cand_from_match(m, "seed", ev) for m in matches]
    seed_name = (intent.seed_company_name or "").strip()
    seed_toks = tokens(seed_name) | {t for t in seed_name.lower().split() if t in TLD_WORDS}
    core = [t for t in seed_name.lower().replace(".", " ").split() if t not in TLD_WORDS and t not in {"inc", "ltd", "llc", "co", "the"}]
    tech_ctx = bool(TECH.search(query))
    scored = []
    for c, m in zip(cands, matches):
        conf = float(m.get("confidence_score") or 0)
        b = m.get("company_data", {}).get("basic_info", {})
        name_l = (c.name or "").lower()
        # 1. the core name should match exactly, not just contain it ("Bland" vs "Bland Landscaping")
        name_score = 1.0 if name_l.replace(".", "").split() == core else (0.4 if core and core[0] in name_l.split() else 0.0)
        # 2. a TLD-like word in the input ("Bland AI" -> bland.ai, "Retell AI" -> retellai.com) is a strong hint
        dom = (c.domain or "").lower()
        tld_hint = 0.0
        for t in seed_toks & TLD_WORDS:
            if dom.endswith("." + t) or dom.replace(".", "").endswith(t):
                tld_hint = 0.8
        # 3. tech context in the request favours software/tech industries
        inds = " ".join(b.get("industries") or [])
        tech = 0.3 if tech_ctx and ("Software" in inds or "Technology" in inds or "Internet" in inds) else 0.0
        # 4. description overlap with the request, ignoring the company's own name tokens
        ctx = overlap(" ".join(t for t in tokens(query) if t not in seed_toks), c.description)
        size_rank = _range_rank(b.get("employee_count_range"))
        score = conf + name_score + tld_hint + tech + 0.4 * ctx + 0.03 * size_rank
        scored.append((score, c, conf))
    scored.sort(key=lambda t: t[0], reverse=True)
    best = scored[0][1]
    # Sanity: a same-named record whose domain doesn't carry the name and whose description shares
    # nothing with the request ("Zzz" → troutman.com, a law firm) is not the company the user meant.
    dom_root = re.sub(r"[^a-z0-9]", "", (best.domain or "").split(".")[0].lower())
    name_in_domain = any(t in dom_root for t in core if len(t) >= 3)
    ctx_best = overlap(" ".join(t for t in tokens(query) if t not in seed_toks), best.description)
    if not name_in_domain and ctx_best == 0 and scored[0][2] < 0.95:
        alts = ", ".join(f"{c.name} ({c.domain})" for _, c, _ in scored[:3])
        tracer.decide("reject", best.name, f"closest graph records don't look like “{seed_name}”: {alts}", ev=[ev])
        tracer.done("resolve", f"Could not resolve “{seed_name}” on the identity graph")
        return None
    best.status, best.reason = "accepted", f"best match (confidence {scored[0][2]:.2f}, score {scored[0][0]:.2f})"
    if len(scored) > 1:
        alts = ", ".join(f"{c.name} ({c.domain})" for _, c, _ in scored[1:4])
        tracer.decide("disambiguate", best.name,
                      f"{len(scored)} candidates matched; chose {best.name} ({best.domain}) by description overlap "
                      f"with the request and company size; rejected: {alts}", ev=[ev])
    tracer.done("resolve", f"{best.name} · {best.domain} · id {best.company_id}", company_id=best.company_id)
    return best


TLD_WORDS = {"ai", "io", "app", "dev", "co", "com", "xyz", "tech", "cloud"}
TECH = re.compile(r"\b(ai|a\.i\.|software|saas|platform|startup|api|agent|agents|app|cloud|data|ml|tech|invest|voice|llm)\b", re.I)


def _range_rank(r: str | None) -> int:
    order = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"]
    return order.index(r) if r in order else 0
