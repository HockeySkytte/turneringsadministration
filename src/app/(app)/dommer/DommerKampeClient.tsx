"use client";

import { useEffect, useState } from "react";

type MatchRow = {
  id: string;
  date: string | null;
  time: string | null;
  league: string | null;
  gender: string | null;
  stage: string | null;
  pool: string | null;
  venue: string | null;
  homeTeam: string;
  awayTeam: string;
  slot: 1 | 2;
};

type LoadResponse = {
  matches: MatchRow[];
};

function fmtDate(dateIso: string | null) {
  if (!dateIso) return "";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return dateIso;
  return d.toLocaleDateString("da-DK");
}

function fmtTime(timeIso: string | null) {
  if (!timeIso) return "";
  const d = new Date(timeIso);
  if (Number.isNaN(d.getTime())) return timeIso;
  return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

export default function DommerKampeClient() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/dommer/kampe", {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      const data = (await res.json()) as LoadResponse & { message?: string };
      if (!res.ok) throw new Error(data.message || "Kunne ikke hente kampe.");

      setMatches(data.matches);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function withdraw(matchId: string) {
    const ok = confirm("Vil du afmelde dig denne kamp?");
    if (!ok) return;

    setSavingId(matchId);
    setError(null);

    try {
      const res = await fetch(`/api/dommer/assignments/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ decision: "WITHDRAWN" }),
      });

      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(data.message || "Kunne ikke afmelde dig.");

      setMatches((prev) => prev.filter((m) => m.id !== matchId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <div className="font-semibold text-zinc-900">Kampe</div>
      <div className="mt-1 text-zinc-600">Dine godkendte (ikke færdigspillede) kampe.</div>

      {loading ? <div className="mt-3 text-sm text-zinc-600">Henter…</div> : null}

      {error ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-700">
            <tr>
              <th className="px-3 py-2">Dato</th>
              <th className="px-3 py-2">Tid</th>
              <th className="px-3 py-2">Liga</th>
              <th className="px-3 py-2">Sted</th>
              <th className="px-3 py-2">Kamp</th>
              <th className="px-3 py-2">Rolle</th>
              <th className="px-3 py-2">Handling</th>
            </tr>
          </thead>
          <tbody>
            {matches.length === 0 && !loading ? (
              <tr>
                <td className="px-3 py-4 text-zinc-600" colSpan={7}>
                  Ingen kampe fundet.
                </td>
              </tr>
            ) : null}

            {matches.map((m) => (
              <tr key={m.id} className="border-t border-zinc-200">
                <td className="whitespace-nowrap px-3 py-2">{fmtDate(m.date)}</td>
                <td className="whitespace-nowrap px-3 py-2">{fmtTime(m.time)}</td>
                <td className="whitespace-nowrap px-3 py-2">{m.league ?? ""}</td>
                <td className="min-w-[180px] px-3 py-2">{m.venue ?? ""}</td>
                <td className="min-w-[240px] px-3 py-2">
                  <div className="font-semibold text-zinc-900">
                    {m.homeTeam} – {m.awayTeam}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-600">
                    {(m.stage ?? "").trim() ? `${m.stage} ` : ""}
                    {(m.pool ?? "").trim() ? `(${m.pool})` : ""}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2">{m.slot === 1 ? "Dommer1" : "Dommer2"}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <button
                    type="button"
                    disabled={savingId === m.id}
                    onClick={() => void withdraw(m.id)}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    Afmeld
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
