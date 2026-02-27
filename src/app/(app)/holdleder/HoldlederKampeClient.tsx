"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type TeamOption = { id: string; league: string; name: string; clubId: string; holdId?: string | null };

type MatchItem = {
  id: string;
  kampId: number | null;
  date: string | null;
  time: string | null;
  league: string | null;
  stage: string | null;
  pool: string | null;
  venue: string | null;
  homeTeam: string;
  awayTeam: string;
  hasUnreadComments: boolean;
  needsMoveRequestResponse: boolean;
  needsAttention: boolean;
};

function fmtDate(date: string | null) {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("da-DK", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function HoldlederKampeClient() {
  const router = useRouter();

  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  const [items, setItems] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadTeams() {
      const res = await fetch("/api/holdleder/teams", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as any;
      if (cancelled) return;
      const list = (json?.teams ?? []) as TeamOption[];
      setTeams(list);
      if (!selectedTeamId && list.length) {
        setSelectedTeamId(list[0]!.id);
      }
    }
    void loadTeams();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const teamOptions = useMemo(() => {
    return teams.map((t) => ({ id: t.id, label: `${t.name}  ·  ${t.league}` }));
  }, [teams]);

  const selectedTeam = useMemo(() => teams.find((t) => t.id === selectedTeamId) ?? null, [teams, selectedTeamId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedTeamId) {
        setItems([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/holdleder/matches?teamId=${encodeURIComponent(selectedTeamId)}`, { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as any;
        if (cancelled) return;
        if (!res.ok || data?.ok !== true) {
          setItems([]);
          setError(data?.message ?? "Kunne ikke hente kampe.");
          return;
        }
        setItems((data?.items ?? []) as MatchItem[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId]);

  const attentionCount = useMemo(() => items.filter((m) => m.needsAttention).length, [items]);

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-semibold">Kampe</div>
          <div className="mt-1 text-sm text-zinc-600">
            Liste over holdets kampe. Kampe markeres hvis der er ulæste kommentarer eller en kampflytningsanmodning, der afventer svar.
          </div>
        </div>
        {attentionCount > 0 ? <div className="text-sm font-semibold text-red-700">{attentionCount} kræver opmærksomhed</div> : null}
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm font-semibold text-zinc-900">Vælg hold</div>
        <select
          className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          value={selectedTeamId}
          onChange={(e) => setSelectedTeamId(e.target.value)}
          disabled={teamOptions.length === 0}
        >
          {teamOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        {selectedTeam ? (
          <div className="mt-2 text-sm text-zinc-700">
            Liga: <span className="font-semibold">{selectedTeam.league}</span> · Hold: <span className="font-semibold">{selectedTeam.name}</span>
          </div>
        ) : null}
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div> : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Dato</th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Tid</th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Hjemme</th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Ude</th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Liga</th>
                <th className="border-b border-zinc-200 px-3 py-2 text-right text-xs font-semibold text-zinc-700">Åbn</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-sm text-zinc-600">
                    Henter…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-sm text-zinc-600">
                    Ingen kampe.
                  </td>
                </tr>
              ) : (
                items.map((m) => {
                  const highlight = m.needsAttention;
                  const href = m.kampId != null ? `/kamp/${m.kampId}?tab=comments` : null;
                  return (
                    <tr
                      key={m.id}
                      className={
                        (highlight ? "bg-red-50 " : "") +
                        "border-b border-zinc-100 " +
                        (href
                          ? highlight
                            ? "cursor-pointer hover:bg-red-100"
                            : "cursor-pointer hover:bg-zinc-50"
                          : "")
                      }
                      onClick={() => {
                        if (href) router.push(href);
                      }}
                      role={href ? "button" : undefined}
                      tabIndex={href ? 0 : -1}
                      onKeyDown={(e) => {
                        if (!href) return;
                        if (e.key === "Enter" || e.key === " ") router.push(href);
                      }}
                    >
                      <td className="px-3 py-2 text-zinc-900">{fmtDate(m.date)}</td>
                      <td className="px-3 py-2 text-zinc-900">{m.time ?? ""}</td>
                      <td className="px-3 py-2 text-zinc-900">{m.homeTeam}</td>
                      <td className="px-3 py-2 text-zinc-900">{m.awayTeam}</td>
                      <td className="px-3 py-2 text-zinc-900">{m.league ?? ""}</td>
                      <td className="px-3 py-2 text-right">
                        {href ? (
                          <Link className="font-semibold text-[color:var(--brand)] hover:underline" href={href}>
                            Åbn kamp
                          </Link>
                        ) : (
                          <span className="text-xs text-zinc-500">Mangler kamp-id</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
