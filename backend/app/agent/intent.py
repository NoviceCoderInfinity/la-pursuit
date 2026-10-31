"""Stage 1: classify the input (company / market / idea), extract keywords, pick the lens."""
from __future__ import annotations

import re

from app.llm import llm
from app.models import Intent
from app.textutil import find_domain, find_linkedin, tokens
from app.trace import Tracer

INVESTOR = re.compile(r"\b(invest|investing|investor|back(ing)?|due diligence|diligence|portfolio|valuation|worth backing|worth a bet|should i (invest|back))\b", re.I)
OPERATOR = re.compile(r"\b(we are|we're|our company|i run|i work at|i'm at|i am at|our competitors|competitors of us|my company)\b", re.I)
FOUNDER = re.compile(r"\b(i want to build|want to build|building a|build a|my idea|an idea|idea for|should i build|can i build|is there a market|is there room|is there space|room for|startup idea|launch(ing)? a)\b", re.I)
LEAD_IN = re.compile(r"^(is there (?:a market|room|space) for|should i build|can i build|i want to build|want to build|building|build|my idea is|an idea for|idea for|map|analy[sz]e|research|show me|what is|who are)\s+(?:an?\s+|the\s+)?(?:new\s+)?", re.I)
COMPARE = re.compile(r"\b(?:or|vs\.?|versus|and)\s+([A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+){0,2})\s*\??$")
COMPANY_HINT = re.compile(r"\b((?i:we are|we're|invest in|back|is|about|analy[sz]e|competitors of))\s+([A-Z][A-Za-z0-9&\-]+(?:\s+(?:AI|Labs|HQ|[A-Z][a-z0-9]+(?=\s+(?:worth|or|vs|against|at|before))))?)(?=\s+(?:worth|or|vs|versus|against|at|before)|[.,;:—–?]|$)")
MARKET_WORDS = re.compile(r"\b(space|market|industry|sector|platforms?|companies|startups|landscape|players|tools?|agents?|vendors|"
                          r"assistants?|copilots?|software|apps?|robots?|robotics|commerce|marketplaces?|providers?|solutions|"
                          r"fintech|healthtech|edtech|saas)\b", re.I)

SYSTEM = """You classify a one-sentence request for a market-intelligence agent.
kind: "company" if the request centres on one named company; "idea" if the user describes something they want to build;
"market" otherwise. market_description: one plain sentence naming the market to map (for a company, the market it competes in).
lens: investor if they are judging an investment, operator if they speak as the company, founder otherwise."""


async def detect_intent(query: str, tracer: Tracer, lens_override: str | None = None) -> Intent:
    tracer.start("intent", "Reading the request")
    intent = await llm.parse(SYSTEM, query, Intent, effort="low") if llm.available else None
    if intent is None:
        intent = _rules(query)
        tracer.emit("note", "Rule-based intent (no model key configured)", detail=intent.model_dump())
    else:
        tracer.emit("note", "Model-classified intent", detail=intent.model_dump())
    if lens_override in ("operator", "investor", "founder"):
        intent.lens = lens_override  # type: ignore[assignment]
    tracer.decide("accept", f"{intent.kind}: {intent.market_description[:80]}",
                  f"Lens: {intent.lens} · {intent.rationale}")
    tracer.done("intent", f"{intent.kind} · lens {intent.lens}", kind=intent.kind, lens=intent.lens,
                market=intent.market_description)
    return intent


FOCUS = [  # what the question is really worried about -> which decision should lead
    ("talent", r"poach|our people|talent|hiring away|steal(ing)? (our )?(engineers|people)"),
    ("gtm", r"hiring sales|sales fastest|selling|go[- ]to[- ]market|\bgtm\b|sales team"),
    ("expansion", r"expand|expanding|where are|which (countries|cities|regions)|new markets?"),
    ("capital", r"who has the money|funded|funding|investors?|raise|round"),
    ("distress", r"weakening|stalling|dying|struggling|losing"),
    ("crowded", r"crowded|room (in|for)|space for|saturated"),
    ("threat", r"catch us|coming after|threat|compete with us|rivals?"),
    ("momentum", r"winning|scaling|breaking out|pulling ahead|fastest|leader|ahead"),
]
QUESTION_TAIL = re.compile(r"\s+(?:are|is)\s+(?:actually\s+|really\s+|still\s+)?(?:winning|scaling|growing|breaking out|pulling ahead|worth it)\s*$|"
                           r"\s+(?:is it|are they)\s+too crowded\s*$", re.I)
QUESTION_HEAD = re.compile(r"^(?:which|what|who|where|are there|is there still room in|is there still room for|is there room in|"
                           r"is there room for|is there space for|is there a market for)\s+(?:an?\s+|the\s+)?(?:new\s+)?", re.I)


def _focus(text: str) -> str | None:
    for name, pat in FOCUS:
        if re.search(pat, text, re.I):
            return name
    return None


def _subject_part(text: str) -> str:
    """'We are Zepto. Who can catch us…' -> 'We are Zepto'; 'Battery recycling in Europe: who is funded' -> 'Battery recycling in Europe'."""
    parts = [p.strip() for p in re.split(r"\s*(?:—|–|:|\?|\.\s|;)\s*", text) if p.strip()]
    if not parts:
        return text
    # keep the first part unless it is only a question word ("Which humanoid… are scaling" stays whole)
    return parts[0]


