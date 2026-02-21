"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Side = "home" | "away" | "events" | null;

type PlayerRow = {
  role: string;
  number: string;
  name: string;
  born: string;
  reserve: string;
  leader: string;
};

type EventRow = {
  period: string;
  time: string;
  side: string;
  number: string;
  goal: string;
  assist: string;
  penalty: string;
  code: string;
};

const EVENT_ROW_COUNT = 50;

function range(n: number): number[] {
  return Array.from({ length: n }, (_v, i) => i);
}

function emptyPlayer(): PlayerRow {
  return { role: "", number: "", name: "", born: "", reserve: "", leader: "" };
}

function emptyEvent(): EventRow {
  return { period: "", time: "", side: "", number: "", goal: "", assist: "", penalty: "", code: "" };
}

function fillArray<T>(n: number, factory: () => T): T[] {
  return Array.from({ length: n }, factory);
}

export default function MatchAdminPanels({
  kampId,
  homeTeam,
  awayTeam,
}: {
  kampId: number;
  homeTeam: string | null;
  awayTeam: string | null;
}) {
  const [open, setOpen] = useState<Side>(null);

  const [playersHome, setPlayersHome] = useState<PlayerRow[]>(() => fillArray(20, emptyPlayer));
  const [playersAway, setPlayersAway] = useState<PlayerRow[]>(() => fillArray(20, emptyPlayer));
  const [events, setEvents] = useState<EventRow[]>(() => fillArray(EVENT_ROW_COUNT, emptyEvent));

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  const homeRows = useMemo(() => range(20), []);
  const awayRows = useMemo(() => range(20), []);
  const eventRows = useMemo(() => range(EVENT_ROW_COUNT), []);

  // Load existing saved protocol once when the admin tools are first used.
  useEffect(() => {
    if (!open) return;
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    let cancelled = false;
    setLoading(true);
    setSaveError(null);

    fetch(`/api/match-data/${kampId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (cancelled) return;

        const nextHome = fillArray(20, emptyPlayer);
        const nextAway = fillArray(20, emptyPlayer);
        const nextEvents = fillArray(EVENT_ROW_COUNT, emptyEvent);

        for (const r of data?.players?.home ?? []) {
          if (typeof r?.rowIndex !== "number") continue;
          if (r.rowIndex < 0 || r.rowIndex >= nextHome.length) continue;
          nextHome[r.rowIndex] = {
            role: String(r.role ?? ""),
            number: String(r.number ?? ""),
            name: String(r.name ?? ""),
            born: String(r.born ?? ""),
            reserve: String(r.reserve ?? ""),
            leader: String(r.leader ?? ""),
          };
        }
        for (const r of data?.players?.away ?? []) {
          if (typeof r?.rowIndex !== "number") continue;
          if (r.rowIndex < 0 || r.rowIndex >= nextAway.length) continue;
          nextAway[r.rowIndex] = {
            role: String(r.role ?? ""),
            number: String(r.number ?? ""),
            name: String(r.name ?? ""),
            born: String(r.born ?? ""),
            reserve: String(r.reserve ?? ""),
            leader: String(r.leader ?? ""),
          };
        }
        for (const r of data?.events ?? []) {
          if (typeof r?.rowIndex !== "number") continue;
          if (r.rowIndex < 0 || r.rowIndex >= nextEvents.length) continue;
          nextEvents[r.rowIndex] = {
            period: String(r.period ?? ""),
            time: String(r.time ?? ""),
            side: String(r.side ?? ""),
            number: String(r.number ?? ""),
            goal: String(r.goal ?? ""),
            assist: String(r.assist ?? ""),
            penalty: String(r.penalty ?? ""),
            code: String(r.code ?? ""),
          };
        }

        setPlayersHome(nextHome);
        setPlayersAway(nextAway);
        setEvents(nextEvents);
      })
      .catch((e) => {
        if (cancelled) return;
        setSaveError(String(e?.message ?? e));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, kampId]);

  // Debounced autosave when data changes (only while a drawer is open).
  useEffect(() => {
    if (!open) return;
    if (!hydratedRef.current) return;

    const t = window.setTimeout(() => {
      setSaving(true);
      setSaveError(null);
      fetch(`/api/match-data/${kampId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playersHome, playersAway, events }),
      })
        .then((r) => {
          if (!r.ok) return r.json().catch(() => null).then((b) => {
            throw new Error(String(b?.message ?? `HTTP ${r.status}`));
          });
        })
        .catch((e) => {
          setSaveError(String(e?.message ?? e));
        })
        .finally(() => {
          setSaving(false);
        });
    }, 600);

    return () => window.clearTimeout(t);
  }, [open, kampId, playersHome, playersAway, events]);

  async function uploadMatch() {
    setUploading(true);
    setUploadMessage(null);
    setUploadError(null);
    try {
      // Ensure we upload the latest edits (autosave is debounced).
      await fetch(`/api/match-data/${kampId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playersHome, playersAway, events }),
      }).then((r) => {
        if (!r.ok)
          return r
            .json()
            .catch(() => null)
            .then((b) => {
              throw new Error(String(b?.message ?? `Kunne ikke gemme før upload (HTTP ${r.status})`));
            });
      });

      const res = await fetch(`/api/match-upload/${kampId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.message ?? `HTTP ${res.status}`));
      }
      const lineupsCount = Number(data?.counts?.lineups ?? 0);
      const eventsCount = Number(data?.counts?.events ?? 0);
      setUploadMessage(`Uploadet: ${lineupsCount} lineups, ${eventsCount} events.`);
    } catch (e) {
      setUploadError(String((e as any)?.message ?? e));
    } finally {
      setUploading(false);
    }
  }

  async function prefillFromLatest(which: "home" | "away") {
    const teamName = which === "home" ? String(homeTeam ?? "").trim() : String(awayTeam ?? "").trim();
    if (!teamName) {
      setPrefillError("Mangler holdnavn for kampen.");
      return;
    }

    setPrefillLoading(true);
    setPrefillError(null);
    try {
      const qp = new URLSearchParams({
        teamName,
        excludeKampId: String(kampId),
      });

      const res = await fetch(`/api/match-roster-latest?${qp.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data?.message ?? `HTTP ${res.status}`));

      const next = fillArray(20, emptyPlayer);
      for (const r of data?.rows ?? []) {
        if (typeof r?.rowIndex !== "number") continue;
        if (r.rowIndex < 0 || r.rowIndex >= next.length) continue;
        next[r.rowIndex] = {
          role: String(r.role ?? ""),
          number: String(r.number ?? ""),
          name: String(r.name ?? ""),
          born: String(r.born ?? ""),
          reserve: String(r.reserve ?? ""),
          leader: String(r.leader ?? ""),
        };
      }

      if (which === "home") setPlayersHome(next);
      else setPlayersAway(next);
    } catch (e) {
      setPrefillError(String((e as any)?.message ?? e));
    } finally {
      setPrefillLoading(false);
    }
  }

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen("home")}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
        >
          Indtast Hjemmehold
        </button>
        <button
          type="button"
          onClick={() => setOpen("away")}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
        >
          Indtast Udehold
        </button>
        <button
          type="button"
          onClick={() => setOpen("events")}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
        >
          Indtast Events
        </button>
        <button
          type="button"
          onClick={uploadMatch}
          disabled={uploading}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
        >
          {uploading ? "Uploader…" : "Upload Kamp"}
        </button>
      </div>

      {uploadMessage || uploadError ? (
        <div className="mt-2 text-xs">
          {uploadMessage ? <div className="text-emerald-700">{uploadMessage}</div> : null}
          {uploadError ? <div className="text-red-600">{uploadError}</div> : null}
        </div>
      ) : null}

      {open === "home" ? (
        <RightDrawer widthClass="w-[min(460px,100%)]" title="Indtast Hjemmehold" onClose={() => setOpen(null)}>
          <StatusLine loading={loading} saving={saving} error={saveError} />
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => prefillFromLatest("home")}
              disabled={prefillLoading}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
            >
              {prefillLoading ? "Henter…" : "Hent seneste"}
            </button>
            {prefillError ? <div className="text-xs text-red-600">{prefillError}</div> : null}
          </div>
          <PlayersTable rows={homeRows} value={playersHome} onChange={setPlayersHome} />
        </RightDrawer>
      ) : null}

      {open === "away" ? (
        <RightDrawer widthClass="w-[min(460px,100%)]" title="Indtast Udehold" onClose={() => setOpen(null)}>
          <StatusLine loading={loading} saving={saving} error={saveError} />
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => prefillFromLatest("away")}
              disabled={prefillLoading}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
            >
              {prefillLoading ? "Henter…" : "Hent seneste"}
            </button>
            {prefillError ? <div className="text-xs text-red-600">{prefillError}</div> : null}
          </div>
          <PlayersTable rows={awayRows} value={playersAway} onChange={setPlayersAway} />
        </RightDrawer>
      ) : null}

      {open === "events" ? (
        <LeftDrawer widthClass="w-[min(620px,100%)]" title="Indtast Events" onClose={() => setOpen(null)}>
          <StatusLine loading={loading} saving={saving} error={saveError} />
          <EventsTable rows={eventRows} kampId={kampId} value={events} onChange={setEvents} />
        </LeftDrawer>
      ) : null}
    </>
  );
}

function StatusLine({
  loading,
  saving,
  error,
}: {
  loading: boolean;
  saving: boolean;
  error: string | null;
}) {
  return (
    <div className="mb-3 flex items-center justify-between text-xs">
      <div className="text-zinc-600">
        {loading ? "Henter…" : saving ? "Gemmer…" : ""}
      </div>
      {error ? <div className="text-red-600">{error}</div> : null}
    </div>
  );
}

function DrawerShell({
  side,
  widthClass,
  title,
  onClose,
  children,
}: {
  side: "left" | "right";
  widthClass: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      <div
        className={
          "absolute top-0 h-full bg-[var(--surface)] text-[var(--surface-foreground)] shadow-2xl " +
          widthClass +
          " " +
          (side === "right" ? "right-0" : "left-0")
        }
      >
        <div className="flex items-center justify-between border-b border-zinc-200 p-4">
          <div className="text-lg font-semibold">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
          >
            Luk
          </button>
        </div>
        <div className="h-[calc(100%-64px)] overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function RightDrawer(props: Omit<Parameters<typeof DrawerShell>[0], "side">) {
  return <DrawerShell side="right" {...props} />;
}

function LeftDrawer(props: Omit<Parameters<typeof DrawerShell>[0], "side">) {
  return <DrawerShell side="left" {...props} />;
}

function PlayersTable({
  rows,
  value,
  onChange,
}: {
  rows: number[];
  value: PlayerRow[];
  onChange: (next: PlayerRow[]) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div>
        <table className="w-full table-fixed text-sm text-zinc-900">
          <thead className="bg-zinc-50 text-[11px] uppercase text-zinc-600">
            <tr>
              <th className="w-[68px] px-2 py-2 text-left">C/G</th>
              <th className="w-[36px] px-2 py-2 text-center">L</th>
              <th className="w-[36px] px-2 py-2 text-center">R</th>
              <th className="w-[56px] px-2 py-2 text-left">Nr.</th>
              <th className="px-2 py-2 text-left">Navn</th>
              <th className="w-[78px] px-2 py-2 text-left">Født</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i} className="hover:bg-zinc-50">
                <td className="px-2 py-2">
                  <select
                    className="w-full rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-sm"
                    value={value[i]?.role ?? ""}
                    onChange={(e) => {
                      const next = value.slice();
                      next[i] = { ...(next[i] ?? emptyPlayer()), role: e.target.value };
                      onChange(next);
                    }}
                  >
                    <option value="">&nbsp;</option>
                    <option value="C">C</option>
                    <option value="G">G</option>
                  </select>
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={String(value[i]?.leader ?? "").toUpperCase() === "L"}
                    onChange={(e) => {
                      const next = value.slice();
                      const cur = next[i] ?? emptyPlayer();
                      next[i] = {
                        ...cur,
                        leader: e.target.checked ? "L" : "",
                        reserve: e.target.checked ? "" : cur.reserve,
                      };
                      onChange(next);
                    }}
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={String(value[i]?.reserve ?? "").toUpperCase() === "R"}
                    onChange={(e) => {
                      const next = value.slice();
                      const cur = next[i] ?? emptyPlayer();
                      next[i] = {
                        ...cur,
                        reserve: e.target.checked ? "R" : "",
                        leader: e.target.checked ? "" : cur.leader,
                      };
                      onChange(next);
                    }}
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    inputMode="numeric"
                    className="w-full rounded-md border border-zinc-300 px-1.5 py-1 text-sm"
                    value={value[i]?.number ?? ""}
                    onChange={(e) => {
                      const next = value.slice();
                      next[i] = { ...(next[i] ?? emptyPlayer()), number: e.target.value };
                      onChange(next);
                    }}
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    className="w-full min-w-0 rounded-md border border-zinc-300 px-1.5 py-1 text-sm"
                    value={value[i]?.name ?? ""}
                    onChange={(e) => {
                      const next = value.slice();
                      next[i] = { ...(next[i] ?? emptyPlayer()), name: e.target.value };
                      onChange(next);
                    }}
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    placeholder="DDMMYY"
                    className="w-full rounded-md border border-zinc-300 px-1.5 py-1 text-sm"
                    value={value[i]?.born ?? ""}
                    onChange={(e) => {
                      const next = value.slice();
                      next[i] = { ...(next[i] ?? emptyPlayer()), born: e.target.value };
                      onChange(next);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EventsTable({
  rows,
  kampId,
  value,
  onChange,
}: {
  rows: number[];
  kampId: number;
  value: EventRow[];
  onChange: (next: EventRow[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-sm text-zinc-600">KampId: {kampId}</div>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div>
          <table className="w-full table-fixed text-sm text-zinc-900">
            <thead className="bg-zinc-50 text-[11px] uppercase text-zinc-600">
              <tr>
                <th className="w-[60px] px-2 py-2 text-left">Periode</th>
                <th className="w-[72px] px-2 py-2 text-left">Tid</th>
                <th className="w-[68px] px-2 py-2 text-left">H/U</th>
                <th className="w-[56px] px-2 py-2 text-left">Nr.</th>
                <th className="w-[56px] px-2 py-2 text-left">Mål</th>
                <th className="w-[64px] px-2 py-2 text-left">Assist</th>
                <th className="w-[76px] px-2 py-2 text-left">Udvisning</th>
                <th className="w-[76px] px-2 py-2 text-left">Kode</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i} className="hover:bg-zinc-50">
                  <td className="px-2 py-2">
                    <select
                      className="w-full rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-sm"
                      value={value[i]?.period ?? ""}
                      onChange={(e) => {
                        const next = value.slice();
                        next[i] = { ...(next[i] ?? emptyEvent()), period: e.target.value };
                        onChange(next);
                      }}
                    >
                      <option value="">&nbsp;</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="OT">OT</option>
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      placeholder="mm:ss"
                      className="w-full rounded-md border border-zinc-300 px-1.5 py-1 text-sm"
                      value={value[i]?.time ?? ""}
                      onChange={(e) => {
                        const next = value.slice();
                        next[i] = { ...(next[i] ?? emptyEvent()), time: e.target.value };
                        onChange(next);
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className="w-full rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-sm"
                      value={value[i]?.side ?? ""}
                      onChange={(e) => {
                        const next = value.slice();
                        next[i] = { ...(next[i] ?? emptyEvent()), side: e.target.value };
                        onChange(next);
                      }}
                    >
                      <option value="">&nbsp;</option>
                      <option value="H">H</option>
                      <option value="U">U</option>
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      inputMode="numeric"
                      className="w-full rounded-md border border-zinc-300 px-1.5 py-1 text-sm"
                      value={value[i]?.number ?? ""}
                      onChange={(e) => {
                        const next = value.slice();
                        next[i] = { ...(next[i] ?? emptyEvent()), number: e.target.value };
                        onChange(next);
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className="w-full rounded-md border border-zinc-300 px-1.5 py-1 text-sm"
                      value={value[i]?.goal ?? ""}
                      onChange={(e) => {
                        const next = value.slice();
                        next[i] = { ...(next[i] ?? emptyEvent()), goal: e.target.value };
                        onChange(next);
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className="w-full rounded-md border border-zinc-300 px-1.5 py-1 text-sm"
                      value={value[i]?.assist ?? ""}
                      onChange={(e) => {
                        const next = value.slice();
                        next[i] = { ...(next[i] ?? emptyEvent()), assist: e.target.value };
                        onChange(next);
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      placeholder="min"
                      className="w-full rounded-md border border-zinc-300 px-1.5 py-1 text-sm"
                      value={value[i]?.penalty ?? ""}
                      onChange={(e) => {
                        const next = value.slice();
                        next[i] = { ...(next[i] ?? emptyEvent()), penalty: e.target.value };
                        onChange(next);
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className="w-full rounded-md border border-zinc-300 px-1.5 py-1 text-sm"
                      value={value[i]?.code ?? ""}
                      onChange={(e) => {
                        const next = value.slice();
                        next[i] = { ...(next[i] ?? emptyEvent()), code: e.target.value };
                        onChange(next);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
