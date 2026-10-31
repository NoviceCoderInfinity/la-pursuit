"""Shared pydantic models (mirrored in frontend/lib/types.ts)."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Lens = Literal["operator", "investor", "founder"]
InputKind = Literal["company", "market", "idea"]


class Intent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: InputKind
    market_description: str = Field(description="One sentence defining the market to map, in plain words")
    seed_company_name: str | None = Field(default=None, description="Company named in the input, if any")
    seed_domain: str | None = Field(default=None, description="Domain of that company if the input contains one")
    keywords: list[str] = Field(default_factory=list, description="3-8 search keywords for the market")
    geo: str | None = Field(default=None, description="Country or region if the input restricts geography")
    segment: str | None = Field(default=None, description="Target customer segment named in an idea ('for dental clinics')")
    compare_with: list[str] = Field(default_factory=list, description="Other companies named for a head-to-head ('X or Y', 'X vs Y')")
    focus: str | None = Field(default=None, description="What the question is worried about: talent, gtm, expansion, capital, distress, crowded, threat, momentum")
    lens: Lens
    rationale: str = Field(description="One short sentence on why this kind and lens")


class Candidate(BaseModel):
    company_id: int | None = None
    name: str
    domain: str | None = None
    description: str | None = None
    headcount: int | None = None
    raised_usd: float | None = None
    founded: int | None = None
    categories: list[str] = Field(default_factory=list)
    country: str | None = None
    source: str = ""                 # search | competitors | web | llm | seed
    status: Literal["pending", "accepted", "rejected"] = "pending"
    reason: str | None = None
    ev: list[str] = Field(default_factory=list)


class HQ(BaseModel):
    lat: float | None = None
    lng: float | None = None
    city: str | None = None
    country: str | None = None
    label: str | None = None


class Peer(BaseModel):
    id: int
    name: str
    domain: str
    logo: str | None = None
    description: str | None = None
    website: str | None = None
    linkedin: str | None = None
    hq: HQ = Field(default_factory=HQ)
    headcount: int | None = None
    headcount_range: str | None = None
    raised_usd: float | None = None
    founded: int | None = None
    is_seed: bool = False
    momentum: float | None = None
    distress: float | None = None
    ev: list[str] = Field(default_factory=list)


class Dispute(BaseModel):
    peer_id: int
    field: str
    values: list[dict[str, Any]]      # [{source, value, ev}]
    rule: str
    resolution: str
    severity: Literal["high", "low"] = "high"
