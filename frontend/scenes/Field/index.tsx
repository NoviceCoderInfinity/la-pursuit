"use client";

import * as d3 from "d3";
import { ActionText } from "@/components/ActionText";
import { fieldAction } from "@/lib/actions";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Num } from "@/components/Num";
import { LegendItem, SceneFrame, Scrubber, Tooltip, useSize } from "@/components/ui";
import { compact, cx, monthLabel, usd } from "@/lib/format";
import { useRun } from "@/lib/run-context";
import type { FieldRow, FieldScene } from "@/lib/types";

type Pt = FieldScene["frames"][number]["points"][number];
type PtC = Pt & { cx: number | null; cy: number | null; clamped: boolean };

const PART_LABEL: Record<string, string> = {
  headcount: "Headcount growth", hiring: "Hiring velocity", traffic: "Traffic trend", followers: "Follower growth", funding: "Funding recency",
};
const PULL_LABEL: Record<string, string> = {
  organic_share: "Earned share of traffic", keyword_net: "Keywords gained − lost", traffic_per_employee: "Traffic per employee", traffic_growth: "Traffic growth",
};

const momentumColor = (m: number | null) => (m == null ? "var(--muted)" : `color-mix(in srgb, var(--accent) ${Math.round(Math.max(0, m - 20) * 1.25)}%, var(--s-other))`);

export function FieldSceneView({ data }: { data: FieldScene }) {
  const { peer, lens, scenes } = useRun();
  const nameOf = (id: number) => peer(id)?.name ?? `#${id}`;
  const dates = data.frames.map((f) => f.date);
  const [idx, setIdx] = useState(Math.max(0, dates.length - 1));
  const [sel, setSel] = useState<number | null>(null);
  const [hot, setHot] = useState<number | null>(null);
  const rows = useMemo(() => new Map((data.table ?? []).map((r) => [r.peer_id, r])), [data.table]);
  const ranked = useMemo(
    () => [...(data.table ?? [])].filter((r) => r.momentum != null).sort((a, b) => b.momentum! - a.momentum!),
    [data.table],
  );
  const top = ranked[0] ? peer(ranked[0].peer_id) : undefined;
  const distressed = ranked.filter((r) => (r.distress ?? 0) >= 30).length;
  const targetId = scenes.deck?.target_id ?? null;
  const tIdx = targetId != null ? ranked.findIndex((r) => r.peer_id === targetId) : -1;
  const target = tIdx >= 0 ? peer(targetId!) : undefined;

  const title =
    lens === "investor" && target
      ? <>{target.name} ranks <Num value={`#${tIdx + 1}`} ev={data.ev[target.id]} /> of {ranked.length} on momentum, <Num value={Math.round(ranked[tIdx].momentum!)} ev={data.ev[target.id]} />/100.</>
      : lens === "investor" && top
        ? <>{top.name} leads <Num value={ranked.length} ev={data.ev[top.id]} /> peers on momentum, <Num value={Math.round(ranked[0].momentum!)} ev={data.ev[top.id]} />/100.</>
      : lens === "operator"
        ? <>Who is accelerating toward you{distressed ? <>, and who is stalling.</> : "."}</>
        : <>Earned growth versus bought growth.</>;

  return (
    <SceneFrame
      id="field" n="02" name="Momentum" title={title} action={<ActionText a={fieldAction(data, lens, nameOf, scenes.deck?.target_id ?? null)} />}
      legend={
        <div className="flex max-w-[520px] flex-wrap items-center justify-end gap-x-4 gap-y-2 text-fg-2">
          <LegendItem color="var(--accent)" label="High momentum" />
          <LegendItem color="var(--muted)" label="Low momentum" />
          <LegendItem color="var(--red)" label="Distress" kind="ring" />
          <LegendItem color="var(--muted)" label="No traffic data" kind="ring" dashed />
          <span className="text-[12px] text-fg-2">size = raised</span>
        </div>
      }
      aside={<Leaderboard ranked={ranked} sel={sel} setSel={setSel} ev={data.ev} setHot={setHot} />}
      controls={dates.length > 1 ? <Scrubber dates={dates} index={idx} onIndex={setIdx} format={monthLabel} /> : undefined}
    >
      <Chart data={data} idx={idx} sel={sel} setSel={setSel} rows={rows} hot={hot} />
    </SceneFrame>
  );
}

