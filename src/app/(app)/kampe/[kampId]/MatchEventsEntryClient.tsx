"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Period = "" | "1" | "2" | "3" | "OT";
type Side = "" | "H" | "U";
type Penalty = "" | "2" | "4" | "2+10";

type EventRow = {
  period: Period;
  time: string; // user input, digits/colon
  side: Side;
  number: string;
  goal: string;
  assist: string;
  penalty: Penalty;
  code: string;
};

type CodesResponse = {
  special: Record<string, string>;
  p2: Record<string, string>;
  p4: Record<string, string>;
};

function range(n: number) {
  return Array.from({ length: n }, (_v, i) => i);
}

function emptyRow(): EventRow {
  return { period: "", time: "", side: "", number: "", goal: "", assist: "", penalty: "", code: "" };
}

function isEmptyRow(r: EventRow): boolean {
  return !(
    r.period || r.time || r.side || r.number || r.goal || r.assist || r.penalty || r.code
  );
}

function snapshotKey(rows: EventRow[]): string {
  // Only non-empty rows; normalize time to digits so mmss vs mm:ss doesn't churn.
  return rows
    .filter((r) => !isEmptyRow(r))
    .map((r) => {
      const t = normalizeDigits(r.time);
      return [r.period, t, r.side, r.number, r.goal, r.assist, r.penalty, r.code].join("|");
    })
    .join("\n");
}

function normalizeDigits(value: string): string {
  return value.replace(/[^0-9]/g, "").slice(0, 4);
}

