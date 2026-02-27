"use client";

import { useEffect, useState } from "react";

type LicenseRequestType = "CREATE" | "UPDATE" | "MOVE" | "DOUBLE_LICENSE";

type PendingLicenseRequest = {
  id: string;
  type: LicenseRequestType;
  status: "PENDING_TA";
  fromClubLabel: string | null;
  targetClubLabel: string | null;
  licenseNumber: number | null;
  licenseName: string | null;
  details?: string | null;
  createdAt: string;
  rejectionReason: string | null;
};

function requestTypeLabel(t: LicenseRequestType) {
  if (t === "CREATE") return "Opret";
  if (t === "UPDATE") return "Ret";
  if (t === "MOVE") return "Flyt";
  return "Dobbeltlicens";
}

function formatDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("da-DK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TurneringSpillerlicensAnmodningerGodkendClient() {
  const [items, setItems] = useState<PendingLicenseRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/turnering/player-license-requests`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || data?.ok !== true) {
        setItems([]);
        setError(data?.message ?? "Kunne ikke hente licensanmodninger.");
        return;
      }
      setItems((data?.items ?? []) as PendingLicenseRequest[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(id: string, decision: "APPROVE" | "REJECT") {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/turnering/player-license-requests/${encodeURIComponent(id)}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || data?.ok !== true) {
        setError(data?.message ?? "Kunne ikke behandle anmodning.");
        return;
      }

      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="text-sm font-semibold text-zinc-900">Godkend licensanmodninger</div>
      <div className="mt-1 text-sm text-zinc-600">Turneringsadmin kan godkende eller afvise licensanmodninger.</div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div>
      ) : null}

      <div className="mt-4 overflow-auto rounded-lg border border-zinc-200">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50">
            <tr>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Type</th>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Oprettet</th>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Fra klub</th>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Til klub</th>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Licens</th>
              <th className="border-b border-zinc-200 px-3 py-2 text-right text-xs font-semibold text-zinc-700"></th>
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
                  Ingen anmodninger.
                </td>
              </tr>
            ) : (
              items.map((r) => (
                <tr key={r.id} className="odd:bg-white even:bg-zinc-50">
                  <td className="border-b border-zinc-100 px-3 py-2 font-medium text-zinc-900">{requestTypeLabel(r.type)}</td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-900">{formatDateTime(r.createdAt)}</td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-900">{r.fromClubLabel ?? ""}</td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-900">{r.targetClubLabel ?? ""}</td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-900">
                    {r.licenseNumber != null
                      ? `${r.licenseNumber}${r.licenseName ? ` – ${r.licenseName}` : ""}`
                      : r.licenseName
                        ? r.licenseName
                        : "(ny licens)"}
                    {r.details ? <div className="mt-1 text-xs text-zinc-600">{r.details}</div> : null}
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void decide(r.id, "APPROVE")}
                        className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] hover:opacity-95 disabled:opacity-50"
                      >
                        Godkend
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void decide(r.id, "REJECT")}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Afvis
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
