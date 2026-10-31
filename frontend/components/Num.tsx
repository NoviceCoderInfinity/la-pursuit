"use client";

import { useRunMaybe } from "@/lib/run-context";
import type { EvId } from "@/lib/types";
import { cx } from "@/lib/format";

/** Every number on screen is a chip that opens its evidence (PRD §9). */
export function Num({
  value, ev, className, title,
}: { value: React.ReactNode; ev?: EvId[]; className?: string; title?: string }) {
  const run = useRunMaybe();
  const cited = !!ev?.length;
  return (
    <button
      type="button"
      title={title ?? (cited ? `Evidence: ${ev!.join(", ")}` : "Unverifiable")}
      disabled={!cited}
      onClick={(e) => {
        e.stopPropagation();
        run?.openEvidence(ev);
      }}
      className={cx(
        "tnum inline-flex items-baseline rounded-[6px] px-1 -mx-1 transition-colors",
        cited
          ? "cursor-pointer underline decoration-dotted decoration-1 underline-offset-[3px] decoration-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] hover:text-accent hover:decoration-accent"
          : "cursor-default text-muted",
        className,
      )}
    >
      {value}
    </button>
  );
}
