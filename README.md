# Vantage

**Live:** [vantagemarket.vercel.app](https://vantagemarket.vercel.app) · **Demo video:** [youtu.be/W0FskB-NIDw](https://youtu.be/W0FskB-NIDw)

Vantage is an autonomous market-intelligence agent built on Crustdata's API. You ask one question about a company, a market or an idea. It resolves the companies, finds and qualifies the peer set, enriches every peer, and returns an answer shaped for your persona. Every number on screen is clickable and opens the exact Crustdata response that produced it. It uses no LLM key: intent, qualification and every judgment are rule-based.

## Who it's for

Each persona sees only its own scenes.

| Persona | Scenes | Answers |
|---|---|---|
| Investor | Momentum, Truth, Capital, Talent, Decisions | Rank against peers, the company's own claims checked against the graph, its syndicate, team health, a verdict with diligence questions |
| Operator | Momentum, Build vs Sell, Atlas, Talent, Decisions | Who is catching you, who switched to selling, where rivals hire, who is poaching your people |
| Founder | Atlas, Momentum, Capital, Decisions | How crowded the market is, who is winning or stalling, which investors to pitch, the wedge |

Each run opens with a brief: the question, a direct answer led by the focus company (for example "Retell is not pulling ahead: Bland 74 vs Retell 69 on momentum"), six numbers for the persona, and the momentum leaders. Each scene ends with one cited "what to do" line. Decisions adds a latest-signals timeline and a live Watchtower that registers real Crustdata entity and discovery watches.

## How it works

```
intent -> resolve -> discover -> enrich -> signals -> engines -> scenes -> decisions -> watch
```

- **Disambiguation.** Ambiguous names ("Bland AI", "Hubspot") are resolved by context. The trace logs the alternates it rejected.
- **Four-source discovery.** Peers come from hybrid company search, incumbent search, SEO competitors, and web mentions re-verified through `identify`. Discovery widens for up to three rounds. Rejected candidates stay visible in Truth.
- **Conflict detection.** When fields disagree (headcount total vs timeseries vs declared band), the scene shows both values and the rule that settled them.
- **News disambiguation.** News items are checked against the company description, so a hotel in Vapi, Gujarat is not counted as Vapi.
- **Honest failures.** On 429, 5xx or a network error the client backs off and retries (three attempts). After that the section degrades and the run still completes. Missing data is shown as "Unverifiable" and is never invented.
- **Disk cache.** Every API call is cached on disk (`backend/.cache`, 24h) by request hash. Set `VANTAGE_NO_CACHE=1` or use `--no-cache` to force live calls.

## Crustdata endpoints used

`/company/identify`, `/company/enrich`, `/company/search`, `/job/search`, `/person/search`, `/person/enrich`, `/web/search/live`, `/web/enrich/live` (web fetch), `/watch/company`, `/watch/company/search`, `/watch/company/{id}/runs`, `/account/credits`.

## Run it

```bash
# backend (Python 3.12+)
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
cp ../.env.example .env        # set CRUSTDATA_API_KEY
uvicorn app.server:app --port 8001

# frontend (Node 20+), http://localhost:3000
cd frontend && npm i && API_ORIGIN=http://127.0.0.1:8001 npm run dev
```

Optional backend env: `VANTAGE_ENRICH_TIMEOUT` (seconds, default 45; past it a company keeps search-level data), `VANTAGE_SITE_TIMEOUT` (homepage fetch, default 40), `VANTAGE_CREATE_WATCHES=0` (preview watches without creating them), `VANTAGE_NO_CACHE=1`.

## Recorded library

`fixtures/runs/*.json` and `fixtures/runs/index.json` hold five real live runs, recorded with every API response. They open instantly and work without the backend. "Run live" re-runs one against the API.

1. Should I invest in Bland AI, or is Retell pulling ahead? (investor)
2. Is Harvey AI worth backing against Legora? (investor)
3. We are Linear. Who is coming after our customers? (operator)
4. We are Retell. Who is poaching our people? (operator)
5. Is there room for a new AI note-taker for doctors in the US? (founder)

To add a run: run it live (the UI or `python -m app.cli run`), which saves `backend/runs/<run_id>.json`. Then export it:

```bash
cd backend && python -m app.cli export r_1234abcd r_5678efgh --slugs bland-vs-retell,linear-customers
```

This copies the runs to `fixtures/runs/<slug>.json` and rebuilds `index.json`. The frontend copies the library into `public/` on `predev`/`prebuild`.

## CLI and MCP

```bash
cd backend && . .venv/bin/activate
python -m app.cli identify "Bland AI"
python -m app.cli run "Should I invest in Bland AI, or is Retell pulling ahead?" --lens investor [--no-cache] [--out report.json]
python -m app.cli export <run_id ...> --slugs a,b
```

```bash
claude mcp add vantage -- $PWD/backend/.venv/bin/python -m app.mcp_server
```

MCP tools: `market_map(query, lens)`, `identify_company(name_or_domain)`, `talent_flow(domains)`, `hiring_intent(domains, days)`.

## API

| Endpoint | Returns |
|---|---|
| `POST /api/run` `{query, lens?}` | `{run_id}`; the run executes in the background |
| `GET /api/run/{id}/events` | SSE trace, ends with `done` (saved runs are replayed) |
| `GET /api/run/{id}` | Full run report |
| `GET /api/run/{id}/evidence/{ev}` | The ledger entry behind a number |
| `POST /api/run/{id}/lens` `{lens}` | Decisions for another persona |
| `GET /api/run/{id}/watch` | Live status and runs of the watches the run registered |
| `GET /api/credits` | Remaining Crustdata credits |
| `GET /api/runs` | Runs in this server process |

`python backend/tests/smoke_api.py "<query>"` runs an end-to-end check against a server on port 8001.

## Repo layout

| Path | What |
|---|---|
| `backend/app/crust/` | Crustdata client: rate gates, retries, disk cache, ledger entries |
| `backend/app/agent/` | Pipeline stages: intent, resolve, discover, enrich, signals, deck (decisions and watches) |
| `backend/app/engines/`, `backend/app/scenes/` | Scoring engines and scene builders |
| `backend/app/pipeline.py`, `server.py`, `cli.py`, `mcp_server.py` | Run orchestration and the three entry points |
| `backend/tests/smoke_api.py` | End-to-end check against a running server |
| `frontend/` | Next.js 15 app (see `frontend/README.md`) |
| `fixtures/runs/` | Recorded live library |

Built by Aman Verma and Anupam.
