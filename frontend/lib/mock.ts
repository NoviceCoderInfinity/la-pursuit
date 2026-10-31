// Sample run used until the backend (or fixtures/voice_ai.json) is available.
// Every value here is synthetic; the UI marks mock runs as "Sample data".
import type {
  ChordScene, ConstellationScene, DeckScene, EvId, EvidenceEntry, FieldScene, Fn, GlobeScene, Lens,
  Peer, RunReport, StreamsScene, TraceEvent, TruthScene,
} from "./types";
import { FUNCTIONS } from "./types";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CITY: Record<string, [number, number, string]> = {
  sf: [37.7749, -122.4194, "United States"],
  nyc: [40.7128, -74.006, "United States"],
  berlin: [52.52, 13.405, "Germany"],
  london: [51.5072, -0.1276, "United Kingdom"],
  bangalore: [12.9716, 77.5946, "India"],
  ahmedabad: [23.0225, 72.5714, "India"],
  pune: [18.5204, 73.8567, "India"],
  hyderabad: [17.385, 78.4867, "India"],
  warsaw: [52.2297, 21.0122, "Poland"],
  krakow: [50.0647, 19.945, "Poland"],
  toronto: [43.6532, -79.3832, "Canada"],
  bogota: [4.711, -74.0721, "Colombia"],
  lisbon: [38.7223, -9.1393, "Portugal"],
  singapore: [1.3521, 103.8198, "Singapore"],
  austin: [30.2672, -97.7431, "United States"],
};

const LABEL: Record<string, string> = {
  sf: "San Francisco", nyc: "New York", berlin: "Berlin", london: "London", bangalore: "Bengaluru",
  ahmedabad: "Ahmedabad", pune: "Pune", hyderabad: "Hyderabad", warsaw: "Warsaw", krakow: "Kraków",
  toronto: "Toronto", bogota: "Bogotá", lisbon: "Lisbon", singapore: "Singapore", austin: "Austin",
};

type PeerSeed = {
  name: string; domain: string; hq: string; hc: number; raised: number; founded: number;
  regions: [string, number][]; newRegion?: string; gtm?: boolean; distress?: number;
};

const SEEDS: PeerSeed[] = [
  { name: "Vapi", domain: "vapi.ai", hq: "sf", hc: 149, raised: 25e6, founded: 2020, regions: [["sf", 52], ["ahmedabad", 61], ["toronto", 9]], newRegion: "pune" },
  { name: "Retell AI", domain: "retellai.com", hq: "sf", hc: 62, raised: 5e6, founded: 2023, regions: [["sf", 41], ["bangalore", 12]], gtm: true },
  { name: "Bland AI", domain: "bland.ai", hq: "sf", hc: 118, raised: 65e6, founded: 2023, regions: [["sf", 88], ["austin", 14]], gtm: true },
  { name: "ElevenLabs", domain: "elevenlabs.io", hq: "nyc", hc: 410, raised: 281e6, founded: 2022, regions: [["nyc", 60], ["london", 110], ["warsaw", 140], ["krakow", 40]], newRegion: "bangalore" },
  { name: "Sierra", domain: "sierra.ai", hq: "sf", hc: 320, raised: 285e6, founded: 2023, regions: [["sf", 250], ["nyc", 40], ["london", 18]] },
  { name: "Synthflow", domain: "synthflow.ai", hq: "berlin", hc: 74, raised: 30e6, founded: 2023, regions: [["berlin", 48], ["lisbon", 11], ["bogota", 9]], gtm: true, distress: 0.68 },
  { name: "PolyAI", domain: "poly.ai", hq: "london", hc: 260, raised: 120e6, founded: 2017, regions: [["london", 170], ["nyc", 40], ["toronto", 20]] },
  { name: "Deepgram", domain: "deepgram.com", hq: "sf", hc: 210, raised: 86e6, founded: 2015, regions: [["sf", 120], ["austin", 50]], newRegion: "hyderabad" },
  { name: "Cartesia", domain: "cartesia.ai", hq: "sf", hc: 58, raised: 91e6, founded: 2023, regions: [["sf", 52]] },
  { name: "Hume AI", domain: "hume.ai", hq: "nyc", hc: 72, raised: 69e6, founded: 2021, regions: [["nyc", 55], ["toronto", 8]], distress: 0.44 },
  { name: "Parloa", domain: "parloa.com", hq: "berlin", hc: 330, raised: 220e6, founded: 2018, regions: [["berlin", 210], ["nyc", 45]], newRegion: "singapore" },
  { name: "Observe.AI", domain: "observe.ai", hq: "sf", hc: 380, raised: 214e6, founded: 2017, regions: [["sf", 90], ["bangalore", 240]] },
];

