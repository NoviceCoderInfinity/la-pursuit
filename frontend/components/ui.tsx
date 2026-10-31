"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { PERSONA_SCENES, useRunMaybe } from "@/lib/run-context";
import type { Lens, SceneKey } from "@/lib/types";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cx("flex items-center gap-2 text-[15px] font-semibold tracking-tight", className)}>
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <circle cx="9" cy="9" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="9" cy="9" r="2.5" fill="var(--accent)" />
      </svg>
      Vantage
    </Link>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => setDark(document.documentElement.dataset.theme === "dark"), []);
  const flip = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
    setDark(!dark);
    window.dispatchEvent(new Event("themechange"));
  };
  return (
    <button onClick={flip} aria-label="Toggle theme" className="grid size-8 place-items-center rounded-full text-muted hover:bg-bg-2 hover:text-fg">
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
      </svg>
    </button>
  );
}

/** Re-render on theme flips so canvas/WebGL scenes can re-read CSS tokens. */
export function useTheme() {
  const [t, setT] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const read = () => setT(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    read();
    window.addEventListener("themechange", read);
    return () => window.removeEventListener("themechange", read);
  }, []);
  return t;
}

export function cssVar(name: string) {
  if (typeof window === "undefined") return "#888";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export const LENSES: { key: Lens; label: string }[] = [
  { key: "operator", label: "Operator" },
  { key: "investor", label: "Investor" },
  { key: "founder", label: "Founder" },
];

export function Segmented<T extends string>({
  options, value, onChange, size = "md", layoutId,
}: {
  options: { key: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  layoutId: string;
}) {
  return (
    <div className={cx("relative inline-flex rounded-full bg-bg-2 p-1", size === "sm" ? "text-[12px]" : "text-[13px]")}>
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cx(
            "relative rounded-full font-medium transition-colors",
            size === "sm" ? "px-3 py-1" : "px-4 py-1.5",
            value === o.key ? "text-fg" : "text-muted hover:text-fg",
          )}
        >
          {value === o.key && (
            <motion.span layoutId={layoutId} className="absolute inset-0 rounded-full bg-bg shadow-[0_1px_2px_rgba(0,0,0,0.12),0_0_0_1px_var(--line)]" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Full-bleed scene frame: index + one-sentence title top-left, legend top-right, controls bottom. */
export function SceneFrame({
  id, n, name, title, action, legend, controls, aside, children, className,
}: {
  id: string; n: string; name: string; title: React.ReactNode; action?: React.ReactNode;
  legend?: React.ReactNode; controls?: React.ReactNode; aside?: React.ReactNode;
  children: React.ReactNode; className?: string;
}) {
  // Number scenes by their position in the active persona's story, not a fixed global order.
  const run = useRunMaybe();
  const order = run ? PERSONA_SCENES[run.lens].indexOf(id as SceneKey) : -1;
  if (order >= 0) n = String(order + 1).padStart(2, "0");
  return (
    <motion.section
      id={id}
      data-scene={id}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cx("relative flex min-h-[calc(100vh-112px)] scroll-mt-[112px] flex-col border-b border-line px-6 py-10 md:px-10", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-[640px]">
          <div className="flex items-center gap-3">
            <span className="font-dot text-[22px] font-black leading-none text-accent">{n}</span>
            <span className="eyebrow">{name}</span>
          </div>
          <h2 className="display mt-4">{title}</h2>
          {action && (
            <div className="mt-4 inline-flex max-w-full items-start gap-2 rounded-2xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3.5 py-2 text-[14px] leading-[20px] text-fg">
              <span className="mt-px shrink-0 font-semibold text-accent">→</span><span>{action}</span>
            </div>
          )}
        </div>
        {legend && <div className="pt-1">{legend}</div>}
      </div>
      <div className="relative mt-8 flex min-h-0 flex-1 flex-col gap-8 lg:flex-row">
        <div className="relative min-h-[420px] min-w-0 flex-1">{children}</div>
        {aside && <div className="w-full shrink-0 lg:w-[300px]">{aside}</div>}
      </div>
      {controls && <div className="mt-6">{controls}</div>}
    </motion.section>
  );
}

export function LegendItem({ color, label, kind = "dot", dashed }: { color: string; label: string; kind?: "dot" | "line" | "ring"; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-fg-2">
      {kind === "dot" && <span className="size-2 rounded-full" style={{ background: color }} />}
      {kind === "ring" && <span className={cx("size-2.5 rounded-full border-[1.5px]", dashed && "border-dashed")} style={{ borderColor: color }} />}
      {kind === "line" && <span className="h-[2px] w-4 rounded-full" style={{ background: color }} />}
      {label}
    </span>
  );
}

export function Scrubber({
  dates, index, onIndex, format,
}: { dates: string[]; index: number; onIndex: (i: number) => void; format: (d: string) => string }) {
  const [playing, setPlaying] = useState(false);
  const idx = useRef(index);
  idx.current = index;
  useEffect(() => {
    if (!playing) return;
    // ~6 steps/s so a 24-month timeline plays in 4s; motion between steps is tweened by the scene.
    const t = setInterval(() => {
      if (idx.current >= dates.length - 1) {
        setPlaying(false);
        return;
      }
      onIndex(idx.current + 1);
    }, 160);
    return () => clearInterval(t);
  }, [playing, dates.length, onIndex]);

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => {
          if (!playing && index >= dates.length - 1) onIndex(0);
          setPlaying((p) => !p);
        }}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-fg text-bg transition-transform active:scale-95"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="0" width="3" height="10" fill="currentColor" /><rect x="6" y="0" width="3" height="10" fill="currentColor" /></svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 0l9 5-9 5z" fill="currentColor" /></svg>
        )}
      </button>
      <span className="w-14 shrink-0 font-mono text-[12px] text-fg tnum">{format(dates[0])}</span>
      <input
        type="range" className="scrub flex-1" min={0} max={dates.length - 1} value={index}
        onChange={(e) => { setPlaying(false); onIndex(+e.target.value); }}
      />
      <span className="w-14 shrink-0 text-right font-mono text-[12px] text-muted tnum">{format(dates[dates.length - 1])}</span>
      <span className="w-[72px] shrink-0 rounded-full bg-bg-2 py-1 text-center font-mono text-[12px] font-medium tnum">{format(dates[index])}</span>
    </div>
  );
}

export function Tooltip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-[140px] rounded-xl border border-line bg-[var(--glass)] px-3 py-2 text-[12px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl"
      style={{ left: x + 14, top: y + 14 }}
    >
      {children}
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return (
    <div className="dots grid h-full min-h-[420px] place-items-center rounded-xl border border-dashed border-line-2">
      <span className="eyebrow">{label}</span>
    </div>
  );
}
