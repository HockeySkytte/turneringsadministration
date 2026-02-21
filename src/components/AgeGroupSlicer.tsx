"use client";

import { useRouter } from "next/navigation";
import type { AgeGroupValue } from "@/lib/ageGroups";

export default function AgeGroupSlicer({
  ageGroups,
  selectedAgeGroup,
}: {
  ageGroups: Array<{ value: AgeGroupValue; label: string }>;
  selectedAgeGroup: AgeGroupValue | null;
}) {
  const router = useRouter();
  const value = selectedAgeGroup ?? ageGroups[0]?.value ?? "";
  const disabled = ageGroups.length <= 1;

  async function onChange(next: AgeGroupValue) {
    await fetch("/api/ui/select-age-group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ageGroup: next }),
    });

    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold">Alder</div>
      <select
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:opacity-70"
        style={{ colorScheme: "light" }}
        value={value}
        onChange={(e) => onChange(e.target.value as AgeGroupValue)}
        disabled={disabled || ageGroups.length === 0}
      >
        {ageGroups.length === 0 ? (
          <option value="">&nbsp;</option>
        ) : (
          ageGroups.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
