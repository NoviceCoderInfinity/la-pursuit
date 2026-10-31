"use client";

import dynamic from "next/dynamic";
import { ActionText } from "@/components/ActionText";
import { globeAction } from "@/lib/actions";
import { useCallback, useMemo, useState } from "react";
import { Num } from "@/components/Num";
import { LegendItem, SceneFrame, Scrubber, cssVar, useSize, useTheme } from "@/components/ui";
import { compact, cx, monthLabel } from "@/lib/format";
import { useRun } from "@/lib/run-context";
import type { EvId, GlobeScene } from "@/lib/types";

const GlobeCanvas = dynamic(() => import("@/components/GlobeCanvas"), { ssr: false });

type Layer = "people" | "hiring" | "talent" | "expansion";
const LAYERS: { key: Layer; label: string }[] = [
  { key: "people", label: "People" },
  { key: "hiring", label: "Hiring" },
  { key: "talent", label: "Talent" },
  { key: "expansion", label: "Expansion" },
];

type Region = { label: string; lat: number; lng: number; count: number; peers: { peer_id: number; count: number }[]; labels: string[] };
type Arc = GlobeScene["arcs"][number] & { from: { lat: number; lng: number } };

export function GlobeSceneView({ data }: { data: GlobeScene }) {
  const { peer, openEvidence, lens } = useRun();
  const nameOf = (id: number) => peer(id)?.name ?? `#${id}`;
  const theme = useTheme();
  const [box, size] = useSize<HTMLDivElement>();
  const [on, setOn] = useState<Record<Layer, boolean>>({ people: true, hiring: true, talent: false, expansion: true });
  const [idx, setIdx] = useState(Math.max(0, data.timeline.length - 1));
  const onIndex = useCallback((i: number) => setIdx(i), []);

  const accent = "#3b82f6";
  const talentColor = useMemo(() => cssVar("--s2") || "#eb6834", [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const frame = data.timeline[idx];
  const regions = useMemo<Region[]>(() => {
    const m = new Map<string, Region>();
    // Crustdata names one place several ways ("San Francisco Bay Area", "San Francisco, CA"), so
    // bucket by ~100 km, name each bucket after its biggest contributor, then merge equal names.
    const top = new Map<string, number>();
    for (const r of frame?.regions ?? []) {
      const k = `${Math.round(r.lat)},${Math.round(r.lng)}`;
      const g = m.get(k) ?? { label: cleanLabel(r.label), lat: r.lat, lng: r.lng, count: 0, peers: [], labels: [] };
      g.count += r.count;
      g.peers.push({ peer_id: r.peer_id, count: r.count });
      if (!g.labels.includes(r.label)) g.labels.push(r.label);
      if (r.count > (top.get(k) ?? 0)) {
        top.set(k, r.count);
        g.label = cleanLabel(r.label);
      }
      m.set(k, g);
    }
    const byName = new Map<string, Region>();
    for (const g of [...m.values()].sort((a, b) => b.count - a.count)) {
      const into = byName.get(g.label);
      if (!into) {
        byName.set(g.label, g);
        continue;
      }
      into.count += g.count;
      into.peers.push(...g.peers);
      into.labels.push(...g.labels.filter((l) => !into.labels.includes(l)));
    }
    return [...byName.values()].sort((a, b) => b.count - a.count);
  }, [frame]);
  const present = useMemo(() => new Set(regions.flatMap((r) => r.peers.map((p) => `${p.peer_id}|${r.label}`))), [regions]);
  const maxCount = Math.max(1, ...regions.map((r) => r.count));

  const node = useCallback((id: number) => data.nodes.find((n) => n.peer_id === id), [data.nodes]);

  const arcs = useMemo<Arc[]>(() => data.arcs
    .filter((a) => on[a.kind === "footprint" ? "people" : a.kind])
    .filter((a) => a.kind === "talent" || present.has(`${a.peer_id}|${a.to.label}`))
    .map((a) => {
      const n = node(a.peer_id);
      return { ...a, from: { lat: n?.lat ?? 0, lng: n?.lng ?? 0 } };
    }), [data.arcs, on, present, node]);

  // HQ clusters → one crisp HTML label per city.
  const clusters = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number; ids: number[]; ev: EvId[]; city: string }>();
    for (const n of data.nodes) {
      const p = peer(n.peer_id);
      const k = `${n.lat.toFixed(1)},${n.lng.toFixed(1)}`;
      const g = m.get(k) ?? { lat: n.lat, lng: n.lng, ids: [], ev: [], city: p?.hq.city ?? "" };
      g.ids.push(n.peer_id);
      g.ev.push(...n.ev);
      m.set(k, g);
    }
    return [...m.values()];
  }, [data.nodes, peer]);

  const pov = useMemo(() => {
    const total = data.nodes.reduce((a, n) => a + n.size, 0) || 1;
    const lat = data.nodes.reduce((a, n) => a + n.lat * n.size, 0) / total;
    const lng = data.nodes.reduce((a, n) => a + n.lng * n.size, 0) / total;
    return { lat: Math.max(-10, Math.min(45, lat)), lng, altitude: 1.75 };
  }, [data.nodes]);

  const totalPeople = regions.reduce((a, r) => a + r.count, 0);
  // A region's evidence: arcs that reach it, plus HQ nodes sitting in it (HQ regions have no arc).
  const regionEv = (r: Region) => [
    ...data.arcs.filter((a) => r.labels.includes(a.to.label)).flatMap((a) => a.ev),
    ...data.nodes.filter((n) => r.labels.some((l) => cleanLabel(l) === (peer(n.peer_id)?.hq.city ?? ""))).flatMap((n) => n.ev),
  ];
  const hiringTotal = data.pulses.reduce((a, p) => a + p.jobs_90d, 0);

  const title = lens === "founder" ? "Where the market is — and isn't." : lens === "investor" ? "Where these companies really operate." : "Where your rivals are building.";

  return (
    <SceneFrame
      id="globe" n="01" name="Atlas" title={title} action={<ActionText a={globeAction(data, lens, nameOf)} />}
      legend={
        <div className="flex flex-wrap items-center gap-4">
          <LegendItem color={accent} label="People" />
          <LegendItem color={accent} kind="ring" label="Hiring, 90d" />
          <LegendItem color={talentColor} kind="line" label="Talent moves" />
        </div>
      }
      controls={<Scrubber dates={data.timeline.map((t) => t.date)} index={idx} onIndex={onIndex} format={monthLabel} />}
      aside={
        <div className="flex h-full flex-col gap-6">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
            <Stat label="People mapped" value={compact(totalPeople)} ev={data.arcs.slice(0, 6).flatMap((a) => a.ev)} />
            <Stat label="Jobs, 90d" value={compact(hiringTotal)} ev={data.pulses.flatMap((p) => p.ev)} />
          </div>
          <div>
            <div className="eyebrow mb-3">Top regions · {monthLabel(frame?.date ?? "")}</div>
            <ol className="space-y-2.5">
              {regions.slice(0, 7).map((r) => (
                <li key={r.label}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="truncate">{r.label}</span>
                    <Num value={compact(r.count)} ev={regionEv(r)} className="font-mono text-[12px]" />
                  </div>
                  <div className="mt-1.5 h-[3px] rounded-full bg-bg-3">
                    <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(r.count / maxCount) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {data.unplaced.length > 0 && (
            <div>
              <div className="eyebrow mb-2">Unplaced</div>
              <ul className="space-y-1 text-[12px] text-muted">
                {data.unplaced.slice(0, 4).map((u) => (
                  <li key={`${u.peer_id}${u.label}`} className="flex justify-between gap-2">
                    <span className="truncate">{u.label} · {peer(u.peer_id)?.name}</span>
                    <span className="font-mono tnum">{u.count}</span>
                  </li>
                ))}
                {data.unplaced.length > 4 && <li>+{data.unplaced.length - 4} more</li>}
              </ul>
            </div>
          )}
        </div>
      }
    >
      <div className="absolute left-0 top-0 z-10 flex flex-wrap gap-1.5">
        {LAYERS.map((l) => (
          <button
            key={l.key}
            onClick={() => setOn((s) => ({ ...s, [l.key]: !s[l.key] }))}
            className={cx(
              "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
              on[l.key] ? "border-fg bg-fg text-bg" : "border-line-2 text-muted hover:text-fg",
            )}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="h-[600px]" />
      <div ref={box} className="absolute inset-0 overflow-hidden">
        {size.width > 0 && (
          <GlobeCanvas
            width={size.width}
            height={size.height}
            pov={pov}
            pointsData={on.people ? regions : []}
            pointLat="lat"
            pointLng="lng"
            pointAltitude={(d) => 0.005 + ((d as Region).count / maxCount) * 0.12}
            pointRadius={(d) => 0.25 + Math.sqrt((d as Region).count / maxCount) * 1.1}
            pointColor={() => "rgba(59,130,246,0.85)"}
            pointsTransitionDuration={250}
            pointLabel={(d) => {
              const r = d as Region;
              return `<b>${r.label}</b> · ${r.count}<br/>${r.peers.map((p) => `${peer(p.peer_id)?.name ?? p.peer_id} ${p.count}`).join("<br/>")}`;
            }}
            onPointClick={(d) => openEvidence(regionEv(d as Region))}
            arcsData={arcs}
            arcStartLat={(a) => (a as Arc).from.lat}
            arcStartLng={(a) => (a as Arc).from.lng}
            arcEndLat={(a) => (a as Arc).to.lat}
            arcEndLng={(a) => (a as Arc).to.lng}
            arcColor={(a: object) => {
              const k = (a as Arc).kind;
              if (k === "talent") return [hexA(talentColor, 0.15), talentColor];
              if (k === "expansion") return ["rgba(59,130,246,0.2)", "#60a5fa"];
              return ["rgba(59,130,246,0.08)", "rgba(59,130,246,0.7)"];
            }}
            arcStroke={(a) => ((a as Arc).kind === "talent" ? 0.35 + (a as Arc).people * 0.08 : 0.25 + Math.min(0.6, (a as Arc).people / 300))}
            arcDashLength={(a) => ((a as Arc).kind === "footprint" ? 1 : 0.4)}
            arcDashGap={(a) => ((a as Arc).kind === "footprint" ? 0 : 0.2)}
            arcDashAnimateTime={(a) => ((a as Arc).kind === "footprint" ? 0 : 2200)}
            arcAltitudeAutoScale={0.4}
            arcLabel={(a) => {
              const x = a as Arc;
              const from = peer(x.peer_id)?.name ?? "";
              return x.kind === "talent" ? `<b>${from} → ${x.to.label}</b><br/>${x.people} people` : `<b>${from}</b> · ${x.to.label}<br/>${x.people} people${x.kind === "expansion" ? ` · new${x.since ? ` since ${monthLabel(x.since)}` : ""}` : ""}`;
            }}
            onArcClick={(a) => openEvidence((a as Arc).ev)}
            ringsData={on.hiring ? data.pulses : []}
            ringLat="lat"
            ringLng="lng"
            ringColor={() => (t: number) => `rgba(59,130,246,${1 - t})`}
            ringMaxRadius={(d) => 1.5 + Math.sqrt((d as GlobeScene["pulses"][number]).jobs_90d) * 0.6}
            ringPropagationSpeed={1.6}
            ringRepeatPeriod={1400}
            htmlElementsData={clusters}
            htmlLat="lat"
            htmlLng="lng"
            htmlAltitude={0.14} // above the tallest people column so tags are never occluded
            htmlElement={(d) => {
              const c = d as (typeof clusters)[number];
              const el = document.createElement("button");
              const names = c.ids.map((id) => peer(id)?.name).filter(Boolean);
              el.className = "globe-tag";
              el.innerHTML = `<span class="globe-dot"></span>${c.ids.length > 1 ? `${c.city} · ${c.ids.length}` : names[0] ?? c.city}`;
              el.title = names.join(", ");
              el.style.pointerEvents = "auto";
              el.onclick = () => openEvidence(c.ev);
              return el;
            }}
          />
        )}
      </div>
    </SceneFrame>
  );
}

function Stat({ label, value, ev }: { label: string; value: string; ev: EvId[] }) {
  return (
    <div className="bg-bg px-4 py-3">
      <div className="eyebrow !text-[10px]">{label}</div>
      <Num value={value} ev={ev} className="mt-1 font-dot text-[26px] font-black leading-[30px] !no-underline" />
    </div>
  );
}

function cleanLabel(l: string) {
  return l
    .replace(/^Greater\s+/i, "")
    .replace(/\s+(Metropolitan\s+)?(Area|Region)\b.*$/i, "")
    .replace(/,\s*[A-Z]{2}$/, "")
    .trim();
}

function hexA(hex: string, a: number) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
