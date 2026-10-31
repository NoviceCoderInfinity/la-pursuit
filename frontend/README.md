# Vantage frontend

Next.js 15 (App Router), TypeScript, Tailwind v4, Framer Motion, react-globe.gl, d3.

```bash
npm i
API_ORIGIN=http://127.0.0.1:8001 npm run dev   # http://localhost:3000; /api is proxied to API_ORIGIN (default http://localhost:8000)
```

- **Recorded library.** `predev` and `prebuild` copy `../fixtures/runs/*.json` (five recorded live runs plus `index.json`) into `public/fixtures/runs/`. A question that matches a recorded run opens it instantly and replays its trace; "Run live" starts a fresh run on the backend. With the backend down, the recorded runs still work. `NEXT_PUBLIC_MOCK=1` forces offline mode.
- **No synthetic data.** Everything on screen comes from a live run or a recording of one. There is no data generator.
- **Persona-filtered scenes.** Each persona (investor, operator, founder) sees only its own scenes, in its own order (`PERSONA_SCENES` in `lib/run-context.tsx`). Each run opens with a brief (`components/RunBrief.tsx`).

## Layout

| Path | What |
|---|---|
| `lib/types.ts` | API contract; change together with the backend |
| `lib/api.ts` | REST + SSE client, recorded-library loading and replay |
| `lib/run-context.tsx` | Run state (trace, peers, scenes, lens, evidence drawer) and persona scene lists |
| `components/` | `Num` (cited number), `EvidenceDrawer`, `RunBrief`, `Library`, `Trace`, `GlobeCanvas`, UI primitives |
| `scenes/` | `Globe` (Atlas), `Field` (Momentum), `Streams` (Build vs Sell), `Chord` (Talent), `Constellation` (Capital), `Truth`, `Deck` (Decisions) |
| `app/run/[id]/RunView.tsx` | Scene registry and run shell |

## Notes

- `compress: false` in `next.config.ts` is required: gzip would buffer the proxied SSE trace until the run ends.
- The stage bar expects the backend stage names `intent, resolve, discover, enrich, signals, engines, scenes, deck, watch`.
