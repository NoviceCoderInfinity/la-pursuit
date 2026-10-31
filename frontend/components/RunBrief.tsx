"use client";

import { motion } from "framer-motion";
import { Num } from "@/components/Num";
import { PeerLogo, PERSONAS } from "@/components/Library";
import { compact, usd } from "@/lib/format";
import { useRun } from "@/lib/run-context";

/** The answer first: who this is for, the single most important move, and the market in six numbers. */
export function RunBrief() {
  const { peers, scenes, lens, trace, status } = useRun();
  if (!peers.length) return null;
  const persona = PERSONAS.find((p) => p.key === lens)!;
  const done = (stage: string) => (trace.find((e) => e.stage === stage && e.type === "stage_done")?.detail as { market?: string } | undefined)?.market;
  const market = done("discover") ?? done("intent");
  const deck = scenes.deck;
  const top = deck?.moves?.[0];
  const ranked = [...peers].filter((p) => p.momentum != null).sort((a, b) => (b.momentum ?? 0) - (a.momentum ?? 0));
  const jobs = scenes.streams?.peers.reduce((a, p) => a + ((p as { jobs_90d?: number }).jobs_90d ?? 0), 0);
  const moves = scenes.chord?.moves.reduce((a, m) => a + m.count, 0);
  const raised = peers.reduce((a, p) => a + (p.raised_usd ?? 0), 0);
  const evHc = peers.flatMap((p) => (p.ev ?? []).slice(0, 1)).slice(0, 8);
  const evRaised = peers.flatMap((p) => (p.ev ?? []).slice(1, 2)).slice(0, 8);
  const evJobs = scenes.streams?.peers.flatMap((p) => (p.ev ?? []).slice(1, 2)).slice(0, 8);

  const table = scenes.field?.table ?? [];
  const rank = [...table].filter((r) => r.momentum != null).sort((a, b) => b.momentum! - a.momentum!);
  const targetId = deck?.target_id ?? null;
  const tIdx = targetId != null ? rank.findIndex((r) => r.peer_id === targetId) : -1;
  const target = targetId != null ? peers.find((p) => p.id === targetId) : undefined;
  const rival = rank.find((r) => r.peer_id !== targetId);
  const sellers = scenes.streams?.peers.filter((p) => p.gtm_shift).length;
  const investors = scenes.constellation?.nodes.filter((n) => n.type === "investor").length;
  const stalling = table.filter((r) => (r.distress ?? 0) >= 30).length;
  const claimsOk = scenes.truth?.claims.filter((c) => c.status === "verified").length;
  const claimsAll = scenes.truth?.claims.filter((c) => c.status !== "unverifiable").length;
  const evidence: [string, string, string[] | undefined] = ["Evidence", scenes.truth ? String(scenes.truth.ledger_count) : "…", undefined];
  const dots = (v: number | undefined | null, f: (n: number) => string = String) => (v == null ? "…" : f(v));

  const byLens: Record<string, [string, string, string[] | undefined][]> = {
    investor: [
      ["Momentum rank", tIdx >= 0 ? `#${tIdx + 1} of ${rank.length}` : "…", target ? (target.ev ?? []).slice(0, 1) : undefined],
      ["Momentum", tIdx >= 0 ? String(Math.round(rank[tIdx].momentum!)) : "…", target ? (target.ev ?? []).slice(0, 1) : undefined],
      ["Raised", target ? usd(target.raised_usd) : "…", target ? (target.ev ?? []).slice(1, 2) : undefined],
      ["Claims that hold", claimsAll ? `${claimsOk} of ${claimsAll}` : scenes.truth ? "none checkable" : "…", scenes.truth?.claims.flatMap((c) => c.ev).slice(0, 3)],
      ["Investors in market", dots(investors), undefined],
      evidence,
    ],
    operator: [
      ["Rivals", String(Math.max(0, peers.length - (targetId != null ? 1 : 0))), evHc],
      [rival ? `Fastest · ${peers.find((p) => p.id === rival.peer_id)?.name ?? "rival"}` : "Fastest rival", rival ? `${Math.round(rival.momentum!)}` : "…", rival ? scenes.field?.ev[rival.peer_id] : undefined],
      ["Rivals in sell mode", dots(sellers), scenes.streams?.peers.filter((p) => p.gtm_shift).flatMap((p) => p.ev).slice(0, 3)],
      ["Roles added · 90d", dots(jobs, compact), evJobs],
      ["Talent moves", dots(moves), scenes.chord?.moves.flatMap((m) => m.ev ?? []).slice(0, 4)],
      evidence,
    ],
    founder: [
      ["Players", String(peers.length), evHc],
      ["Crowdedness", deck?.crowdedness != null ? `${deck.crowdedness}/100` : "…", undefined],
      ["Capital raised", usd(raised), evRaised],
      ["Active investors", dots(investors), undefined],
      ["Stalling players", scenes.field ? String(stalling) : "…", undefined],
      evidence,
    ],
  };
  const stats = byLens[lens];

  return (
    <section className="border-b border-line px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3 py-1 text-[12px] font-medium text-accent">For the {persona.title}</span>
        {market && !/^the market .* competes in$/.test(market) && <span className="line-clamp-1 max-w-[760px] text-[13px] text-muted">Market · {market}</span>}
      </div>
      <motion.h1 key={top?.title ?? "pending"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="mt-5 max-w-[920px] text-[34px] font-semibold leading-[40px] tracking-[-0.025em] md:text-[44px] md:leading-[50px]">
        {top ? top.title : status === "running" ? "Mapping the market…" : "No decision could be drawn."}
      </motion.h1>
      {top && <p className="mt-3 max-w-[820px] text-[15px] leading-[22px] text-fg-2">{top.why}</p>}

      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([k, v, ev], i) => (
          <motion.div key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-bg px-5 py-4">
            <div className="eyebrow !text-[10px]">{k}</div>
            <div className="mt-1 font-dot text-[28px] font-black leading-[32px] tnum">{ev?.length ? <Num value={v} ev={ev} /> : v}</div>
          </motion.div>
        ))}
      </div>

      {ranked.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <span className="eyebrow">Momentum leaders</span>
          {ranked.slice(0, 6).map((p, i) => (
            <span key={p.id} className="flex items-center gap-2 text-[13px]">
              <span className="font-mono text-[11px] text-muted">{i + 1}</span>
              <PeerLogo name={p.name} src={p.logo} size={24} />
              <span className="font-medium">{p.name}</span>
              <Num value={Math.round(p.momentum ?? 0)} ev={(p.ev ?? []).slice(0, 1)} className="font-mono text-[12px] text-accent" />
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
