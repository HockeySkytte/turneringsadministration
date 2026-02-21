"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type TeamOption = {
  id: string;
  name: string;
  logoUrl?: string | null;
};

export default function TeamSlicer({
  teams,
  selectedTeamId,
}: {
  teams: TeamOption[];
  selectedTeamId: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(selectedTeamId ?? teams[0]?.id ?? "");
  const disabled = teams.length <= 1;

  async function onChange(nextId: string) {
    setValue(nextId);
    await fetch("/api/ui/select-team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: nextId }),
    });

    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold">Hold</div>
      <select
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:opacity-70"
        style={{ colorScheme: "light" }}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
