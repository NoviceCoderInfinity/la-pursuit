"use client";

import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { STAGES } from "@/lib/mock";
import { useRun } from "@/lib/run-context";
import type { TraceEvent } from "@/lib/types";
import { cx } from "@/lib/format";

const GLYPH: Record<string, string> = {
  accept: "+", reject: "−", widen: "↔", narrow: "→←", retry: "↻", degrade: "↓", disambiguate: "?",
  dispute: "≠", fallback: "⇢",
};

export function StageBar() {
  const { trace, status } = useRun();
  const started = new Set(trace.filter((e) => e.type === "stage_start").map((e) => e.stage));
  const finished = new Set(trace.filter((e) => e.type === "stage_done").map((e) => e.stage));
  if (status === "done") STAGES.forEach((s) => finished.add(s));
  return (
    <div className="flex gap-1">
      {STAGES.map((s) => {
        const state = finished.has(s) ? "done" : started.has(s) ? "live" : "idle";
        return (
          <div key={s} className="flex-1">
            <div className="h-[3px] overflow-hidden rounded-full bg-bg-3">
              <motion.div
                className="h-full rounded-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: state === "done" ? "100%" : state === "live" ? "55%" : 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
            <div className={cx("eyebrow mt-2 !text-[10px]", state === "idle" ? "opacity-40" : state === "live" && "!text-fg")}>{s}</div>
          </div>
        );
      })}
    </div>
  );
}

export function Trace({ compact }: { compact?: boolean }) {
  const { trace, credits } = useRun();
  const list = useRef<HTMLDivElement>(null);
  // Scroll only the trace pane, never the page.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [trace.length]);

  const calls = trace.filter((e) => e.type === "tool_call").length;
  const accepted = trace.filter((e) => e.decision?.kind === "accept" && e.stage === "discover").length;
  const rejected = trace.filter((e) => e.decision?.kind === "reject").length;

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-4 gap-px border-b border-line bg-line">
        {[
          ["Calls", calls],
          ["Peers", accepted],
          ["Rejected", rejected],
          ["Credits", Math.round(credits * 10) / 10],
        ].map(([k, v]) => (
          <div key={k} className="bg-bg px-4 py-3">
            <div className="eyebrow !text-[10px]">{k}</div>
            <div className="mt-0.5 font-dot text-[22px] font-black leading-[26px] tnum">{v}</div>
          </div>
        ))}
      </div>
      <div ref={list} className={cx("flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[20px]", compact && "max-h-[50vh]")}>
        {trace.map((e, i) => <Row key={i} e={e} />)}
      </div>
    </div>
  );
}

function Row({ e }: { e: TraceEvent }) {
  if (e.type === "stage_done") return null;
  if (e.type === "stage_start")
    return <div className="mt-3 mb-1 eyebrow !text-fg first:mt-0">{e.stage}</div>;

  const d = e.decision;
  const isErr = e.type === "error";
  const isNote = e.type === "note";
  const glyph = d ? GLYPH[d.kind] ?? "·" : e.type === "tool_call" ? "›" : e.type === "tool_result" ? "‹" : e.type === "scene_ready" ? "■" : e.type === "done" ? "✓" : "·";
  const text = d ? d.subject : e.type === "scene_ready" ? `${e.scene} ready` : e.label;
  const meta = d ? d.reason : e.detail ? [e.detail.count != null && `${e.detail.count}`, e.detail.ms != null && `${e.detail.ms}ms`].filter(Boolean).join(" · ") : "";

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}
      className={cx("grid grid-cols-[14px_1fr] gap-2", (d?.kind === "reject" || isNote) && "text-muted")}
    >
      <span className={cx("text-center", isErr ? "text-red" : d?.kind === "accept" || e.type === "scene_ready" ? "text-accent" : "text-muted")}>{glyph}</span>
      <span className="min-w-0 truncate">
        <span className={cx(d?.kind === "reject" && "line-through decoration-[var(--muted)]", isErr && "text-red")}>{text}</span>
        {meta && <span className="ml-2 text-muted">{meta}</span>}
      </span>
    </motion.div>
  );
}
