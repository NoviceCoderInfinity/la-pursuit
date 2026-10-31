// Client for the PRD §8 API. Falls back to a local run when the backend is unreachable, so every
// screen works offline. Mock run ids start with "mock_". The fallback replays the recorded run in
// fixtures/voice_ai.json (copied to public/ by `predev`/`prebuild`); the synthetic run in mock.ts is
// only used if that file is missing.
import { mockDeck, mockReport, mockTrace } from "./mock";
import type { DeckScene, EvidenceEntry, Lens, RunReport, TraceEvent } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const FORCE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
const FIXTURE_URL = "/fixtures/voice_ai.json";
const REPLAY_SPEED = 3; // recorded run plays 3× faster
const REPLAY_MAX_GAP_MS = 700;

export const isMock = (runId: string) => runId.startsWith("mock_");

type Offline = { report: RunReport; recorded: boolean };
let fixture: Promise<RunReport | null> | null = null;
const loadFixture = () =>
  (fixture ??= fetch(FIXTURE_URL)
    .then((r) => (r.ok ? (r.json() as Promise<RunReport>) : null))
    .catch(() => null));

const synthetic = new Map<string, RunReport>();
async function offline(query: string, lens?: Lens): Promise<Offline> {
  const rec = await loadFixture();
  if (rec) return { report: rec, recorded: true };
  const key = `${query}|${lens ?? ""}`;
  if (!synthetic.has(key)) synthetic.set(key, mockReport(query, lens));
  return { report: synthetic.get(key)!, recorded: false };
}

/** Recorded trace → replay schedule, keeping the real rhythm but compressed. */
function replay(trace: TraceEvent[]) {
  let at = 0;
  return trace.map((ev, i) => {
    if (i > 0) {
      const gap = Date.parse(ev.ts) - Date.parse(trace[i - 1].ts);
      at += Math.min(REPLAY_MAX_GAP_MS, Math.max(0, gap) / REPLAY_SPEED);
    }
    return { delay: at, ev };
  });
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json() as Promise<T>;
}

export async function startRun(query: string, lens?: Lens): Promise<{ run_id: string }> {
  if (!FORCE_MOCK) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 4000);
      const out = await json<{ run_id: string }>("/api/run", {
        method: "POST", body: JSON.stringify({ query, lens }), signal: ctl.signal,
      });
      clearTimeout(timer);
      return out;
    } catch {
      /* backend down → sample run */
    }
  }
  return { run_id: "mock_voice_ai" };
}

export function subscribe(
  runId: string,
  ctx: { query: string; lens?: Lens },
  onEvent: (e: TraceEvent) => void,
): () => void {
  if (isMock(runId)) {
    let timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    offline(ctx.query, ctx.lens).then(({ report, recorded }) => {
      if (cancelled) return;
      const plan = recorded ? replay(report.trace) : mockTrace(report);
      timers = plan.map(({ delay, ev }) => setTimeout(() => onEvent(ev), delay));
    });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }
  const es = new EventSource(`${BASE}/api/run/${runId}/events`);
  es.onmessage = (m) => {
    const ev = JSON.parse(m.data) as TraceEvent;
    onEvent(ev);
    if (ev.type === "done") es.close();
  };
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) return;
    onEvent({ ts: new Date().toISOString(), stage: "client", type: "error", label: "stream interrupted" });
    es.close();
  };
  return () => es.close();
}

export async function getReport(runId: string, ctx: { query: string; lens?: Lens }): Promise<RunReport> {
  if (isMock(runId)) return (await offline(ctx.query, ctx.lens)).report;
  return json<RunReport>(`/api/run/${runId}`);
}

export async function getEvidence(runId: string, evId: string, ctx: { query: string; lens?: Lens }): Promise<EvidenceEntry | null> {
  if (isMock(runId)) return (await offline(ctx.query, ctx.lens)).report.ledger.find((e) => e.id === evId) ?? null;
  return json<EvidenceEntry>(`/api/run/${runId}/evidence/${evId}`);
}

export async function setLens(runId: string, lens: Lens, ctx: { query: string; lens?: Lens }): Promise<DeckScene> {
  if (isMock(runId)) {
    const { report, recorded } = await offline(ctx.query, ctx.lens);
    // A recording holds one lens's deck; re-ranking needs the backend.
    return recorded ? { ...(report.scenes.deck as DeckScene), lens } : mockDeck(lens, report.peers);
  }
  return json<DeckScene>(`/api/run/${runId}/lens`, { method: "POST", body: JSON.stringify({ lens }) });
}

export async function getCredits(): Promise<number | null> {
  try {
    return (await json<{ credits: number }>("/api/credits")).credits;
  } catch {
    return null;
  }
}

export function curlFor(e: EvidenceEntry) {
  return [
    `curl -X POST https://api.crustdata.com${e.endpoint}`,
    `  -H 'authorization: Bearer $CRUSTDATA_API_KEY'`,
    `  -H 'x-api-version: 2025-11-01'`,
    `  -H 'content-type: application/json'`,
    `  -d '${JSON.stringify(e.params)}'`,
  ].join(" \\\n");
}
