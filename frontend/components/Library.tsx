"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getLibrary } from "@/lib/api";
import { compact, cx, usd } from "@/lib/format";
import type { Lens, RunSummary } from "@/lib/types";

export const PERSONAS: { key: Lens; title: string; ask: string; gets: string[]; scenes: string }[] = [
  {
    key: "operator", title: "Operator", ask: "“We are Retell. Who is coming for us?”",
    gets: ["Which rival is accelerating fastest", "Who just switched from building to selling", "Where rivals are hiring, and whose people you can recruit"],
    scenes: "Momentum · Build vs Sell · Atlas · Talent · Decisions",
  },
  {
    key: "investor", title: "Investor", ask: "“Should I invest in Bland AI?”",
    gets: ["Its momentum rank against every peer", "Its own claims checked against the graph", "Who already backs the space, and what to ask on the call"],
    scenes: "Momentum · Truth · Capital · Talent · Decisions",
  },
  {
    key: "founder", title: "Founder", ask: "“AI receptionist for dental clinics in India.”",
    gets: ["How crowded the market is, and its stage", "Investors with a bet here and room for one more", "Weakening incumbents whose customers you can take"],
    scenes: "Atlas · Momentum · Capital · Decisions",
  },
];

export function useLibrary() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  useEffect(() => { getLibrary().then(setRuns); }, []);
  return runs;
}

export function Personas({ runs, onPick }: { runs: RunSummary[] | null; onPick: (l: Lens) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {PERSONAS.map((p, i) => {
        const n = runs?.filter((r) => r.lens === p.key).length ?? 0;
        return (
          <motion.button
            key={p.key} onClick={() => onPick(p.key)}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08 }}
            className="group flex flex-col rounded-[18px] border border-line bg-bg p-6 text-left transition-colors hover:border-accent"
          >
            <div className="flex items-center justify-between">
              <span className="eyebrow !text-accent">{p.title}</span>
              <PersonaGlyph k={p.key} />
            </div>
            <div className="mt-4 text-[19px] font-semibold leading-[26px] tracking-tight">{p.ask}</div>
            <ul className="mt-5 flex-1 space-y-2.5">
              {p.gets.map((g) => (
                <li key={g} className="flex gap-2.5 text-[14px] leading-[20px] text-fg-2">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />{g}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center justify-between border-t border-line pt-4 text-[12px]">
              <span className="font-mono text-muted">{p.scenes}</span>
              {n > 0 && <span className="shrink-0 font-medium text-fg group-hover:text-accent">{n} runs →</span>}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

function PersonaGlyph({ k }: { k: Lens }) {
  const a = "var(--accent)", c = "var(--muted)";
  const g: Record<Lens, React.ReactNode> = {
    operator: (<><circle cx="14" cy="14" r="10" fill="none" stroke={c} /><circle cx="14" cy="14" r="3" fill={a} /><path d="M14 2v5M14 21v5M2 14h5M21 14h5" stroke={c} /></>),
    investor: (<><path d="M3 22 L10 14 L15 18 L25 6" fill="none" stroke={a} strokeWidth="1.8" /><path d="M19 6h6v6" fill="none" stroke={a} strokeWidth="1.8" /></>),
    founder: (<><path d="M14 3 L17 11 L25 11 L19 16 L21 25 L14 20 L7 25 L9 16 L3 11 L11 11Z" fill="none" stroke={a} strokeWidth="1.5" /></>),
  };
  return <svg width="28" height="28" viewBox="0 0 28 28">{g[k]}</svg>;
}

export function LibraryGrid({ runs, filter, setFilter }: { runs: RunSummary[] | null; filter: Lens | "all"; setFilter: (f: Lens | "all") => void }) {
  const shown = useMemo(() => (runs ?? []).filter((r) => !r.error && (filter === "all" || r.lens === filter)), [runs, filter]);
  if (runs && runs.length === 0) return null;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Recorded live on Crustdata</div>
          <h2 className="mt-2 text-[32px] font-semibold leading-[38px] tracking-[-0.02em]">Open a market someone already mapped.</h2>
        </div>
        <div className="flex gap-1.5">
          {(["all", "operator", "investor", "founder"] as const).map((k) => (
            <button key={k} onClick={() => setFilter(k)}
              className={cx("rounded-full border px-3 py-1 text-[12px] font-medium capitalize", filter === k ? "border-fg bg-fg text-bg" : "border-line-2 text-muted hover:text-fg")}>
              {k === "all" ? `All · ${runs?.filter((r) => !r.error).length ?? 0}` : k}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!runs && Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[220px] animate-pulse rounded-[18px] bg-bg-2" />)}
        {shown.map((r, i) => <RunCard key={r.slug} r={r} i={i} />)}
      </div>
    </div>
  );
}

function RunCard({ r, i }: { r: RunSummary; i: number }) {
  const sp = new URLSearchParams({ q: r.query, lens: r.lens });
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
      <Link href={`/run/rec_${r.slug}?${sp}`}
        className="group flex h-full flex-col rounded-[18px] border border-line bg-bg p-5 transition-all hover:-translate-y-0.5 hover:border-line-2 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between">
          <span className="eyebrow !text-[10px] !text-accent">{r.lens}</span>
          <span className="font-mono text-[10px] text-muted">{new Date(r.created).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        </div>
        <div className="mt-3 text-[17px] font-semibold leading-[23px] tracking-tight group-hover:text-accent">{r.query}</div>
        <div className="mt-4 flex -space-x-2">
          {r.top.slice(0, 6).map((p) => <PeerLogo key={p.id} name={p.name} src={p.logo} />)}
        </div>
        {r.headline && <div className="mt-4 line-clamp-2 flex-1 text-[13px] leading-[19px] text-fg-2">{r.headline}</div>}
        <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
          {[["Peers", String(r.peers)], ["People", compact(r.people)], ["Raised", usd(r.raised_usd)]].map(([k, v]) => (
            <div key={k} className="bg-bg px-3 py-2">
              <div className="eyebrow !text-[9px]">{k}</div>
              <div className="font-dot text-[17px] font-black leading-[22px] tnum">{v}</div>
            </div>
          ))}
        </div>
      </Link>
    </motion.div>
  );
}

export function PeerLogo({ name, src, size = 30 }: { name: string; src: string | null; size?: number }) {
  const [ok, setOk] = useState(!!src);
  const init = name.replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-bg bg-bg-3 text-[10px] font-semibold text-fg-2"
      style={{ width: size, height: size }} title={name}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {ok && src ? <img src={src} alt={name} className="size-full object-cover" onError={() => setOk(false)} /> : init}
    </span>
  );
}
