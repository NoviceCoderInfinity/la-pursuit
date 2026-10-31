"use client";

import * as d3 from "d3";
import { ActionText } from "@/components/ActionText";
import { capitalAction } from "@/lib/actions";
import { useMemo, useState } from "react";
import { Num } from "@/components/Num";
import { LegendItem, SceneFrame, Tooltip, useSize } from "@/components/ui";
import { compact, cx, usd } from "@/lib/format";
import { useRun } from "@/lib/run-context";
import type { ConstellationScene } from "@/lib/types";

type CNode = ConstellationScene["nodes"][number] & d3.SimulationNodeDatum & { r: number };
type CEdge = ConstellationScene["edges"][number];
type Link = { source: CNode; target: CNode; edge?: CEdge; pull?: boolean };

const DISTRESS = 0.5;

export function ConstellationSceneView({ data }: { data: ConstellationScene }) {
  const { openEvidence, lens } = useRun();
  const [box, { width, height }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const W = Math.max(320, width);
  const H = Math.max(480, height);

  const { nodes, links } = useMemo(() => {
    const maxCo = d3.max(data.nodes.filter((n) => n.type === "company"), (n) => n.size) || 1;
    const rCo = d3.scaleSqrt().domain([0, maxCo]).range([7, 26]);
    const nodes: CNode[] = data.nodes.map((n) => ({
      ...n,
      r: n.type === "company" ? rCo(n.size) : n.kingmaker ? 6 + n.size * 1.5 : n.open_slot ? 6 : 4,
    }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: Link[] = data.edges
      .filter((e) => byId.has(e.from) && byId.has(e.to))
      .map((e) => ({ source: byId.get(e.from)!, target: byId.get(e.to)!, edge: e }));

    // Distressed companies drift toward the nearest acquirer (consolidation pairs).
    const acquirers = nodes.filter((n) => n.acquisitive);
    nodes.filter((n) => (n.distress ?? 0) >= DISTRESS && !n.acquisitive).forEach((n, k) => {
      if (acquirers.length) links.push({ source: n, target: acquirers[k % acquirers.length], pull: true });
    });

    const outer = Math.min(W, H) / 2 - 30;
    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink<CNode, Link>(links).distance((l) => (l.pull ? 70 : 60 + l.target.r)).strength((l) => (l.pull ? 0.25 : 0.5)))
      .force("charge", d3.forceManyBody<CNode>().strength((n) => (n.type === "company" ? -260 : -90)))
      .force("collide", d3.forceCollide<CNode>((n) => n.r + 14))
      .force("x", d3.forceX(W / 2).strength(0.04))
      .force("y", d3.forceY(H / 2).strength(0.06))
      // Kingmakers sit in the middle; single-bet investors and open slots ride the outer ring.
      .force("radial", d3.forceRadial<CNode>((n) => (n.kingmaker ? 0 : n.open_slot ? outer : n.type === "investor" ? outer * 0.85 : outer * 0.5), W / 2, H / 2)
        .strength((n) => (n.kingmaker ? 0.12 : n.open_slot ? 0.5 : n.type === "investor" ? 0.08 : 0.02)))
      .stop();
    for (let i = 0; i < 320; i++) sim.tick();
    nodes.forEach((n) => {
      n.x = Math.max(n.r + 4, Math.min(W - n.r - 4, n.x ?? 0));
      n.y = Math.max(n.r + 4, Math.min(H - n.r - 16, n.y ?? 0));
    });
    return { nodes, links };
  }, [data, W, H]);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links) {
      if (l.pull) continue;
      m.set(l.source.id, (m.get(l.source.id) ?? new Set()).add(l.target.id));
      m.set(l.target.id, (m.get(l.target.id) ?? new Set()).add(l.source.id));
    }
    return m;
  }, [links]);

  const lit = (id: string) => !hover || hover.id === id || neighbors.get(hover.id)?.has(id);
  const kingmakers = nodes.filter((n) => n.kingmaker).sort((a, b) => b.size - a.size);
  const slots = nodes.filter((n) => n.open_slot);
  const recent = data.edges.filter((e) => e.recent);
  const hn = hover ? nodes.find((n) => n.id === hover.id) : null;
  const hEdges = hover ? data.edges.filter((e) => e.from === hover.id || e.to === hover.id) : [];
  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;

  const emph = lens === "founder" ? "slots" : lens === "investor" ? "kings" : "pairs";
  const title = emph === "slots" ? `${slots.length} ${slots.length === 1 ? "investor" : "investors"} with no bet here yet.` : emph === "kings" ? "Who backs this market." : "Who funds whom, and who may be bought.";

  return (
    <SceneFrame
      id="constellation" n="05" name="Capital" title={title} action={<ActionText a={capitalAction(data, lens)} />}
      legend={
        <div className="flex flex-wrap items-center gap-4">
          <LegendItem color="#3b82f6" label="Kingmaker" />
          <LegendItem color="var(--muted)" kind="ring" dashed label="Open slot" />
          <LegendItem color="#3b82f6" kind="line" label="Last 12 mo" />
          <LegendItem color="var(--red)" label="Distress" />
        </div>
      }
      aside={
        <div className="flex flex-col gap-7">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
            <div className="bg-bg px-4 py-3">
              <div className="eyebrow !text-[10px]">Rounds, 12 mo</div>
              <Num value={recent.length} ev={recent.flatMap((e) => e.ev)} className="mt-1 font-dot text-[26px] font-black leading-[30px] !no-underline" />
            </div>
            <div className="bg-bg px-4 py-3">
              <div className="eyebrow !text-[10px]">Raised, 12 mo</div>
              <Num value={usd(recent.reduce((a, e) => a + (e.amount_usd ?? 0), 0))} ev={recent.flatMap((e) => e.ev)} className="mt-1 font-dot text-[26px] font-black leading-[30px] !no-underline" />
            </div>
          </div>
          <List title="Kingmakers" emph={emph === "kings"} items={kingmakers.map((k) => ({
            id: k.id, label: k.label,
            right: <Num value={`${neighbors.get(k.id)?.size ?? 0} cos`} ev={data.edges.filter((e) => e.from === k.id).flatMap((e) => e.ev)} className="font-mono" />,
          }))} onHover={(id) => setHover(id ? { id, x: -999, y: -999 } : null)} />
          <List title="Open slots" emph={emph === "slots"} items={slots.map((s) => ({ id: s.id, label: s.label, right: <span className="font-mono text-muted">—</span> }))} onHover={() => {}} />
        </div>
      }
    >
      <div ref={box} className="relative h-full min-h-[560px]" onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={W} height={H} className="absolute inset-0 overflow-visible">
            <defs>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {links.map((l, k) => {
              const on = lit(l.source.id) && lit(l.target.id);
              if (l.pull)
                return <line key={k} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y} stroke="var(--red)" strokeDasharray="1 4" strokeLinecap="round" strokeWidth={1.5} opacity={emph === "pairs" ? 0.8 : 0.4} />;
              const recentEdge = l.edge?.recent;
              return (
                <line key={k} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
                  stroke={recentEdge ? "#3b82f6" : "var(--line-2)"}
                  strokeWidth={(recentEdge ? 1.5 : 1) * (l.edge?.attributed === false ? 0.6 : 1)}
                  strokeDasharray={l.edge?.attributed === false ? "3 3" : undefined}
                  filter={recentEdge && on ? "url(#glow)" : undefined}
                  opacity={on ? (recentEdge ? 0.9 : 1) : 0.15}
                  className="cursor-pointer transition-opacity duration-200"
                  onClick={() => openEvidence(l.edge?.ev)} />
              );
            })}
            {nodes.map((n) => {
              const on = lit(n.id);
              const distressed = (n.distress ?? 0) >= DISTRESS;
              return (
                <g key={n.id} transform={`translate(${n.x},${n.y})`} opacity={on ? 1 : 0.2}
                  className="cursor-pointer transition-opacity duration-200"
                  onMouseEnter={(e) => {
                    const r = (e.currentTarget.ownerSVGElement!.parentElement as HTMLElement).getBoundingClientRect();
                    setHover({ id: n.id, x: e.clientX - r.left, y: e.clientY - r.top });
                  }}
                  onClick={() => openEvidence(data.edges.filter((x) => x.from === n.id || x.to === n.id).flatMap((x) => x.ev))}
                >
                  {n.acquisitive && <circle r={n.r + 7} fill="none" stroke="#3b82f6" strokeDasharray="2 3" opacity={0.7} />}
                  {n.type === "company" ? (
                    <circle r={n.r} fill="var(--bg)" stroke="var(--fg)" strokeWidth={1.5} />
                  ) : n.open_slot ? (
                    <circle r={n.r} fill="none" stroke="var(--muted)" strokeDasharray="2 2" strokeWidth={emph === "slots" ? 1.6 : 1} />
                  ) : (
                    <circle r={n.r} fill={n.kingmaker ? "#3b82f6" : "var(--muted)"} stroke="var(--bg)" strokeWidth={2} filter={n.kingmaker && emph === "kings" ? "url(#glow)" : undefined} />
                  )}
                  {distressed && (
                    <circle r={4} cx={n.r * 0.72} cy={-n.r * 0.72} fill="var(--red)" stroke="var(--bg)" strokeWidth={2}>
                      <animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {(n.type === "company" || n.kingmaker || n.open_slot) && (
                    <text y={n.r + 14} textAnchor="middle"
                      className={cx("text-[11px]", n.type === "company" ? "fill-[var(--fg)] font-medium" : "fill-[var(--muted)]")}>
                      {n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {hover && hn && hover.x > -999 && (
          <Tooltip x={hover.x} y={hover.y}>
            <div className="font-medium">{hn.label}</div>
            {hn.type === "company" && <div className="text-muted">{usd(hn.size)} raised</div>}
            {hEdges.slice(0, 5).map((e, k) => (
              <div key={k} className="mt-1 flex justify-between gap-4 text-muted">
                <span className="truncate">{label(hn.type === "company" ? e.from : e.to)}</span>
                <span className="font-mono tnum">{e.round ?? ""} {e.amount_usd ? `$${compact(e.amount_usd)}` : ""}</span>
              </div>
            ))}
            {hn.open_slot && <div className="text-muted">No bet in this market</div>}
          </Tooltip>
        )}
      </div>
    </SceneFrame>
  );
}

function List({ title, items, emph, onHover }: { title: string; emph?: boolean; items: { id: string; label: string; right: React.ReactNode }[]; onHover: (id: string | null) => void }) {
  return (
    <div>
      <div className={cx("eyebrow mb-3", emph && "!text-accent")}>{title}</div>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id} onMouseEnter={() => onHover(i.id)} onMouseLeave={() => onHover(null)}
            className="flex items-center justify-between gap-3 text-[13px]">
            <span className="truncate">{i.label}</span>
            <span className="text-[12px]">{i.right}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
