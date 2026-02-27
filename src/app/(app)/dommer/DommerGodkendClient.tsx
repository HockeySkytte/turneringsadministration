"use client";

import { useEffect, useState } from "react";

type AssignmentRow = {
  match: {
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
  };
  slot: 1 | 2;
};

type LoadResponse = {
  assignments: AssignmentRow[];
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

export default function DommerGodkendClient() {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/dommer/assignments", {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      const data = (await res.json()) as LoadResponse & { message?: string };
      if (!res.ok) throw new Error(data.message || "Kunne ikke hente dine påsætninger.");

      setAssignments(data.assignments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(matchId: string, decision: "ACCEPTED" | "DECLINED") {
    setSavingId(matchId);
    setError(null);

    try {
      const res = await fetch(`/api/dommer/assignments/${matchId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ decision }),
        }
      );

      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(data.message || "Kunne ikke gemme dit svar.");

      setAssignments((prev) => prev.filter((a) => a.match.id !== matchId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <div className="font-semibold text-zinc-900">Godkend</div>
      <div className="mt-1 text-zinc-600">Her kan du godkende eller afvise kampe, du er påsat.</div>

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
              <th className="px-3 py-2">Svar</th>
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 && !loading ? (
              <tr>
                <td className="px-3 py-4 text-zinc-600" colSpan={7}>
                  Ingen kampe til godkendelse.
                </td>
              </tr>
            ) : null}

            {assignments.map((a) => {
              const m = a.match;
              const isSaving = savingId === m.id;

              return (
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
                  <td className="whitespace-nowrap px-3 py-2">{a.slot === 1 ? "Dommer1" : "Dommer2"}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        disabled={isSaving}
                        onClick={() => void decide(m.id, "ACCEPTED")}
                        className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                      >
                        Godkend
                      </button>
                      <button
                        disabled={isSaving}
                        onClick={() => void decide(m.id, "DECLINED")}
                        className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        Afvis
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
