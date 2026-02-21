"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type PlayerRow = {
  id: string;
  displayName: string;
  username: string;
  email: string;
  imageUrl: string | null;
};

type PlayersResponse = {
  ok: boolean;
  canPickAllPlayers: boolean;
  players: PlayerRow[];
  message?: string;
};

function getSelectionFromUrl(searchParams: ReturnType<typeof useSearchParams>) {
  const mode = String(searchParams.get("mode") ?? "").toLowerCase();
  const playerId = String(searchParams.get("playerId") ?? "").trim();
  if (mode === "all") return { mode: "all" as const, playerId: null };
  if (playerId) return { mode: "single" as const, playerId };
  return { mode: "single" as const, playerId: null as string | null };
}

export default function PlayerSlicer() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [canPickAllPlayers, setCanPickAllPlayers] = useState(false);

  const isSpillerPage = pathname === "/spiller" || pathname.startsWith("/spiller/");

  const selection = useMemo(() => getSelectionFromUrl(searchParams), [searchParams]);

  async function loadPlayers() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/player/players", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as PlayersResponse;
      if (!res.ok || !data?.ok) {
        setError(data?.message ?? "Kunne ikke hente spillere.");
        setPlayers([]);
        setCanPickAllPlayers(false);
        return;
      }

      setPlayers(Array.isArray(data.players) ? data.players : []);
      setCanPickAllPlayers(!!data.canPickAllPlayers);

      // Ensure URL has a sane default selection
      const nextUrl = new URL(window.location.href);
      if (data.canPickAllPlayers) {
        if (selection.mode !== "all" && !selection.playerId) {
          nextUrl.searchParams.set("mode", "all");
          nextUrl.searchParams.delete("playerId");
          router.replace(nextUrl.pathname + "?" + nextUrl.searchParams.toString());
        }
      } else {
        const myId = data.players?.[0]?.id;
        if (myId && selection.playerId !== myId) {
          nextUrl.searchParams.delete("mode");
          nextUrl.searchParams.set("playerId", myId);
          router.replace(nextUrl.pathname + "?" + nextUrl.searchParams.toString());
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isSpillerPage) return;
    loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpillerPage]);

  function goAll() {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "all");
    url.searchParams.delete("playerId");
    router.push(url.pathname + "?" + url.searchParams.toString());
  }

  function goPlayer(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.delete("mode");
    url.searchParams.set("playerId", id);
    router.push(url.pathname + "?" + url.searchParams.toString());
  }

  if (!isSpillerPage) return null;

  const selectedValue =
    selection.mode === "all" ? "ALL" : selection.playerId ?? players[0]?.id ?? "";
  const disabled = loading || (!canPickAllPlayers && players.length <= 1);

  return (
    <div className="mt-4 space-y-1.5">
      <div className="text-xs font-semibold">Spiller</div>
      <select
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:opacity-70"
        style={{ colorScheme: "light" }}
        value={selectedValue}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "ALL") goAll();
          else goPlayer(v);
        }}
      >
        {canPickAllPlayers ? <option value="ALL">Alle</option> : null}
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.displayName}
          </option>
        ))}
      </select>

      {error ? <div className="text-xs text-red-200">{error}</div> : null}
    </div>
  );
}
