# Vantage — Final Plan
### An autonomous market-intelligence agent that turns Crustdata's identity graph into seven pictures and three decisions

> Type a company, a market, or an idea. The agent builds the market from Crustdata, then renders it as seven scenes: a living globe, a momentum field, build-vs-sell streams, a talent-flow chord, a capital constellation, a truth lens, and a decision deck that keeps itself alive through Watchers. Every number on screen is clickable to the exact Crustdata response that produced it.

Theme: **Research and markets** (serves Investing, Revenue, Hiring too).
Surfaces: Web app (demo) · CLI · MCP server, one Python core.

---

## 1. Principles

1. **Quality over quantity.** Seven scenes. Nothing else ships.
2. **Every scene fuses ≥3 Crustdata signal families.** No single-field charts.
3. **A scene must beat a slide.** If a paragraph could say it, the scene is cut.
4. **All numbers computed in code, prose by the LLM, every number cited.** A validator drops any sentence containing a number that is not in the evidence ledger.
5. **No human in the loop.** Ambiguity, thin results, throttling, and bad data are handled and *shown*, not asked about.

---

## 2. Verified Crustdata foundation (tested live with `api.key`, 2025-11-01)

| Endpoint | Verified | Feeds |
|---|---|---|
| `POST /company/identify` | ✅ confidence + alternates | Seed resolution, candidate verification |
| `POST /company/enrich` (batch domains) | ✅ 6 domains/call | headcount timeseries · by_role (+growth) · by_region · GEO_REGION timeseries · hiring by function + open_jobs_timeseries · funding milestones + investors_detailed + acquisitions · web_traffic timeseries + source mix · seo (ads budget, paid/organic clicks, keywords gained/lost) · followers timeseries · news · people (founders/cxos/decision_makers) · employee_reviews · revenue estimate · taxonomy · locations.headquarters |
| `POST /company/search` | ✅ hybrid `search.query` + `filters` | Peer discovery |
| `POST /job/search` | ✅ `aggregations.group_by` domain × category, location.country | Hiring pulses on the globe, sell-vs-build streams |
| `POST /person/search` | ✅ 73 cross-peer moves found for 4 voice-AI peers | Talent flow, exec joins |
| `POST /person/enrich` | ✅ | Founder verification (investor lens) |
| `POST /web/search/live` | ✅ | Competitor lists, funding/layoff/expansion news |
| `POST /web/enrich/live` | ✅ (HTML, strip to text) | Homepage positioning and claims |
| `POST /watch/company` | ✅ preview `can_create: true` | Watchtower |
| `GET /account/credits` | ✅ ~15k credits | Footer meter |

Rate limits: enrich 15 RPM (batched), search 30, web 10, watch 10. Disk cache keyed by request hash keeps demos safe and re-runs instant; new queries are fully live.

Data quirks found and turned into the Truth Lens: `headcount.total` 14 vs timeseries 149 for Vapi; news about "Vapi, Gujarat" hotel; semantic search returning 10-person noise companies; SEO competitors like "getvapi.com".

---

## 3. The seven scenes

### Scene 1 — The Globe (Market Atlas)
**Picture:** A 3D globe. Each peer is a glowing node at its HQ sized by headcount. From each HQ, arcs reach the regions where its people actually sit (headcount by region). A time scrubber (24 months) animates regions lighting up as headcount grows there. Job postings pulse on the countries where roles were added in the last 90 days. Talent moves between peers draw as traveling arcs between HQs. A layer switch: *People footprint · Hiring pulses · Talent flow · Expansion (regions new in last 6 months)*.
**Signals fused:** `locations.headquarters` · `headcount.by_region_absolute` · `headcount.by_function_timeseries.GEO_REGION` · `job/search` group_by `location.country` + `metadata.date_added` · `person/search` cross-peer moves · web search news "opens office".
**Insight it gives:** the market's center of gravity, who is offshoring engineering, who just entered a geography, where talent is being pulled.
**Decision:** Operator: which geography to defend or attack. Founder: where the competition is not. Investor: geographic risk/opportunity.
**Click:** any arc or pulse → evidence drawer.

