// Offline helpers. Offline runs are the live recordings in fixtures/runs (see lib/api.ts);
// there is deliberately no synthetic data generator, so nothing on screen is ever made up.
import type { Lens } from "./types";

export function detectLens(q: string): Lens {
  const s = q.toLowerCase();
  if (/\b(invest|back|fund|valuation)\b/.test(s)) return "investor";
  if (/\b(we are|we're|our company|i run)\b/.test(s)) return "operator";
  return "founder";
}

// Mirrors backend/app/pipeline.py STAGES.
const STAGES = ["intent", "resolve", "discover", "enrich", "signals", "engines", "scenes", "deck", "watch"] as const;

export { STAGES };
