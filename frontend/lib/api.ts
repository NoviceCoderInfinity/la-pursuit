// Client for the backend API (see README). Falls back to a local run when the backend is unreachable, so every
// screen works offline. Mock run ids start with "mock_". The fallback replays the recorded run in
// fixtures/runs/*.json (live runs recorded with every API response; copied to public/ by `predev`/`prebuild`).
import type { DeckScene, EvidenceEntry, Lens, RunReport, RunSummary, TraceEvent } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const FORCE_OFFLINE = process.env.NEXT_PUBLIC_MOCK === "1";
const LIBRARY_URL = "/fixtures/runs";
const REPLAY_SPEED = 6; // recorded runs replay 6× faster than they ran
const REPLAY_MAX_GAP_MS = 400;

/** Recorded live runs have ids "rec_<slug>"; legacy "mock_*" links map to the voice-agents recording. */
export const isRecorded = (runId: string) => runId.startsWith("rec_") || runId.startsWith("mock_");
export const isMock = isRecorded;
const slugOf = (runId: string) => (runId.startsWith("rec_") ? runId.slice(4) : "ai-voice-agents");

const cache = new Map<string, Promise<RunReport | null>>();
function loadRecorded(slug: string) {
  if (!cache.has(slug)) {
    cache.set(slug, fetch(`${LIBRARY_URL}/${slug}.json`).then((r) => (r.ok ? (r.json() as Promise<RunReport>) : null)).catch(() => null));
  }
  return cache.get(slug)!;
}

async function offline(runId: string): Promise<RunReport> {
  const rec = await loadRecorded(slugOf(runId));
  if (!rec) throw new Error("This recorded run is not available");
  return rec;
}

let library: Promise<RunSummary[]> | null = null;
export function getLibrary(): Promise<RunSummary[]> {
  return (library ??= fetch(`${LIBRARY_URL}/index.json`).then((r) => (r.ok ? (r.json() as Promise<RunSummary[]>) : [])).catch(() => []));
}

const norm = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

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

export class OfflineError extends Error {}

export async function startRun(query: string, lens?: Lens, opts: { live?: boolean } = {}): Promise<{ run_id: string }> {
  // A query we already ran live opens its recording instantly, unless the user asks for a fresh live run.
  const hit = (await getLibrary()).find((r) => norm(r.query) === norm(query) && (!lens || r.lens === lens));
  if (hit?.slug && !opts.live) return { run_id: `rec_${hit.slug}` };
  if (!FORCE_OFFLINE) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 4000);
      const out = await json<{ run_id: string }>("/api/run", {
        method: "POST", body: JSON.stringify({ query, lens }), signal: ctl.signal,
      });
      clearTimeout(timer);
      return out;
    } catch {
      /* live engine unreachable */
    }
  }
  if (hit?.slug) return { run_id: `rec_${hit.slug}` };
  throw new OfflineError("The live engine is offline. Open one of the recorded runs below.");
}

export function subscribe(
  runId: string,
  ctx: { query: string; lens?: Lens },
  onEvent: (e: TraceEvent) => void,
): () => void {
  if (isMock(runId)) {
    let timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    offline(runId)
      .then((report) => {
        if (cancelled) return;
        timers = replay(report.trace).map(({ delay, ev }) => setTimeout(() => onEvent(ev), delay));
      })
      .catch((err: Error) => {
        const ts = new Date().toISOString();
        onEvent({ ts, stage: "client", type: "error", label: err.message });
        onEvent({ ts, stage: "client", type: "done", label: "done" });
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

export async function getReport(runId: string): Promise<RunReport> {
  if (isRecorded(runId)) return offline(runId);
  return json<RunReport>(`/api/run/${runId}`);
}

export async function getEvidence(runId: string, evId: string): Promise<EvidenceEntry | null> {
  if (isRecorded(runId)) return (await offline(runId)).ledger.find((e) => e.id === evId) ?? null;
  return json<EvidenceEntry>(`/api/run/${runId}/evidence/${evId}`);
}

export async function setLens(runId: string, lens: Lens): Promise<DeckScene> {
  if (isRecorded(runId)) {
    const rec = await offline(runId);
    return rec.decks?.[lens] ?? { ...(rec.scenes.deck as DeckScene), lens };
  }
  return json<DeckScene>(`/api/run/${runId}/lens`, { method: "POST", body: JSON.stringify({ lens }) });
}

export interface WatchStatus {
  id: string; kind: "entity" | "discovery"; status: string; last_run_at?: string | null; notifications_count?: number | null;
  runs: { id: number; status: string; started_at: string; completed_at: string | null; records_searched: number | null; records_matched: number | null; new_records_count: number | null }[];
  ev?: string[];
}
export async function getWatchStatus(runId: string): Promise<WatchStatus[]> {
  if (isRecorded(runId)) return [];
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
