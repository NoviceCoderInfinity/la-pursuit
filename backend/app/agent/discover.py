"""Stage 3: build the peer set from several candidate sources, qualify each, widen/narrow until 8-15."""
from __future__ import annotations

import math
import re
from datetime import datetime
from typing import Any

from app.config import settings
from app.crust.client import CrustClient, CrustError
from app.crust.fields import SEARCH_FIELDS
from app.models import Candidate, Intent
from app.textutil import overlap, tokens
from app.trace import Tracer

SERVICES = re.compile(r"\b(agency|agencies|consultanc(y|ies)|consulting|freelanc|outsourc|staffing|recruit(ing|ment)|"
                      r"marketing services|web design|digital marketing|training institute|academy|bootcamp|"
                      r"it services|software development services|custom software|offshore|system integrator)\b", re.I)
SERVICES_NAME = re.compile(r"\b(solutions|infosolutions|infotech|infosystems|services|pvt|technologies llc|softwares?)\b", re.I)
AGG_DOMAINS = ("linkedin.com", "crunchbase.com", "g2.com", "capterra.com", "producthunt.com", "wikipedia.org",
               "medium.com", "reddit.com", "youtube.com", "github.com", "techcrunch.com", "forbes.com", "google.com")


def _cand_from_search(c: dict[str, Any], ev: str) -> Candidate:
    b = c.get("basic_info", {})
    return Candidate(company_id=c.get("crustdata_company_id"), name=b.get("name") or "?",
                     domain=b.get("primary_domain"), description=b.get("description"),
                     headcount=(c.get("headcount") or {}).get("total"),
                     raised_usd=(c.get("funding") or {}).get("total_investment_usd"),
                     founded=b.get("year_founded"), categories=(c.get("taxonomy") or {}).get("categories") or [],
                     country=(c.get("locations") or {}).get("country"), source="search", ev=[ev])


