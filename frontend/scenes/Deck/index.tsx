"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { getWatchStatus, type WatchStatus } from "@/lib/api";
import { PeerLogo } from "@/components/Library";
import { Num } from "@/components/Num";
import { SceneFrame } from "@/components/ui";
import { cx } from "@/lib/format";
import { scenesFor, useRun } from "@/lib/run-context";
import type { DeckScene } from "@/lib/types";

const sceneLabel = (lens: string, key: string) => {
  const s = scenesFor(lens as Parameters<typeof scenesFor>[0]).find((x) => x.key === key);
  return s ? `${s.n} ${s.name}` : null;
};
const LENS_WORD: Record<string, string> = { operator: "operator", investor: "investor", founder: "founder" };

export function DeckSceneView({ data }: { data: DeckScene }) {
  const { lens, peer, status, runId } = useRun();
  const target = data.target_id ? peer(data.target_id) : undefined;
  const live = data.watches.filter((w) => w.id && w.id !== "preview");
  const [ws, setWs] = useState<Record<string, WatchStatus>>({});
  useEffect(() => {
    if (!live.length) return;
    let stop = false;
    const tick = () => getWatchStatus(runId).then((rows) => { if (!stop) setWs(Object.fromEntries(rows.map((r) => [String(r.id), r]))); }).catch(() => {});
    tick();
    const t = setInterval(tick, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, [runId, live.length]);

  const title = target && lens !== "founder"
    ? <>{data.moves.length} moves for the {LENS_WORD[lens]}{lens === "investor" ? ` looking at ${target.name}` : lens === "operator" ? ` at ${target.name}` : ""}.</>
    : <>{data.moves.length} moves for the {LENS_WORD[lens]}.</>;

  return (
    <SceneFrame id="deck" n="07" name="Decisions" title={title}
      legend={data.market_stage && (
        <div className="flex items-center gap-4">
          <Gauge value={data.crowdedness ?? 0} label="crowded" />
          <div><div className="eyebrow !text-[10px]">Market stage</div><div className="text-[15px] font-semibold capitalize">{data.market_stage}</div></div>
        </div>
      )}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {data.moves.map((m, i) => (
          <motion.article key={m.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="group relative flex flex-col rounded-[18px] border border-line bg-bg p-6 transition-colors hover:border-line-2">
            <div className="flex items-center justify-between">
              <span className="font-dot text-[22px] font-black leading-none text-accent">0{i + 1}</span>
              <a href={`#${m.scene}`} className="rounded-full bg-bg-2 px-2.5 py-1 font-mono text-[10px] text-muted transition-colors hover:text-fg">{sceneLabel(lens, m.scene) ?? m.scene} ↗</a>
            </div>
            <h3 className="mt-5 text-[22px] font-semibold leading-[28px] tracking-[-0.02em]">{m.title}</h3>
            <p className="mt-3 flex-1 text-[14px] leading-[21px] text-fg-2">{m.why}</p>
            <div className="mt-5">
              <div className="flex items-center justify-between text-[11px] text-muted"><span className="eyebrow !text-[10px]">Confidence</span><span className="font-mono tnum">{Math.round(m.confidence * 100)}%</span></div>
              <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-bg-3"><motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${m.confidence * 100}%` }} transition={{ duration: 0.8, delay: 0.3 + i * 0.1 }} /></div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Num value={`${m.ev.length} source${m.ev.length === 1 ? "" : "s"}`} ev={m.ev} className="rounded-full !border !border-line-2 !px-2.5 !py-1 !text-[11px] !no-underline" />
              {m.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line-2 px-2.5 py-1 text-[11px] text-fg-2 hover:border-accent hover:text-fg">
                  <span className="size-1.5 shrink-0 rounded-full bg-accent" /><span className="truncate">{l.label}</span>
                </a>
              ))}
            </div>
          </motion.article>
        ))}
      </div>

      {data.diligence_questions && data.diligence_questions.length > 0 && (
        <div className="mt-8 grid gap-6 lg:grid-cols-[220px_1fr]">
          <div><div className="eyebrow">Diligence questions</div><p className="mt-2 text-[13px] text-muted">What the graph cannot answer.</p></div>
          <ol className="divide-y divide-line rounded-[16px] border border-line">
            {data.diligence_questions.map((q, i) => (
              <li key={q} className="flex gap-4 px-5 py-3 text-[14px]"><span className="font-mono text-[11px] text-muted tnum">{String(i + 1).padStart(2, "0")}</span>{q}</li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-10 border-t border-line pt-8">
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2"><span className={cx("size-2 rounded-full", live.length ? "bg-green blink" : status === "running" ? "bg-accent blink" : "bg-muted")} /><span className="eyebrow">Watchtower</span></div>
            <p className="mt-2 text-[13px] text-muted">Live on Crustdata. Deltas are re-scored by the engines.</p>
          </div>
          <span className="font-mono text-[11px] text-muted">{live.length} live · {data.watches.length} configured</span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {data.watches.length === 0 && <div className="dots rounded-[14px] border border-dashed border-line-2 p-6 text-[13px] text-muted">Registering…</div>}
          {data.watches.map((w, i) => {
            const sample = (w.preview_sample as { record?: { basic_info?: { name?: string } } } | null)?.record?.basic_info?.name;
            const isLive = w.id && w.id !== "preview";
            return (
              <motion.div key={`${w.kind}-${i}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.08 }} className="rounded-[14px] border border-line bg-bg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cx("size-2 rounded-full", isLive ? "bg-green" : "bg-muted")} />
                    <span className="text-[13px] font-semibold capitalize">{w.kind} watch</span>
                  </div>
                  <span className="font-mono text-[11px] text-muted">{isLive ? `#${w.id} · ${w.status}` : "preview"}</span>
                </div>
                <div className="mt-2 text-[12px] text-fg-2">{w.track}</div>
                {(() => { const st = ws[String(w.id)]; const r0 = st?.runs?.[0]; return r0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <span className={cx("rounded-full px-2 py-0.5 font-mono", r0.status === "SUCCESS" ? "bg-[color-mix(in_srgb,var(--green)_14%,transparent)] text-green" : "bg-bg-3 text-muted")}>baseline {r0.status.toLowerCase()}</span>
                    <Num value={`${r0.records_matched ?? 0} matched`} ev={st.ev} className="font-mono text-fg-2" />
                    <Num value={`${r0.new_records_count ?? 0} flagged`} ev={st.ev} className="font-mono text-fg-2" />
                    {st.last_run_at && <span className="font-mono text-muted">{st.last_run_at.slice(0, 16).replace("T", " ")} UTC</span>}
                  </div>
                ) : null; })()}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
                  {w.entities != null && <span>{w.resolved ?? w.entities}/{w.entities} peers resolved</span>}
                  {sample && <span>sample · {sample}</span>}
                  {w.created_at && <span>{w.created_at.slice(0, 16).replace("T", " ")} UTC</span>}
                  {w.ev?.length ? <Num value="receipt" ev={w.ev} /> : null}
                </div>
              </motion.div>
            );
          })}
        </div>
        <Signals alerts={data.alerts} />
      </div>
    </SceneFrame>
  );
}

function Gauge({ value, label }: { value: number; label: string }) {
  const r = 22, c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-16 place-items-center">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--bg-3)" strokeWidth="5" />
        <motion.circle cx="32" cy="32" r={r} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value / 100) }} transition={{ duration: 1, ease: "easeOut" }} />
      </svg>
      <div className="absolute text-center leading-none"><div className="font-dot text-[16px] font-black tnum">{value}</div></div>
      <div className="absolute -bottom-3 text-[9px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

const ENGINE: Record<string, { label: string; color: string }> = {
  capital: { label: "Funding", color: "var(--s1)" },
  talent: { label: "Hire", color: "var(--s3)" },
  gtm: { label: "GTM shift", color: "var(--s2)" },
  expansion: { label: "Expansion", color: "var(--s4)" },
  news: { label: "News", color: "var(--s5)" },
};

function Signals({ alerts }: { alerts: DeckScene["alerts"] }) {
  const { peer } = useRun();
  return (
    <div className="mt-8">
      <div className="flex items-end justify-between">
        <div className="eyebrow">Latest signals · last 120 days</div>
        <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
          {Object.entries(ENGINE).map(([k, e]) => (
            <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-muted"><span className="size-1.5 rounded-full" style={{ background: e.color }} />{e.label}</span>
          ))}
        </div>
      </div>
      {alerts.length === 0 ? (
        <div className="mt-3 text-[13px] text-muted">Quiet market: no funding, senior hires, expansions or GTM shifts in the window.</div>
      ) : (
        <ol className="relative mt-4 border-l border-line pl-6">
          {alerts.map((a, i) => {
            const e = ENGINE[a.engine] ?? { label: a.engine, color: "var(--muted)" };
            const p = peer(a.peer_id);
            return (
              <motion.li key={a.ts + a.headline} initial={{ opacity: 0, x: -6 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(i, 10) * 0.04 }}
                className="relative pb-4 last:pb-0">
                <span className="absolute -left-[29px] top-[5px] size-2.5 rounded-full border-2 border-bg" style={{ background: e.color }} />
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="w-[74px] shrink-0 font-mono text-[11px] text-muted tnum">{new Date(a.ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: `color-mix(in srgb, ${e.color} 14%, transparent)`, color: e.color }}>{e.label}</span>
                  {p && <PeerLogo name={p.name} src={p.logo} size={18} />}
                  <span className="min-w-0 flex-1 text-[14px] leading-[20px]">
                    {a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="hover:text-accent">{a.headline}</a> : a.headline}
                  </span>
                  {(a.ev?.length ?? 0) > 0 && <Num value="receipt" ev={a.ev} className="text-[11px] text-muted" />}
                </div>
              </motion.li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
