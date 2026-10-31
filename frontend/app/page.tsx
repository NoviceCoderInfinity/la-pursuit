"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LibraryGrid, Personas, useLibrary } from "@/components/Library";
import { LENSES, Logo, Segmented, ThemeToggle } from "@/components/ui";
import { OfflineError, startRun } from "@/lib/api";
import { detectLens } from "@/lib/mock";
import type { Lens } from "@/lib/types";

const GlobeCanvas = dynamic(() => import("@/components/GlobeCanvas"), { ssr: false });

const EXAMPLES: { q: string; lens: Lens }[] = [
  { q: "We are Retell", lens: "operator" },
  { q: "Should I invest in Bland AI", lens: "investor" },
  { q: "AI receptionist for dental clinics in India", lens: "founder" },
];

type LensPick = Lens | "auto";

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [lens, setLens] = useState<LensPick>("auto");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState<string | null>(null);
  const [filter, setFilter] = useState<Lens | "all">("all");
  const runs = useLibrary();
  const detected = q.trim() ? detectLens(q) : null;

  async function go(query = q, pick: LensPick = lens) {
    const text = query.trim();
    if (!text || busy) return;
    setBusy(true);
    setOffline(null);
    const l = pick === "auto" ? undefined : pick;
    let run_id: string;
    try {
      ({ run_id } = await startRun(text, l));
    } catch (e) {
      setBusy(false);
      setOffline(e instanceof OfflineError ? e.message : "Could not start the run.");
      document.getElementById("library")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    const sp = new URLSearchParams({ q: text });
    if (l) sp.set("lens", l);
    router.push(`/run/${run_id}?${sp}`);
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <header className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-6">
        <Logo />
        <ThemeToggle />
      </header>

      <section className="mx-auto flex max-w-[860px] flex-col items-center px-6 pt-[9vh] text-center">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="eyebrow">
          Market intelligence on Crustdata
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05 }}
          className="mt-5 text-[44px] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-[72px]"
        >
          See the whole market.
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.15 }} className="mt-5 text-[17px] text-muted sm:text-[19px]">
          One sentence in. Seven views out.
        </motion.p>

        <motion.form
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
          onSubmit={(e) => { e.preventDefault(); go(); }}
          className="mt-10 flex w-full items-center gap-2 rounded-full border border-line-2 bg-bg p-2 pl-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_rgba(0,0,0,0.06)] focus-within:border-accent"
        >
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="A company, a market, or an idea"
            className="h-12 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted"
          />
          <button
            type="submit" disabled={!q.trim() || busy} aria-label="Run"
            className="grid size-12 shrink-0 place-items-center rounded-full bg-fg text-bg transition-all hover:scale-[1.03] active:scale-95 disabled:opacity-25"
          >
            {busy ? <span className="size-4 animate-spin rounded-full border-2 border-bg border-t-transparent" /> : (
              <svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 8h11M9 3.5L13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            )}
          </button>
        </motion.form>

        {offline && <div className="mt-4 rounded-full bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-1.5 text-[13px] text-red">{offline}</div>}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-5 flex flex-col items-center gap-2">
          <Segmented
            layoutId="home-lens"
            value={lens}
            onChange={setLens}
            options={[{ key: "auto" as LensPick, label: lens === "auto" && detected ? `Auto · ${cap(detected)}` : "Auto" }, ...LENSES]}
          />
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-8 flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.q}
              onClick={() => { setQ(ex.q); setLens(ex.lens); go(ex.q, ex.lens); }}
              className="group flex items-center gap-2 rounded-full border border-line px-4 py-2 text-[13px] text-fg-2 transition-colors hover:border-line-2 hover:bg-bg-2 hover:text-fg"
            >
              <span className="eyebrow !text-[10px] group-hover:!text-accent">{ex.lens}</span>
              {ex.q}
            </button>
          ))}
        </motion.div>
      </section>

      {/* Horizon globe */}
      <div className="pointer-events-none relative mx-auto mt-12 h-[420px] w-full max-w-[1100px] overflow-hidden">
        <div className="absolute left-1/2 top-0 -translate-x-1/2">
          <GlobeCanvas width={940} height={940} autoRotate rotateSpeed={0.35} interactive={false} pov={{ lat: 22, lng: 20, altitude: 1.9 }} />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[var(--bg)] to-transparent" />
      </div>

      <section className="mx-auto max-w-[1100px] px-6 pb-20">
        <div className="eyebrow">Who it is for</div>
        <h2 className="mt-2 text-[32px] font-semibold leading-[38px] tracking-[-0.02em]">Same market. Three different decisions.</h2>
        <div className="mt-6">
          <Personas runs={runs} onPick={(l) => { setFilter(l); document.getElementById("library")?.scrollIntoView({ behavior: "smooth" }); }} />
        </div>
      </section>

      <section id="library" className="mx-auto max-w-[1100px] scroll-mt-8 px-6 pb-20">
        <LibraryGrid runs={runs} filter={filter} setFilter={setFilter} />
      </section>

    </main>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
