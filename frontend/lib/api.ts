// Client for the PRD §8 API. Falls back to a local sample run when the backend is unreachable,
// so every screen works offline. Mock run ids start with "mock_".
import { mockDeck, mockReport, mockTrace } from "./mock";
import type { DeckScene, EvidenceEntry, Lens, RunReport, TraceEvent } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const FORCE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

export const isMock = (runId: string) => runId.startsWith("mock_");

const mockCache = new Map<string, RunReport>();
function mockFor(query: string, lens?: Lens) {
  const key = `${query}|${lens ?? ""}`;
  if (!mockCache.has(key)) mockCache.set(key, mockReport(query, lens));
  return mockCache.get(key)!;
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
    const timers = mockTrace(mockFor(ctx.query, ctx.lens)).map(({ delay, ev }) => setTimeout(() => onEvent(ev), delay));
    return () => timers.forEach(clearTimeout);
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
  if (isMock(runId)) return mockFor(ctx.query, ctx.lens);
  return json<RunReport>(`/api/run/${runId}`);
}

export async function getEvidence(runId: string, evId: string, ctx: { query: string; lens?: Lens }): Promise<EvidenceEntry | null> {
  if (isMock(runId)) return mockFor(ctx.query, ctx.lens).ledger.find((e) => e.id === evId) ?? null;
  return json<EvidenceEntry>(`/api/run/${runId}/evidence/${evId}`);
}

export async function setLens(runId: string, lens: Lens, ctx: { query: string; lens?: Lens }): Promise<DeckScene> {
  if (isMock(runId)) return mockDeck(lens, mockFor(ctx.query, ctx.lens).peers);
  return json<DeckScene>(`/api/run/${runId}/lens`, { method: "POST", body: JSON.stringify({ lens }) });
}

export interface WatchStatus {
  id: string; kind: "entity" | "discovery"; status: string; last_run_at?: string | null; notifications_count?: number | null;
  runs: { id: number; status: string; started_at: string; completed_at: string | null; records_searched: number | null; records_matched: number | null; new_records_count: number | null }[];
  ev?: string[];
}
export async function getWatchStatus(runId: string): Promise<WatchStatus[]> {
  if (isMock(runId)) return [];
  return json<WatchStatus[]>(`/api/run/${runId}/watch`);
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
