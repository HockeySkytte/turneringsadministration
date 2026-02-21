"use client";

import { usePathname, useRouter } from "next/navigation";

export type StatsAggregationMode = "TOTAL" | "PER_GAME";

export default function StatsAggregationModeSlicer({
  mode,
}: {
  mode: StatsAggregationMode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname !== "/statistik") return null;

  async function setMode(next: StatsAggregationMode) {
    await fetch("/api/ui/select-stats-aggregation-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });

    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold">Visning</div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("TOTAL")}
          className={
            mode === "TOTAL"
              ? "rounded-md bg-[color:var(--topbar-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--topbar-foreground)]"
              : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900"
          }
        >
          Total
        </button>
        <button
          type="button"
          onClick={() => setMode("PER_GAME")}
          className={
            mode === "PER_GAME"
              ? "rounded-md bg-[color:var(--topbar-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--topbar-foreground)]"
              : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900"
          }
        >
          Per kamp
        </button>
      </div>
    </div>
  );
}
