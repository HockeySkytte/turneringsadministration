"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MatchEventsEntryClient from "./MatchEventsEntryClient";

type Venue = "Hjemme" | "Ude";

type LineupRow = {
  venue: Venue;
  rowIndex: number;
  cG: string | null;
  number: string | null;
  name: string | null;
  birthday: string | null;
  leader: string | null;
  reserve: string | null;
};

type AdminLineupResponse = {
  ok: true;
  kampId: number;
  status: string;
  rows: LineupRow[];
};

function norm(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-md bg-[color:var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-foreground)]"
          : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
      }
    >
      {children}
    </button>
  );
}

function makeBaseRows(venue: Venue): LineupRow[] {
  return Array.from({ length: 25 }, (_v, rowIndex) => ({
    venue,
    rowIndex,
    cG: null,
    number: null,
    name: null,
    birthday: null,
    leader: null,
    reserve: null,
  }));
}

function mergeRows(base: LineupRow[], fromDb: LineupRow[]): LineupRow[] {
  const byIdx = new Map<number, LineupRow>();
  for (const r of fromDb) byIdx.set(Number(r.rowIndex), r);
  return base.map((b) => {
    const r = byIdx.get(Number(b.rowIndex));
    if (!r) return b;
    return {
      ...b,
      cG: r.cG ?? null,
      number: r.number ?? null,
      name: r.name ?? null,
      birthday: r.birthday ?? null,
      leader: r.leader ?? null,
      reserve: r.reserve ?? null,
    };
  });
}

function isLeaderRow(r: LineupRow): boolean {
  return norm(r.leader).toUpperCase() === "L";
}

export default function MatchEditTabClient({ kampId }: { kampId: number }) {
  const router = useRouter();
  const [tab, setTab] = useState<"lineups" | "events">("lineups");
  const [venueTab, setVenueTab] = useState<Venue>("Hjemme");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [homeRows, setHomeRows] = useState<LineupRow[]>(() => makeBaseRows("Hjemme"));
  const [awayRows, setAwayRows] = useState<LineupRow[]>(() => makeBaseRows("Ude"));

  const currentRows = venueTab === "Hjemme" ? homeRows : awayRows;
  const setCurrentRows = venueTab === "Hjemme" ? setHomeRows : setAwayRows;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/kamp/admin-lineup/${kampId}`, { cache: "no-store" })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (cancelled) return;
        if (!ok || b?.ok !== true) {
          setError(norm(b?.error ?? "Kunne ikke hente lineup."));
          return;
        }
        setStatus(norm(b?.status ?? ""));

        const rows = (b?.rows ?? []) as LineupRow[];
        setHomeRows(mergeRows(makeBaseRows("Hjemme"), rows.filter((x) => norm((x as any).venue) === "Hjemme")));
        setAwayRows(mergeRows(makeBaseRows("Ude"), rows.filter((x) => norm((x as any).venue) === "Ude")));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(norm((e as any)?.message ?? e));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [kampId]);

  async function saveVenueRows(venue: Venue) {
    setSaving(true);
    setError(null);
    try {
      const rows = venue === "Hjemme" ? homeRows : awayRows;
      const res = await fetch(`/api/kamp/admin-lineup/${kampId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue, rows }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        setError(norm(json?.error) || "Kunne ikke gemme lineup.");
        return;
      }

      const b = json as AdminLineupResponse;
      setStatus(norm(b.status));
      if (venue === "Hjemme") setHomeRows(mergeRows(makeBaseRows("Hjemme"), b.rows));
      else setAwayRows(mergeRows(makeBaseRows("Ude"), b.rows));

      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function updateRow(idx: number, patch: Partial<LineupRow>) {
    setCurrentRows((prev) => prev.map((r) => (r.rowIndex === idx ? { ...r, ...patch } : r)));
  }

  const meaningfulCount = useMemo(() => {
    return currentRows.filter((r) => norm(r.name) || norm(r.number) || norm(r.cG) || norm(r.birthday) || norm(r.leader) || norm(r.reserve)).length;
  }, [currentRows]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm font-semibold text-zinc-900">Ret Kamp (Turneringsadmin)</div>
        <div className="mt-1 text-sm text-zinc-700">Her kan du rette events og holdlister efter kampen er afsluttet.</div>
        {status ? <div className="mt-2 text-xs text-zinc-600">Status: {status}</div> : null}
        {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === "lineups"} onClick={() => setTab("lineups")}>
          Holdlister
        </TabButton>
        <TabButton active={tab === "events"} onClick={() => setTab("events")}>
          Events
        </TabButton>
      </div>

      {tab === "events" ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <MatchEventsEntryClient kampId={kampId} />
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <TabButton active={venueTab === "Hjemme"} onClick={() => setVenueTab("Hjemme")}>
                Hjemme
              </TabButton>
              <TabButton active={venueTab === "Ude"} onClick={() => setVenueTab("Ude")}>
                Ude
              </TabButton>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-sm text-zinc-600">Rækker: {meaningfulCount}</div>
              <button
                type="button"
                disabled={saving || loading}
                onClick={() => void saveVenueRows(venueTab)}
                className="rounded-md bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-60"
              >
                {saving ? "Gemmer…" : "Gem"}
              </button>
            </div>
          </div>

          {loading ? <div className="mt-3 text-sm text-zinc-600">Henter…</div> : null}

          <div className="mt-4 overflow-auto rounded-xl border border-zinc-200">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-600">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Leder</th>
                  <th className="px-3 py-2 text-left">Reserve</th>
                  <th className="px-3 py-2 text-left">C/G</th>
                  <th className="px-3 py-2 text-left">Nr</th>
                  <th className="px-3 py-2 text-left">Navn</th>
                  <th className="px-3 py-2 text-left">Født</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((r) => {
                  const leader = isLeaderRow(r);
                  return (
                    <tr key={`${r.venue}-${r.rowIndex}`} className="border-t border-zinc-100">
                      <td className="px-3 py-2 text-zinc-600">{r.rowIndex}</td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={leader}
                          onChange={(e) =>
                            updateRow(r.rowIndex, {
                              leader: e.target.checked ? "L" : null,
                              reserve: null,
                              cG: null,
                              number: null,
                              birthday: null,
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={norm(r.reserve).toUpperCase() === "R"}
                          disabled={leader}
                          onChange={(e) => updateRow(r.rowIndex, { reserve: e.target.checked ? "R" : null })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1"
                          value={norm(r.cG).toUpperCase()}
                          disabled={leader}
                          onChange={(e) => updateRow(r.rowIndex, { cG: e.target.value || null })}
                        >
                          <option value=""></option>
                          <option value="C">C</option>
                          <option value="G">G</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-24 rounded-md border border-zinc-300 bg-white px-2 py-1"
                          value={leader ? "" : norm(r.number)}
                          disabled={leader}
                          onChange={(e) => updateRow(r.rowIndex, { number: e.target.value || null })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-full min-w-[240px] rounded-md border border-zinc-300 bg-white px-2 py-1"
                          value={norm(r.name)}
                          onChange={(e) => updateRow(r.rowIndex, { name: e.target.value || null })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-32 rounded-md border border-zinc-300 bg-white px-2 py-1"
                          value={leader ? "" : norm(r.birthday)}
                          disabled={leader}
                          onChange={(e) => updateRow(r.rowIndex, { birthday: e.target.value || null })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-zinc-600">Tip: Holdliste-regler (C/G/leder) håndhæves kun ved Holdleder-indsendelse, ikke her.</div>
        </div>
      )}
    </div>
  );
}
