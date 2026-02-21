"use client";

import { useEffect, useMemo, useState } from "react";

type LatestImport = {
  id: string;
  createdAt: string;
  filename: string | null;
  counts: {
    kampe: number;
    holdliste: number;
    klubliste: number;
  };
  preview: {
    kampe: Array<Record<string, unknown>>;
    holdliste: Array<Record<string, unknown>>;
    klubliste: Array<Record<string, unknown>>;
  };
} | null;

export default function TurneringKampeImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [latest, setLatest] = useState<LatestImport>(null);

  const canUpload = useMemo(() => Boolean(file && !loading), [file, loading]);

  async function loadLatest() {
    setError(null);
    setInfo(null);
    const res = await fetch("/api/turnering/latest-import", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok !== true) {
      setLatest(null);
      return;
    }
    setLatest((data.latest ?? null) as LatestImport);
  }

  useEffect(() => {
    void loadLatest();
  }, []);

  async function upload() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const fd = new FormData();
      fd.set("file", file);

      const res = await fetch("/api/turnering/import-excel", {
        method: "POST",
        body: fd,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        setError(data?.message ?? "Kunne ikke importere Excel.");
        return;
      }

      setFile(null);
      const input = document.getElementById("turnering-import-file") as HTMLInputElement | null;
      if (input) input.value = "";

      await loadLatest();
    } finally {
      setLoading(false);
    }
  }

  async function publishLatest() {
    if (!latest) return;
    if (!confirm("Dette overskriver Kampe/Klubber/Hold i databasen. Fortsæt?") ) return;

    setPublishing(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch("/api/turnering/publish-latest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        const msg = String(data?.message ?? "Kunne ikke uploade til databasen.");
        const dbg = data?.debug ? String(data.debug) : "";
        setError(dbg ? `${msg} (${dbg})` : msg);
        return;
      }

      setInfo(
        `Uploadet. Klubber: ${data?.published?.counts?.klubber ?? "?"}, Hold: ${
          data?.published?.counts?.hold ?? "?"
        }, Kampe: ${data?.published?.counts?.kampe ?? "?"}.`
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm font-semibold text-zinc-900">Import fra Excel</div>
        <div className="mt-1 text-sm text-zinc-600">
          Excel skal indeholde sheets: <span className="font-medium">Kampprogram</span>,{" "}
          <span className="font-medium">Holdliste</span>, <span className="font-medium">Klubliste</span>.
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            id="turnering-import-file"
            type="file"
            accept=".xlsx,.xlsm,.xls"
            className="block w-full text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          <button
            type="button"
            disabled={!canUpload}
            onClick={() => void upload()}
            className="inline-flex items-center justify-center rounded-lg bg-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-50"
          >
            {loading ? "Uploader…" : "Upload"}
          </button>

          <button
            type="button"
            onClick={() => void loadLatest()}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Opdater
          </button>

          <button
            type="button"
            disabled={!latest || publishing || loading}
            onClick={() => void publishLatest()}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
          >
            {publishing ? "Uploader…" : "Overskriv database"}
          </button>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        ) : null}

        {info ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            {info}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Seneste import</div>
            {latest ? (
              <div className="mt-1 text-sm text-zinc-600">
                {new Date(latest.createdAt).toLocaleString("da-DK")} — {latest.filename ?? "(ukendt fil)"}
              </div>
            ) : (
              <div className="mt-1 text-sm text-zinc-600">Ingen import endnu.</div>
            )}
          </div>

          {latest ? (
            <div className="text-right text-sm text-zinc-600">
              <div>Kampe: {latest.counts.kampe}</div>
              <div>Hold: {latest.counts.holdliste}</div>
              <div>Klubber: {latest.counts.klubliste}</div>
            </div>
          ) : null}
        </div>

        {latest ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Preview title="Kampe (preview)" rows={latest.preview.kampe} />
            <Preview title="Holdliste (preview)" rows={latest.preview.holdliste} />
            <Preview title="Klubliste (preview)" rows={latest.preview.klubliste} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Preview({
  title,
  rows,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
}) {
  const headers = Object.keys(rows[0] ?? {});

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="text-xs font-semibold text-zinc-900">{title}</div>
      {rows.length === 0 ? (
        <div className="mt-2 text-xs text-zinc-600">Ingen rækker.</div>
      ) : (
        <div className="mt-2 overflow-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                {headers.slice(0, 6).map((h) => (
                  <th key={h} className="border-b border-zinc-200 px-2 py-1 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((r, idx) => (
                <tr key={idx} className="odd:bg-zinc-50/50">
                  {headers.slice(0, 6).map((h) => (
                    <td key={h} className="border-b border-zinc-100 px-2 py-1 align-top">
                      {String(r[h] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