class Discovery:
    def __init__(self, intent: Intent, seed: Candidate | None, client: CrustClient, tracer: Tracer):
        self.intent, self.seed, self.client, self.tracer = intent, seed, client, tracer
        self.candidates: dict[int, Candidate] = {}
        self.market = intent.market_description
        self.keywords = " ".join(intent.keywords)

    # ---- candidate sources ---------------------------------------------------
    async def _from_seed(self) -> None:
        """Use the seed's own description/categories to sharpen the market, and its competitors as candidates."""
        if not self.seed or not self.seed.domain:
            return
        try:
            data, ev = await self.client.enrich([self.seed.domain],
                                                ["basic_info", "taxonomy", "competitors", "headcount.total", "funding.total_investment_usd"],
                                                label=f"enrich seed {self.seed.name} (taxonomy, competitors)")
        except CrustError as e:
            self.tracer.decide("degrade", "seed enrich", e.message)
            return
        m = (data[0].get("matches") or [{}])[0].get("company_data", {}) if data else {}
        b, tax = m.get("basic_info", {}), m.get("taxonomy", {}) or {}
        desc = b.get("description") or ""
        cats = tax.get("categories") or []
        self.market = f"{self.seed.name}: {desc[:300]}"
        self.intent.market_description = _market_sentence(self.seed.name, desc, cats)
        self.keywords = " ".join(sorted(tokens(desc))[:12] + [c.lower() for c in cats])
        self.seed.description, self.seed.categories = desc, cats
        self.seed.headcount = (m.get("headcount") or {}).get("total")
        self.seed.raised_usd = (m.get("funding") or {}).get("total_investment_usd")
        self.seed.ev.append(ev)
        self.tracer.emit("note", f"Market defined from {self.seed.name}'s profile: {self.intent.market_description}",
                         detail={"categories": cats}, ev=[ev])
        comp = m.get("competitors") or {}
        ids = [i for i in (comp.get("company_ids") or []) if isinstance(i, int)]
        if ids:
            await self._identify_ids(ids[:15], "competitors")
        await self._from_seo_competitors(comp)

    async def _from_seo_competitors(self, comp: dict[str, Any]) -> None:
        doms = []
        for k in ("organic_seo", "paid_seo", "all_domains"):
            for d in comp.get(k) or []:
                d = (d or "").strip().lower()
                if d and d not in doms and not d.endswith(AGG_DOMAINS) and d != (self.seed.domain if self.seed else None):
                    doms.append(d)
        if not doms:
            return
        try:
            data, ev = await self.client.enrich(doms[:12], SEARCH_FIELDS, label=f"enrich {len(doms[:12])} SEO-competitor domains")
        except CrustError as e:
            self.tracer.decide("degrade", "seo competitors", e.message)
            return
        for row in data or []:
            for m in row.get("matches") or []:
                c = _cand_from_search(m.get("company_data", {}), ev)
                c.source = "competitors"
                self._add(c)

    async def _from_web(self) -> None:
        """Web search for '<seed|market> competitors/alternatives', extract capitalised names, verify via identify."""
        subject = self.seed.name if self.seed else self.intent.market_description
        q = f"{subject} competitors alternatives" if self.seed else f"best {subject} companies alternatives"
        results: list[dict[str, Any]] = []
        evs: list[str] = []
        q2 = f"top {subject} companies {datetime.now().year}" if not self.seed else f"{subject} vs"
        for query, srcs in ((q, ["web"]), (q2, ["web", "news"])):
            try:
                data, ev = await self.client.web_search(query, sources=srcs, label=f"web/search “{query}”")
                results += data.get("results", [])
                evs.append(ev)
            except CrustError as e:
                self.tracer.decide("degrade", "web search", e.message)
        ev = evs[0] if evs else ""
        names = _extract_names(results, exclude={subject.lower()})
        if not names:
            return
        self.tracer.emit("note", f"Web mentions to verify on the graph: {', '.join(names[:12])}", ev=[ev])
        try:
            idd, ev2 = await self.client.identify(names=names[:12], label=f"identify {len(names[:12])} web-mentioned names")
        except CrustError as e:
            self.tracer.decide("degrade", "identify web names", e.message)
            return
        for row in idd or []:
            ms = row.get("matches") or []
            if not ms or float(ms[0].get("confidence_score") or 0) < 0.8:
                continue
            cd = ms[0].get("company_data", {})
            b = cd.get("basic_info", {})
            c = Candidate(company_id=cd.get("crustdata_company_id") or b.get("crustdata_company_id"), name=b.get("name") or row.get("matched_on"),
                          domain=b.get("primary_domain"), description=b.get("description"), founded=b.get("year_founded"),
                          categories=b.get("industries") or [], source="web", ev=[ev, ev2],
                          headcount=_range_mid(b.get("employee_count_range")))
            self._add(c)

    async def _identify_ids(self, ids: list[int], source: str) -> None:
        try:
            data, ev = await self.client.enrich_ids(ids, SEARCH_FIELDS, label=f"enrich {len(ids)} {source} candidates")
        except CrustError as e:
            self.tracer.decide("degrade", source, e.message)
            return
        for row in data or []:
            for m in row.get("matches") or []:
                c = _cand_from_search(m.get("company_data", {}), ev)
                c.source = source
                self._add(c)

    async def _from_incumbents(self) -> int:
        """Same market query, but headcount >= 50: surfaces the established players the relevance sort buries."""
        try:
            data, ev = await self.client.search_companies(
                query=self.intent.market_description, mode="hybrid",
                filters={"op": "and", "conditions": [{"field": "headcount.total", "type": "=>", "value": 50}]},
                fields=SEARCH_FIELDS, limit=20, label="company/search hybrid · incumbents (headcount ≥ 50)")
        except CrustError as e:
            self.tracer.decide("degrade", "incumbent search", e.message)
            return 0
        n = 0
        for c in data.get("companies", []):
            cand = _cand_from_search(c, ev)
            cand.source = "incumbents"
            if self._add(cand):
                n += 1
        return n

    async def _from_search(self, round_no: int) -> int:
        q = self.market if round_no == 1 else f"{self.intent.market_description} {self.keywords}"
        floor = {1: 10, 2: 5, 3: 3}[round_no]
        mode = "hybrid" if round_no < 3 else "semantic"
        conds: list[dict[str, Any]] = [{"field": "headcount.total", "type": "=>", "value": floor}]
        if self.intent.geo and round_no == 1:
            conds.append({"field": "locations.country", "type": "=", "value": self.intent.geo})
        try:
            data, ev = await self.client.search_companies(
                query=q, mode=mode, filters={"op": "and", "conditions": conds}, fields=SEARCH_FIELDS,
                limit=30 if round_no == 1 else 50, label=f"company/search {mode} (round {round_no}, headcount ≥ {floor})")
        except CrustError as e:
            self.tracer.decide("degrade", "company/search", e.message)
            return 0
        n = 0
        for c in data.get("companies", []):
            if self._add(_cand_from_search(c, ev)):
                n += 1
        return n

    def _add(self, c: Candidate) -> bool:
        if not c.company_id or c.company_id in self.candidates:
            return False
        if self.seed and c.company_id == self.seed.company_id:
            return False
        self.candidates[c.company_id] = c
        return True

    # ---- qualification -----------------------------------------------------------
    def _qualify(self, c: Candidate) -> tuple[bool, str, float]:
        desc = c.description or ""
        rel = max(overlap(self.intent.market_description, desc), overlap(self.keywords, desc),
                  overlap(self.intent.market_description, " ".join(c.categories)))
        matched = sorted(tokens(self.intent.market_description) & tokens(desc + " " + " ".join(c.categories)))[:5]
        if not desc:
            return False, "no company description on the graph", 0
        if (c.headcount or 0) < 3:
            return False, f"too small ({c.headcount or 0} people)", 0
        if SERVICES.search(desc) and not SERVICES.search(self.intent.market_description):
            return False, "services/agency firm, not a product company in this market", 0
        if SERVICES_NAME.search(c.name) and not (c.raised_usd or 0) and c.source != "competitors":
            return False, "services-style company name with no funding signal", 0
        need = min(2, len(tokens(self.intent.market_description)))
        if c.source in ("competitors", "web") and (rel >= 0.05 or matched):
            score = 1.5 + rel + math.log1p(c.headcount or 0) / 4 + math.log1p((c.raised_usd or 0) / 1e6) / 20
            src = "listed as a competitor" if c.source == "competitors" else "named alongside the seed on the web"
            return True, f"{src} of {self.seed.name if self.seed else 'the market'}; shares: {', '.join(matched) or 'category'}", score
        if rel < 0.08 or len(matched) < need:
            return False, f"description does not match the market definition (matched {len(matched)} of {need} needed terms)", 0
        score = 2 * rel + math.log1p(c.headcount or 0) / 4 + math.log1p((c.raised_usd or 0) / 1e6) / 20
        return True, f"matches on: {', '.join(matched)} · {c.headcount or '?'} people", score

    async def run(self) -> list[Candidate]:
        t = self.tracer
        t.start("discover", f"Discovering peers for: {self.intent.market_description}")
        await self._from_seed()
        await self._from_web()
        accepted: list[tuple[float, Candidate]] = []
        for rnd in range(1, settings.max_discovery_rounds + 1):
            if rnd > 1:
                t.decide("widen", "peer search", f"only {len(accepted)} qualified after round {rnd-1}; "
                         f"lowering headcount floor and using {'semantic' if rnd >= 3 else 'hybrid'} search")
            new = await self._from_search(rnd)
            if rnd == 1:
                new += await self._from_incumbents()
            t.emit("note", f"Round {rnd}: {new} new candidates ({len(self.candidates)} total)")
            accepted = []
            for c in self.candidates.values():
                if c.status == "pending" or rnd > 1 and c.status == "rejected" and c.source == "search":
                    ok, reason, score = self._qualify(c)
                    c.status, c.reason = ("accepted" if ok else "rejected"), reason
                    t.decide("accept" if ok else "reject", f"{c.name} ({c.domain})", reason, ev=c.ev)
                if c.status == "accepted":
                    _, _, score = self._qualify(c)
                    accepted.append((score, c))
            if len(accepted) >= settings.min_peers:
                break
        accepted.sort(key=lambda s: s[0], reverse=True)
        if len(accepted) > settings.max_peers:
            dropped = accepted[settings.max_peers:]
            t.decide("narrow", "peer set", f"{len(accepted)} qualified; keeping the top {settings.max_peers} by relevance, "
                     f"size and funding; dropped {', '.join(c.name for _, c in dropped[:6])}{'…' if len(dropped) > 6 else ''}")
            for _, c in dropped:
                c.status, c.reason = "rejected", "ranked below the top peers"
            accepted = accepted[:settings.max_peers]
        peers = [c for _, c in accepted]
        if self.seed:
            self.seed.status = "accepted"
            peers.insert(0, self.seed)
        t.done("discover", f"{len(peers)} peers qualified from {len(self.candidates)} candidates",
               peers=[p.name for p in peers], candidates=len(self.candidates))
        return peers


