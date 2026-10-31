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
  | "scene_ready" | "error" | "done";

export interface TraceEvent {
  ts: string;
  stage: string;
  type: TraceType;
  label?: string;
  detail?: { params?: object; count?: number; ms?: number; credits?: number };
  decision?: {
    kind: "accept" | "reject" | "widen" | "narrow" | "retry" | "degrade" | "disambiguate";
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
  axes: { x: "headcount_growth_yoy"; y: "organic_pull" };
  frames: {
    date: string;
    points: { peer_id: number; x: number; y: number; size: number; momentum: number; distress: number }[];
  }[];
  weights: { headcount: number; hiring: number; traffic: number; followers: number; funding: number };
  ev: Record<number, EvId[]>;
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
  rejected_candidates: { name: string; reason: string }[];
  rejected_news: { peer_id: number; title: string; reason: string }[];
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
  watches: { id: string; kind: "entity" | "discovery"; track: string; status: string; preview_sample?: object }[];
  alerts: { ts: string; peer_id: number; engine: string; headline: string; ev: EvId[] }[];
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
