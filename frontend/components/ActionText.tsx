"use client";

import { Num } from "@/components/Num";
import type { Action } from "@/lib/actions";

export function ActionText({ a }: { a: Action | null }) {
  if (!a) return null;
  return (
    <>
      {a.text}
      {a.ev && a.ev.length > 0 && <> <Num value="source" ev={a.ev} className="text-[12px] text-muted" /></>}
    </>
  );
}
