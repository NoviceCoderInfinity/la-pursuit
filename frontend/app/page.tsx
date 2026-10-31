"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LENSES, Logo, Segmented, ThemeToggle } from "@/components/ui";
import { startRun } from "@/lib/api";
import { detectLens } from "@/lib/mock";
import { SCENES } from "@/lib/run-context";
import type { Lens } from "@/lib/types";
import { cx } from "@/lib/format";

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
  const detected = q.trim() ? detectLens(q) : null;

  async function go(query = q, pick: LensPick = lens) {
    const text = query.trim();
    if (!text || busy) return;
    setBusy(true);
    const l = pick === "auto" ? undefined : pick;
    const { run_id } = await startRun(text, l);
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

      <section className="mx-auto max-w-[1100px] px-6 pb-24">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-line bg-line sm:grid-cols-4 lg:grid-cols-7">
          {SCENES.map((s, i) => (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
              className={cx("flex aspect-square flex-col justify-between bg-bg p-4", i === 6 && "col-span-2 sm:col-span-1")}
            >
              <span className="font-dot text-[28px] font-black leading-none text-fg">{s.n}</span>
              <SceneGlyph k={s.key} />
              <span className="text-[13px] font-medium">{s.name}</span>
            </motion.div>
          ))}
        </div>
      </section>
    </main>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function SceneGlyph({ k }: { k: string }) {
  const c = "var(--muted)";
  const a = "var(--accent)";
  const g: Record<string, React.ReactNode> = {
    globe: (<><circle cx="20" cy="20" r="15" fill="none" stroke={c} /><ellipse cx="20" cy="20" rx="6" ry="15" fill="none" stroke={c} /><path d="M8 26 Q20 6 32 14" fill="none" stroke={a} strokeWidth="1.5" /></>),
    field: (<><circle cx="12" cy="26" r="3" fill={c} /><circle cx="20" cy="18" r="5" fill="none" stroke={c} /><circle cx="29" cy="10" r="4" fill={a} /><path d="M10 30 L18 21 L28 11" stroke={a} strokeDasharray="2 2" fill="none" /></>),
    streams: (<><path d="M4 22 C12 14 20 26 36 16 L36 24 C20 34 12 22 4 28Z" fill={a} opacity=".9" /><path d="M4 16 C12 8 20 20 36 10 L36 16 C20 26 12 14 4 22Z" fill={c} opacity=".5" /></>),
    chord: (<><circle cx="20" cy="20" r="15" fill="none" stroke={c} strokeWidth="2" strokeDasharray="12 3" /><path d="M9 12 Q20 20 30 26" fill="none" stroke={a} strokeWidth="2" /><path d="M10 28 Q20 20 28 9" fill="none" stroke={c} /></>),
    constellation: (<><path d="M20 20 L8 10 M20 20 L33 13 M20 20 L12 32 M20 20 L30 30" stroke={c} /><circle cx="20" cy="20" r="4" fill={a} /><circle cx="8" cy="10" r="2.5" fill={c} /><circle cx="33" cy="13" r="2.5" fill={c} /><circle cx="12" cy="32" r="2.5" fill={c} /><circle cx="30" cy="30" r="2.5" fill="none" stroke={c} strokeDasharray="1.5 1.5" /></>),
    truth: (<><rect x="7" y="6" width="26" height="28" rx="3" fill="none" stroke={c} /><path d="M12 14h16M12 20h10M12 26h13" stroke={c} /><circle cx="29" cy="26" r="5" fill="var(--bg)" stroke={a} strokeWidth="1.5" /><path d="M26.8 26l1.6 1.6 3-3" stroke={a} fill="none" strokeWidth="1.5" /></>),
    deck: (<><rect x="6" y="12" width="20" height="22" rx="3" fill="none" stroke={c} /><rect x="14" y="6" width="20" height="22" rx="3" fill="var(--bg)" stroke={a} strokeWidth="1.5" /><path d="M19 14h10M19 19h6" stroke={a} /></>),
  };
  return <svg width="40" height="40" viewBox="0 0 40 40" className="self-center">{g[k]}</svg>;
}
