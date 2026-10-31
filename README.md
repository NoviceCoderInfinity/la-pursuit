# Vantage

Autonomous market intelligence on Crustdata's identity graph. One sentence in — a company, a market, or an idea — seven visual scenes and three decisions out. Every number on screen opens the exact API response that produced it.

```
input ─► intent ─► resolve ─► discover peers ─► enrich (batched) ─► signals ─► engines ─► scenes ─► deck ─► watch
                                     ▲  qualify / widen / narrow loop  │
```

| Scene | What it shows | Crustdata endpoints |
|---|---|---|
| 01 Atlas | Globe: HQs, where people sit, hiring pulses, talent arcs, 24-month scrubber | enrich (headcount by region, timeseries), job/search, person/search |
| 02 Momentum | Bubble field with 12-month trails; Momentum Index, Organic Pull, distress | enrich (headcount, web_traffic, seo, followers, funding, hiring, reviews) |
| 03 Build vs Sell | Role-mix streamgraphs, roles added, ad budget, GTM-shift badge | enrich (function timeseries), job/search aggregations |
| 04 Talent | Chord of people who moved between peers; senior joins | person/search |
| 05 Capital | Investors ↔ companies; kingmakers, open slots, consolidation pairs | enrich (funding milestones, investors) |
| 06 Truth | Evidence ledger, field conflicts and how they were settled, claims vs graph | every call; web/enrich/live, web/search/live |
| 07 Decisions | Three cited moves per lens; live Watchtower | watch/company, watch/company/search |

Lenses: **Operator** · **Investor** · **Founder**. Auto-detected, switchable without refetching.

No LLM key is used. Intent, qualification and the decision deck are rule-based (`backend/app/llm.py` is an optional upgrade path).

## Run it

```bash
# backend (Python 3.12+)
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
printf "CRUSTDATA_API_KEY=...\nCRUSTDATA_API_VERSION=2025-11-01\n" > .env
uvicorn app.server:app --port 8001

# frontend (Node 20+)
cd frontend && npm i && API_ORIGIN=http://127.0.0.1:8001 npm run dev     # http://localhost:3000
```

Without a backend the UI falls back to `fixtures/voice_ai.json`, a real recorded run.

### CLI
```bash
cd backend && . .venv/bin/activate
python -m app.cli identify "Bland AI"
python -m app.cli run "Should I invest in Bland AI" --lens investor
python -m app.cli run "AI receptionist for dental clinics in India" --no-cache --out report.json
```

### MCP
```bash
claude mcp add vantage -- $PWD/backend/.venv/bin/python -m app.mcp_server
```
Tools: `market_map(query, lens)`, `identify_company(name_or_domain)`, `talent_flow(domains)`, `hiring_intent(domains, days)`.

## API (PRD §8)
`POST /api/run` → `{run_id}` · `GET /api/run/{id}/events` (SSE trace, ends with `done`) · `GET /api/run/{id}` (RunReport) · `GET /api/run/{id}/evidence/{ev}` · `POST /api/run/{id}/lens` · `GET /api/credits`

## Robustness, by design
- Ambiguous names ("Hubspot", "Bland AI") are resolved by context; rejected alternates are logged in the trace.
- Peer discovery pulls from four sources (hybrid search, incumbents search, SEO competitors, web mentions re-verified through `identify`) and widens up to three rounds.
- Field conflicts (headcount total vs timeseries vs declared band) are flagged with both values and the rule used.
- News is disambiguated against the company description (a hotel in Vapi, Gujarat is not Vapi).
- 429/5xx → backoff ×3, then the section degrades and the run completes. Missing data is "Unverifiable", never invented.
- Every API call is cached on disk by request hash; demo re-runs are instant, new queries are fully live.

## Repo
`backend/app` — client, ledger, trace, agent stages, engines, scenes, deck, server, cli, mcp_server · `frontend/` — Next.js 15 app · `fixtures/` — recorded runs · `plan.md`, `features.md`, `PRD.md` — design docs.
