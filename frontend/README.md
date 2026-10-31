# Vantage · frontend

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Framer Motion · react-globe.gl · d3.

```bash
npm i
npm run dev            # http://localhost:3000, proxies /api → http://localhost:8000
```

- **No backend?** `POST /api/run` falls back to replaying the recorded run in `fixtures/voice_ai.json` (copied to `public/fixtures/` by `predev`/`prebuild`), shown with a "Sample data" pill. There is no synthetic data. Force it with `NEXT_PUBLIC_MOCK=1`.
- **Other backend origin:** `API_ORIGIN=http://host:8000 npm run dev`.

## Layout
| Path | What |
|---|---|
| `lib/types.ts` | PRD §8 contract, verbatim. Change with the backend. |
| `lib/api.ts` | REST + SSE client, recorded-run fallback |
| `lib/run-context.tsx` | Run state: trace, peers, scenes, lens, evidence drawer |
| `components/` | `Num` (cited number chip), `EvidenceDrawer`, `Trace`, `GlobeCanvas`, UI primitives |
| `scenes/{Globe,Streams,Chord,Constellation}` | F1, F3, F4, F5 |
| `app/run/[id]/RunView.tsx` | Scene registry. F2 Field, F6 Truth, F7 Deck plug in via `VIEWS` |

## Backend notes
- Scenes reference peers by id; the frontend reads `data.peers` from any event (backend sends it on `enrich` and `signals` `stage_done`). The full `RunReport` is fetched on `done`.
- `compress: false` in `next.config.ts` is required: gzip would buffer the proxied SSE trace until the run ends.
- The trace stage bar expects stage names `intent, resolve, discover, enrich, signals, engines, scenes, deck, watch`.
