# Handoff → Anupam's agent (from Aman's side, 2026-10-31)

Paste the block below as the prompt for the agent working in `anupam/frontend` (or on `main` now that PR #1 is merged).

---

You are continuing the **Vantage** frontend in `frontend/` of https://github.com/NoviceCoderInfinity/la-pursuit. Read `PRD.md` §8 (contract, with the "Additions agreed 2026-10-31" block), `features.md`, and `frontend/lib/types.ts` first. `main` already contains your shell + Globe/Streams/Chord/Constellation, merged with Aman's backend and his three scenes (`scenes/Field`, `scenes/Truth`, `scenes/Deck`). `npm run build` passes on `main`.

**What exists now**
- Backend (`backend/`, FastAPI): `POST /api/run` answers in <0.1s; SSE at `/api/run/{id}/events`; `GET /api/run/{id}`; `GET /api/run/{id}/evidence/{ev}`; `POST /api/run/{id}/lens`; `GET /api/credits`. Run it with `cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && uvicorn app.server:app --port 8001`. It needs `backend/.env` with `CRUSTDATA_API_KEY` (ask Aman). No LLM key is used anywhere.
- `fixtures/voice_ai.json` is a real recorded `RunReport` for "AI voice agent platforms" (15 peers, 7 scenes, live watch ids). **Replace the synthetic sample in `lib/mock.ts` with this fixture** so the offline fallback shows real data: load it as the mock report and derive `mockTrace` from its `trace` array (replay events with ~120 ms spacing; `scene_ready` events already carry full payloads). Keep the "Sample data" pill.
- Contract deltas you must handle (all additive, already in `lib/types.ts`): `stage_done` on `enrich` **and** `signals` carries `data.peers` (signals re-sends peers with geocoded HQ); extra trace type `note`; decision kinds `dispute` and `fallback` (add glyphs in `Trace.tsx`, e.g. `≠` and `⇢`); `tool_result.detail.endpoint/cached`; stages `deck` and `watch` follow `scenes` (add them to `STAGES` in the stage bar or ignore them); `FieldScene.axes` is now `headcount_growth_6m_pct` × `traffic_growth_3m_pct` with `pull` per point and a `table` of per-peer engine rows.

**Your tasks, in order**
1. Wire the fixture into `lib/mock.ts` as above and delete the synthetic generator once it renders.
2. Globe: use `arcs[].kind === "expansion"` (has `since`) as a distinct layer; `unplaced` is non-trivial on real data (≈40 entries) — render it as a collapsed "unplaced regions" list under the globe, not inline.
3. Streams: `ad_budget_series` on real data is one observation repeated over the last 6 months (the API gives only a current monthly budget) — label the strip "current ad budget", don't imply a trend. `gtm_shift.date` is the first day of the month the shift started.
4. Chord: `senior_joins[].from_company` can be "—"; `moves[].titles` can be empty. Real runs have 5–15 moves across 15 peers, so the ring must still read well when sparse (show counts on hover, fade empty ribbons).
5. Constellation: real `nodes` are ~60 with investors that back one peer each; keep kingmakers central and let single-bet investors sit in an outer ring; `edges[].attributed=false` means the round's lead is unknown (draw thinner).
6. Trace: unknown decision kinds must render (no `undefined` glyph). Show `note` events in muted text.
7. Run `npm run build` before every push; don't change types in `lib/types.ts` without a line in PR text — Aman's scenes depend on them.

**Live test** once the backend is up: open `http://localhost:3000`, run "AI voice agent platforms" (founder), "Should I invest in Bland AI" (investor), "We are Retell" (operator); every number should open the evidence drawer; the lens switch must re-rank Decisions without refetching.