function formatTimeDisplay(value: string): string {
  const digits = normalizeDigits(value);
  if (!digits) return "";
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function isValidTime(value: string): boolean {
  const digits = normalizeDigits(value);
  if (!digits) return true;
  if (digits.length !== 4) return false;
  const mm = Number.parseInt(digits.slice(0, 2), 10);
  const ss = Number.parseInt(digits.slice(2, 4), 10);
  if (!Number.isFinite(mm) || !Number.isFinite(ss)) return false;
  if (mm < 0 || mm > 59) return false;
  if (ss < 0 || ss > 59) return false;
  return true;
}

function allowedCodes(penalty: Penalty, codes: CodesResponse | null): Array<{ code: string; label: string }> {
  const special = codes?.special ?? {};
  const p2 = codes?.p2 ?? {};
  const p4 = codes?.p4 ?? {};

  if (!penalty) {
    return [
      { code: "", label: "" },
      { code: "401", label: `401 – ${special["401"] ?? "Time out"}` },
      { code: "402", label: `402 – ${special["402"] ?? "Straffeslag"}` },
    ];
  }

  if (penalty === "2") {
    return [{ code: "", label: "" }, ...Object.entries(p2).map(([c, txt]) => ({ code: c, label: `${c} – ${txt}` }))];
  }

  if (penalty === "4") {
    return [{ code: "", label: "" }, ...Object.entries(p4).map(([c, txt]) => ({ code: c, label: `${c} – ${txt}` }))];
  }

  // 2+10
  return [
    { code: "", label: "" },
    { code: "101", label: `101 – ${special["101"] ?? "Dårlig opførsel"}` },
  ];
}

function computeNextScore(rows: EventRow[], idx: number, side: Side): string {
  let h = 0;
  let u = 0;

  for (let i = 0; i < idx; i++) {
    const r = rows[i]!;
    if (!r.goal) continue;
    if (r.side === "H") h++;
    if (r.side === "U") u++;
  }

  if (side === "H") h++;
  if (side === "U") u++;
  return `${h}-${u}`;
}

export default function MatchEventsEntryClient({ kampId }: { kampId: number }) {
  const [rows, setRows] = useState<EventRow[]>(() => [emptyRow()]);
  const [homeNumbers, setHomeNumbers] = useState<string[]>([]);
  const [awayNumbers, setAwayNumbers] = useState<string[]>([]);
  const [codes, setCodes] = useState<CodesResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const serverSnapshotRef = useRef<string>("");
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/kamp/events/${kampId}`, { cache: "no-store" })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (cancelled) return;
        if (!ok || b?.ok !== true) {
          setError(String(b?.error ?? "Kunne ikke hente events."));
          return;
        }

        setHomeNumbers((b?.lineups?.homeNumbers ?? []) as string[]);
        setAwayNumbers((b?.lineups?.awayNumbers ?? []) as string[]);
        setCodes((b?.codes ?? null) as CodesResponse | null);

        const eventsSorted = ([...(b?.events ?? [])] as any[]).sort(
          (a, c) => Number(a?.rowIndex ?? 0) - Number(c?.rowIndex ?? 0),
        );

        const populated: EventRow[] = eventsSorted.map((ev) => ({
          period: (String(ev?.period ?? "") as Period) || "",
          time: String(ev?.time ?? ""),
          side: (String(ev?.side ?? "") as Side) || "",
          number: String(ev?.number ?? ""),
          goal: String(ev?.goal ?? ""),
          assist: String(ev?.assist ?? ""),
          penalty: (String(ev?.penalty ?? "") as Penalty) || "",
          code: String(ev?.code ?? ""),
        }));

        setRows([...(populated.length ? populated : []), emptyRow()]);

        serverSnapshotRef.current = snapshotKey([...(populated.length ? populated : []), emptyRow()]);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String((e as any)?.message ?? e));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [kampId]);

  const rowIndexes = useMemo(() => range(rows.length), [rows.length]);

  function normalizeRows(next: EventRow[]): EventRow[] {
    // Keep exactly one empty row at the end.
    let end = next.length;
    while (end > 0 && isEmptyRow(next[end - 1]!)) end--;
    const trimmed = next.slice(0, end);
    return [...trimmed, emptyRow()];
  }

  function updateRow(idx: number, patch: Partial<EventRow>) {
    setRows((prev) => {
      const next = prev.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      return normalizeRows(next);
    });
  }

  function validateAll(): string | null {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      if (isEmptyRow(r)) continue;
      if (!r.period) return `Række ${i + 1}: Vælg periode.`;
      if (!r.side) return `Række ${i + 1}: Vælg H/U.`;
      if (!isValidTime(r.time)) return `Række ${i + 1}: Tid skal være 4 tal (mmss) og gyldig.`;

      // number required except timeout/straffeslag
      if (r.code !== "401" && r.code !== "402") {
        if (!r.number) return `Række ${i + 1}: Vælg Nr.`;
      }

      // If penalty chosen, code must be chosen (except blank row)
      if (r.penalty && !r.code) return `Række ${i + 1}: Vælg kode.`;
    }
    return null;
  }

  async function upload() {
    setError(null);
    setStatus(null);

    const v = validateAll();
    if (v) {
      setError(v);
      return;
    }

    setSaving(true);
    try {
      const nonEmpty = rows.filter((r) => !isEmptyRow(r));
      const payload = {
        events: nonEmpty.map((r) => ({
          period: r.period,
          time: r.time,
          side: r.side,
          number: r.number,
          goal: r.goal,
          assist: r.assist,
          penalty: r.penalty,
          code: r.code,
        })),
      };

      const res = await fetch(`/api/kamp/events/${kampId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok || b?.ok !== true) {
        setError(String(b?.error ?? "Kunne ikke uploade events."));
        return;
      }

      const res2 = await fetch(`/api/match-upload/${kampId}`, { method: "POST" });
      const b2 = await res2.json().catch(() => ({}));
      if (!res2.ok || b2?.ok !== true) {
        setError(String(b2?.message ?? b2?.error ?? "Events gemt, men upload fejlede."));
        return;
      }

      const countProto = Number(b?.count ?? 0);
      const countUpload = Number(b2?.counts?.events ?? 0);
      setStatus(`Gemt: ${countProto}. Uploadet: ${countUpload}.`);
    } finally {
      setSaving(false);
    }
  }

  // Auto-upload whenever user has entered a valid change.
  useEffect(() => {
    if (loading) return;
    if (saving) return;

    const current = snapshotKey(rows);
    if (!current) return; // nothing to upload
    if (current === serverSnapshotRef.current) return;

    const v = validateAll();
    if (v) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void (async () => {
        await upload();
        // After successful upload() it will have pushed to server.
        // We optimistically sync snapshot so it doesn't re-fire.
        serverSnapshotRef.current = snapshotKey(rows);
      })();
    }, 600);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [rows, loading, saving]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Events</div>
          <div className="mt-1 text-sm text-zinc-600">Indtast events og tryk Upload. Du kan rette mens kampen er live.</div>
        </div>

        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void upload()}
          className="rounded-md bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-60"
        >
          {saving ? "Uploader…" : "Upload"}
        </button>
      </div>

      {error ? <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div> : null}
      {status ? <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">{status}</div> : null}

      <div className="overflow-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-[980px] w-full border-collapse text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-600">
            <tr>
              <th className="px-2 py-2 text-left">PERIODE</th>
              <th className="px-2 py-2 text-left">TID</th>
              <th className="px-2 py-2 text-left">H/U</th>
              <th className="px-2 py-2 text-left">NR.</th>
              <th className="px-2 py-2 text-left">MÅL</th>
              <th className="px-2 py-2 text-left">ASSIST</th>
              <th className="px-2 py-2 text-left">UDVISNING</th>
              <th className="px-2 py-2 text-left">KODE</th>
            </tr>
          </thead>
          <tbody>
            {rowIndexes.map((idx) => {
              const r = rows[idx]!;
              const timeOk = isValidTime(r.time);
              const numbers = r.side === "H" ? homeNumbers : r.side === "U" ? awayNumbers : [];
              const assistOptions = numbers;

              const codesOptions = allowedCodes(r.penalty, codes);
              const currentCode = r.code;

              const goalOption = r.side ? computeNextScore(rows, idx, r.side) : "";

              return (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-zinc-50/40"}>
                  <td className="px-2 py-1">
                    <select
                      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1"
                      value={r.period}
                      onChange={(e) => updateRow(idx, { period: e.target.value as Period })}
                    >
                      <option value=""></option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="OT">OT</option>
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className={
                        "w-full rounded-md border px-2 py-1 " +
                        (timeOk ? "border-zinc-300" : "border-red-400 bg-red-50")
                      }
                      inputMode="numeric"
                      placeholder="mmss"
                      value={formatTimeDisplay(r.time)}
                      onChange={(e) => updateRow(idx, { time: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <select
                      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1"
                      value={r.side}
                      onChange={(e) => {
                        const nextSide = e.target.value as Side;
                        // Reset dependent fields
                        updateRow(idx, { side: nextSide, number: "", assist: "" });
                      }}
                    >
                      <option value=""></option>
                      <option value="H">H</option>
                      <option value="U">U</option>
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <select
                      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1"
                      value={r.number}
                      onChange={(e) => updateRow(idx, { number: e.target.value })}
                      disabled={!r.side}
                    >
                      <option value=""></option>
                      {numbers.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <select
                      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1"
                      value={r.goal}
                      onChange={(e) => updateRow(idx, { goal: e.target.value })}
                      disabled={!r.side}
                    >
                      <option value=""></option>
                      {r.side ? <option value={goalOption}>{goalOption}</option> : null}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <select
                      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1"
                      value={r.assist}
                      onChange={(e) => updateRow(idx, { assist: e.target.value })}
                      disabled={!r.side}
                    >
                      <option value=""></option>
                      {assistOptions.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <select
                      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1"
                      value={r.penalty}
                      onChange={(e) => {
                        const next = e.target.value as Penalty;
                        // Reset code when penalty changes
                        updateRow(idx, { penalty: next, code: "" });
                      }}
                    >
                      <option value=""></option>
                      <option value="2">2</option>
                      <option value="4">4</option>
                      <option value="2+10">2+10</option>
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <select
                      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1"
                      value={r.code}
                      onChange={(e) => updateRow(idx, { code: e.target.value })}
                    >
                      {codesOptions.map((o) => {
                        const label = o.code && o.code === currentCode ? o.code : o.label;
                        return (
                          <option key={o.code || "_"} value={o.code}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loading ? <div className="text-sm text-zinc-600">Henter events…</div> : null}
    </div>
  );
}
