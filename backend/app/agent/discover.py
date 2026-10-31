"""Stage 3: build the peer set from several candidate sources, qualify each, widen/narrow until 8-15."""
from __future__ import annotations

import asyncio
import math
import re
from datetime import datetime
from typing import Any

from app.config import settings
from app.crust.client import CrustClient, CrustError
from app.crust.fields import SEARCH_FIELDS
from app.models import Candidate, Intent
from app.textutil import find_domain, terms, tokens
from app.trace import Tracer

SERVICES = re.compile(r"\b(agency|agencies|consultanc(y|ies)|consulting|freelanc|outsourc|staffing|recruit(ing|ment)|"
                      r"marketing services|web design|digital marketing|training institute|academy|bootcamp|"
                      r"it services|software development services|custom software|offshore|system integrator|"
                      r"custom ai|development company|for (?:our )?clients|delivered \d+\+? (?:projects|solutions))\b", re.I)
SERVICES_NAME = re.compile(r"\b(solutions|infosolutions|infotech|infosystems|services|pvt|technologies llc|softwares?|"
                           r"ltd|limited|llp|global)\b", re.I)
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
    def __init__(self, intent: Intent, seed: Candidate | None, client: CrustClient, tracer: Tracer, query: str = ""):
        self.intent, self.seed, self.client, self.tracer = intent, seed, client, tracer
        self.candidates: dict[int, Candidate] = {}
        self.market = intent.market_description
        self.keywords = " ".join(intent.keywords)
        # The user's own words are the market's core; generated descriptions only widen it.
        self.query = query
        self.core: set[str] = set()
        self.wide: set[str] = set()
        self.geo: set[str] = set()

    def _vocab(self) -> None:
        if self.seed:
            self.core = terms(self.intent.market_description)
        else:
            self.core = terms(self.query) or terms(self.intent.market_description)
        self.wide = (terms(self.intent.market_description) | terms(self.keywords)) - self.core
        # A place says where, not what: "india" alone must not qualify a 10,000-person conglomerate.
        self.geo = terms(self.intent.geo)

    @property
    def subject(self) -> str:
        """Short phrase for web queries: the user's phrase, not a generated paragraph."""
        md = self.intent.market_description
        if len(md.split()) <= 6 or not self.query:
            return md
        return self.query

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
        subject = self.seed.name if self.seed else self.subject
        q = f"{subject} competitors alternatives" if self.seed else f"best {subject} companies alternatives"
        results: list[dict[str, Any]] = []
        evs: list[str] = []
        q2 = f"top {subject} companies {datetime.now().year}" if not self.seed else f"{subject} vs"
        async def one(query: str, srcs: list[str]) -> None:
            try:
                data, ev = await self.client.web_search(query, sources=srcs, label=f"web/search “{query}”")
                results.extend(data.get("results", []))
                evs.append(ev)
            except CrustError as e:
                self.tracer.decide("degrade", "web search", e.message)
        await asyncio.gather(one(q, ["web"]), one(q2, ["web", "news"]))
        ev = evs[0] if evs else ""
        names = self._company_like(_extract_names(results, exclude={subject.lower()}))
        if not names:
            return
        self.tracer.emit("note", f"Web mentions to verify on the graph: {', '.join(names[:12])}", ev=[ev])
        await self._resolve_web_names(names[:12], ev)

    def _company_like(self, names: list[str]) -> list[str]:
        """Drop names that are just the market's own words ("Legal", "Law", "Lawyers") read as companies."""
        market = self.core | self.wide | self.geo
        return [n for n in names if not (terms(n) and terms(n) <= market)]

    async def _resolve_web_names(self, names: list[str], ev: str) -> None:
        doms = [d for d in (find_domain(n) for n in names) if d]
        plain = [n for n in names if not find_domain(n)]
        rows: list[tuple[dict[str, Any], str]] = []
        for kind, items in (("names", plain), ("domains", doms)):
            if not items:
                continue
            try:
                idd, ev2 = await self.client.identify(**{kind: items}, label=f"identify {len(items)} web-mentioned {kind}")
            except CrustError as e:
                self.tracer.decide("degrade", f"identify web {kind}", e.message)
                continue
            rows += [(row, ev2) for row in idd or []]
        picked = [(_pick_match(row), row, ev2) for row, ev2 in rows]
        # A bare name that resolves to nothing or a tiny namesake ("Synthflow" → synthflow.ink, 6 people)
        # usually means the real company sits on <name>.ai; check that in one batched call.
        weak = {f"{_norm_name(row.get('matched_on'))}.ai": row.get("matched_on") for cd, row, _ in picked
                if row.get("match_type") != "domain" and _norm_name(row.get("matched_on"))
                and (not cd or (_range_mid(cd.get("basic_info", {}).get("employee_count_range")) or 0) < 10)}
        if weak:
            try:
                idd, ev3 = await self.client.identify(domains=list(weak), label=f"identify {len(weak)} names as .ai domains")
                for row in idd or []:
                    cd = _pick_match(row)
                    if cd and _norm_name(cd.get("basic_info", {}).get("name")) == _norm_name(weak.get(row.get("matched_on"), "")):
                        picked.append((cd, row, ev3))
            except CrustError as e:
                self.tracer.decide("degrade", "identify .ai domains", e.message)
        for cd, row, ev2 in picked:
            if not cd or not cd.get("basic_info", {}).get("primary_domain"):
                continue
            b = cd.get("basic_info", {})
            c = Candidate(company_id=cd.get("crustdata_company_id") or b.get("crustdata_company_id"), name=b.get("name") or row.get("matched_on"),
                          domain=b.get("primary_domain"), description=b.get("description"), founded=b.get("year_founded"),
                          categories=b.get("industries") or [], source="web", ev=[ev, ev2],
                          headcount=_range_mid(b.get("employee_count_range")))
            self._add(c)

    async def _from_anchor(self) -> None:
        """No seed company: comparison pages ("Vapi vs Retell") name the rest of the field."""
        if self.seed:
            return
        web = [c for c in self.candidates.values() if c.source == "web" and self.core & terms(c.description)]
        if len(web) < 2:
            return
        a, b = sorted(web, key=_credibility, reverse=True)[:2]
        q = f"{a.name} vs {b.name} alternatives"
        try:
            data, ev = await self.client.web_search(q, sources=["web"], label=f"web/search “{q}”")
        except CrustError as e:
            self.tracer.decide("degrade", "comparison search", e.message)
            return
        known = {_norm_name(c.name) for c in self.candidates.values()}
        names = [n for n in self._company_like(_extract_names(data.get("results", []), exclude={a.name.lower(), b.name.lower()}))
                 if _norm_name(n) not in known]
        if names:
            self.tracer.emit("note", f"Named alongside {a.name} and {b.name}: {', '.join(names[:10])}", ev=[ev])
            await self._resolve_web_names(names[:10], ev)

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
        if not c.company_id:
            return False
        prev = self.candidates.get(c.company_id)
        if prev:
            # Found by search and also named by the web/graph: that's corroboration, whichever arrived first.
            if c.source in ("web", "competitors") and prev.source not in ("web", "competitors", "seed"):
                prev.source = c.source
                prev.ev = list(dict.fromkeys(prev.ev + c.ev))
            return False
        if self.seed and c.company_id == self.seed.company_id:
            return False
        self.candidates[c.company_id] = c
        return True

    # ---- qualification -----------------------------------------------------------
    def _qualify(self, c: Candidate) -> tuple[bool, str, float]:
        desc = c.description or ""
        doc = terms(desc + " " + " ".join(c.categories))
        core_hit = sorted((self.core - self.geo) & doc)
        wide_hit = sorted(self.wide & doc)
        rel = 0.7 * len(core_hit) / max(1, len(self.core - self.geo)) + 0.3 * len(wide_hit) / max(1, len(self.wide))
        shown = ", ".join((core_hit + wide_hit)[:5])
        if not desc:
            return False, "no company description on the graph", 0
        if (c.headcount or 0) < 3:
            return False, f"too small ({c.headcount or 0} people)", 0
        if SERVICES.search(desc) and not SERVICES.search(self.intent.market_description):
            return False, "services/agency firm, not a product company in this market", 0
        if SERVICES_NAME.search(c.name) and not (c.raised_usd or 0) and c.source != "competitors":
            return False, "services-style company name with no funding signal", 0
        corroborated = c.source in ("competitors", "web")
        need = 1 if corroborated else min(2, len(self.core - self.geo))
        if len(core_hit) < need and rel < 0.35:
            return False, f"description does not match the market (core terms {len(core_hit)} of {need} needed: {', '.join(sorted(self.core))})", 0
        # Named by the web or the graph as a competitor is the strongest evidence we have; identify gives
        # no funding for these, so the credibility prior alone would undervalue them.
        score = 2 * rel + _credibility(c) + (1.5 if corroborated else 0)
        if corroborated:
            src = "listed as a competitor" if c.source == "competitors" else "named on the web"
            return True, f"{src} of {self.seed.name if self.seed else 'the market'}; shares: {shown or 'category'}", score
        return True, f"matches on: {shown} · {c.headcount or '?'} people", score

    async def run(self) -> list[Candidate]:
        t = self.tracer
        t.start("discover", f"Discovering peers for: {self.intent.market_description}")
        await self._from_seed()
        self._vocab()
        t.emit("note", f"Core terms: {', '.join(sorted(self.core))}" + (f" · widened by: {', '.join(sorted(self.wide)[:10])}" if self.wide else ""))
        async def web_chain() -> None:
            await self._from_web()
            await self._from_anchor()

        # Independent sources run together; the web chain is sequential (comparison search needs web names).
        _, n_search, n_inc = await asyncio.gather(web_chain(), self._from_search(1), self._from_incumbents())
        accepted: list[tuple[float, Candidate]] = []
        for rnd in range(1, settings.max_discovery_rounds + 1):
            if rnd > 1:
                t.decide("widen", "peer search", f"only {len(accepted)} qualified after round {rnd-1}; "
                         f"lowering headcount floor and using {'semantic' if rnd >= 3 else 'hybrid'} search")
            new = n_search + n_inc if rnd == 1 else await self._from_search(rnd)
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
                     f"size, funding and corroboration; dropped {', '.join(c.name for _, c in dropped[:6])}{'…' if len(dropped) > 6 else ''}")
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


