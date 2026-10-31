"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { curlFor, getEvidence } from "@/lib/api";
import { useRun } from "@/lib/run-context";
import type { EvidenceEntry } from "@/lib/types";
import { cx } from "@/lib/format";

export function EvidenceDrawer() {
  const { evidence, closeEvidence, runId } = useRun();
  const [active, setActive] = useState(0);
  const [entries, setEntries] = useState<Record<string, EvidenceEntry | null>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setActive(0);
    if (!evidence) return;
    evidence.forEach((id) => {
      if (id in entries) return;
      getEvidence(runId, id)
        .then((e) => setEntries((m) => ({ ...m, [id]: e })))
        .catch(() => setEntries((m) => ({ ...m, [id]: null })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidence]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeEvidence();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeEvidence]);

  const id = evidence?.[active];
  const e = id ? entries[id] : undefined;

  return (
    <AnimatePresence>
      {evidence && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: "none" }}
            onClick={closeEvidence}
          />
          <motion.aside
            className="fixed right-3 top-3 bottom-3 z-50 flex w-[min(480px,calc(100vw-24px))] flex-col overflow-hidden rounded-[16px] border border-line bg-bg shadow-[0_24px_80px_rgba(0,0,0,0.25)]"
            initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0, pointerEvents: "none" }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <header className="flex items-center justify-between border-b border-line px-5 py-4">
              <span className="eyebrow">Evidence</span>
              <button onClick={closeEvidence} className="grid size-7 place-items-center rounded-full text-muted hover:bg-bg-2 hover:text-fg" aria-label="Close">
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" /></svg>
              </button>
            </header>

            {evidence.length > 1 && (
              <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-line px-4 py-2">
                {evidence.map((x, i) => (
                  <button key={x} onClick={() => setActive(i)}
                    className={cx("rounded-full px-2.5 py-1 font-mono text-[11px]", i === active ? "bg-fg text-bg" : "text-muted hover:text-fg")}>
                    {x}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {e === undefined && <p className="blink text-muted">Loading…</p>}
              {e === null && <p className="text-muted">Unverifiable — no ledger entry.</p>}
              {e && (
                <div className="space-y-6">
                  <div>
                    <div className="font-mono text-[12px] text-muted">{e.id}</div>
                    <div className="mt-2 break-words text-[32px] font-semibold leading-[38px] tracking-tight tnum">
                      {typeof e.value === "object" ? JSON.stringify(e.value) : String(e.value)}
                    </div>
                    {e.path && <div className="mt-2 break-all font-mono text-[12px] text-fg-2">{e.path}</div>}
                  </div>

                  <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line text-[12px]">
                    {[
                      ["Endpoint", e.endpoint],
                      ["Credits", String(e.credits ?? 0)],
                      ["Time", new Date(e.ts).toLocaleTimeString("en-GB")],
                    ].map(([k, v]) => (
                      <div key={k} className="bg-bg px-3 py-2.5">
                        <dt className="eyebrow">{k}</dt>
                        <dd className="mt-1 truncate font-mono text-fg">{v}</dd>
                      </div>
                    ))}
                  </dl>

                  <Block label="Request" body={e.params} />
                  <Block label="Response" body={e.snippet} />

                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(curlFor(e));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1200);
                    }}
                    className="w-full rounded-full border border-line-2 py-2.5 text-[13px] font-medium hover:bg-bg-2"
                  >
                    {copied ? "Copied" : "Copy as curl"}
                  </button>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Block({ label, body }: { label: string; body: object }) {
  return (
    <div>
      <div className="eyebrow mb-2">{label}</div>
      <pre className="max-h-64 overflow-auto rounded-xl bg-bg-2 p-3.5 font-mono text-[12px] leading-[18px] text-fg-2">
        {JSON.stringify(body, null, 2)}
      </pre>
    </div>
  );
}
