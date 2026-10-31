"use client";

import * as d3 from "d3";
import { useMemo, useState } from "react";
import { Num } from "@/components/Num";
import { LegendItem, SceneFrame, useSize } from "@/components/ui";
import { compact, cx, monthLabel, quarterLabel, usd } from "@/lib/format";
import { useRun } from "@/lib/run-context";
import { FUNCTIONS, type Fn, type StreamsScene } from "@/lib/types";

const COLOR: Record<Fn, string> = {
  Engineering: "var(--s1)",
  Sales: "var(--s2)",
  "Customer Success": "var(--s3)",
  Marketing: "var(--s4)",
  Operations: "var(--s5)",
  Other: "var(--s-other)",
};

type PeerStream = StreamsScene["peers"][number];

export function StreamsSceneView({ data }: { data: StreamsScene }) {
  const { peer, lens } = useRun();
  const [hover, setHover] = useState<number | null>(null);
  const [onlyShifts, setOnlyShifts] = useState(false);

  const sorted = useMemo(() => {
    const total = (p: PeerStream) => FUNCTIONS.reduce((a, f) => a + (p.series.at(-1)?.[f] ?? 0), 0);
    return [...data.peers].sort((a, b) => (b.gtm_shift ? 1 : 0) - (a.gtm_shift ? 1 : 0) || total(b) - total(a));
  }, [data.peers]);
  const shown = onlyShifts ? sorted.filter((p) => p.gtm_shift) : sorted;
  const shifts = sorted.filter((p) => p.gtm_shift).length;
  const dates = data.peers[0]?.series.map((s) => s.date) ?? [];

  const title = lens === "operator" ? `${shifts} rivals just switched to selling.` : lens === "founder" ? "Who is still building, who is selling." : "Build mode or sell mode.";

  return (
    <SceneFrame
      id="streams" n="03" name="Build vs Sell" title={title}
      legend={
        <div className="flex max-w-[420px] flex-wrap items-center justify-end gap-x-4 gap-y-2">
          {FUNCTIONS.map((f) => <LegendItem key={f} color={COLOR[f]} label={f} />)}
        </div>
      }
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1.5">
          {[
            { k: false, label: `All · ${sorted.length}` },
            { k: true, label: `GTM shift · ${shifts}` },
          ].map((o) => (
            <button key={String(o.k)} onClick={() => setOnlyShifts(o.k)}
              className={cx("rounded-full border px-3 py-1 text-[12px] font-medium", onlyShifts === o.k ? "border-fg bg-fg text-bg" : "border-line-2 text-muted hover:text-fg")}>
              {o.label}
            </button>
          ))}
        </div>
        <span className="font-mono text-[12px] text-muted tnum">{hover != null ? monthLabel(dates[hover]) : `${monthLabel(dates[0] ?? "")} – ${monthLabel(dates.at(-1) ?? "")}`}</span>
      </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[16px] border border-line bg-line sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((p) => (
          <Card key={p.peer_id} p={p} name={peer(p.peer_id)?.name ?? `#${p.peer_id}`} hover={hover} setHover={setHover} />
        ))}
      </div>
    </SceneFrame>
  );
}

