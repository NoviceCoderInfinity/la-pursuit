# Vantage — Product Requirements Document
_Crustdata Hackathon · Team: Aman Verma, Anupam · v1.0 (2026-10-31)_

## 1. Summary
Vantage is an autonomous market-intelligence agent. Input: one sentence (a company, a market, or an idea). Output: seven visual scenes built from Crustdata's identity graph, three lens-specific decisions, and live Watchers that keep the market alive. Every number is clickable to its evidence.

Read with: `features.md` (what each scene is) and `plan.md` (full rationale, verified API notes, risks).

## 2. Goals and non-goals
**Goals**
1. Take a never-seen request to finished work with zero human input.
2. Use Crustdata massively: identify, enrich (batched), company search, job search aggregations, person search, person enrich, web search, web fetch, watch.
3. Make the UI the argument: seven full-bleed scenes, Apple-clean, dark + light, motion everywhere it explains something.
4. Every claim cited. A validator rejects any sentence with a number not in the evidence ledger.

**Non-goals**
- Multi-user accounts, auth, billing.
- More than seven scenes. New ideas go into an existing scene or are rejected.
- Pixel-perfect mobile. Desktop demo first; tablet acceptable.

## 3. Users and lenses
| Lens | Who | Input example | Decision Deck focus |
|---|---|---|---|
| Operator | Founder/PM at a company | "We are Retell" | Threats, geographies to defend, talent to poach, rivals' GTM shifts |
| Investor | VC / angel | "Should I invest in Bland AI" | Momentum rank, growth quality, claim check, co-investors, exit paths, founders to contact |
| Founder | Anyone with an idea | "AI receptionist for dental clinics in India" | Crowdedness, whitespace, investors with open slots, incumbents likely to move in |

Lens is auto-detected from phrasing and switchable in the header. Switching re-ranks the Decision Deck and re-highlights scenes without refetching.

## 4. Hackathon criteria → requirements
| Criterion | Requirement |
|---|---|
| End-to-end | R1 One input → full report + watches with no prompts. Live trace shows every step. |
| Data integrity | R2 Every number carries an evidence id. R3 Truth Lens lists every conflict caught and its resolution. |
| Robustness | R4 Ambiguous identify resolved by context, alternates shown. R5 <8 peers → widen loop (max 3). R6 429/5xx → backoff ×3 then degrade section, run completes. R7 Missing data → "Unverifiable", never fabricated. |
| Demo clarity | R8 Each scene explainable in one sentence. R9 Full run ≤ 90 s on a cached-free query. |

## 5. Scope: the seven scenes
See `features.md` F0–F7. All are in scope. Priority if time runs out: F0, F1, F2, F6, F7, then F4, F5, F3.

## 6. Ownership split

| Area | Owner | Deliverable |
|---|---|---|
| Backend core: Crustdata client, ledger, cache, backoff, pipeline stages (intent, resolve, discover, enrich, signals), all engines, scene JSON builders, FastAPI + SSE, Watchtower, MCP, CLI | **Aman** | `backend/` |
| Frontend shell: Next.js app, design system, home, run view + live trace, scene nav, lens switch, evidence drawer | **Anupam** | `frontend/` |
| F1 Globe (three.js / react-globe.gl) | **Anupam** | `frontend/scenes/Globe` |
| F3 Build vs Sell streamgraphs | **Anupam** | `frontend/scenes/Streams` |
| F4 Talent Flow chord (d3) | **Anupam** | `frontend/scenes/Chord` |
| F5 Capital Constellation (d3-force) | **Anupam** | `frontend/scenes/Constellation` |
| F2 Momentum Field (bubble trails) | **Aman** | `frontend/scenes/Field` |
| F6 Truth Lens + evidence drawer content | **Aman** | `frontend/scenes/Truth` |
| F7 Decision Deck + Watchtower UI | **Aman** | `frontend/scenes/Deck` |
| Fixtures (real recorded runs) so frontend can build without backend | **Aman**, by end of Phase 1 | `fixtures/voice_ai.json` |
| Demo video | both | — |

Swap any row if skills fit better. The contract in §8 is what makes the halves independent.

## 7. Architecture
```
Next.js (frontend)  ──SSE/REST──►  FastAPI (backend)  ──httpx──►  api.crustdata.com
   scenes render           │          pipeline → engines → scenes → ledger
   from scene JSON         └─────────  Anthropic SDK (intent, qualify, narrate)
```
Backend: Python 3.12, FastAPI, httpx, pydantic v2, diskcache, tenacity, anthropic, fastmcp, typer.
Frontend: Next.js 15 (App Router), TypeScript, Tailwind, Framer Motion, react-globe.gl, d3 (chord, force, shape), visx.

