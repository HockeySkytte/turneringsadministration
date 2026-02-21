"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useStatsFilters } from "@/components/stats/StatsFiltersProvider";

type StatsEvent = {
  perspective?: string | null;
  teamName?: string | null;
  gameId: string | null;
  gameDate?: string | null;
  teamHome?: string | null;
  teamAway?: string | null;
  strength?: string | null;
  p1Name: string | null;
  p2Name: string | null;
  goalieName?: string | null;
  homePlayersNames?: string | null;
  awayPlayersNames?: string | null;
};

function splitOnIce(value: string | null | undefined) {
  return String(value ?? "")
    .split(" - ")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function StatsSidebarSlicers() {
  const pathname = usePathname();
  const show = pathname === "/statistik" || pathname.startsWith("/statistik/");

  const { filters, setPerspektiv, setKamp, setStyrke, setSpiller, setMaalmand, setPaaBanen } =
    useStatsFilters();

  const [events, setEvents] = useState<StatsEvent[]>([]);

  useEffect(() => {
    if (!show) return;

    let cancelled = false;

    (async () => {
      const res = await fetch("/api/stats/events?limit=1000", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      if (cancelled) return;
      setEvents(data?.events ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [show]);

  const options = useMemo(() => {
    const perspectives = new Set<string>();
    const strengths = new Set<string>();
    const players = new Set<string>();
    const goalies = new Set<string>();
    const onIce = new Set<string>();

    const games = new Map<
      string,
      { gameDate: string | null; teamHome: string | null; teamAway: string | null }
    >();

    for (const e of events) {
      if (e.teamName) perspectives.add(e.teamName);
      else if (e.perspective) perspectives.add(e.perspective);

      if (e.strength) strengths.add(e.strength);

      if (e.p1Name) players.add(e.p1Name);
      if (e.p2Name) players.add(e.p2Name);

      if (e.goalieName) goalies.add(e.goalieName);

      for (const name of splitOnIce(e.homePlayersNames)) onIce.add(name);
      for (const name of splitOnIce(e.awayPlayersNames)) onIce.add(name);

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
      perspectives: Array.from(perspectives).sort(sortAlpha),
      games: gamesList,
      strengths: Array.from(strengths).sort(sortAlpha),
      players: Array.from(players).sort(sortAlpha),
      goalies: Array.from(goalies).sort(sortAlpha),
      onIce: Array.from(onIce).sort(sortAlpha),
    };
  }, [events]);

  useEffect(() => {
    if (!show) return;
    if (filters.perspektiv) return;
    if (options.perspectives.length === 0) return;
    setPerspektiv(options.perspectives[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, options.perspectives.length]);

  if (!show) return null;

  return (
    <div className="mt-4 space-y-2.5">
      <label className="block text-xs">
        <div className="mb-0.5 font-semibold">Perspektiv</div>
        <select
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:opacity-70"
          value={filters.perspektiv}
          disabled={options.perspectives.length === 0}
          onChange={(e) => setPerspektiv(e.target.value)}
        >
          {options.perspectives.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

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
        <div className="mb-0.5 font-semibold">Spiller</div>
        <select
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:opacity-70"
          value={filters.spiller}
          onChange={(e) => setSpiller(e.target.value)}
        >
          <option value="">Alle</option>
          {options.players.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs">
        <div className="mb-0.5 font-semibold">Målmand</div>
        <select
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:opacity-70"
          value={filters.maalmand}
          onChange={(e) => setMaalmand(e.target.value)}
        >
          <option value="">Alle</option>
          {options.goalies.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs">
        <div className="mb-0.5 font-semibold">På Banen</div>
        <select
          multiple
          className="h-32 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900"
          value={filters.paaBanen}
          onChange={(e) => {
            const values = Array.from(e.currentTarget.selectedOptions).map((o) => o.value);
            setPaaBanen(values);
          }}
        >
          {options.onIce.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
