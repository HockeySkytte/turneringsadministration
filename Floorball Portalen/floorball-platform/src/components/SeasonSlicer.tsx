"use client";

import { useRouter } from "next/navigation";

export type SeasonOption = {
  startYear: number;
  label: string;
  isCurrent: boolean;
};

export default function SeasonSlicer({
  seasons,
  selectedStartYear,
}: {
  seasons: SeasonOption[];
  selectedStartYear: number | null;
}) {
  const router = useRouter();
  const value = selectedStartYear ?? seasons[0]?.startYear ?? "";
  const disabled = seasons.length <= 1;

  async function onChange(next: number) {
    await fetch("/api/ui/select-season", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startYear: next }),
    });

    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold">Sæson</div>
      <select
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:opacity-70"
        style={{ colorScheme: "light" }}
        value={value}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
        disabled={disabled || seasons.length === 0}
      >
        {seasons.length === 0 ? (
          <option value="">&nbsp;</option>
        ) : (
          seasons.map((s) => (
            <option key={s.startYear} value={s.startYear}>
              {s.label}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