def _credibility(c: Candidate) -> float:
    """Size and funding prior: a 300-person, $200M company outranks an unfunded 13-person one."""
    hc, raised_m = c.headcount or 0, (c.raised_usd or 0) / 1e6
    penalty = 0.8 if not raised_m and hc < 25 else 0
    return math.log1p(hc) / 3 + math.log1p(raised_m) / 6 - penalty


def _norm_name(s: str | None) -> str:
    s = (s or "").lower()
    s = re.sub(r"\.(ai|io|com|co)\b", "", s)
    return re.sub(r"[^a-z0-9]+", "", re.sub(r"\b(ai|inc|labs|hq)\b", "", s))


def _pick_match(row: dict[str, Any]) -> dict[str, Any] | None:
    """Identify returns several near-tied matches for a bare name ("Synthflow" → synthflow.ink and
    synthflow.ai). Keep the ones whose name actually matches, then prefer the largest company."""
    ms = row.get("matches") or []
    if not ms:
        return None
    best = max(float(m.get("confidence_score") or 0) for m in ms)
    if best < 0.6:
        return None
    asked = _norm_name(row.get("matched_on"))
    tied = [m for m in ms if float(m.get("confidence_score") or 0) >= best - 0.05]
    named = [m for m in tied if asked and _norm_name(m.get("company_data", {}).get("basic_info", {}).get("name")) == asked]
    pool = named or ([] if best < 0.8 else tied[:1])
    if not pool:
        return None
    return max(pool, key=lambda m: _range_mid(m.get("company_data", {}).get("basic_info", {}).get("employee_count_range")) or 0)["company_data"]


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