def _market_sentence(name: str, desc: str, cats: list[str]) -> str:
    first = re.split(r"(?<=[.!?])\s", desc.strip())[0] if desc else ""
    first = re.sub(rf"^{re.escape(name)}\s+(is|builds|provides|offers|helps|makes)\s+", "", first, flags=re.I)
    if cats:
        return f"{first[:160]} ({', '.join(cats[:4])})"
    return first[:200] or f"the market {name} competes in"


COMMON = set("""The A An And Or Of For In On At To With From By Best Top Alternatives Alternative Competitors Competitor Compare
Comparison Vs Versus Which Wins Winning Guide Review Reviews Ranked Compared Enterprise Voice Platform Platforms AI Agent Agents
Phone Call Calls Customer Service Teams Team Software Tools Tool Most Popular Pricing Features Free Open Source What Why How Who
January February March April May June July August September October November December Jan Feb Mar Apr Jun Jul Aug Sep Sept Oct Nov Dec Read More Learn Get Try New Your Our
Companies Company Startups Startup Market Industry Solutions Solution API Apps App Data Cloud Business Businesses Sales Support
Inc Ltd LLC Co Corp Group Global Services Technology Technologies Systems Labs Network Networks Digital Online Web Mobile Smart
Here Are Is It This That These Those You We They Their Its All Any Each Every Both Some Such No Not Only Also Just Still Yet
Automation Automated Conversational Generative Agentic Assistant Assistants Chatbot Chatbots Bot Bots Model Models LLM LLMs
EU Act Compliance TCO CX G2 Capterra Forbes Reddit YouTube LinkedIn Medium Twitter Google Microsoft Amazon Apple Meta OpenAI""".split())


