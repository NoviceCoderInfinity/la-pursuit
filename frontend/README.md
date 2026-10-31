# Vantage · frontend

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Framer Motion · react-globe.gl · d3.

```bash
npm i
npm run dev            # http://localhost:3000, proxies /api → http://localhost:8000
```

- **No backend?** `POST /api/run` falls back to a built-in sample run (`lib/mock.ts`), shown with a "Sample data" pill. Force it with `NEXT_PUBLIC_MOCK=1`.
- **Other backend origin:** `API_ORIGIN=http://host:8000 npm run dev`.

## Layout
| Path | What |
|---|---|
| `lib/types.ts` | PRD §8 contract, verbatim. Change with the backend. |
| `lib/api.ts` | REST + SSE client, mock fallback |
| `lib/run-context.tsx` | Run state: trace, peers, scenes, lens, evidence drawer |
| `components/` | `Num` (cited number chip), `EvidenceDrawer`, `Trace`, `GlobeCanvas`, UI primitives |
| `scenes/{Globe,Streams,Chord,Constellation}` | F1, F3, F4, F5 |
| `app/run/[id]/RunView.tsx` | Scene registry. F2 Field, F6 Truth, F7 Deck plug in via `VIEWS` |

## Backend notes
- Scenes reference peers by id, so the frontend needs `Peer[]` before the first `scene_ready`. It reads `data.peers` from any event; send it on the `enrich` `stage_done` event. The full `RunReport` is fetched on `done`.
- The trace stage bar expects stage names `intent, resolve, discover, enrich, signals, engines, scenes`.
