"use client";

import { useRouter } from "next/navigation";

export type GenderOption = {
  id: "MEN" | "WOMEN";
  name: string;
};

const options: GenderOption[] = [
  { id: "MEN", name: "Mænd" },
  { id: "WOMEN", name: "Damer" },
];

export default function GenderSlicer({
  selectedGender,
}: {
  selectedGender: "MEN" | "WOMEN" | null;
}) {
  const router = useRouter();
  const value = selectedGender ?? "MEN";

  async function onChange(next: "MEN" | "WOMEN") {
    await fetch("/api/ui/select-gender", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gender: next }),
    });

    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold">Køn</div>
      <select
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:opacity-70"
        style={{ colorScheme: "light" }}
        value={value}
        onChange={(e) => onChange(e.target.value as "MEN" | "WOMEN")}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