def _rules(q: str) -> Intent:
    text = q.strip()
    domain = find_domain(text)
    linkedin = find_linkedin(text)
    lens = "founder"
    if INVESTOR.search(text):
        lens = "investor"
    elif OPERATOR.search(text):
        lens = "operator"
    elif FOUNDER.search(text):
        lens = "founder"
    subject = _subject_part(text)

    kind = "market"
    seed = None
    m = COMPANY_HINT.search(text)
    if FOUNDER.search(text) and not m:
        kind = "idea"
    else:
        words = subject.split()
        if m:
            # stop the company name at punctuation or the next clause ("Linear. Who…", "Bland AI, or is…")
            seed, kind = re.split(r"[.,;:—–?]|\s+(?:or|vs\.?|versus|against|and|before|at)\s+", m.group(2))[0].strip(" .?!"), "company"
        elif domain or linkedin:
            kind, seed = "company", (domain or linkedin)
        elif (len(words) <= 2 and not (len(words) == 2 and MARKET_WORDS.search(subject))) or (len(words) == 3 and not MARKET_WORDS.search(subject)):
            kind, seed = "company", subject.strip(" .?!")  # resolve_seed decides whether it is real
    if seed and seed.lower() in {"ai", "the"}:
        seed, kind = None, "market"
    if kind == "company" and lens == "founder":
        lens = "operator"

    segment = None
    if kind == "company":
        desc = f"the market {seed} competes in"
        kw = sorted(tokens(text))[:8]
    else:
        core = QUESTION_TAIL.sub("", QUESTION_HEAD.sub("", LEAD_IN.sub("", subject))).strip(" .?!") or subject
        desc, segment = _split_segment(core)
        kw = sorted(tokens(desc))[:8]
    compare = []
    if kind == "company":
        mc = re.search(r"\b(?:or|vs\.?|versus|against)\s+(?:is\s+|are\s+)?([A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+){0,1})", text)
        if mc:
            cand = re.split(r"\s+(?:pulling|catching|ahead|growing)\b", mc.group(1))[0].strip(" .?!,")
            if cand and cand != seed and cand.lower() not in {"is", "are", "google"}:
                compare = [cand]
    return Intent(kind=kind, market_description=desc, seed_company_name=seed if not domain else None, compare_with=compare,
                  seed_domain=domain, keywords=kw, geo=_geo(text), lens=lens, segment=segment, focus=_focus(text),  # type: ignore[arg-type]
                  rationale="rule-based classification")


GEO = {"india": "India", "indian": "India", "usa": "United States", "us": "United States", "united states": "United States",
       "america": "United States", "europe": "Europe", "european": "Europe", "uk": "United Kingdom", "united kingdom": "United Kingdom",
       "britain": "United Kingdom", "germany": "Germany", "german": "Germany", "singapore": "Singapore", "australia": "Australia",
       "canada": "Canada", "canadian": "Canada", "brazil": "Brazil", "japan": "Japan", "france": "France", "french": "France",
       "israel": "Israel", "netherlands": "Netherlands", "spain": "Spain", "mexico": "Mexico", "indonesia": "Indonesia",
       "uae": "United Arab Emirates", "dubai": "United Arab Emirates",
       "san francisco": "San Francisco", "sfo": "San Francisco", "sf": "San Francisco", "bay area": "San Francisco",
       "new york": "New York", "nyc": "New York", "london": "London", "bangalore": "Bengaluru", "bengaluru": "Bengaluru", "nigeria": "Nigeria", "kenya": "Kenya", "south africa": "South Africa"}
CITY_GEO = {"San Francisco": "USA", "New York": "USA", "London": "GBR", "Bengaluru": "IND"}
_GEO_RE = re.compile(r"\b(" + "|".join(sorted((re.escape(k) for k in GEO), key=len, reverse=True)) + r")\b", re.I)


def _geo(text: str) -> str | None:
    hits = [m.group(1).lower() for m in _GEO_RE.finditer(text)]
    if not hits:
        return None
    # "show us dental clinics in india": a real country name beats the pronoun-shaped "us"
    specific = [h for h in hits if h not in ("us",)]
    cities = [h for h in specific if GEO[h] in CITY_GEO]
    if cities:  # a city is more specific than its country
        return GEO[cities[-1]]
    return GEO[(specific or hits)[-1]]


def _split_segment(desc: str) -> tuple[str, str | None]:
    """'AI receptionist for dental clinics in India' -> ('AI receptionist', 'dental clinics').
    Only split when the product side still says something on its own ('Vertical AI for insurance' stays whole)."""
    from app.textutil import terms
    desc = re.sub(r"\s+in\s+(the\s+)?(us|usa|uk|sfo|sf|nyc|europe|india|bay area|[A-Z][a-z]+(\s[A-Z][a-z]+)?)\s*$", "", desc, flags=re.I).strip(" .?!") or desc
    m = re.match(r"^(?P<core>.+?)\s+(?:for|serving|targeting)\s+(?P<seg>.+)$", desc, flags=re.I)
    if m and terms(m.group("core")) - {"ai"}:
        return m.group("core").strip(), m.group("seg").strip(" .?!")
    return desc, None
