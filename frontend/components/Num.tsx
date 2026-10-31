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
  // A span with button semantics, so chips can sit inside clickable rows without nesting <button>s.
  return (
    <span
      role={cited ? "button" : undefined}
      tabIndex={cited ? 0 : undefined}
      title={title ?? (cited ? `Evidence: ${ev!.join(", ")}` : "Unverifiable")}
      onClick={(e) => {
        if (!cited) return;
        e.stopPropagation();
        run?.openEvidence(ev);
      }}
      onKeyDown={(e) => {
        if (!cited || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        e.stopPropagation();
        run?.openEvidence(ev);
      }}
      className={cx(
        "tnum inline-flex items-baseline rounded-[6px] px-1 -mx-1 transition-colors",
        cited
          ? "cursor-pointer underline decoration-dotted decoration-1 underline-offset-[3px] decoration-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] hover:text-accent hover:decoration-accent focus-visible:outline-2 focus-visible:outline-accent"
          : "cursor-default text-muted",
        className,
      )}
    >
      {value}
    </span>
  );
}