### Scene 2 — Momentum Field
**Picture:** A bubble field. x = headcount growth YoY, y = Organic Pull (direct+organic traffic growth and keyword gains, per ad dollar), bubble = total raised, color = Momentum Index 0–100. Scrub time and each bubble leaves a 12-month trail, so you *see* who is accelerating and who is stalling. Distress-flagged peers pulse red.
**Signals fused:** `headcount.timeseries` · `web_traffic.monthly_visitors_timeseries` + `source_*_pct` timeseries · `seo.gained/lost/newly_ranked_seo_keywords`, `monthly_google_ads_budget` · `followers.timeseries` · `funding.milestones` · `hiring.open_jobs_timeseries` · `employee_reviews.business_outlook_rating`.
**Insight:** quality of growth (earned vs bought), momentum ranking, early distress.
**Decision:** Investor: who to dig into and who to avoid. Operator: which rival is the real threat. Founder: which incumbents have true pull.

### Scene 3 — Build vs Sell Streams
**Picture:** One streamgraph per peer, stacked in a grid: role mix over time (Engineering / Sales / Customer Success / Marketing / Ops), overlaid with a thin line of open-roles-by-category and a bar of monthly ad budget. The moment a company flips from build to sell is visible as the sales band swelling. A badge marks "GTM shift detected: Q2 2026".
**Signals fused:** `headcount.by_function_timeseries.CURRENT_FUNCTION` · `headcount.by_role_growth_6m_pct` · `job/search` group_by category per domain · `hiring.by_function_qoq_pct` · `seo.monthly_google_ads_budget`, `monthly_paid_clicks` · news (launches, partnerships).
**Insight:** who is going to market now, who is still building, who is cutting.
**Decision:** Operator: brace for account competition from X. Investor: stage read, GTM scale-up. Founder: the window is closing / still open.

### Scene 4 — Talent Flow Chord
**Picture:** A chord diagram of peers. Ribbon width = people who moved from A to B. Outer ring color = employee sentiment (recommend-to-friend, CEO rating). Net talent winners expand, net losers shrink. Hover a ribbon → the roles that moved (titles, seniority). A side list: recent senior joins at each peer and where they came from.
**Signals fused:** `person/search` (current ∈ peers AND past ∈ peers; `seniority_level`; `start_date` ≤ 6 months) · `employee_reviews` ratings · `headcount.growth` ÷ `hiring.openings_count` (fill rate) · `people.cxos` · news.
**Insight:** who is the talent magnet, who is leaking, which exec hires reveal intent ("new CRO from Twilio + sales spike").
**Decision:** Operator: who to poach from and whom to shield. Investor: team-quality risk. Founder: where experienced builders are available.
**Privacy:** aggregated by company on stage; names shown only for founders/CXOs; individual names behind a toggle.