const INVESTORS: [string, number[], boolean?][] = [
  ["Y Combinator", [0, 1, 2]],
  ["Andreessen Horowitz", [3, 9]],
  ["Sequoia Capital", [3, 4]],
  ["Benchmark", [4]],
  ["Index Ventures", [3, 8, 5]],
  ["Lightspeed", [8, 6]],
  ["Accel", [5, 6]],
  ["Khosla Ventures", [6]],
  ["Tiger Global", [7]],
  ["Madrona", [7]],
  ["Northzone", [10]],
  ["Altimeter", [10]],
  ["SoftBank Vision", [11]],
  ["Union Square Ventures", [9]],
  ["Bessemer", [0]],
  ["Greylock", [], true],
  ["General Catalyst", [], true],
  ["Kleiner Perkins", [], true],
];

const MONTHS = Array.from({ length: 24 }, (_, i) => {
  const d = new Date(Date.UTC(2024, 10 + i, 1));
  return d.toISOString().slice(0, 10);
});

const ROLE_TITLES = [
  "Founding Engineer", "Staff Engineer", "ML Engineer", "Account Executive", "Solutions Engineer",
  "Product Manager", "Head of Sales", "Research Scientist", "Customer Success Lead", "Forward Deployed Engineer",
];

export function detectLens(q: string): Lens {
  const s = q.toLowerCase();
  if (/\b(invest|back|fund|valuation)\b/.test(s)) return "investor";
  if (/\b(we are|we're|our company|i run)\b/.test(s)) return "operator";
  return "founder";
}

export function mockReport(query: string, lensIn?: Lens): RunReport {
  const r = rng(42);
  const lens = lensIn ?? detectLens(query);
  const ledger: EvidenceEntry[] = [];
  let t0 = Date.UTC(2026, 9, 31, 12, 0, 0);

  const cite = (endpoint: string, params: object, path: string, value: unknown, credits = 0): EvId => {
    const id = `ev_${String(ledger.length + 1).padStart(3, "0")}`;
    t0 += 350;
    ledger.push({
      id, endpoint, params, ts: new Date(t0).toISOString(), credits, path, value,
      snippet: { [path.split(".").pop() ?? "value"]: value },
    });
    return id;
  };

  const enrich = (d: string, path: string, value: unknown) =>
    cite("/company/enrich", { domains: [d] }, `matches[0].company_data.${path}`, value, 2);

  // Peers
  const peers: Peer[] = SEEDS.map((s, i) => {
    const [lat, lng, country] = CITY[s.hq];
    const mom = Math.round(35 + r() * 60);
    return {
      id: i + 1, name: s.name, domain: s.domain, logo: null,
      hq: { lat, lng, city: LABEL[s.hq], country },
      headcount: s.hc, raised_usd: s.raised, founded: s.founded,
      momentum: mom, distress: s.distress ?? Math.round(r() * 25) / 100,
      ev: [
        enrich(s.domain, "headcount.total", s.hc),
        enrich(s.domain, "funding.total_investment_usd", s.raised),
        enrich(s.domain, "locations.headquarters", `${LABEL[s.hq]}, ${country}`),
      ],
    };
  });
  const pid = (i: number) => peers[i].id;

  // Chord (talent moves between peers)
  const n = peers.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
  const magnets = [3, 4, 10]; // ElevenLabs, Sierra, Parloa pull talent
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const pull = magnets.includes(j) ? 0.55 : 0.18;
      if (r() < pull) matrix[i][j] = 1 + Math.floor(r() * (magnets.includes(j) ? 6 : 3));
    }
  const moves: ChordScene["moves"] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (matrix[i][j] > 0)
        moves.push({
          from: pid(i), to: pid(j), count: matrix[i][j],
          titles: Array.from({ length: Math.min(3, matrix[i][j]) }, () => ROLE_TITLES[Math.floor(r() * ROLE_TITLES.length)]),
          ev: [cite("/person/search", { current_company: SEEDS[j].domain, past_company: SEEDS[i].domain, start_date_gte: "2026-05-01" }, "total_count", matrix[i][j], 1)],
        });
  const chord: ChordScene = {
    peers: peers.map((p, i) => {
      const inflow = matrix.reduce((a, row) => a + row[i], 0);
      const outflow = matrix[i].reduce((a, b) => a + b, 0);
      return { peer_id: p.id, sentiment: Math.round((3.1 + r() * 1.6) * 10) / 10, net_flow: inflow - outflow, fill_rate: Math.round((0.35 + r() * 0.55) * 100) / 100 };
    }),
    matrix, moves,
    senior_joins: [
      { peer_id: pid(2), title: "Chief Revenue Officer", from_company: "Twilio", date: "2026-06-12" },
      { peer_id: pid(3), title: "VP Engineering", from_company: "Sierra", date: "2026-08-03" },
      { peer_id: pid(1), title: "Head of Sales", from_company: "Vapi", date: "2026-07-21" },
      { peer_id: pid(10), title: "GM, North America", from_company: "Salesforce", date: "2026-05-30" },
      { peer_id: pid(4), title: "Head of Research", from_company: "Google DeepMind", date: "2026-09-02" },
      { peer_id: pid(5), title: "VP Sales", from_company: "Bland AI", date: "2026-07-08" },
    ].map((j) => ({ ...j, ev: [cite("/person/search", { current_company: SEEDS[j.peer_id - 1].domain, seniority_level: ["CXO", "VP"] }, "profiles[0].current_title", j.title, 1)] })),
  };

  // Globe
  const arcs: GlobeScene["arcs"] = [];
  const timeline: GlobeScene["timeline"] = MONTHS.map((date) => ({ date, regions: [] }));
  SEEDS.forEach((s, i) => {
    const regions = [...s.regions] as [string, number][];
    if (s.newRegion) regions.push([s.newRegion, 8 + Math.floor(r() * 20)]);
    regions.forEach(([key, count]) => {
      const [lat, lng] = CITY[key];
      const isNew = key === s.newRegion;
      const ev = enrich(s.domain, `headcount.by_region_absolute["${LABEL[key]}"]`, count);
      if (key !== s.hq) arcs.push({ peer_id: pid(i), to: { lat, lng, label: LABEL[key] }, people: count, kind: isNew ? "expansion" : "footprint", ev: [ev] });
      const start = isNew ? 18 + Math.floor(r() * 3) : 0;
      timeline.forEach((f, m) => {
        if (m < start) return;
        const growth = isNew ? (m - start + 1) / (24 - start) : 0.45 + 0.55 * (m / 23) + (r() - 0.5) * 0.05;
        f.regions.push({ peer_id: pid(i), label: LABEL[key], lat, lng, count: Math.max(1, Math.round(count * Math.min(1, growth))) });
      });
    });
  });
  moves.filter((m) => m.count >= 3).forEach((m) => {
    const to = peers[m.to - 1];
    arcs.push({ peer_id: m.from, to: { lat: to.hq.lat, lng: to.hq.lng, label: to.name }, people: m.count, kind: "talent", to_peer_id: m.to, ev: m.ev });
  });
  const PULSE: [number, string, number][] = [[0, "ahmedabad", 14], [0, "sf", 9], [1, "sf", 11], [2, "sf", 23], [2, "austin", 6], [3, "warsaw", 31], [3, "london", 18], [3, "bangalore", 12], [4, "sf", 27], [5, "berlin", 7], [6, "london", 15], [7, "hyderabad", 10], [10, "berlin", 22], [10, "singapore", 5], [11, "bangalore", 19]];
  const globe: GlobeScene = {
    nodes: peers.map((p) => ({ peer_id: p.id, lat: p.hq.lat, lng: p.hq.lng, size: p.headcount ?? 0, ev: [p.ev[0], p.ev[2]] })),
    arcs,
    pulses: PULSE.map(([i, key, jobs]) => ({
      peer_id: pid(i), country: CITY[key][2], lat: CITY[key][0], lng: CITY[key][1], jobs_90d: jobs,
      ev: [cite("/job/search", { filters: { company_domain: SEEDS[i].domain, date_added_gte: "2026-08-02" }, aggregations: { group_by: "location.country" } }, `aggregations.location.country["${CITY[key][2]}"]`, jobs, 1)],
    })),
    timeline,
    unplaced: [{ peer_id: pid(5), label: "Remote · EMEA", count: 6 }, { peer_id: pid(0), label: "Greater Valsad Area", count: 3 }],
  };

  // Streams
  const streams: StreamsScene = {
    peers: SEEDS.map((s, i) => {
      const mixStart = s.gtm ? [0.66, 0.1, 0.07, 0.06, 0.06, 0.05] : [0.56, 0.15, 0.1, 0.08, 0.06, 0.05];
      const mixEnd = s.gtm ? [0.44, 0.3, 0.1, 0.06, 0.05, 0.05] : mixStart.map((v, k) => v + (k === 0 ? 0.02 : k === 1 ? -0.01 : -0.002));
      const series = MONTHS.map((date, m) => {
        const k = s.gtm ? Math.max(0, (m - 14) / 9) : m / 23;
        const total = s.hc * (0.55 + 0.45 * (m / 23)) * (1 + (r() - 0.5) * 0.03);
        const row = { date } as { date: string } & Record<Fn, number>;
        FUNCTIONS.forEach((f, fi) => { row[f] = Math.round(total * (mixStart[fi] + (mixEnd[fi] - mixStart[fi]) * Math.min(1, k))); });
        return row;
      });
      const budgetBase = 4000 + r() * 20000;
      return {
        peer_id: pid(i), series,
        jobs_by_category: { Engineering: 4 + Math.floor(r() * 18), Sales: s.gtm ? 9 + Math.floor(r() * 10) : Math.floor(r() * 5), "Customer Success": Math.floor(r() * 5), Marketing: Math.floor(r() * 4) },
        ad_budget_series: MONTHS.map((date, m) => ({ date, usd: Math.round(budgetBase * (s.gtm && m > 14 ? 1 + (m - 14) * 0.35 : 1 + (r() - 0.5) * 0.2)) })),
        gtm_shift: s.gtm ? { date: "2026-04-01", confidence: 0.7 + r() * 0.2, reason: "Sales share doubled in 6 months while ad spend rose" } : null,
        ev: [enrich(s.domain, "headcount.by_function_timeseries.CURRENT_FUNCTION", "24 points"), cite("/job/search", { filters: { company_domain: s.domain }, aggregations: { group_by: "category" } }, "aggregations.category", "by category", 1)],
      };
    }),
  };

  // Constellation
  const cNodes: ConstellationScene["nodes"] = peers.map((p, i) => ({
    id: `c${p.id}`, type: "company", label: p.name, size: p.raised_usd ?? 0, kingmaker: false, open_slot: false,
    acquisitive: i === 3 || i === 11, distress: p.distress, peer_id: p.id,
  }));
  const cEdges: ConstellationScene["edges"] = [];
  const ROUNDS = ["Seed", "Series A", "Series B", "Series C"];
  INVESTORS.forEach(([name, ports, open], k) => {
    cNodes.push({ id: `i${k}`, type: "investor", label: name, size: Math.max(1, ports.length), kingmaker: ports.length >= 2, open_slot: !!open, acquisitive: false, distress: null });
    ports.forEach((pi) => {
      const year = 2023 + Math.floor(r() * 4);
      const month = 1 + Math.floor(r() * (year === 2026 ? 9 : 12));
      const date = `${year}-${String(month).padStart(2, "0")}-15`;
      const amount = Math.round((SEEDS[pi].raised * (0.15 + r() * 0.4)) / 1e5) * 1e5;
      cEdges.push({
        from: `i${k}`, to: `c${pid(pi)}`, date, amount_usd: amount, round: ROUNDS[Math.floor(r() * ROUNDS.length)],
        recent: date >= "2025-11-01",
        ev: [enrich(SEEDS[pi].domain, "funding.investors_detailed", name)],
      });
    });
  });
  const constellation: ConstellationScene = { nodes: cNodes, edges: cEdges };

  // Field (Aman's scene; minimal valid payload)
  const field: FieldScene = {
    axes: { x: "headcount_growth_yoy", y: "organic_pull" },
    frames: MONTHS.slice(-12).map((date, m) => ({
      date,
      points: peers.map((p) => ({ peer_id: p.id, x: (p.momentum ?? 50) / 100 + m * 0.01, y: r(), size: p.raised_usd ?? 0, momentum: p.momentum ?? 0, distress: p.distress ?? 0 })),
    })),
    weights: { headcount: 30, hiring: 20, traffic: 20, followers: 10, funding: 20 },
    ev: Object.fromEntries(peers.map((p) => [p.id, p.ev])),
  };

  // Truth (Aman's scene)
  const truth: TruthScene = {
    ledger_count: 0, credits_used: 0,
    disputes: [{
      peer_id: 1, field: "headcount",
      values: [{ source: "headcount.total", value: 14, ev: enrich("vapi.ai", "headcount.total", 14) }, { source: "headcount.timeseries[-1]", value: 149, ev: enrich("vapi.ai", "headcount.timeseries[-1].headcount", 149) }],
      rule: "Prefer timeseries when total disagrees by >5×", resolution: "149",
    }],
    claims: [],
    rejected_candidates: [{ name: "NexaVoxa AI", reason: "12 employees, no funding; agency, not a platform" }],
    rejected_news: [{ peer_id: 1, title: "New hotel opens in Vapi, Gujarat", reason: "About the city of Vapi, not the company" }],
  };

  // Deck (Aman's scene)
  const deck = mockDeck(lens, peers);

  const credits = ledger.reduce((a, e) => a + e.credits, 0);
  truth.ledger_count = ledger.length;
  truth.credits_used = credits;

  return {
    run_id: "mock_voice_ai", query,
    intent: { kind: "market", keywords: ["voice ai", "voice agents"], geo: null, lens },
    peers,
    scenes: { globe, field, streams, chord, constellation, truth, deck },
    ledger, trace: [], credits_used: credits,
  };
}

export function mockDeck(lens: Lens, peers: Peer[]): DeckScene {
  const by = (name: string) => peers.find((p) => p.name === name)!;
  const MOVES: Record<Lens, DeckScene["moves"]> = {
    operator: [
      { title: "Defend India before Vapi scales Ahmedabad", why: "Vapi's India team is now larger than its US team.", confidence: 0.78, ev: by("Vapi").ev, scene: "globe", links: [] },
      { title: "Brace for Bland's sales push", why: "Sales share doubled in two quarters.", confidence: 0.74, ev: by("Bland AI").ev, scene: "streams", links: [] },
      { title: "Recruit from Synthflow", why: "Net talent outflow and rising distress.", confidence: 0.66, ev: by("Synthflow").ev, scene: "chord", links: [] },
    ],
    investor: [
      { title: "Dig into ElevenLabs' momentum", why: "Top momentum, growth is earned not bought.", confidence: 0.81, ev: by("ElevenLabs").ev, scene: "field", links: [] },
      { title: "Co-invest alongside Index Ventures", why: "In three peers, most active this year.", confidence: 0.72, ev: by("Cartesia").ev, scene: "constellation", links: [] },
      { title: "Avoid Synthflow at current terms", why: "Distress signals and talent leaving.", confidence: 0.63, ev: by("Synthflow").ev, scene: "chord", links: [] },
    ],
    founder: [
      { title: "Build for India first", why: "Hiring is concentrated in the US and EU.", confidence: 0.7, ev: by("Observe.AI").ev, scene: "globe", links: [] },
      { title: "Pitch Greylock, General Catalyst, Kleiner", why: "Active in adjacent AI, no bet here yet.", confidence: 0.68, ev: by("Sierra").ev, scene: "constellation", links: [] },
      { title: "Move before Retell goes upmarket", why: "Its sales hiring started in April.", confidence: 0.61, ev: by("Retell AI").ev, scene: "streams", links: [] },
    ],
  };
  return {
    lens, moves: MOVES[lens],
    watches: [
      ...peers.map((p, i): DeckScene["watches"][number] => ({ id: `w_${(9001 + i).toString(36)}`, kind: "entity", track: p.domain, status: "active" })),
      { id: "w_disc01", kind: "discovery", track: "voice ai agents", status: "active" },
    ],
    alerts: [],
  };
}

const STAGES = ["intent", "resolve", "discover", "enrich", "signals", "engines", "scenes"] as const;

export function mockTrace(rep: RunReport): { delay: number; ev: TraceEvent }[] {
  const out: { delay: number; ev: TraceEvent }[] = [];
  let ms = 0;
  const push = (delay: number, ev: Omit<TraceEvent, "ts">) => {
    ms += delay;
    out.push({ delay: ms, ev: { ts: new Date(Date.UTC(2026, 9, 31, 12) + ms).toISOString(), ...ev } });
  };
  const stage = (s: (typeof STAGES)[number], delay = 250) => push(delay, { stage: s, type: "stage_start", label: s });
  const done = (s: string, delay = 150, data?: unknown) => push(delay, { stage: s, type: "stage_done", label: s, data });

  stage("intent", 100);
  push(500, { stage: "intent", type: "decision", decision: { kind: "accept", subject: rep.intent.kind, reason: `Lens: ${rep.intent.lens}` } });
  done("intent");
  stage("resolve");
  push(300, { stage: "resolve", type: "tool_call", label: "company/identify", detail: { params: { query: rep.query } } });
  push(600, { stage: "resolve", type: "tool_result", label: "company/identify", detail: { count: 3, ms: 412, credits: 0 } });
  done("resolve");
  stage("discover");
  push(300, { stage: "discover", type: "tool_call", label: "company/search hybrid" });
  push(700, { stage: "discover", type: "tool_result", label: "company/search hybrid", detail: { count: 23, ms: 812, credits: 0.7 } });
  push(250, { stage: "discover", type: "tool_call", label: "web/search/live", detail: { params: { query: "voice ai competitors" } } });
  push(500, { stage: "discover", type: "tool_result", label: "web/search/live", detail: { count: 10, ms: 1290, credits: 1 } });
  push(300, { stage: "discover", type: "decision", decision: { kind: "reject", subject: "NexaVoxa AI", reason: "12 employees, no funding" } });
  push(200, { stage: "discover", type: "decision", decision: { kind: "reject", subject: "getvapi.com", reason: "SEO lookalike domain" } });
  push(200, { stage: "discover", type: "decision", decision: { kind: "widen", subject: "headcount floor", reason: "7 peers < 8, relax to 20" } });
  rep.peers.forEach((p) => push(110, { stage: "discover", type: "decision", decision: { kind: "accept", subject: p.name, reason: p.domain } }));
  done("discover");
  stage("enrich");
  for (let b = 0; b < rep.peers.length; b += 6) {
    push(200, { stage: "enrich", type: "tool_call", label: "company/enrich ×6" });
    push(800, { stage: "enrich", type: "tool_result", label: "company/enrich ×6", detail: { count: 6, ms: 1640, credits: 12 } });
  }
  done("enrich", 150, { peers: rep.peers });
  stage("signals");
  push(250, { stage: "signals", type: "tool_call", label: "job/search group_by country" });
  push(400, { stage: "signals", type: "error", label: "429 rate limited", decision: { kind: "retry", subject: "job/search", reason: "backoff 2s" } });
  push(600, { stage: "signals", type: "tool_result", label: "job/search group_by country", detail: { count: 412, ms: 930, credits: 1 } });
  push(200, { stage: "signals", type: "tool_call", label: "person/search cross-peer" });
  push(700, { stage: "signals", type: "tool_result", label: "person/search cross-peer", detail: { count: rep.scenes.chord?.moves.reduce((a, m) => a + m.count, 0), ms: 1880, credits: 4 } });
  done("signals");
  stage("engines");
  done("engines", 400);
  stage("scenes", 100);
  (["globe", "field", "streams", "chord", "constellation", "truth", "deck"] as const).forEach((k, i) => {
    push(i === 0 ? 300 : 450, { stage: "scenes", type: "scene_ready", scene: k, data: rep.scenes[k] });
  });
  push(300, { stage: "scenes", type: "done", label: "done", detail: { credits: rep.credits_used } });
  return out;
}

export { STAGES };
