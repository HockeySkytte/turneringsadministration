"use client";

import { useRouter } from "next/navigation";

export type CompetitionRowOption = {
  id: string;
  name: string;
};

export default function CompetitionRowSlicer({
  rows,
  selectedRowId,
}: {
  rows: CompetitionRowOption[];
  selectedRowId: string | null;
}) {
  const router = useRouter();
  const value = selectedRowId ?? rows[0]?.id ?? "";
  const disabled = rows.length <= 1;

  async function onChange(nextId: string) {
    await fetch("/api/ui/select-competition-row", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowId: nextId }),
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
        disabled={disabled || rows.length === 0}
        onChange={(e) => onChange(e.target.value)}
      >
        {rows.length === 0 ? (
          <option value="">(Ingen ligaer)</option>
        ) : (
          rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
