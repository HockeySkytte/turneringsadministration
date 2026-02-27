"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PendingItem = {
  id: string;
  kampId: number;
  current: {
    date: string | null;
    time: string | null;
    league: string | null;
    homeTeam: string;
    awayTeam: string;
  } | null;
  proposed: {
    date: string | null;
    time: string | null;
    note: string | null;
  };
  createdAt: string;
  createdBy: string;
};

function norm(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function fmtDateTimeIso(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("da-DK", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function TurneringKampflytningerClient() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/turnering/move-requests/pending", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.message ?? "Kunne ikke hente.");
      setItems(Array.isArray(data?.items) ? (data.items as PendingItem[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(id: string, decision: "APPROVE" | "REJECT") {
    const reason =
      decision === "REJECT" ? prompt("Begrundelse (valgfri):", "") : "";
    if (decision === "REJECT" && reason === null) return;

    setDecidingId(id);
    setError(null);

    try {
      const res = await fetch(`/api/turnering/move-requests/${encodeURIComponent(id)}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ decision, reason: norm(reason) || null }),
      });

      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.message ?? "Kunne ikke gemme.");

      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div>
      <div className="text-sm font-semibold text-zinc-900">Godkend kampflytninger</div>
      <div className="mt-1 text-sm text-zinc-600">Når udeholdet har accepteret, kan Turneringsadmin godkende eller afvise her.</div>

      {loading ? <div className="mt-3 text-sm text-zinc-600">Henter…</div> : null}
      {error ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      {items.length === 0 ? (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600">Ingen kampflytninger afventer.</div>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((it) => {
            const matchTitle = it.current ? `${it.current.homeTeam} – ${it.current.awayTeam}` : `Kamp ${it.kampId}`;
            return (
              <div key={it.id} className="rounded-lg border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-zinc-900">{matchTitle}</div>
                  <Link className="text-sm font-semibold text-[color:var(--brand)] hover:underline" href={`/kamp/${it.kampId}?tab=comments`}>
                    Åbn kamp
                  </Link>
                </div>

                <div className="mt-1 text-sm text-zinc-700">
                  Nuværende: {it.current?.date || "?"}{it.current?.time ? ` kl. ${it.current.time}` : ""}{it.current?.league ? ` · ${it.current.league}` : ""}
                </div>
                <div className="mt-1 text-sm text-zinc-700">
                  Foreslået: {it.proposed.date || "(ingen dato)"}{it.proposed.time ? ` kl. ${it.proposed.time}` : ""}
                </div>
                {it.proposed.note ? <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">Note: {it.proposed.note}</div> : null}

                <div className="mt-2 text-xs text-zinc-600">Oprettet: {fmtDateTimeIso(it.createdAt)} · {it.createdBy}</div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void decide(it.id, "APPROVE")}
                    disabled={decidingId === it.id}
                    className={
                      "rounded-lg px-4 py-2 text-sm font-semibold " +
                      (decidingId === it.id ? "bg-zinc-200 text-zinc-700" : "bg-[color:var(--brand)] text-[var(--brand-foreground)]")
                    }
                  >
                    Godkend
                  </button>
                  <button
                    type="button"
                    onClick={() => void decide(it.id, "REJECT")}
                    disabled={decidingId === it.id}
                    className={
                      "rounded-lg px-4 py-2 text-sm font-semibold " +
                      (decidingId === it.id ? "bg-zinc-200 text-zinc-700" : "bg-zinc-200 text-zinc-800 hover:bg-zinc-300")
                    }
                  >
                    Afvis
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
