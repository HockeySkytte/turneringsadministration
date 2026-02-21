"use client";

import { useEffect, useMemo, useState } from "react";

type AuditItem = {
  kampId: number;
  startAt: string | null;
  league: string | null;
  pool: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
};

type AuditResponse = {
  ok: true;
  seasonStartYear: number | null;
  availableSeasonStartYears: number[];
  counts: { kalenderKampIds: number; protocolKampIds: number; missing: number };
  items: AuditItem[];
};

function fmtDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("da-DK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TurneringAuditClient() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [seasonStartYear, setSeasonStartYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (year: number | null) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/turnering/audit-missing-kampe", window.location.origin);
      if (year) url.searchParams.set("seasonStartYear", String(year));
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as AuditResponse;
      setData(json);
      setSeasonStartYear(json.seasonStartYear);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(null);
  }, []);

  const options = useMemo(() => data?.availableSeasonStartYears ?? [], [data]);

  return (
    <div>
      <div className="font-semibold text-zinc-900">Audit: Kampe der mangler i Kalender</div>
      <div className="mt-1 text-sm text-zinc-600">
        Viser kamp-id’s som findes i kampindberetninger (protokol/upload), men ikke findes i Kalenderens
        kampprogram (ta_matches.externalId). Hvis disse mangler, skal de med i Excel → Kampprogram og
        derefter “Publish”.
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <div className="text-xs font-semibold text-zinc-700">Sæson</div>
          <select
            className="mt-1 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
            value={seasonStartYear ?? ""}
            onChange={(e) => setSeasonStartYear(e.target.value ? Number(e.target.value) : null)}
          >
            {options.length ? null : <option value="">(ingen sæsoner)</option>}
            {options.map((y) => (
              <option key={y} value={y}>
                {y}/{y + 1}
              </option>
            ))}
          </select>
        </div>

        <button
          className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-50"
          onClick={() => void load(seasonStartYear)}
          disabled={loading}
        >
          {loading ? "Henter…" : "Opdater"}
        </button>

        {data ? (
          <div className="text-sm text-zinc-700">
            Kalender: <span className="font-semibold">{data.counts.kalenderKampIds}</span> kamp-id’s ·
            Protokol/upload: <span className="font-semibold">{data.counts.protocolKampIds}</span> ·
            Mangler: <span className="font-semibold">{data.counts.missing}</span>
          </div>
        ) : null}
      </div>

      {error ? <div className="mt-3 text-sm text-red-700">Fejl: {error}</div> : null}

      {data && !data.items.length ? (
        <div className="mt-3 text-sm text-zinc-700">Ingen manglende kampe for den valgte sæson.</div>
      ) : null}

      {data && data.items.length ? (
        <div className="mt-4 overflow-auto rounded-lg border border-zinc-200">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                  kampId
                </th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                  Dato/tid
                </th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                  Liga
                </th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                  Pulje
                </th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                  Hjemme
                </th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                  Ude
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.kampId} className="odd:bg-white even:bg-zinc-50/50">
                  <td className="border-b border-zinc-200 px-3 py-2 font-mono text-xs">{it.kampId}</td>
                  <td className="border-b border-zinc-200 px-3 py-2">{fmtDateTime(it.startAt)}</td>
                  <td className="border-b border-zinc-200 px-3 py-2">{it.league ?? "-"}</td>
                  <td className="border-b border-zinc-200 px-3 py-2">{it.pool ?? "-"}</td>
                  <td className="border-b border-zinc-200 px-3 py-2">{it.homeTeam ?? "-"}</td>
                  <td className="border-b border-zinc-200 px-3 py-2">{it.awayTeam ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
