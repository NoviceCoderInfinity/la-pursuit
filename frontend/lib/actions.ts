// One cited next step per scene, per persona. Computed from the scene's own data; never invented.
import type { ChordScene, ConstellationScene, EvId, FieldScene, GlobeScene, Lens, StreamsScene, TruthScene } from "./types";

export interface Action { text: string; ev?: EvId[] }
type Name = (id: number) => string;

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const month = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function globeAction(d: GlobeScene, lens: Lens, name: Name): Action | null {
  const last = d.timeline.at(-1);
  const totals = new Map<string, number>();
  for (const r of last?.regions ?? []) totals.set(r.label, (totals.get(r.label) ?? 0) + r.count);
  const regions = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const all = regions.reduce((a, [, n]) => a + n, 0);
  const exp = d.arcs.filter((a) => a.kind === "expansion").sort((a, b) => String((b as { since?: string }).since ?? "").localeCompare(String((a as { since?: string }).since ?? "")));
  const ev = d.nodes.flatMap((n) => n.ev).slice(0, 4);
  if (lens === "operator" && exp[0]) {
    const e = exp[0] as GlobeScene["arcs"][number] & { since?: string };
    return { text: `${name(e.peer_id)} started hiring in ${e.to.label}${e.since ? ` in ${month(e.since)}` : ""}. Check your coverage there.`, ev: e.ev };
  }
  if (!regions.length) return null;
  const [top, second] = regions;
  if (lens === "investor") return { text: `${pct(top[1], all)}% of this market's mapped people sit in ${top[0]}; ${exp.length} expansions in the last 6 months.`, ev };
  return { text: `Competition clusters in ${top[0]}${second ? ` and ${second[0]}` : ""}. Everywhere else is less contested.`, ev };
}

export function fieldAction(d: FieldScene, lens: Lens, name: Name, targetId?: number | null): Action | null {
  const rows = [...(d.table ?? [])].filter((r) => r.momentum != null).sort((a, b) => b.momentum! - a.momentum!);
  if (!rows.length) return null;
  const ev = (id: number) => d.ev[id];
  if (lens === "investor" && targetId != null) {
    const i = rows.findIndex((r) => r.peer_id === targetId);
    if (i === 0 && rows[1]) return { text: `${name(targetId)} leads on momentum. Closest is ${name(rows[1].peer_id)} at ${Math.round(rows[1].momentum!)}; ask what keeps the gap open.`, ev: ev(targetId) };
    if (i > 0) return { text: `${name(targetId)} is #${i + 1} of ${rows.length}. ${list(rows.slice(0, Math.min(i, 3)).map((r) => name(r.peer_id)))} move${i === 1 ? "s" : ""} faster; ask why.`, ev: ev(targetId) };
  }
  const stalled = rows.filter((r) => (r.distress ?? 0) >= 30 && r.peer_id !== targetId);
  if (lens === "founder" && stalled.length) {
    return { text: `${list(stalled.slice(0, 3).map((r) => name(r.peer_id)))} ${stalled.length === 1 ? "is" : "are"} stalling. Their customers are the opening.`, ev: ev(stalled[0].peer_id) };
  }
  const lead = rows.find((r) => r.peer_id !== targetId) ?? rows[0];
  const g = lead.hc_growth_6m;
  return { text: `Watch ${name(lead.peer_id)}: momentum ${Math.round(lead.momentum!)}${g != null ? `, headcount ${g >= 0 ? "+" : ""}${Math.round(g)}% in 6 months` : ""}.`, ev: ev(lead.peer_id) };
}

export function streamsAction(d: StreamsScene, lens: Lens, name: Name): Action | null {
  const shifts = d.peers.filter((p) => p.gtm_shift).sort((a, b) => (b.gtm_shift!.date > a.gtm_shift!.date ? 1 : -1));
  const ev = shifts.flatMap((p) => p.ev).slice(0, 4);
  if (!shifts.length) {
    return lens === "founder"
      ? { text: "Nobody here has switched to selling yet. The market is still won on product." }
      : { text: "No rival has switched from building to selling in the last two quarters." };
  }
  const who = list(shifts.slice(0, 3).map((p) => name(p.peer_id)));
  if (lens === "operator") return { text: `${who} switched to selling. Expect their reps in your accounts.`, ev };
  if (lens === "investor") return { text: `${shifts.length} of ${d.peers.length} are now scaling sales: ${who}. Growth there gets more expensive.`, ev };
  return { text: `${who} already scale sales. Differentiate on product before they reach your segment.`, ev };
}

export function chordAction(d: ChordScene, lens: Lens, name: Name): Action | null {
  const rows = d.peers.filter((p) => p.net_flow !== 0).sort((a, b) => b.net_flow - a.net_flow);
  if (!rows.length) return null;
  const win = rows[0], lose = rows[rows.length - 1];
  const ev = d.moves.flatMap((m) => m.ev ?? []).slice(0, 3);
  if (lens === "investor") return { text: `${name(win.peer_id)} is the talent magnet (+${win.net_flow}); ${name(lose.peer_id)} leaks people (${lose.net_flow}).`, ev };
  if (lose.net_flow >= 0) return { text: `${name(win.peer_id)} wins the most people from its peers (+${win.net_flow}).`, ev };
  return { text: `Recruit from ${name(lose.peer_id)}: it lost ${-lose.net_flow} more people to peers than it gained.`, ev };
}

export function capitalAction(d: ConstellationScene, lens: Lens): Action | null {
  // distinct companies backed, not rounds: the same number the Kingmakers list shows
  const inv = d.nodes.filter((n) => n.type === "investor").map((n) => ({ n, k: new Set(d.edges.filter((e) => e.from === n.id).map((e) => e.to)).size }))
    .sort((a, b) => b.k - a.k)[0];
  if (!inv || inv.k < 2) return null;
  const ev = d.edges.filter((e) => e.from === inv.n.id).flatMap((e) => e.ev).slice(0, 3);
  if (lens === "founder") return { text: `Pitch ${inv.n.label} first: it already backs ${inv.k} companies here.`, ev };
  if (lens === "investor") return { text: `${inv.n.label} backs ${inv.k} of these companies. Expect it in any round, as partner or rival.`, ev };
  return { text: `${inv.n.label} backs ${inv.k} of your rivals. Watch where its next cheque goes.`, ev };
}

export function truthAction(d: TruthScene, lens: Lens): Action | null {
  const bad = d.claims.find((c) => c.status === "contradicted");
  const ok = d.claims.filter((c) => c.status === "verified").length;
  const unv = d.claims.filter((c) => c.status === "unverifiable").length;
  if (lens === "investor" && bad) return { text: `Ask about “${bad.claim}”: ${bad.note}.`, ev: bad.ev };
  if (lens === "investor" && d.claims.length) return { text: `${ok} claim${ok === 1 ? "" : "s"} hold against the graph; ask for proof of the ${unv} that data can't check.`, ev: d.claims.flatMap((c) => c.ev).slice(0, 3) };
  return { text: `${d.disputes.length} data conflicts settled and ${d.rejected_candidates.length} candidates rejected. Click any number to see its source.` };
}
