"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type LeagueOption = {
  id: string;
  name: string;
};

export default function LeagueSlicer({
  leagues,
  selectedLeagueId,
}: {
  leagues: LeagueOption[];
  selectedLeagueId: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(selectedLeagueId ?? leagues[0]?.id ?? "");
  const disabled = leagues.length <= 1;

  async function onChange(nextId: string) {
    setValue(nextId);
    await fetch("/api/ui/select-league", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueId: nextId }),
    });

    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold">Liga</div>
      <select
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:opacity-70"
        style={{ colorScheme: "light" }}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {leagues.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}
