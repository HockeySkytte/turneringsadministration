"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function norm(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export default function MatchDeleteTabClient({ kampId }: { kampId: number }) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [ack, setAck] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const canDelete = useMemo(() => {
    return ack && norm(confirmText) === String(kampId);
  }, [ack, confirmText, kampId]);

  async function doDelete() {
    setDeleting(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/kamp/delete/${kampId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: norm(confirmText) }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        setError(norm(json?.error) || norm(json?.message) || "Kunne ikke slette kampdata.");
        return;
      }
      const counts = json?.deleted ?? {};
      setStatus(
        `Slettet. Lineups(upload): ${Number(counts.matchUploadLineup ?? 0)}, Events(upload): ${Number(counts.matchUploadEvent ?? 0)}, ` +
          `Spillere(protokol): ${Number(counts.matchProtocolPlayer ?? 0)}, Events(protokol): ${Number(counts.matchProtocolEvent ?? 0)}, ` +
          `Underskrifter: ${Number(counts.matchLineupApproval ?? 0)}, Start: ${Number(counts.matchStart ?? 0)}.`,
      );
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="text-sm font-semibold text-red-900">Advarsel: permanent sletning</div>
        <div className="mt-2 text-sm text-red-900">
          Dette sletter kampdata permanent for kampId <span className="font-semibold">{kampId}</span>:
        </div>
        <ul className="mt-2 list-disc pl-5 text-sm text-red-900">
          <li>Holdlister (upload)</li>
          <li>Events (protokol + upload)</li>
          <li>Underskrifter/godkendelser</li>
          <li>Starttidspunkt</li>
        </ul>
        <div className="mt-3 text-sm text-red-900">
          Kalender/turnerings-kampen slettes ikke; kun indtastet/udført kampdata.
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <label className="flex items-center gap-2 text-sm text-zinc-900">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          Jeg forstår at dette ikke kan fortrydes
        </label>

        <div className="mt-3">
          <div className="text-sm font-semibold text-zinc-900">Skriv kampId for at bekræfte</div>
          <input
            className="mt-2 w-full max-w-xs rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            placeholder={String(kampId)}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            inputMode="numeric"
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={!canDelete || deleting}
            onClick={() => void doDelete()}
            className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {deleting ? "Sletter…" : "Slet Kamp"}
          </button>
          {!canDelete ? <div className="text-sm text-zinc-600">Afkryds + skriv kampId for at aktivere.</div> : null}
        </div>

        {error ? <div className="mt-3 text-sm font-semibold text-red-700">Fejl: {error}</div> : null}
        {status ? <div className="mt-3 rounded-lg border border-zinc-200 bg-green-50 p-3 text-sm text-green-800">{status}</div> : null}
      </div>
    </div>
  );
}