function Chart({ data, idx, sel, setSel, rows, hot }: { data: FieldScene; idx: number; sel: number | null; setSel: (id: number | null) => void; rows: Map<number, FieldRow>; hot: number | null }) {
  const { peer } = useRun();
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ p: PtC; x: number; y: number } | null>(null);
  const W = Math.max(1, width);
  const H = Math.max(420, height || 0);
  const M = { t: 30, r: 28, b: 44, l: 56 };

  const { x, y, r, trails, pts, xTicks, yTicks } = useMemo(() => {
    const all = data.frames.flatMap((f) => f.points);
    // Fixed, clamped domains: a 10-visitor site tripling is not a signal worth stretching the axis for.
    const XD: [number, number] = [-60, 300];
    const YD: [number, number] = [-80, 400];
    const cl = (v: number, d: [number, number]) => Math.max(d[0], Math.min(d[1], v));
    const x = d3.scaleSymlog().constant(40).domain(XD).range([M.l, W - M.r]).clamp(true);
    const y = d3.scaleSymlog().constant(40).domain(YD).range([H - M.b, M.t]).clamp(true);
    const r = d3.scaleSqrt().domain([0, d3.max(all, (p) => p.size) || 1]).range([6, 34]);
    const pts = (data.frames[idx]?.points ?? []).map((p) => ({ ...p, cx: p.x == null ? null : cl(p.x, XD), cy: p.y == null ? null : cl(p.y, YD), clamped: (p.x != null && (p.x < XD[0] || p.x > XD[1])) || (p.y != null && (p.y < YD[0] || p.y > YD[1])) }));
    const line = d3.line<[number, number]>().curve(d3.curveBasis);
    const trails = pts.map((p) => {
      const path = data.frames.slice(0, idx + 1).map((f) => f.points.find((q) => q.peer_id === p.peer_id))
        .filter((q): q is Pt => !!q && q.x != null && q.y != null).map((q) => [x(cl(q.x!, XD)), y(cl(q.y!, YD))] as [number, number]);
      return { id: p.peer_id, d: path.length > 1 ? line(path) ?? "" : "", color: momentumColor(p.momentum) };
    });
    return { x, y, r, trails, pts, xTicks: [-50, 0, 50, 100, 200, 300], yTicks: [-50, 0, 50, 100, 200, 400] };
  }, [data, idx, W, H, M.l, M.r, M.t, M.b]);

  const labelled = useMemo(() => new Set([...pts].sort((a, b) => b.size - a.size).slice(0, 6).map((p) => p.peer_id)), [pts]);

  return (
    <div ref={ref} className="relative h-full min-h-[420px] w-full" onClick={() => setSel(null)}>
      {W > 1 && (
        <svg width={W} height={H} className="block select-none">
          {/* grid */}
          {xTicks.map((t) => (
            <g key={`x${t}`}>
              <line x1={x(t)} x2={x(t)} y1={M.t} y2={H - M.b} stroke={t === 0 ? "var(--line-2)" : "var(--line)"} strokeWidth={t === 0 ? 1.5 : 1} />
              <text x={x(t)} y={H - M.b + 18} textAnchor="middle" className="fill-[var(--muted)] font-mono text-[11px]">{t > 0 ? `+${t}%` : `${t}%`}</text>
            </g>
          ))}
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--line-2)" : "var(--line)"} strokeWidth={t === 0 ? 1.5 : 1} />
              <text x={M.l - 8} y={y(t) + 4} textAnchor="end" className="fill-[var(--muted)] font-mono text-[11px]">{t > 0 ? `+${t}%` : `${t}%`}</text>
            </g>
          ))}
          <text x={W - M.r} y={H - 6} textAnchor="end" className="fill-[var(--muted)] text-[11px] uppercase tracking-[0.08em]">Headcount · trailing 6 months →</text>
          <text x={M.l} y={M.t - 8} className="fill-[var(--muted)] text-[11px] uppercase tracking-[0.08em]">↑ Web traffic · trailing 3 months</text>
          <text x={W - M.r - 6} y={M.t + 14} textAnchor="end" className="fill-[var(--muted)] text-[11px] italic opacity-70">accelerating</text>
          <text x={M.l + 6} y={H - M.b - 8} className="fill-[var(--muted)] text-[11px] italic opacity-70">stalling</text>

          {/* trails */}
          {trails.map((t) => t.d && (sel === t.id || hover?.p.peer_id === t.id || (sel == null && labelled.has(t.id))) && (
            <motion.path key={`t${t.id}`} d={t.d} fill="none" stroke={t.color} strokeWidth={sel === t.id ? 2 : 1.25} strokeLinecap="round"
              initial={false} animate={{ d: t.d, opacity: sel === t.id || hover?.p.peer_id === t.id ? 0.7 : 0.28 }} transition={{ duration: 0.35 }} />
          ))}

          {/* bubbles */}
          {pts.map((p) => {
            const missing = p.cx == null || p.cy == null;
            const cx0 = x(p.cx ?? 0), cy0 = y(p.cy ?? 0), rr = r(p.size);
            const dim = (sel != null && sel !== p.peer_id) || (hot != null && hot !== p.peer_id && sel == null);
            const dis = (p.distress ?? 0) >= 30;
            const name = peer(p.peer_id)?.name ?? `#${p.peer_id}`;
            return (
              <g key={p.peer_id} className="cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setSel(sel === p.peer_id ? null : p.peer_id); }}
                onMouseEnter={(e) => { const b = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ p, x: e.clientX - b.left, y: e.clientY - b.top }); }}
                onMouseMove={(e) => { const b = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ p, x: e.clientX - b.left, y: e.clientY - b.top }); }}
                onMouseLeave={() => setHover(null)}>
                {dis && (
                  <motion.circle cx={cx0} cy={cy0} fill="none" stroke="var(--red)" strokeWidth={1.5}
                    animate={{ cx: cx0, cy: cy0, r: [rr + 4, rr + 12, rr + 4], opacity: [0.9, 0, 0.9] }}
                    transition={{ cx: { duration: 0.35 }, cy: { duration: 0.35 }, r: { duration: 1.8, repeat: Infinity }, opacity: { duration: 1.8, repeat: Infinity } }} />
                )}
                <motion.circle
                  initial={false}
                  animate={{ cx: cx0, cy: cy0, r: rr, opacity: dim ? 0.18 : missing ? 0.7 : 0.92 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  fill={missing ? "transparent" : momentumColor(p.momentum)}
                  stroke={missing ? "var(--muted)" : sel === p.peer_id || hot === p.peer_id ? "var(--fg)" : "var(--bg)"}
                  strokeDasharray={missing ? "3 3" : undefined}
                  strokeWidth={sel === p.peer_id || hot === p.peer_id ? 2 : 1.5}
                />
                {(labelled.has(p.peer_id) || sel === p.peer_id || hot === p.peer_id) && (
                  <motion.text initial={false} animate={{ x: cx0 + rr + 6, y: cy0 + 4, opacity: dim ? 0.2 : 1 }} transition={{ duration: 0.35 }}
                    className="fill-[var(--fg)] text-[12px] font-medium" style={{ pointerEvents: "none" }}>{name}{p.clamped ? " ↗" : ""}</motion.text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover && (
        <Tooltip x={hover.x} y={hover.y}>
          <div className="font-semibold text-fg">{peer(hover.p.peer_id)?.name}</div>
          <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted">
            <span>Headcount 6m</span><span className="text-right font-mono text-fg tnum">{fmtPct(hover.p.x)}</span>
            <span>Traffic 3m</span><span className="text-right font-mono text-fg tnum">{fmtPct(hover.p.y)}</span>
            <span>Momentum</span><span className="text-right font-mono text-fg tnum">{hover.p.momentum == null ? "—" : Math.round(hover.p.momentum)}</span>
            <span>Organic pull</span><span className="text-right font-mono text-fg tnum">{hover.p.pull == null ? "—" : Math.round(hover.p.pull)}</span>
            <span>Raised</span><span className="text-right font-mono text-fg tnum">{usd(hover.p.size || null)}</span>
            {(hover.p.distress ?? 0) > 0 && <><span className="text-red">Distress</span><span className="text-right font-mono text-red tnum">{Math.round(hover.p.distress!)}</span></>}
          </div>
          {rows.get(hover.p.peer_id) && <div className="mt-1 text-[11px] text-muted">click for the breakdown</div>}
        </Tooltip>
      )}
    </div>
  );
}

const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(0)}%`);

function Leaderboard({ ranked, sel, setSel, ev, setHot }: { ranked: FieldRow[]; sel: number | null; setSel: (id: number | null) => void; ev: Record<number, string[]>; setHot: (id: number | null) => void }) {
  const { peer } = useRun();
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[16px] border border-line">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="eyebrow">Momentum index</span>
        <span className="font-mono text-[11px] text-muted">{ranked.length} peers</span>
      </div>
      <div className="max-h-[560px] flex-1 overflow-y-auto">
        {ranked.map((r, i) => {
          const open = sel === r.peer_id;
          const name = peer(r.peer_id)?.name ?? `#${r.peer_id}`;
          return (
            <div key={r.peer_id} className={cx("border-b border-line last:border-0", open && "bg-bg-2")}>
              <div role="button" tabIndex={0} onClick={() => setSel(open ? null : r.peer_id)} onKeyDown={(e) => e.key === "Enter" && setSel(open ? null : r.peer_id)}
                onMouseEnter={() => setHot(r.peer_id)} onMouseLeave={() => setHot(null)}
                className="grid w-full cursor-pointer grid-cols-[24px_1fr_44px] items-center gap-3 px-4 py-2.5 text-left hover:bg-bg-2">
                <span className="font-mono text-[11px] text-muted tnum">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{name}</span>
                  <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-bg-3">
                    <motion.span className="block h-full rounded-full" style={{ background: momentumColor(r.momentum) }}
                      initial={{ width: 0 }} animate={{ width: `${r.momentum ?? 0}%` }} transition={{ duration: 0.6, delay: i * 0.03 }} />
                  </span>
                </span>
                <span className="flex items-center justify-end gap-1.5">
                  {(r.distress ?? 0) >= 30 && <span className="size-1.5 rounded-full bg-red" title={`distress ${r.distress}`} />}
                  <Num value={Math.round(r.momentum ?? 0)} ev={ev[r.peer_id]} className="font-mono text-[12px]" />
                </span>
              </div>
              {open && <Breakdown r={r} ev={ev[r.peer_id]} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Breakdown({ r, ev }: { r: FieldRow; ev?: string[] }) {
  const parts = Object.entries(r.momentum_parts ?? {});
  const pulls = Object.entries(r.pull_parts ?? {});
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden px-4 pb-4 text-[12px]">
      <div className="eyebrow !text-[10px]">How the index is built</div>
      <div className="mt-2 space-y-1.5">
        {parts.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[1fr_auto] items-center gap-2">
            <div>
              <div className="flex justify-between text-fg-2"><span>{PART_LABEL[k] ?? k}</span><span className="font-mono text-muted">w {Math.round((r.momentum_weights?.[k] ?? 0) * 100)}%</span></div>
              <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-bg-3"><div className="h-full rounded-full bg-accent" style={{ width: `${v ?? 0}%` }} /></div>
            </div>
            <Num value={v == null ? "n/a" : `${Math.round(v)}`} ev={v == null ? undefined : ev} className="w-9 justify-end font-mono" />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between"><span className="eyebrow !text-[10px]">Organic pull</span><Num value={r.pull == null ? "—" : Math.round(r.pull)} ev={r.pull == null ? undefined : ev} className="font-mono" /></div>
      <div className="mt-1 space-y-0.5 text-muted">
        {pulls.map(([k, v]) => <div key={k} className="flex justify-between"><span>{PULL_LABEL[k] ?? k}</span><span className="font-mono tnum">{v == null ? "—" : Math.round(v)}</span></div>)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-muted">
        <span>Visitors / mo</span><Num value={compact(r.visitors)} ev={ev} className="justify-end font-mono text-fg" />
        <span>Paid share</span><Num value={r.paid_share == null ? "—" : `${r.paid_share.toFixed(1)}%`} ev={ev} className="justify-end font-mono text-fg" />
        <span>Ad budget / mo</span><Num value={usd(r.ads_budget)} ev={ev} className="justify-end font-mono text-fg" />
        <span>Roles · 90d</span><Num value={r.jobs_90d ?? "—"} ev={ev} className="justify-end font-mono text-fg" />
        <span>Last round</span><Num value={r.last_round ? `${r.last_round.replace("_", " ")} · ${r.last_round_date ?? ""}` : "—"} ev={ev} className="justify-end font-mono text-fg" />
      </div>
      {r.distress_signals?.length > 0 && (
        <div className="mt-3 rounded-lg border border-red/30 bg-[color-mix(in_srgb,var(--red)_6%,transparent)] p-2.5">
          <div className="flex justify-between"><span className="eyebrow !text-[10px] !text-red">Distress</span><Num value={Math.round(r.distress ?? 0)} ev={ev} className="font-mono text-red" /></div>
          <ul className="mt-1 space-y-0.5 text-fg-2">{r.distress_signals.map((s) => <li key={s.text}>· {s.text}</li>)}</ul>
        </div>
      )}
    </motion.div>
  );
}
