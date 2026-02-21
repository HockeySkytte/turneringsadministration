"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAgeGroupLabel, type AgeGroupValue } from "@/lib/ageGroups";

type Gender = "MEN" | "WOMEN";
type AgeGroup = AgeGroupValue;

type CompetitionRowOption = {
  id: string;
  name: string;
  gender: Gender;
  ageGroup: AgeGroup;
};

type CompetitionPoolOption = { id: string; name: string; rowId: string };

type CompetitionPoolTeamOption = {
  poolId: string;
  name: string;
  rank: number | null;
};

export default function IndstillingerClient({
  rows,
  pools,
  poolTeams,
  initialGender,
  initialAgeGroup,
  initialRowId,
  initialPoolId,
  initialTeamName,
}: {
  rows: CompetitionRowOption[];
  pools: CompetitionPoolOption[];
  poolTeams: CompetitionPoolTeamOption[];
  initialGender: Gender;
  initialAgeGroup: AgeGroup | null;
  initialRowId: string | null;
  initialPoolId: string | null;
  initialTeamName: string | null;
}) {
  const router = useRouter();

  const [gender, setGender] = useState<Gender>(initialGender);

  const availableAgeGroups = useMemo(() => {
    const set = new Set<AgeGroup>();
    for (const r of rows) {
      if (r.gender === gender) set.add(r.ageGroup);
    }
    return Array.from(set);
  }, [rows, gender]);

  const [ageGroup, setAgeGroup] = useState<AgeGroup>(
    initialAgeGroup && availableAgeGroups.includes(initialAgeGroup)
      ? initialAgeGroup
      : (availableAgeGroups[0] ?? "SENIOR")
  );

  const filteredRows = useMemo(
    () => rows.filter((r) => r.gender === gender && r.ageGroup === ageGroup),
    [rows, gender, ageGroup]
  );

  const [rowId, setRowId] = useState(
    initialRowId && filteredRows.some((r) => r.id === initialRowId)
      ? initialRowId
      : filteredRows[0]?.id ?? ""
  );

  const filteredPools = useMemo(
    () => pools.filter((p) => p.rowId === rowId),
    [pools, rowId]
  );

  const [poolId, setPoolId] = useState(
    initialPoolId && filteredPools.some((p) => p.id === initialPoolId)
      ? initialPoolId
      : filteredPools[0]?.id ?? ""
  );

  const filteredTeams = useMemo(() => {
    const list = poolTeams.filter((t) => t.poolId === poolId);
    return list.sort((a, b) => {
      const ar = a.rank ?? 999;
      const br = b.rank ?? 999;
      if (ar !== br) return ar - br;
      return a.name.localeCompare(b.name, "da");
    });
  }, [poolTeams, poolId]);

  const [teamName, setTeamName] = useState(
    initialTeamName && filteredTeams.some((t) => t.name === initialTeamName)
      ? initialTeamName
      : filteredTeams[0]?.name ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function onChangeGender(next: Gender) {
    setGender(next);
    const nextAgeGroups = Array.from(
      new Set(rows.filter((r) => r.gender === next).map((r) => r.ageGroup))
    );
    const nextAgeGroup = (nextAgeGroups[0] ?? "SENIOR") as AgeGroup;
    setAgeGroup(nextAgeGroup);

    const nextRows = rows.filter(
      (r) => r.gender === next && r.ageGroup === nextAgeGroup
    );
    const nextRowId = nextRows[0]?.id ?? "";
    setRowId(nextRowId);

    const nextPools = pools.filter((p) => p.rowId === nextRowId);
    const nextPoolId = nextPools[0]?.id ?? "";
    setPoolId(nextPoolId);

    const nextTeams = poolTeams.filter((t) => t.poolId === nextPoolId);
    setTeamName(nextTeams[0]?.name ?? "");
  }

  function onChangeAgeGroup(next: AgeGroup) {
    setAgeGroup(next);
    const nextRows = rows.filter((r) => r.gender === gender && r.ageGroup === next);
    const nextRowId = nextRows[0]?.id ?? "";
    setRowId(nextRowId);

    const nextPools = pools.filter((p) => p.rowId === nextRowId);
    const nextPoolId = nextPools[0]?.id ?? "";
    setPoolId(nextPoolId);

    const nextTeams = poolTeams.filter((t) => t.poolId === nextPoolId);
    setTeamName(nextTeams[0]?.name ?? "");
  }

  function onChangeRow(nextRowId: string) {
    setRowId(nextRowId);
    const nextPools = pools.filter((p) => p.rowId === nextRowId);
    const nextPoolId = nextPools[0]?.id ?? "";
    setPoolId(nextPoolId);
    const nextTeams = poolTeams.filter((t) => t.poolId === nextPoolId);
    setTeamName(nextTeams[0]?.name ?? "");
  }

  function onChangePool(nextPoolId: string) {
    setPoolId(nextPoolId);
    const nextTeams = poolTeams.filter((t) => t.poolId === nextPoolId);
    setTeamName(nextTeams[0]?.name ?? "");
  }

  async function save() {
    setSaving(true);
    setError(null);
    setOk(null);

    try {
      const res = await fetch("/api/auth/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gender,
          ageGroup,
          competitionRowId: rowId,
          competitionPoolId: poolId,
          competitionTeamName: teamName,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;

      if (!res.ok) {
        setError(data?.message ?? "Kunne ikke gemme indstillinger.");
        return;
      }

      setOk("Gemt.");
      router.refresh();
    } catch {
      setError("Kunne ikke gemme indstillinger.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="text-2xl font-semibold">Indstillinger</h1>
      <p className="mt-2 text-sm opacity-80">
        Vælg standardfiltre for Køn, Alder, Liga, Pulje og Hold.
      </p>

      <div className="mt-6 space-y-4 rounded-xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-sm">
        <div>
          <div className="text-sm font-semibold">Køn</div>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            value={gender}
            onChange={(e) => onChangeGender(e.target.value as Gender)}
          >
            <option value="MEN">Mænd</option>
            <option value="WOMEN">Damer</option>
          </select>
        </div>

        <div>
          <div className="text-sm font-semibold">Alder</div>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            value={ageGroup}
            onChange={(e) => onChangeAgeGroup(e.target.value as AgeGroup)}
            disabled={availableAgeGroups.length <= 1}
          >
            {availableAgeGroups.map((g) => (
              <option key={g} value={g}>
                {getAgeGroupLabel(g)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="text-sm font-semibold">Liga</div>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            value={rowId}
            onChange={(e) => onChangeRow(e.target.value)}
            disabled={filteredRows.length <= 1}
          >
            {filteredRows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="text-sm font-semibold">Pulje</div>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            value={poolId}
            onChange={(e) => onChangePool(e.target.value)}
            disabled={filteredPools.length <= 1}
          >
            {filteredPools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="text-sm font-semibold">Hold</div>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            disabled={filteredTeams.length <= 1}
          >
            {filteredTeams.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </div>
        ) : null}

        {ok ? (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
            {ok}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || !rowId || !poolId || !teamName}
            className="rounded-md bg-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
          >
            {saving ? "Gemmer..." : "Gem"}
          </button>
        </div>
      </div>
    </div>
  );
}