function Card({ p, name, hover, setHover }: { p: PeerStream; name: string; hover: number | null; setHover: (i: number | null) => void }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const H = 120;
  const AD = 22;
  const n = p.series.length;

  const { layers, x, shiftX, adY } = useMemo(() => {
    const stack = d3.stack<PeerStream["series"][number], Fn>().keys(FUNCTIONS).offset(d3.stackOffsetSilhouette).order(d3.stackOrderNone);
    const layers = stack(p.series);
    const x = d3.scaleLinear().domain([0, n - 1]).range([0, Math.max(1, width)]);
    const lo = d3.min(layers, (l) => d3.min(l, (d) => d[0])) ?? 0;
    const hi = d3.max(layers, (l) => d3.max(l, (d) => d[1])) ?? 1;
    const y = d3.scaleLinear().domain([lo, hi]).range([H - 4, 4]);
    const area = d3.area<d3.SeriesPoint<PeerStream["series"][number]>>()
      .x((_, i) => x(i)).y0((d) => y(d[0])).y1((d) => y(d[1])).curve(d3.curveBasis);
    const shiftI = p.gtm_shift ? p.series.findIndex((s) => s.date >= p.gtm_shift!.date) : -1;
    const adMax = d3.max(p.ad_budget_series, (d) => d.usd) || 1;
    const adY = (v: number) => (v / adMax) * (AD - 2);
    return { layers: layers.map((l) => ({ key: l.key as Fn, d: area(l) ?? "" })), x, shiftX: shiftI >= 0 ? x(shiftI) : null, adY };
  }, [p, width, n]);

  const last = p.series.at(-1);
  const at = hover != null ? p.series[hover] : last;
  const total = at ? FUNCTIONS.reduce((a, f) => a + at[f], 0) : 0;
  const sales = at ? at.Sales / (total || 1) : 0;
  const barW = width / Math.max(1, p.ad_budget_series.length);
  // Crustdata returns a single current monthly budget repeated over months; don't draw it as a trend.
  const flatAds = new Set(p.ad_budget_series.map((d) => d.usd)).size <= 1;

  return (
    <div className="bg-bg p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold tracking-tight">{name}</div>
          <div className="mt-0.5 text-[12px] text-muted">
            <Num value={compact(total)} ev={p.ev.slice(0, 1)} /> people · <Num value={`${Math.round(sales * 100)}%`} ev={p.ev.slice(0, 1)} /> sales
          </div>
        </div>
        {p.gtm_shift && (
          <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--s2)_14%,transparent)] px-2.5 py-1 text-[11px] font-medium text-fg" title={p.gtm_shift.reason}>
            GTM shift · {quarterLabel(p.gtm_shift.date)}
          </span>
        )}
      </div>

      <div
        ref={ref}
        className="relative mt-4"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
        }}
      >
        {width > 0 && (
          <svg width={width} height={H + AD + 6} className="block overflow-visible">
            {layers.map((l) => (
              <path key={l.key} d={l.d} fill={COLOR[l.key]} stroke="var(--bg)" strokeWidth={1} opacity={hover != null ? 0.9 : 1} />
            ))}
            {shiftX != null && (
              <line x1={shiftX} x2={shiftX} y1={0} y2={H} stroke="var(--fg)" strokeDasharray="2 3" strokeWidth={1} opacity={0.5} />
            )}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H + AD + 6} stroke="var(--fg)" strokeWidth={1} />}
            <g transform={`translate(0, ${H + 6})`}>
              {flatAds ? (
                <rect x={0} width={width} y={AD - 3} height={3} rx={1.5} fill="var(--muted)" opacity={p.ad_budget_series[0]?.usd ? 0.45 : 0.15} />
              ) : p.ad_budget_series.map((d, i) => (
                <rect key={d.date} x={i * barW + 1} width={Math.max(1, barW - 2)} y={AD - adY(d.usd)} height={adY(d.usd)} rx={1}
                  fill={hover === i ? "var(--fg)" : "var(--muted)"} opacity={hover === i ? 1 : 0.45} />
              ))}
            </g>
          </svg>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
        <span className="eyebrow !text-[10px]">{flatAds ? "Current ad budget / mo" : "Ad budget / mo"}</span>
        <Num value={usd(hover != null && !flatAds ? p.ad_budget_series[hover]?.usd : p.ad_budget_series.at(-1)?.usd)} ev={p.ev} className="font-mono" />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3 text-[11px] text-muted">
        <span className="eyebrow !text-[10px]">Open roles</span>
        {Object.entries(p.jobs_by_category).filter(([, v]) => v > 0).slice(0, 4).map(([k, v]) => (
          <span key={k}>{k.replace("Customer Success", "CS")} <Num value={v} ev={p.ev.slice(1)} className="font-mono text-fg" /></span>
        ))}
      </div>
    </div>
  );
}
