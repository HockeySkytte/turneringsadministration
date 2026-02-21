"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useStatsFilters } from "@/components/stats/StatsFiltersProvider";

type StatsEvent = {
  perspective?: string | null;
  teamName?: string | null;
  gameId: string | null;
  gameDate?: string | null;
  teamHome?: string | null;
  teamAway?: string | null;
  strength?: string | null;
  event: string;
  videoUrl?: string | null;
  videoTime?: number | null;
};

export default function SpillerVideoSidebarSlicers() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const show = pathname === "/spiller" || pathname.startsWith("/spiller/");

  const tab = String(searchParams.get("tab") ?? "").toLowerCase();
  const playerMode = String(searchParams.get("mode") ?? "").toLowerCase();
  const playerId = String(searchParams.get("playerId") ?? "").trim();
  const isAllPlayers = tab === "video" && (playerMode === "all" || !playerId);

  const { filters, setKamp, setStyrke, setEvent, setScope } = useStatsFilters();

  const [events, setEvents] = useState<StatsEvent[]>([]);

  useEffect(() => {
    if (!show) return;
    if (tab !== "video") return;

    let cancelled = false;

    (async () => {
      const res = await fetch("/api/stats/events?limit=1000", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      if (cancelled) return;
      setEvents(Array.isArray(data?.events) ? data.events : []);
    })();

    return () => {
      cancelled = true;
    };
  }, [show, tab]);

  const options = useMemo(() => {
    const strengths = new Set<string>();
    const eventTypes = new Set<string>();

    const games = new Map<
      string,
      { gameDate: string | null; teamHome: string | null; teamAway: string | null }
    >();

    for (const e of events) {
      const hasVideo =
        Boolean(String(e.videoUrl ?? "").trim()) &&
        typeof e.videoTime === "number" &&
        Number.isFinite(e.videoTime);
      if (!hasVideo) continue;

      if (e.strength) strengths.add(e.strength);
      if (e.event) eventTypes.add(e.event);

      if (e.gameId) {
        const existing = games.get(e.gameId);
        const nextDate = e.gameDate ?? null;
        if (!existing) {
          games.set(e.gameId, {
            gameDate: nextDate,
            teamHome: e.teamHome ?? null,
            teamAway: e.teamAway ?? null,
          });
        } else {
          const existingDate = existing.gameDate ? new Date(existing.gameDate).getTime() : -Infinity;
          const candidateDate = nextDate ? new Date(nextDate).getTime() : -Infinity;
          if (candidateDate > existingDate) {
            games.set(e.gameId, {
              gameDate: nextDate,
              teamHome: e.teamHome ?? existing.teamHome,
              teamAway: e.teamAway ?? existing.teamAway,
            });
          }
        }
      }
    }

    const sortAlpha = (a: string, b: string) => a.localeCompare(b, "da-DK");

    const gamesList = Array.from(games.entries())
      .map(([id, info]) => ({ id, ...info }))
      .sort((a, b) => {
        const da = a.gameDate ? new Date(a.gameDate).getTime() : -Infinity;
        const db = b.gameDate ? new Date(b.gameDate).getTime() : -Infinity;
        return db - da;
      })
      .map((g) => {
        const dateLabel = g.gameDate
          ? new Date(g.gameDate).toLocaleDateString("da-DK")
          : "";
        return {
          id: g.id,
          label: `${dateLabel} - ${g.teamHome ?? ""} - ${g.teamAway ?? ""}`.trim(),
        };
      });

    return {
      games: gamesList,
      strengths: Array.from(strengths).sort(sortAlpha),
      eventTypes: Array.from(eventTypes).sort(sortAlpha),
    };
  }, [events]);

  if (!show) return null;
  if (tab !== "video") return null;

  return (
    <div className="mt-4 space-y-2.5">
      <label className="block text-xs">
        <div className="mb-0.5 font-semibold">Kamp</div>
        <select
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:opacity-70"
          value={filters.kamp}
          onChange={(e) => setKamp(e.target.value)}
        >
          <option value="">Alle</option>
          {options.games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label || g.id}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs">
        <div className="mb-0.5 font-semibold">Styrkeforhold</div>
        <select
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:opacity-70"
          value={filters.styrke}
          onChange={(e) => setStyrke(e.target.value)}
        >
          <option value="">Alle</option>
          {options.strengths.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs">
        <div className="mb-0.5 font-semibold">Event</div>
        <select
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:opacity-70"
          value={filters.event}
          onChange={(e) => setEvent(e.target.value)}
        >
          <option value="">Alle</option>
          {options.eventTypes.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <div className="block text-xs">
        <div className="mb-1 font-semibold">Individuelt / På Banen</div>
        <div className="flex gap-2">
          <button
            type="button"
            className={
              "flex-1 rounded-md px-3 py-2 text-xs font-semibold " +
              (filters.scope === "individual"
                ? "text-[var(--brand-foreground)]"
                : "border border-zinc-300 bg-white text-zinc-900")
            }
            style={filters.scope === "individual" ? { background: "var(--brand)" } : undefined}
            disabled={isAllPlayers}
            onClick={() => setScope(filters.scope === "individual" ? "" : "individual")}
          >
            Individuelt
          </button>
          <button
            type="button"
            className={
              "flex-1 rounded-md px-3 py-2 text-xs font-semibold " +
              (filters.scope === "onIce"
                ? "text-[var(--brand-foreground)]"
                : "border border-zinc-300 bg-white text-zinc-900")
            }
            style={filters.scope === "onIce" ? { background: "var(--brand)" } : undefined}
            disabled={isAllPlayers}
            onClick={() => setScope(filters.scope === "onIce" ? "" : "onIce")}
          >
            På Banen
          </button>
        </div>
        {isAllPlayers ? (
          <div className="mt-1 text-[11px] text-red-200/90">
            Vælg en spiller for Individuelt/På Banen.
          </div>
        ) : null}
      </div>
    </div>
  );
}