### Scene 5 — Capital Constellation
**Picture:** A force graph. Investors and companies are nodes; each round is an edge with date and amount; edges from the last 12 months glow. Investors that back ≥2 peers sit at the center (the market's kingmakers). Investors active in adjacent categories but with no bet here are shown as faint "open slots". Acquisitive companies carry an M&A halo; distress-flagged companies sit near them as likely targets.
**Signals fused:** `funding.investors_detailed` · `funding.milestones` (round type, date, amount) · `funding.acquisitions`, `acquired_by` · `funding.total_investment_usd` vs `headcount.total` (capital efficiency) · Scene 2 distress · M&A news.
**Insight:** who is deploying now, syndicate clusters, open slots, likely consolidation pairs.
**Decision:** Founder: exactly whom to pitch and in what order. Investor: who you syndicate with or compete against; exit paths. Operator: which rival may be bought or refunded.

### Scene 6 — Truth Lens
**Picture:** A panel that looks like a lab notebook. Left: the evidence ledger (every API call: endpoint, params, timestamp, credits, snippet) with the running count. Right: disputed items the agent caught, each with the two conflicting values, the rule applied, and the resolution. Below: for the investor lens, the target's homepage claims as cards flipping to Verified / Contradicted / Unverifiable.
**Signals fused:** cross-field consistency inside enrich (total vs timeseries vs range) · news relevance judged against company description · `web/enrich/live` homepage claims vs enrich + `person/enrich` founder histories · identify alternates rejected.
**Insight:** how much of the picture is solid, where the data disagrees, and which claims the company makes that the graph does not support.
**Decision:** Trust level for every other scene. The judges' "verifiable citations for every claim" box, made visible.

### Scene 7 — Decision Deck + Watchtower
**Picture:** Three large cards per lens: *Move · Why · Evidence · Confidence*. Each card names people (founders/CXOs with LinkedIn), investors, or geographies and links to the scene that proves it. Below: the Watchtower — entity watches registered live on every peer (IDs on screen, tracked fields, preview sample), a discovery watch for new entrants matching the market definition, and a feed where incoming deltas are re-run through the scene engines so an alert reads "GTM shift at Bland" rather than "headcount changed".
**Signals fused:** every engine above · `people.founders/cxos/decision_makers` · `watch/company` entity + discovery watches.
**Insight:** what to do, with whom, and what to watch for.
**Decision:** This *is* the decision.

Lens switch (Operator / Investor / Founder) re-ranks the Decision Deck and re-highlights the scenes; nothing is re-fetched.

---

## 4. Agent architecture

```
input ─► Intent ─► Resolve (identify) ─► Discover peers ─► Enrich batch ─► Signals ─► Engines ─► Scenes ─► Decision Deck ─► Watchtower
                                            ▲   qualify / widen / narrow loop   │
                                            └───────────────────────────────────┘
```

**Stages**
1. *Intent* (LLM): company / market / idea; keywords; geography; lens.
2. *Resolve*: `company/identify`; ambiguity resolved by description similarity; alternates logged.
3. *Discover*: candidates from four sources — hybrid `company/search`, `enrich.competitors`, web search "X competitors", LLM-proposed names — all forced through `identify`, then an LLM qualifier accepts/rejects each against the market definition with a reason. Widen (drop headcount floor, relax country, semantic mode) or narrow until 8–15 peers. Max 3 rounds, all logged.
4. *Enrich*: batched `company/enrich` with the full projection needed by the scenes.
5. *Signals*: `job/search` aggregations (domain × category, country, date); `person/search` cross-peer flow and recent senior joins; `web/search/live` news (judged for relevance); `web/enrich/live` homepages stripped to text; geocoding of region strings (offline gazetteer → Nominatim with cache → country centroid fallback).
6. *Engines* (pure functions): Momentum Index, Organic Pull, Distress, GTM Shift, Talent Magnet, Expansion Radar, Capital Map, Consolidation pairs, Truth checks.
7. *Scenes*: typed JSON per scene for the frontend.
8. *Decision Deck* (LLM, constrained): ranks engine outputs per lens; citation validator enforces ledger IDs.
9. *Watchtower*: preview → create entity watch (headcount changed, funding rounds increased, openings changed; `every_hours: 168`, `expires_at` +30d) + discovery watch on the market filters; delta handler re-runs engines.

**Autonomy rules:** 429/5xx → backoff ×3 then degrade the section and continue; missing fields → "Unverifiable", momentum re-weighted and shown; credit budget per run; nothing is ever fabricated.

**Evidence ledger entry**
```json
{"id":"ev_017","endpoint":"/company/enrich","params":{"domains":["bland.ai"]},"ts":"2026-10-31T12:04:11Z",
 "credits":2,"path":"matches[0].company_data.headcount.growth_percent.yoy","value":49.2,"snippet":{...}}
```

---

## 5. UI

Apple-clean: graphite/white surfaces, one accent (electric blue) for momentum, red reserved for distress and contradictions, Inter type, generous whitespace, Framer Motion transitions. Dark and light.

- **Home**: one input, three example chips (one per lens), auto-detected lens pill.
- **Run view**: left rail = Live Agent Trace (streaming stages, tool calls with sizes, accept/reject/widen decisions, retries, credits); right = scenes fading in as they complete, globe first.
- **Report**: full-bleed scenes 1–7 in a vertical scroll with a sticky scene nav and lens switch; every number is a chip; click → Evidence Drawer (endpoint, params, JSON, copy-as-curl).
- **Stack**: Next.js 15 + TypeScript + Tailwind + Framer Motion; `react-globe.gl` (three.js) for Scene 1; d3 (chord, force) for Scenes 4–5; visx/d3 for streamgraph and bubble trails; backend FastAPI + httpx + SSE + diskcache + tenacity + Anthropic SDK (latest Claude; confirm model id via the claude-api skill at build time); FastMCP; Typer.

```
crustdata/
  api.key  plan.md  README.md
  backend/app/
    crust/client.py  crust/fields.py        # wrapper, batching, cache, backoff, ledger hooks
    agent/{intent,resolve,discover,enrich,signals}.py
    engines/{momentum,pull,distress,gtm,talent,expansion,capital,truth}.py
    scenes/{globe,field,streams,chord,constellation,truth,deck}.py
    ledger.py  pipeline.py  server.py  mcp_server.py  cli.py  geocode.py
  backend/tests/fixtures/                   # recorded live responses
  frontend/                                 # Next.js
```

---

## 6. Build order and checkpoints

| Phase | Build | Live checkpoint |
|---|---|---|
| 0 | Client + ledger + cache + backoff; CLI skeleton | `identify "Vapi"` → canonical id with ledger entry |
| 1 | Intent → Resolve → Discover loop → Enrich batch | `"AI voice agents"` → 8–15 qualified peers with accept/reject trail |
| 2 | Signals (jobs agg, talent flow, news judge, homepages, geocode) + Engines | JSON for all 7 scenes on the voice-AI market; ≥1 disputed item in Truth Lens |
| 3 | Decision Deck per lens + citation validator; Watchtower preview → create | Three lenses give different moves; watch IDs returned |
| 4 | Frontend: home, run view + trace, Scenes 1–7, evidence drawer, lens switch | Full browser run on a never-seen query |
| 5 | MCP + CLI polish + README + fixtures | `market_map` callable from Claude Code |
| 6 | Dry-run on 3 fresh inputs; record 2-minute video | Video done |

---

## 7. Live test matrix

| Input | Lens | Must be visible |
|---|---|---|
| "AI voice agent platforms" | Founder | ≥10 peers incl. Vapi, Retell, Bland, ElevenLabs, Sierra, Synthflow; globe arcs to India/EU regions; chord with ≥50 moves |
| "Should I invest in Bland AI" | Investor | Momentum rank, Organic Pull vs ad spend, claim cards from bland.ai, constellation with its investors glowing, 3 moves |
| "We are Retell" | Operator | GTM shift badges on rivals, talent targets, geography to defend |
| "AI receptionist for dental clinics in India" | Founder | Crowdedness, whitespace on the globe (India sparse), investors with open slots |
| "Hubspot" (two identify matches at 1.0) | Operator | Disambiguation in the trace with rejected alternate |
| "zzz nonexistent corp" | any | Honest failure: web fallback → "could not resolve" + suggestions |
| Simulated 429 mid-run | any | Backoff visible, section degrades, run completes |

---

## 8. Two-minute demo

0:00 Type "AI voice agent platforms". Trace streams: identify → 23 candidates → 11 rejected with reasons → widen → 12 peers.
0:25 Globe spins in: arcs from SF to Ahmedabad and Warsaw; hiring pulses in India; scrub time, regions light up.
0:45 Momentum Field: scrub 12 months, ElevenLabs and Sierra streak up-right, Synthflow pulses red.
1:00 Build vs Sell: Bland's sales band swells, badge "GTM shift Q2 2026".
1:15 Talent Chord: 73 moves, ElevenLabs net winner. Capital Constellation: kingmaker investors glow, open slots faint.
1:35 Click a number → Evidence Drawer with raw Crustdata JSON. Truth Lens: disputed headcount resolved, hotel news rejected.
1:50 Lens → Investor: Decision Deck re-ranks, three moves with founders to contact. Watchtower: 12 watches registered, IDs on screen. End.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Region strings like "Greater Ahmedabad Area" | Offline gazetteer first, Nominatim with disk cache, country centroid fallback, unresolved shown as "unplaced" |
| Globe performance | Cap at 15 peers, ≤300 arcs, lazy-load three.js, static fallback map image if WebGL missing |
| Semantic search noise | Four candidate sources + identify + LLM qualifier with visible reasons |
| Rate limits on stage | Batching, disk cache, pre-warmed demo query, live for new ones |
| LLM number hallucination | Citation validator over the ledger |
| Watch credits | Preview first; weekly trigger; 30-day expiry; max 25 results/run |
| Person data on stage | Aggregated; names only for founders/CXOs; toggle for the rest |

---

## 10. Decisions taken

1. Name: **Vantage** (working title).
2. Exactly seven scenes; feature requests go into a scene or are rejected.
3. Investor lens polished first (it has the claim cards); other lenses differ only in the Decision Deck ranking and highlights.
4. Momentum Index v1 weights: headcount growth 30 · hiring velocity 20 · organic traffic trend 20 · follower growth 10 · funding recency 20; re-weighted and shown when a stream is missing.
5. Numbers in code; prose by the LLM; every number cited or the sentence is dropped.