## 8. The contract (frontend ↔ backend)

### 8.1 REST
| Method | Path | Body / Returns |
|---|---|---|
| POST | `/api/run` | `{query: string, lens?: "operator"\|"investor"\|"founder"}` → `{run_id}` |
| GET | `/api/run/{id}/events` | SSE stream of TraceEvent (below) |
| GET | `/api/run/{id}` | RunReport |
| GET | `/api/run/{id}/evidence/{ev_id}` | EvidenceEntry |
| POST | `/api/run/{id}/lens` | `{lens}` → DeckScene (re-ranked, no refetch) |
| GET | `/api/credits` | `{credits: number}` |

### 8.2 SSE TraceEvent
```json
{"ts":"2026-10-31T12:00:01Z","stage":"discover","type":"tool_call|tool_result|decision|stage_start|stage_done|scene_ready|error|done",
 "label":"company/search hybrid","detail":{"params":{},"count":23,"ms":812,"credits":0.7},
 "decision":{"kind":"accept|reject|widen|narrow|retry|degrade|disambiguate","subject":"NexaVoxa AI","reason":"12 employees, no funding, description is an agency"},
 "scene":"globe","data":{}, "ev":["ev_012"]}
```
`scene_ready` carries the full scene payload so the UI can render as scenes complete, globe first.

### 8.3 RunReport
```json
{"run_id":"r_abc","query":"AI voice agent platforms","intent":{"kind":"market|company|idea","keywords":[],"geo":null,"lens":"founder"},
 "peers":[Peer],"scenes":{"globe":GlobeScene,"field":FieldScene,"streams":StreamsScene,"chord":ChordScene,"constellation":ConstellationScene,"truth":TruthScene,"deck":DeckScene},
 "ledger":[EvidenceEntry],"trace":[TraceEvent],"credits_used":31.5}
```

### 8.4 Shared types
```ts
type EvId = string;                       // "ev_017"
interface Peer { id: number; name: string; domain: string; logo: string|null;
  hq: {lat:number; lng:number; city:string|null; country:string|null};
  headcount: number|null; raised_usd: number|null; founded: number|null;
  momentum: number|null; distress: number|null; ev: EvId[] }
interface EvidenceEntry { id: EvId; endpoint: string; params: object; ts: string; credits: number;
  path: string; value: unknown; snippet: object }
```

### 8.5 Scene payloads
```ts
interface GlobeScene {
  nodes: {peer_id:number; lat:number; lng:number; size:number; ev:EvId[]}[];
  arcs:  {peer_id:number; to:{lat:number; lng:number; label:string}; people:number;
          kind:"footprint"|"talent"|"expansion"; to_peer_id?:number; ev:EvId[]}[];
  pulses:{peer_id:number; country:string; lat:number; lng:number; jobs_90d:number; ev:EvId[]}[];
  timeline:{date:string; regions:{peer_id:number; label:string; lat:number; lng:number; count:number}[]}[];
  unplaced:{peer_id:number; label:string; count:number}[] }

interface FieldScene {
  axes:{x:"headcount_growth_yoy"; y:"organic_pull"};
  frames:{date:string; points:{peer_id:number; x:number; y:number; size:number; momentum:number; distress:number}[]}[];
  weights:{headcount:number; hiring:number; traffic:number; followers:number; funding:number};
  ev:Record<number,EvId[]> }

interface StreamsScene { peers:{peer_id:number;
  series:{date:string; Engineering:number; Sales:number; "Customer Success":number; Marketing:number; Operations:number; Other:number}[];
  jobs_by_category:Record<string,number>; ad_budget_series:{date:string; usd:number}[];
  gtm_shift:{date:string; confidence:number; reason:string}|null; ev:EvId[]}[] }

interface ChordScene { peers:{peer_id:number; sentiment:number|null; net_flow:number; fill_rate:number|null}[];
  matrix:number[][];                       // moves[i][j] = people from peer i to peer j
  moves:{from:number; to:number; count:number; titles:string[]; ev:EvId[]}[];
  senior_joins:{peer_id:number; title:string; from_company:string; date:string; ev:EvId[]}[] }

interface ConstellationScene {
  nodes:{id:string; type:"investor"|"company"; label:string; size:number; kingmaker:boolean; open_slot:boolean;
         acquisitive:boolean; distress:number|null; peer_id?:number}[];
  edges:{from:string; to:string; date:string|null; amount_usd:number|null; round:string|null; recent:boolean; ev:EvId[]}[] }

interface TruthScene { ledger_count:number; credits_used:number;
  disputes:{peer_id:number; field:string; values:{source:string; value:unknown; ev:EvId}[]; rule:string; resolution:string}[];
  claims:{peer_id:number; claim:string; status:"verified"|"contradicted"|"unverifiable"; ev:EvId[]; note:string}[];
  rejected_candidates:{name:string; reason:string}[]; rejected_news:{peer_id:number; title:string; reason:string}[] }

interface DeckScene { lens:"operator"|"investor"|"founder";
  moves:{title:string; why:string; confidence:number; ev:EvId[]; scene:"globe"|"field"|"streams"|"chord"|"constellation";
         links:{label:string; url:string}[]}[];
  watches:{id:string; kind:"entity"|"discovery"; track:string; status:string; preview_sample?:object}[];
  alerts:{ts:string; peer_id:number; engine:string; headline:string; ev:EvId[]}[] }
```
Every visual element with a number must expose its `ev` so the evidence drawer can open from it.

