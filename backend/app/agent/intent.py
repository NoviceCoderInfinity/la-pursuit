"""Stage 1: classify the input (company / market / idea), extract keywords, pick the lens."""
from __future__ import annotations

import re

from app.llm import llm
from app.models import Intent
from app.textutil import find_domain, find_linkedin, tokens
from app.trace import Tracer

INVESTOR = re.compile(r"\b(invest|investing|investor|back(ing)?|due diligence|diligence|fund|portfolio|valuation|worth backing|should i (invest|back))\b", re.I)
OPERATOR = re.compile(r"\b(we are|we're|our company|i run|i work at|i'm at|i am at|our competitors|competitors of us|my company)\b", re.I)
FOUNDER = re.compile(r"\b(i want to build|want to build|building a|build a|my idea|an idea|idea for|should i build|is there a market|startup idea|launch(ing)? a)\b", re.I)
COMPANY_HINT = re.compile(r"\b(we are|we're|invest in|back|about|analy[sz]e|map|competitors of|vs\.?|versus)\s+([A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+){0,2})", re.I)
MARKET_WORDS = re.compile(r"\b(space|market|industry|sector|platforms?|companies|startups|landscape|players|tools?|agents?|vendors)\b", re.I)

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

    kind = "market"
    seed = None
    if FOUNDER.search(text) and not COMPANY_HINT.search(text):
        kind = "idea"
    else:
        m = COMPANY_HINT.search(text)
        words = text.split()
        if m:
            seed, kind = m.group(2).strip(" .?!"), "company"
        elif domain or linkedin:
            kind, seed = "company", (domain or linkedin)
        elif len(words) <= 3 and not MARKET_WORDS.search(text) and text[:1].isupper():
            kind, seed = "company", text.strip(" .?!")
    if seed and seed.lower() in {"ai", "the"}:
        seed, kind = None, "market"
    if kind == "company" and lens == "founder":
        lens = "operator"

    kw = sorted(tokens(text))[:8]
    if kind == "company":
        desc = f"the market {seed} competes in"
    elif kind == "idea":
        desc = re.sub(r"^(i want to build|want to build|building|build|my idea is|an idea for|idea for)\s*(an?|the)?\s*", "", text, flags=re.I).strip(" .?!") or text
    else:
        desc = re.sub(r"^(map|analy[sz]e|research|show me|what is|who are|the)\s+", "", text, flags=re.I).strip(" .?!") or text
    return Intent(kind=kind, market_description=desc, seed_company_name=seed if not domain else None,
                  seed_domain=domain, keywords=kw, geo=_geo(text), lens=lens,  # type: ignore[arg-type]
                  rationale="rule-based classification")


GEO = {"india": "India", "indian": "India", "usa": "United States", "us ": "United States", "europe": "Europe",
       "european": "Europe", "uk": "United Kingdom", "germany": "Germany", "singapore": "Singapore",
       "australia": "Australia", "canada": "Canada", "brazil": "Brazil", "japan": "Japan"}


def _geo(text: str) -> str | None:
    t = text.lower() + " "
    for k, v in GEO.items():
        if k in t:
            return v
    return None