def _extract_names(results: list[dict[str, Any]], exclude: set[str]) -> list[str]:
    """Capitalised one/two-word names that recur across titles and snippets, minus common words."""
    import collections
    counts: collections.Counter[str] = collections.Counter()
    pat = re.compile(r"\b([A-Z][A-Za-z0-9]{2,}(?:\.(?:ai|io))?(?:\s+(?:AI|Labs|HQ))?)\b")
    for r in results:
        text = f"{r.get('title') or ''} . {r.get('snippet') or ''}"
        seen = set()
        for m in pat.finditer(text):
            name = m.group(1).strip()
            base = name.split()[0]
            if base in COMMON or name.lower() in exclude or base.isupper() and len(base) <= 3:
                continue
            if name not in seen:
                seen.add(name)
                counts[name] += 1
    ranked = [n for n, c in counts.most_common(40) if c >= 2]
    # merge "Synthflow" and "Synthflow AI"
    out: list[str] = []
    for n in ranked:
        if any(n.split()[0] == o.split()[0] for o in out):
            continue
        out.append(n)
    return out[:15]


def _range_mid(r: str | None) -> int | None:
    if not r:
        return None
    if r.endswith("+"):
        return int(r[:-1])
    try:
        lo, hi = r.split("-")
        return (int(lo) + int(hi)) // 2
    except ValueError:
        return None
