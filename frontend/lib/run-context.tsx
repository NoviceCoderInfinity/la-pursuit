"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getReport, isMock, setLens as postLens, subscribe } from "./api";
import type { EvId, Lens, Peer, SceneKey, Scenes, TraceEvent } from "./types";

type Status = "running" | "done" | "error";

interface RunState {
  runId: string;
  query: string;
  lens: Lens;
  mock: boolean;
  status: Status;
  trace: TraceEvent[];
  peers: Peer[];
  peer: (id: number) => Peer | undefined;
  scenes: Partial<Scenes>;
  credits: number;
  evidence: EvId[] | null;
  openEvidence: (ev: EvId[] | undefined) => void;
  closeEvidence: () => void;
  setLens: (l: Lens) => void;
}

const Ctx = createContext<RunState | null>(null);

export function useRun() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRun outside RunProvider");
  return v;
}

/** Same as useRun but safe outside a run (e.g. on the home page). */
export const useRunMaybe = () => useContext(Ctx);

export function RunProvider({
  runId, query, initialLens, children,
}: { runId: string; query: string; initialLens?: Lens; children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("running");
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [scenes, setScenes] = useState<Partial<Scenes>>({});
  const [credits, setCredits] = useState(0);
  const [lens, setLensState] = useState<Lens>(initialLens ?? "founder");
  const [evidence, setEvidence] = useState<EvId[] | null>(null);
  const ctx = useRef({ query, lens: initialLens });

  useEffect(() => {
    const c = ctx.current;
    const unsub = subscribe(runId, c, (ev) => {
      setTrace((t) => [...t, ev]);
      if (ev.detail?.credits) setCredits((x) => x + (ev.detail?.credits ?? 0));
      const d = ev.data as { peers?: Peer[]; lens?: Lens } | undefined;
      if (d?.peers) setPeers(d.peers);
      if (ev.stage === "intent" && ev.type === "decision" && !c.lens) {
        const m = /Lens: (\w+)/.exec(ev.decision?.reason ?? "");
        if (m) setLensState(m[1] as Lens);
      }
      if (ev.type === "scene_ready" && ev.scene) setScenes((s) => ({ ...s, [ev.scene!]: ev.data }));
      if (ev.type === "done") {
        setStatus("done");
        getReport(runId)
          .then((r) => {
            setPeers(r.peers);
            setScenes((s) => ({ ...r.scenes, ...s }));
            setCredits(r.credits_used);
            const l = r.intent?.lens ?? (r as { lens?: Lens }).lens;
            if (!c.lens && l) setLensState(l);
          })
          .catch(() => {});
      }
    });
    return unsub;
  }, [runId]);

  const peerMap = useMemo(() => new Map(peers.map((p) => [p.id, p])), [peers]);

  const setLens = useCallback(
    (l: Lens) => {
      setLensState(l);
      postLens(runId, l)
        .then((deck) => setScenes((s) => ({ ...s, deck })))
        .catch(() => {});
    },
    [runId],
  );

  const value: RunState = {
    runId, query, lens, mock: isMock(runId), status, trace, peers,
    peer: (id) => peerMap.get(id),
    scenes, credits, evidence,
    openEvidence: (ev) => ev && ev.length && setEvidence(ev),
    closeEvidence: () => setEvidence(null),
    setLens,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const SCENES: { key: SceneKey; n: string; name: string }[] = [
  { key: "globe", n: "01", name: "Atlas" },
  { key: "field", n: "02", name: "Momentum" },
  { key: "streams", n: "03", name: "Build vs Sell" },
  { key: "chord", n: "04", name: "Talent" },
  { key: "constellation", n: "05", name: "Capital" },
  { key: "truth", n: "06", name: "Truth" },
  { key: "deck", n: "07", name: "Decisions" },
];
