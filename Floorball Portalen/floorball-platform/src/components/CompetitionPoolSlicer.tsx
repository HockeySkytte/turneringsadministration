"use client";

import { useRouter } from "next/navigation";

export type CompetitionPoolOption = {
  id: string;
  name: string;
};

export default function CompetitionPoolSlicer({
  pools,
  selectedPoolId,
}: {
  pools: CompetitionPoolOption[];
  selectedPoolId: string | null;
}) {
  const router = useRouter();
  const value = selectedPoolId ?? pools[0]?.id ?? "";
  const disabled = pools.length <= 1;

  async function onChange(nextId: string) {
    await fetch("/api/ui/select-competition-pool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poolId: nextId }),
    });

    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold">Pulje</div>
      <select
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:opacity-70"
        style={{ colorScheme: "light" }}
        value={value}
        disabled={disabled || pools.length === 0}
        onChange={(e) => onChange(e.target.value)}
      >
        {pools.length === 0 ? (
          <option value="">&nbsp;</option>
        ) : (
          pools.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
