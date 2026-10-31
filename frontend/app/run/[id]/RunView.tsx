"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { EvidenceDrawer } from "@/components/EvidenceDrawer";
import { StageBar, Trace } from "@/components/Trace";
import { Empty, LENSES, Logo, SceneFrame, Segmented, ThemeToggle } from "@/components/ui";
import { cx } from "@/lib/format";
import { RunProvider, SCENES, useRun } from "@/lib/run-context";
import type { Lens, SceneKey, Scenes } from "@/lib/types";
import { ChordSceneView } from "@/scenes/Chord";
import { ConstellationSceneView } from "@/scenes/Constellation";
import { GlobeSceneView } from "@/scenes/Globe";
import { StreamsSceneView } from "@/scenes/Streams";

// Scenes not yet built (F2 Field, F6 Truth, F7 Deck) fall back to a placeholder frame.
const VIEWS: Partial<{ [K in SceneKey]: React.ComponentType<{ data: Scenes[K] }> }> = {
  globe: GlobeSceneView,
  streams: StreamsSceneView,
  chord: ChordSceneView,
  constellation: ConstellationSceneView,
};

export default function RunView({ runId, query, lens }: { runId: string; query: string; lens?: Lens }) {
  return (
    <RunProvider runId={runId} query={query} initialLens={lens}>
      <Shell />
      <EvidenceDrawer />
    </RunProvider>
  );
}

function Shell() {
  const run = useRun();
  const [showTrace, setShowTrace] = useState(true);
  const active = useActiveScene();

  // Free the stage once the run is done.
  useEffect(() => {
    if (run.status !== "done") return;
    const t = setTimeout(() => setShowTrace(false), 1600);
    return () => clearTimeout(t);
  }, [run.status]);

  const ready = SCENES.filter((s) => run.scenes[s.key]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-[var(--glass)] backdrop-blur-xl">
        <div className="flex h-14 items-center gap-4 px-6">
          <Logo />
          <div className="mx-auto hidden min-w-0 max-w-[520px] flex-1 items-center justify-center gap-2 md:flex">
            <span className="truncate text-[13px] text-fg-2">{run.query}</span>
            {run.mock && <span className="eyebrow shrink-0 rounded-full border border-line-2 px-2 py-0.5 !text-[10px]">Sample data</span>}
          </div>
          <Segmented size="sm" layoutId="run-lens" options={LENSES} value={run.lens} onChange={run.setLens} />
          <ThemeToggle />
        </div>
        <nav className="scrollbar-none flex h-14 items-center gap-1 overflow-x-auto border-t border-line px-4">
          <button
            onClick={() => setShowTrace((s) => !s)}
            className={cx("mr-2 flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium", showTrace ? "bg-fg text-bg" : "text-muted hover:bg-bg-2 hover:text-fg")}
          >
            <span className={cx("size-1.5 rounded-full", run.status === "running" ? "blink bg-accent" : run.status === "error" ? "bg-red" : "bg-current")} />
            Trace
          </button>
          <span className="mr-2 h-5 w-px shrink-0 bg-line-2" />
          {SCENES.map((s) => {
            const has = !!run.scenes[s.key];
            return (
              <a
                key={s.key}
                href={has ? `#${s.key}` : undefined}
                className={cx(
                  "flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                  !has && "pointer-events-none text-muted opacity-50",
                  has && active === s.key ? "bg-bg-2 text-fg" : has && "text-fg-2 hover:text-fg",
                )}
              >
                <span className={cx("font-mono text-[11px]", active === s.key && has ? "text-accent" : "text-muted")}>{s.n}</span>
                {s.name}
              </a>
            );
          })}
        </nav>
      </header>

      <div className="flex">
        <AnimatePresence initial={false}>
          {showTrace && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }} animate={{ width: 340, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="sticky top-[113px] h-[calc(100vh-113px)] shrink-0 overflow-hidden border-r border-line"
            >
              <div className="h-full w-[340px]"><Trace /></div>
            </motion.aside>
          )}
        </AnimatePresence>

        <main className="min-w-0 flex-1">
          {run.status === "running" && (
            <div className="border-b border-line px-6 py-8 md:px-10">
              <StageBar />
            </div>
          )}

          {ready.length === 0 && <Waiting />}

          {SCENES.map((s) => {
            const data = run.scenes[s.key];
            if (!data) return null;
            const View = VIEWS[s.key] as React.ComponentType<{ data: unknown }> | undefined;
            return View ? <View key={s.key} data={data} /> : (
              <SceneFrame key={s.key} id={s.key} n={s.n} name={s.name} title={<span className="text-muted">Coming up.</span>}>
                <Empty label={`${s.name} · in progress`} />
              </SceneFrame>
            );
          })}

          {run.status === "done" && (
            <footer className="flex items-center justify-between px-6 py-10 text-[12px] text-muted md:px-10">
              <span className="font-mono">{run.runId}</span>
              <span className="font-mono tnum">{Math.round(run.credits * 10) / 10} credits</span>
            </footer>
          )}
        </main>
      </div>
    </div>
  );
}

function Waiting() {
  const { trace } = useRun();
  const last = [...trace].reverse().find((e) => e.type === "stage_start");
  return (
    <div className="dots grid min-h-[60vh] place-items-center px-6">
      <div className="text-center">
        <div className="font-dot text-[56px] font-black leading-none text-accent blink">●</div>
        <div className="mt-6 text-[28px] font-semibold tracking-tight">{last ? cap(last.stage) : "Starting"}…</div>
      </div>
    </div>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function useActiveScene() {
  const [active, setActive] = useState<SceneKey>("globe");
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (vis) setActive((vis.target as HTMLElement).dataset.scene as SceneKey);
      },
      { rootMargin: "-120px 0px -50% 0px", threshold: [0, 0.25, 0.5] },
    );
    const observe = () => document.querySelectorAll("[data-scene]").forEach((el) => io.observe(el));
    observe();
    const mo = new MutationObserver(observe);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, []);
  return active;
}
