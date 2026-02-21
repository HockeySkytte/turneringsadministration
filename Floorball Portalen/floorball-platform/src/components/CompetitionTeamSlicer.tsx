"use client";

import { useRouter } from "next/navigation";

export type CompetitionTeamOption = {
  name: string;
};

export default function CompetitionTeamSlicer({
  teams,
  selectedTeamName,
}: {
  teams: CompetitionTeamOption[];
  selectedTeamName: string | null;
}) {
  const router = useRouter();
  const value = selectedTeamName ?? teams[0]?.name ?? "";
  const disabled = teams.length <= 1;

  async function onChange(nextName: string) {
    await fetch("/api/ui/select-competition-team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamName: nextName }),
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
        disabled={disabled || teams.length === 0}
        onChange={(e) => onChange(e.target.value)}
      >
        {teams.length === 0 ? (
          <option value="">&nbsp;</option>
        ) : (
          teams.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
