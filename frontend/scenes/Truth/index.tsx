"use client";

import { motion } from "framer-motion";
import { ActionText } from "@/components/ActionText";
import { truthAction } from "@/lib/actions";
import { useMemo, useState } from "react";
import { Num } from "@/components/Num";
import { SceneFrame } from "@/components/ui";
import { cx } from "@/lib/format";
import { useRun } from "@/lib/run-context";
import type { TruthScene } from "@/lib/types";

const STATUS: Record<string, { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "bg-[color-mix(in_srgb,var(--green)_14%,transparent)] text-green" },
  contradicted: { label: "Contradicted", cls: "bg-[color-mix(in_srgb,var(--red)_14%,transparent)] text-red" },
  unverifiable: { label: "Unverifiable", cls: "bg-bg-3 text-muted" },
};

export function TruthSceneView({ data }: { data: TruthScene }) {
  const { lens, peer, trace, openEvidence } = useRun();
  const [tab, setTab] = useState<"disputes" | "claims" | "thrown">(data.claims.length ? "claims" : "disputes");
  const calls = useMemo(() => trace.filter((e) => e.type === "tool_result"), [trace]);
  const verified = data.claims.filter((c) => c.status === "verified").length;
  const contradicted = data.claims.filter((c) => c.status === "contradicted").length;
  const high = data.disputes.filter((d) => (d as { severity?: string }).severity !== "low");

  const title =
    lens === "investor" && data.claims.length && (verified || contradicted)
      ? <>Their claims, checked against the graph: <span className="text-green">{verified} hold</span>{contradicted ? <>, <span className="text-red">{contradicted} don’t</span></> : ""}.</>
      : lens === "investor" && data.claims.length
        ? <>{data.claims.length} claim{data.claims.length > 1 ? "s" : ""} on their site, none the graph can check.</>
      : high.length
        ? <>The data disagreed <Num value={high.length} ev={high[0]?.values[0]?.ev ? [high[0].values[0].ev] : undefined} /> times. Here is how it was settled.</>
        : <>Every number here has a receipt.</>;

  return (
    <SceneFrame
      id="truth" n="06" name="Truth" title={title} action={<ActionText a={truthAction(data, lens)} />}
      aside={<Ledger calls={calls} total={data.ledger_count} endpoints={data.endpoints ?? []} credits={data.credits_used} onOpen={openEvidence} />}
    >
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-line bg-line sm:grid-cols-4">
        {[
          ["API calls", data.calls ?? calls.length],
          ["Evidence entries", data.ledger_count],
          ["Conflicts caught", data.disputes.length],
          ["Thrown out", data.rejected_candidates.length + data.rejected_news.length],
        ].map(([k, v], i) => (
          <motion.div key={String(k)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="bg-bg px-5 py-4">
            <div className="eyebrow !text-[10px]">{k}</div>
            <div className="mt-1 font-dot text-[30px] font-black leading-[34px] tnum">{v}</div>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 flex gap-1.5">
        {([
          ["claims", `Claims · ${data.claims.length}`],
          ["disputes", `Conflicts · ${data.disputes.length}`],
          ["thrown", `Thrown out · ${data.rejected_candidates.length + data.rejected_news.length}`],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cx("rounded-full border px-3 py-1 text-[12px] font-medium", tab === k ? "border-fg bg-fg text-bg" : "border-line-2 text-muted hover:text-fg")}>{label}</button>
        ))}
      </div>

      {tab === "claims" && (
        data.claims.length === 0 ? <EmptyNote text={lens === "investor" ? "No checkable claims on the homepage." : "Switch to Investor to check the target's claims."} /> : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.claims.map((c, i) => {
              const s = STATUS[c.status];
              return (
                <motion.div key={c.claim + i} initial={{ opacity: 0, rotateX: -40, y: 10 }} animate={{ opacity: 1, rotateX: 0, y: 0 }} transition={{ delay: i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  style={{ transformPerspective: 800 }}
                  className={cx("rounded-[14px] border bg-bg p-4", c.status === "contradicted" ? "border-red/40" : c.status === "verified" ? "border-green/40" : "border-line")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[11px] text-muted">{peer(c.peer_id)?.name} says</div>
                    <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", s.cls)}>{s.label}</span>
                  </div>
                  <div className="mt-2 text-[16px] font-semibold tracking-tight">“{c.claim}”</div>
                  <div className="mt-2 text-[12px] text-fg-2">{c.note}</div>
                  <div className="mt-3"><Num value={c.ev.length ? `${c.ev.length} source${c.ev.length > 1 ? "s" : ""}` : "no graph field"} ev={c.ev} className="text-[12px]" /></div>
                </motion.div>
              );
            })}
          </div>
        )
      )}

      {tab === "disputes" && (
        data.disputes.length === 0 ? <EmptyNote text="No conflicts in this run." /> : (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {data.disputes.map((d, i) => {
              const sev = (d as { severity?: string }).severity ?? "high";
              return (
                <motion.div key={`${d.peer_id}-${d.field}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className={cx("rounded-[14px] border bg-bg p-4", sev === "high" ? "border-red/40" : "border-line")}>
                  <div className="flex items-center justify-between">
                    <div className="text-[13px] font-semibold">{peer(d.peer_id)?.name ?? `#${d.peer_id}`} <span className="font-mono text-[11px] font-normal text-muted">· {d.field}</span></div>
                    <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", sev === "high" ? "bg-[color-mix(in_srgb,var(--red)_14%,transparent)] text-red" : "bg-bg-3 text-muted")}>{sev === "high" ? "conflict" : "stale band"}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {d.values.map((v) => (
                      <div key={v.source} className="rounded-lg border border-line px-2.5 py-1.5">
                        <div className="font-mono text-[10px] text-muted">{v.source}</div>
                        <Num value={String(v.value ?? "null")} ev={[v.ev]} className="font-mono text-[14px] font-semibold" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-[12px] text-muted">Rule · {d.rule}</div>
                  <div className="mt-1 text-[13px] text-fg">→ {d.resolution}</div>
                </motion.div>
              );
            })}
          </div>
        )
      )}

      {tab === "thrown" && (
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="eyebrow">Candidates rejected · {data.rejected_candidates.length}</div>
            <ul className="mt-2 divide-y divide-line rounded-[14px] border border-line">
              {data.rejected_candidates.slice(0, 18).map((c) => (
                <li key={c.name + (c.domain ?? "")} className="flex items-baseline justify-between gap-3 px-3 py-2 text-[12px]">
                  <span className="min-w-0 truncate"><span className="text-fg line-through decoration-[var(--muted)]">{c.name}</span> <span className="font-mono text-muted">{c.domain}</span></span>
                  <span className="shrink-0 text-right text-muted">{c.reason}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="eyebrow">News rejected · {data.rejected_news.length}</div>
            <ul className="mt-2 divide-y divide-line rounded-[14px] border border-line">
              {data.rejected_news.slice(0, 18).map((n, i) => (
                <li key={i} className="px-3 py-2 text-[12px]">
                  <div className="truncate text-fg line-through decoration-[var(--muted)]">{n.title}</div>
                  <div className="text-muted">{peer(n.peer_id)?.name} · {n.reason}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </SceneFrame>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <div className="dots mt-5 rounded-[14px] border border-dashed border-line-2 p-8 text-center text-[13px] text-muted">{text}</div>;
}

function Ledger({ calls, total, endpoints, credits, onOpen }: {
  calls: ReturnType<typeof useRun>["trace"]; total: number; endpoints: string[]; credits: number | null; onOpen: (ev: string[] | undefined) => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[16px] border border-line">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between"><span className="eyebrow">Evidence ledger</span><span className="font-mono text-[11px] text-muted">{total} entries</span></div>
        <div className="mt-2 flex flex-wrap gap-1">
          {endpoints.map((e) => <span key={e} className="rounded-full bg-bg-2 px-2 py-0.5 font-mono text-[10px] text-fg-2">{e}</span>)}
        </div>
        <div className="mt-2 font-mono text-[11px] text-muted">
          {credits ? `${credits.toFixed(1)} credits spent` : calls.length && calls.every((c) => c.detail?.cached) ? "served from cache · 0 credits" : "0 credits"}
        </div>
      </div>
      <div className="max-h-[560px] flex-1 overflow-y-auto">
        {calls.map((e, i) => (
          <button key={i} onClick={() => onOpen(e.ev)} className="grid w-full grid-cols-[1fr_auto] gap-2 border-b border-line px-4 py-2 text-left last:border-0 hover:bg-bg-2">
            <span className="min-w-0">
              <span className="block truncate font-mono text-[11px] text-accent">{e.detail?.endpoint ?? ""}</span>
              <span className="block truncate text-[12px] text-fg-2">{e.label}</span>
            </span>
            <span className="text-right font-mono text-[10px] text-muted tnum">
              {e.detail?.count != null && <span>{e.detail.count} rows<br /></span>}
              {e.detail?.cached ? "cached" : `${e.detail?.ms ?? 0}ms`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
