"use client";

import { usePathname, useRouter } from "next/navigation";

export type CalendarMode = "ALL" | "TEAM";

export default function CalendarModeSlicer({
  mode,
  hasTeam,
}: {
  mode: CalendarMode;
  hasTeam: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Only relevant on Kalender.
  if (pathname !== "/kalender") return null;

  async function setMode(next: CalendarMode) {
    await fetch("/api/ui/select-calendar-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });

    router.refresh();
  }

  const disabled = !hasTeam;

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold">Kampe</div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setMode("ALL")}
          className={
            mode === "ALL"
              ? "rounded-md bg-[color:var(--topbar-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--topbar-foreground)] disabled:opacity-70"
              : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 disabled:opacity-70"
          }
        >
          Alle
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setMode("TEAM")}
          className={
            mode === "TEAM"
              ? "rounded-md bg-[color:var(--topbar-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--topbar-foreground)] disabled:opacity-70"
              : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 disabled:opacity-70"
          }
        >
          Holdet
        </button>
      </div>
      {!hasTeam ? (
        <div className="text-xs text-zinc-500">Vælg et hold for at filtrere.</div>
      ) : null}
    </div>
  );
}
