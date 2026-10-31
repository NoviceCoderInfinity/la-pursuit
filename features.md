# Vantage — Features

**One line:** Type a company, a market, or an idea. An agent builds the whole market from Crustdata's identity graph and shows it as seven pictures and three decisions. Every number on screen clicks through to the exact Crustdata response that produced it.

**Lenses:** Operator (I run a company) · Investor (should I back this?) · Founder (is my idea worth building?). Same pipeline, different Decision Deck.

Each feature below is a full-bleed visual scene. If a slide could say it, it is not a feature.

---

## F0 · The Agent (the engine behind every scene)
**What:** From one messy sentence to 8–15 canonical peers, fully enriched, with no human in the loop. A live trace shows every tool call, every accept/reject, every widen/retry.
**Crustdata:** `company/identify` → `company/search` (hybrid) + `enrich.competitors` + `web/search/live` → every candidate re-verified through `identify` → batched `company/enrich` → `job/search` aggregations → `person/search` → `web/enrich/live` → `watch/company`.
**Why it wins:** This is the End-to-End criterion, made visible.

## F1 · The Globe — Market Atlas
**What:** A 3D globe. Peers glow at their HQ sized by headcount. Arcs reach the regions where their people actually sit. Job postings pulse on countries where roles were added in the last 90 days. Talent moves travel as arcs between HQs. A 24-month scrubber animates regions lighting up. Layers: People · Hiring · Talent · Expansion.
**Crustdata:** `locations.headquarters` · `headcount.by_region_absolute` · `headcount.by_function_timeseries.GEO_REGION` · `job/search` group_by `location.country` · `person/search` cross-peer moves · news.
**Insight → decision:** Where the market's center of gravity is, who is offshoring, who just entered a geography. Operator: defend/attack. Founder: where competition is absent.

## F2 · Momentum Field
**What:** Bubble field with 12-month trails. x = headcount growth, y = Organic Pull (earned traffic + keyword gains per ad dollar), size = raised, color = Momentum Index. Distress pulses red. Scrub time and watch who accelerates and who stalls.
**Crustdata:** `headcount.timeseries` · `web_traffic` visitors + source-mix timeseries · `seo` keywords gained/lost + ads budget · `followers.timeseries` · `funding.milestones` · `hiring.open_jobs_timeseries` · `employee_reviews.business_outlook_rating`.
**Insight → decision:** Earned vs bought growth; who is the real threat; early distress. Investor: dig in or avoid.

## F3 · Build vs Sell Streams
**What:** A streamgraph per peer: role mix over time (Engineering / Sales / CS / Marketing / Ops) with open-roles-by-category and monthly ad budget overlaid. The flip from build mode to sell mode is visible as the sales band swells. Badge: "GTM shift detected · Q2 2026".
**Crustdata:** `headcount.by_function_timeseries` · `by_role_growth_6m_pct` · `job/search` group_by category · `hiring.by_function_qoq_pct` · `seo.monthly_google_ads_budget` · news.
**Insight → decision:** Who is going to market now. Operator: brace for account competition. Founder: the window is open or closing.

## F4 · Talent Flow Chord
**What:** A chord diagram of peers. Ribbon width = people who moved A→B. Ring color = employee sentiment. Net winners expand, net losers shrink. Side list: recent senior joins and where they came from.
**Crustdata:** `person/search` (current ∈ peers AND past ∈ peers; seniority; start_date ≤ 6 mo) · `employee_reviews` · fill rate from `headcount.growth` ÷ `hiring.openings_count` · `people.cxos`.
**Insight → decision:** Who is the talent magnet; exec hires that reveal intent. Operator: whom to poach from. Investor: team risk.

## F5 · Capital Constellation
**What:** A force graph of investors and companies. Each round is an edge; last-12-month edges glow. Investors in ≥2 peers sit at the center (kingmakers). Adjacent-category investors with no bet here appear as faint open slots. Acquisitive companies get an M&A halo; distressed peers drift toward them as likely targets.
**Crustdata:** `funding.investors_detailed` · `funding.milestones` · `funding.acquisitions` / `acquired_by` · capital efficiency (`total_investment_usd` ÷ `headcount.total`) · F2 distress.
**Insight → decision:** Who is deploying now, syndicate clusters, open slots, consolidation pairs. Founder: whom to pitch, in order. Investor: co-investors and exit paths.

## F6 · Truth Lens
**What:** A lab-notebook panel. Left: the evidence ledger (every API call, params, timestamp, credits, snippet). Right: every data conflict the agent caught, with both values, the rule, and the resolution. Investor lens: the target's homepage claims as cards flipping to Verified / Contradicted / Unverifiable.
**Crustdata:** cross-field checks in `enrich` (total vs timeseries vs range) · news relevance vs description · `web/enrich/live` claims vs `enrich` + `person/enrich` founder histories · rejected `identify` alternates.
**Why it wins:** The Data Integrity criterion made into a picture. Found live: Vapi headcount 14 vs 149; a hotel in Vapi, Gujarat in the news feed.

## F7 · Decision Deck + Watchtower
**What:** Three cards per lens: Move · Why · Evidence · Confidence, naming people (founders/CXOs with LinkedIn), investors, or geographies, each linked to the scene that proves it. Below: entity watches registered live on every peer (IDs on screen), a discovery watch for new entrants, and a feed where deltas are re-run through the engines so an alert reads "GTM shift at Bland", not "headcount changed".
**Crustdata:** every engine · `people.founders / cxos / decision_makers` · `watch/company` entity + discovery watches.
**Why it wins:** Finished work, not a report. The Watcher endpoint most teams skip.

---

## Criteria map
| Hackathon criterion | Where it shows |
|---|---|
| End-to-end execution | F0 trace, F7 deck + watches |
| Data integrity & verification | F6, evidence chips on every number |
| Robustness & edge cases | F0 widen/reject/retry trail, F6 disputes, "Unverifiable" states |
| Demo clarity | F1–F5 are the demo; each scene is one sentence to explain |
