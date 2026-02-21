"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ClubOption = {
  id: string;
  name: string;
  clubNo: string | null;
};

function formatClubLabel(c: ClubOption) {
  const no = String(c.clubNo ?? "").trim();
  return no ? `${c.name} (${no})` : c.name;
}

export default function KlublederClubPickerClient({
  clubs,
  defaultClubId,
}: {
  clubs: ClubOption[];
  defaultClubId: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const selectedClubId = (sp.get("clubId") ?? defaultClubId ?? "").trim() || "";

  const selectedClub = useMemo(
    () => clubs.find((c) => c.id === selectedClubId) ?? null,
    [clubs, selectedClubId],
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="space-y-1">
        <div className="text-sm font-semibold text-zinc-900">Vælg klub</div>
        <select
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          value={selectedClubId}
          onChange={(e) => {
            const next = e.target.value;
            const nextParams = new URLSearchParams(sp.toString());
            if (next) nextParams.set("clubId", next);
            else nextParams.delete("clubId");
            // Always stay on same tab
            if (!nextParams.get("tab")) nextParams.set("tab", "godkend");
            router.push(`/klubleder?${nextParams.toString()}`);
            router.refresh();
          }}
          disabled={clubs.length === 0}
        >
          {clubs.length === 0 ? <option value="">Ingen klubber</option> : null}
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {formatClubLabel(c)}
            </option>
          ))}
        </select>
      </div>

      {selectedClub ? (
        <div className="mt-3 text-sm text-zinc-600">
          Klub: <span className="font-semibold text-zinc-900">{formatClubLabel(selectedClub)}</span>
        </div>
      ) : null}
    </div>
  );
}
