import type { Lens } from "@/lib/types";
import RunView from "./RunView";

export default async function RunPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; lens?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const lens = ["operator", "investor", "founder"].includes(sp.lens ?? "") ? (sp.lens as Lens) : undefined;
  return <RunView runId={id} query={sp.q ?? "AI voice agent platforms"} lens={lens} />;
}
