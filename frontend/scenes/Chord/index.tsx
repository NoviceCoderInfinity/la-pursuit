"use client";

import * as d3 from "d3";
import { ActionText } from "@/components/ActionText";
import { chordAction } from "@/lib/actions";
import { useMemo, useState } from "react";
import { Num } from "@/components/Num";
import { LegendItem, SceneFrame, Tooltip, useSize } from "@/components/ui";
import { cx } from "@/lib/format";
import { useRun } from "@/lib/run-context";
import type { ChordScene } from "@/lib/types";

type Hover = { kind: "group"; i: number } | { kind: "ribbon"; s: number; t: number; x: number; y: number } | null;

export function ChordSceneView({ data }: { data: ChordScene }) {
  const { peer, openEvidence, lens } = useRun();
  const nameOf = (id: number) => peer(id)?.name ?? `#${id}`;
  const [box, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<Hover>(null);
  const size = Math.max(320, Math.min(width, 600));
  const R = size / 2 - 72;

  const names = data.peers.map((p) => peer(p.peer_id)?.name ?? `#${p.peer_id}`);
  const idxOf = useMemo(() => new Map(data.peers.map((p, i) => [p.peer_id, i])), [data.peers]);
  const moveAt = (s: number, t: number) => data.moves.find((m) => m.from === data.peers[s].peer_id && m.to === data.peers[t].peer_id);
  const totalMoves = data.moves.reduce((a, m) => a + m.count, 0);

  // Peers with no moves would pile up as zero-width slivers with colliding labels; leave them off the ring.
  const ring = useMemo(() => data.peers.map((_, i) => i).filter((i) => data.matrix[i].some((v) => v > 0) || data.matrix.some((row) => row[i] > 0)), [data]);
  const chords = useMemo(
    () => d3.chordDirected().padAngle(0.035).sortSubgroups(d3.descending)(ring.map((i) => ring.map((j) => data.matrix[i][j]))),
    [data.matrix, ring],
  );
  const at = (k: number) => ring[k]; // chord index → peer index
  // Sentiment (1–5 rating) on a single-hue blue ramp; missing → neutral.
  const sentColor = (v: number | null) => (v == null ? "var(--bg-3)" : d3.interpolateRgb("#9ec5f4", "#1c5cab")(Math.max(0, Math.min(1, (v - 3) / 1.6))));
  const maxNet = Math.max(1, ...data.peers.map((p) => Math.abs(p.net_flow)));
  const thick = (net: number) => 10 + (net / maxNet) * 7;

  const ribbon = d3.ribbonArrow<d3.Chord, d3.ChordSubgroup>().radius(R - 2).padAngle(0.004);
  const arc = d3.arc<d3.ChordGroup & { innerRadius: number; outerRadius: number }>();

  const active = (c: d3.Chord) => {
    if (!hover) return true;
    if (hover.kind === "group") return at(c.source.index) === hover.i || at(c.target.index) === hover.i;
    return at(c.source.index) === hover.s && at(c.target.index) === hover.t;
  };
  const ribbonColor = (c: d3.Chord) => {
    if (hover?.kind === "group") return at(c.target.index) === hover.i ? "#3b82f6" : "var(--s2)";
    if (hover?.kind === "ribbon") return "#3b82f6";
    return "var(--fg)";
  };

  const ranked = [...data.peers].map((p, i) => ({ ...p, i })).sort((a, b) => b.net_flow - a.net_flow);
  const winner = ranked[0];
  const title = lens === "operator" ? `Talent is flowing to ${names[winner?.i ?? 0]}.` : lens === "investor" ? "Who keeps their people." : "Where the builders are moving.";

  const hovered = hover?.kind === "ribbon" ? moveAt(hover.s, hover.t) : undefined;

  return (
    <SceneFrame
      id="chord" n="04" name="Talent" title={title} action={((a) => (a ? <ActionText a={a} /> : undefined))(chordAction(data, lens, nameOf))}
      legend={
        <div className="flex flex-wrap items-center gap-4">
          <LegendItem color="#3b82f6" kind="line" label="In" />
          <LegendItem color="var(--s2)" kind="line" label="Out" />
          <span className="inline-flex items-center gap-2 text-[12px] text-fg-2">
            <span className="h-2 w-10 rounded-full" style={{ background: "linear-gradient(90deg,#9ec5f4,#1c5cab)" }} />
            Sentiment
          </span>
        </div>
      }
      aside={
        <div className="flex flex-col gap-7">
          <div className="rounded-xl border border-line px-4 py-3">
            <div className="eyebrow !text-[10px]">Moves · 6 months</div>
            <Num value={totalMoves} ev={data.moves.flatMap((m) => m.ev)} className="mt-1 font-dot text-[30px] font-black leading-[34px] !no-underline" />
          </div>
          <div>
            <div className="eyebrow mb-3">Net flow</div>
            <ul className="space-y-1.5">
              {ranked.map((p) => (
                <li key={p.peer_id}
                  onMouseEnter={() => setHover({ kind: "group", i: p.i })} onMouseLeave={() => setHover(null)}
                  className={cx("grid cursor-default grid-cols-[1fr_88px_32px] items-center gap-2 text-[12px]", hover?.kind === "group" && hover.i !== p.i && "opacity-40")}>
                  <span className="truncate">{names[p.i]}</span>
                  <span className="relative h-[6px]">
                    <span className="absolute left-1/2 top-[-3px] h-3 w-px bg-line-2" />
                    <span className="absolute top-0 h-full rounded-full"
                      style={{
                        background: p.net_flow >= 0 ? "#3b82f6" : "var(--s2)",
                        left: p.net_flow >= 0 ? "50%" : `${50 - (Math.abs(p.net_flow) / maxNet) * 50}%`,
                        width: `${(Math.abs(p.net_flow) / maxNet) * 50}%`,
                      }} />
                  </span>
                  <Num value={p.net_flow > 0 ? `+${p.net_flow}` : p.net_flow} ev={data.moves.filter((m) => m.to === p.peer_id || m.from === p.peer_id).flatMap((m) => m.ev)} className="justify-end font-mono" />
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="eyebrow mb-3">Senior joins</div>
            <ul className="space-y-3">
              {data.senior_joins.slice(0, 5).map((j, k) => (
                <li key={k} className="cursor-pointer text-[12px] leading-[17px]" onClick={() => openEvidence(j.ev)}>
                  <div className="font-medium">{j.title} · {peer(j.peer_id)?.name}</div>
                  {j.from_company && j.from_company !== "—" && <div className="text-muted">from {j.from_company}</div>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      }
    >
      <div ref={box} className="relative grid h-full place-items-center">
        {width > 0 && (
          <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} className="overflow-visible">
            <g>
              {chords.map((c, k) => (
                <path
                  key={k}
                  d={ribbon(c) as unknown as string}
                  fill={ribbonColor(c)}
                  fillOpacity={active(c) ? (hover ? 0.7 : 0.07) : 0.02}
                  className="cursor-pointer transition-[fill-opacity] duration-200"
                  onMouseMove={(e) => {
                    const r = (e.currentTarget.ownerSVGElement!.parentElement as HTMLElement).getBoundingClientRect();
                    setHover({ kind: "ribbon", s: at(c.source.index), t: at(c.target.index), x: e.clientX - r.left, y: e.clientY - r.top });
                  }}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => openEvidence(moveAt(at(c.source.index), at(c.target.index))?.ev)}
                />
              ))}
            </g>
            <g>
              {chords.groups.map((g) => {
                const p = data.peers[at(g.index)];
                const mid = (g.startAngle + g.endAngle) / 2;
                const flip = mid > Math.PI;
                const outer = R + thick(p.net_flow);
                const dim = hover?.kind === "group" && hover.i !== at(g.index);
                return (
                  <g key={g.index}
                    onMouseEnter={() => setHover({ kind: "group", i: at(g.index) })} onMouseLeave={() => setHover(null)}
                    onClick={() => openEvidence(data.moves.filter((m) => idxOf.get(m.to) === at(g.index) || idxOf.get(m.from) === at(g.index)).flatMap((m) => m.ev))}
                    className="cursor-pointer" opacity={dim ? 0.35 : 1}>
                    <path d={arc({ ...g, innerRadius: R, outerRadius: outer }) ?? ""} fill={sentColor(p.sentiment)} stroke="var(--bg)" strokeWidth={2} />
                    <text
                      transform={`rotate(${(mid * 180) / Math.PI - 90}) translate(${R + 26},0) ${flip ? "rotate(180)" : ""}`}
                      textAnchor={flip ? "end" : "start"} dy="0.35em"
                      className="fill-[var(--fg)] text-[12px] font-medium"
                    >
                      {names[at(g.index)]}
                      <tspan className="fill-[var(--muted)] font-mono text-[11px]" dx={6}>{p.net_flow > 0 ? `+${p.net_flow}` : p.net_flow}</tspan>
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
        {hover?.kind === "ribbon" && hovered && (
          <Tooltip x={hover.x} y={hover.y}>
            <div className="font-medium">{names[hover.s]} → {names[hover.t]}</div>
            <div className="mt-0.5 font-dot text-[20px] font-black">{hovered.count}</div>
            {hovered.titles.length > 0 && <div className="mt-1 text-muted">{hovered.titles.join(" · ")}</div>}
          </Tooltip>
        )}
      </div>
    </SceneFrame>
  );
}