### 8.6 Geocoding rule (Globe)
Crustdata region strings are messy ("Greater Ahmedabad Area", "Los Angeles Metropolitan Area", bare "Surat"). Tested live: raw strings fail or mis-place on Nominatim (LA Metropolitan Area → Lima, Peru). The backend resolves them in this order, and every result is cached on disk forever:
1. **Normalize**: strip `Greater `, ` Area`, ` Metropolitan Area`, ` Metro`; take the first comma segment as city; expand US state codes (`Dallas, TX` → `Dallas, TX, United States`).
2. **Country hint**: append the peer's `headcount.largest_headcount_country` or `locations.country` when the string has no country (`Surat` → `Surat, India`).
3. **Offline gazetteer** (`backend/app/data/cities.json`, ~1k major cities) checked first; zero network.
4. **Nominatim** (`nominatim.openstreetmap.org`, 1 request/s, custom User-Agent) for misses. A result is rejected if its country disagrees with the hint.
5. **Fallback**: country centroid; if still unresolved, the region goes to `GlobeScene.unplaced` and the UI lists it under the globe rather than dropping it silently.
Verified: `Ahmedabad, India`, `Surat, India`, `Los Angeles, United States`, `Valsad, India`, `Pune, India`, `Dallas, TX, United States` all resolve correctly after normalization.

## 9. Design system (frontend)
- Surfaces: graphite `#0B0C0E` / white `#FFFFFF`; text `#EDEDED` / `#111111`; muted `#8A8F98`.
- Accent: electric blue `#3B82F6` (momentum, selection). Red `#EF4444` only for distress and contradictions. Green `#22C55E` only for verified.
- Type: Inter; display 40/48 semibold, body 15/22, mono for evidence JSON.
- Radius 12; borders 1px at 8% alpha; shadows soft and rare.
- Motion: Framer Motion, 200–400 ms, ease-out; scenes fade+rise on ready; time scrubbers animate at 24 frames/s.
- Every number is a chip: `<Num value ev={[...]}/>` → click opens the Evidence Drawer.
- Scene layout: full-bleed, 100vh min, title (one sentence) top-left, legend top-right, scrubber bottom.

## 10. Phases and sync points
| Phase | Aman | Anupam | Sync point |
|---|---|---|---|
| 0 | Client, ledger, cache, CLI `identify` | Next.js scaffold, design tokens, Evidence Drawer, `<Num/>` | Agree on §8 types; stub JSON checked in |
| 1 | Intent → resolve → discover → enrich; `fixtures/voice_ai.json` recorded | Home + run view + trace renderer against stub events | Fixture lands; Anupam switches to it |
| 2 | Signals + engines + scene builders (all 7 JSON) | Globe, Streams, Chord, Constellation on fixture | Scene JSON shape frozen |
| 3 | Deck + validator + Watchtower; Field, Truth, Deck UI | Polish scenes, time scrubbers, layer toggles | Full browser run on live query |
| 4 | MCP + CLI + README | Dark/light, motion pass, responsive | Dry run ×3, record video |

## 11. Setup
```bash
# backend
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cp ../.env.example .env   # CRUSTDATA_API_KEY=..., ANTHROPIC_API_KEY=...
uvicorn app.server:app --reload --port 8000
# frontend
cd frontend && npm i && npm run dev   # http://localhost:3000, proxies /api to :8000
```
`api.key` and `.env` are gitignored. Never commit keys.

## 12. Definition of done
- `"AI voice agent platforms"` runs end-to-end in the browser in ≤ 90 s with all seven scenes populated and ≥ 1 dispute in Truth Lens.
- Three lenses produce different Decision Decks on the same run.
- Any number on any scene opens its evidence.
- Watches registered live with IDs visible.
- Test matrix in `plan.md` §7 passes, including the nonexistent-company and simulated-429 cases.
- Two-minute video recorded.
