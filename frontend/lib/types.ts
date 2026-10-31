// Frontend ↔ backend contract. Mirrors PRD §8 exactly; change both sides together.

export type EvId = string;
export type Lens = "operator" | "investor" | "founder";
export type SceneKey = "globe" | "field" | "streams" | "chord" | "constellation" | "truth" | "deck";

export interface Peer {
  id: number;
  name: string;
  domain: string;
  logo: string | null;
  hq: { lat: number; lng: number; city: string | null; country: string | null };
  headcount: number | null;
  raised_usd: number | null;
  founded: number | null;
  momentum: number | null;
  distress: number | null;
  ev: EvId[];
}

export interface EvidenceEntry {
  id: EvId;
  endpoint: string;
  params: object;
  ts: string;
  credits: number;
  path: string;
  value: unknown;
  snippet: object;
}

export type TraceType =
  | "tool_call" | "tool_result" | "decision" | "stage_start" | "stage_done"
  | "scene_ready" | "error" | "done" | "note";

export interface TraceEvent {
  ts: string;
  stage: string;
  type: TraceType;
  label?: string;
  detail?: { params?: object; count?: number | null; ms?: number | null; credits?: number; endpoint?: string; cached?: boolean; [k: string]: unknown };
  decision?: {
    kind: "accept" | "reject" | "widen" | "narrow" | "retry" | "degrade" | "disambiguate" | "dispute" | "fallback";
    subject: string;
    reason: string;
  };
  scene?: SceneKey;
  data?: unknown;
  ev?: EvId[];
}

export interface GlobeScene {
  nodes: { peer_id: number; lat: number; lng: number; size: number; ev: EvId[] }[];
  arcs: {
    peer_id: number;
    to: { lat: number; lng: number; label: string };
    people: number;
    kind: "footprint" | "talent" | "expansion";
    to_peer_id?: number;
    ev: EvId[];
  }[];
  pulses: { peer_id: number; country: string; lat: number; lng: number; jobs_90d: number; ev: EvId[] }[];
  timeline: {
    date: string;
    regions: { peer_id: number; label: string; lat: number; lng: number; count: number }[];
  }[];
  unplaced: { peer_id: number; label: string; count: number }[];
}

export interface FieldScene {
  // x/y are trailing growth rates so the 12 frames animate; `pull` (Organic Pull 0-100) rides on each point.
  axes: { x: "headcount_growth_yoy" | "headcount_growth_6m_pct"; y: "organic_pull" | "traffic_growth_3m_pct"; size?: string; color?: string };
  frames: {
    date: string;
    points: { peer_id: number; x: number | null; y: number | null; size: number; momentum: number | null; distress: number | null; pull?: number | null; headcount?: number | null }[];
  }[];
  weights: { headcount: number; hiring: number; traffic: number; followers: number; funding: number };
  ev: Record<number, EvId[]>;
  /** Per-peer engine detail for the aside (owned by F2). */
  table?: FieldRow[];
}

export interface FieldRow {
  peer_id: number;
  momentum: number | null;
  momentum_parts: Record<string, number | null>;
  momentum_weights: Record<string, number>;
  pull: number | null;
  pull_parts: Record<string, number | null>;
  distress: number | null;
  distress_signals: { w: number; text: string }[];
  hc_growth_6m: number | null;
  hc_growth_yoy: number | null;
  traffic_qoq: number | null;
  followers_qoq: number | null;
  visitors: number | null;
  paid_share: number | null;
  ads_budget: number | null;
  kw_gained: number | null;
  kw_lost: number | null;
  openings: number | null;
  jobs_90d: number | null;
  last_round: string | null;
  last_round_date: string | null;
  months_since_round: number | null;
  outlook: number | null;
  recommend: number | null;
}

export const FUNCTIONS = ["Engineering", "Sales", "Customer Success", "Marketing", "Operations", "Other"] as const;
export type Fn = (typeof FUNCTIONS)[number];

export interface StreamsScene {
  peers: {
    peer_id: number;
    series: ({ date: string } & Record<Fn, number>)[];
    jobs_by_category: Record<string, number>;
    ad_budget_series: { date: string; usd: number }[];
    gtm_shift: { date: string; confidence: number; reason: string } | null;
    ev: EvId[];
  }[];
}

export interface ChordScene {
  peers: { peer_id: number; sentiment: number | null; net_flow: number; fill_rate: number | null }[];
  matrix: number[][]; // matrix[i][j] = people from peer i to peer j
  moves: { from: number; to: number; count: number; titles: string[]; ev: EvId[] }[];
  senior_joins: { peer_id: number; title: string; from_company: string; date: string; ev: EvId[] }[];
}

export interface ConstellationScene {
  nodes: {
    id: string;
    type: "investor" | "company";
    label: string;
    size: number;
    kingmaker: boolean;
    open_slot: boolean;
    acquisitive: boolean;
    distress: number | null;
    peer_id?: number;
  }[];
  edges: {
    from: string;
    to: string;
    date: string | null;
    amount_usd: number | null;
    round: string | null;
    recent: boolean;
    ev: EvId[];
  }[];
}

export interface TruthScene {
  ledger_count: number;
  credits_used: number;
  disputes: {
    peer_id: number;
    field: string;
    values: { source: string; value: unknown; ev: EvId }[];
    rule: string;
    resolution: string;
  }[];
  claims: {
    peer_id: number;
    claim: string;
    status: "verified" | "contradicted" | "unverifiable";
    ev: EvId[];
    note: string;
  }[];
  rejected_candidates: { name: string; domain?: string | null; reason: string }[];
  rejected_news: { peer_id: number; title: string; reason: string }[];
  /** Extras owned by F6. */
  calls?: number;
  endpoints?: string[];
  news?: Record<number, { title: string; url: string | null; date: string | null; publisher: string | null }[]>;
}

export interface DeckScene {
  lens: Lens;
  moves: {
    title: string;
    why: string;
    confidence: number;
    ev: EvId[];
    scene: "globe" | "field" | "streams" | "chord" | "constellation";
    links: { label: string; url: string }[];
  }[];
  watches: { id: string; kind: "entity" | "discovery"; track: string; status: string; preview_sample?: object | null; entities?: number; resolved?: number; created_at?: string; ev?: EvId[] }[];
  alerts: { ts: string; peer_id: number; engine: string; headline: string; ev: EvId[] }[];
  /** Extras owned by F7. */
  target_id?: number | null;
  diligence_questions?: string[];
  market_stage?: string;
  crowdedness?: number;
}

export interface Scenes {
  globe: GlobeScene;
  field: FieldScene;
  streams: StreamsScene;
  chord: ChordScene;
  constellation: ConstellationScene;
  truth: TruthScene;
  deck: DeckScene;
}

export interface RunReport {
  run_id: string;
  query: string;
  intent: { kind: "market" | "company" | "idea"; keywords: string[]; geo: string | null; lens: Lens };
  peers: Peer[];
  scenes: Partial<Scenes>;
  ledger: EvidenceEntry[];
  trace: TraceEvent[];
  credits_used: number;
}
