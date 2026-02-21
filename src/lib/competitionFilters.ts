import { prisma } from "@/lib/prisma";
import type { SessionData } from "@/lib/session";
import { getAgeGroupLabel, type AgeGroupValue, isAgeGroupValue } from "@/lib/ageGroups";

const POKAL_ROW_ID = "__pokalturneringen__";
const POKAL_POOL_ID = "__pokal_pool__";
const POKAL_NAME = "Pokalturneringen";

function isPokalRowName(name: string): boolean {
  return String(name ?? "").trim().toLocaleLowerCase("da-DK").startsWith("pokal");
}

function getCurrentSeasonStartYear(now = new Date()): number {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 7 ? y : y - 1;
}

export type CompetitionFilterContext = {
  seasons: Array<{ startYear: number; label: string; isCurrent: boolean }>;
  selectedSeasonStartYear: number | null;
  selectedSeasonId: string | null;
  selectedSeasonIsCurrent: boolean;

  selectedGender: "MEN" | "WOMEN";
  ageGroups: Array<{ value: AgeGroupValue; label: string }>;
  selectedAgeGroup: AgeGroupValue | null;

  rows: Array<{ id: string; name: string }>;
  selectedRowId: string | null;

  pools: Array<{ id: string; puljeId: number; name: string }>;
  selectedPoolId: string | null;

  // If a virtual pool is selected (e.g. Pokalturneringen), these are the underlying pool IDs to use for queries.
  effectivePoolIds: string[];
  isPokalturnering: boolean;

  poolTeams: Array<{ name: string }>;
  selectedTeamName: string | null;
};

export async function getCompetitionFilterContext({
  user,
  session,
}: {
  user: {
    gender: "MEN" | "WOMEN";
    ageGroup: string;
    competitionRowId: string | null;
    competitionPoolId: string | null;
    competitionTeamName: string | null;
  } | null;
  session: SessionData;
}): Promise<CompetitionFilterContext> {
  const currentStartYear = getCurrentSeasonStartYear();

  const seasonsFromDb = await prisma.competitionSeason.findMany({
    where: {
      OR: [
        { isCurrent: true, startYear: { lte: currentStartYear } },
        {
          rows: {
            some: {
              pools: {
                some: {},
              },
            },
          },
        },
      ],
    },
    select: { id: true, startYear: true, isCurrent: true },
    orderBy: { startYear: "desc" },
  });

  const seasons = seasonsFromDb.map((s) => ({
    startYear: s.startYear,
    label: `${s.startYear}-${s.startYear + 1}`,
    isCurrent: s.isCurrent,
  }));

  const currentSeason = seasonsFromDb.find((s) => s.isCurrent) ?? null;
  const requestedStartYear = session.selectedCompetitionSeasonStartYear;
  const selectedSeasonStartYear =
    typeof requestedStartYear === "number" && seasonsFromDb.some((s) => s.startYear === requestedStartYear)
      ? requestedStartYear
      : currentSeason?.startYear ?? seasonsFromDb[0]?.startYear ?? null;

  const selectedSeasonRecord =
    selectedSeasonStartYear != null
      ? seasonsFromDb.find((s) => s.startYear === selectedSeasonStartYear) ?? null
      : null;

  const selectedSeasonId = selectedSeasonRecord?.id ?? null;
  const selectedSeasonIsCurrent = selectedSeasonRecord?.isCurrent ?? false;

  const selectedGender = (session.selectedGender ?? user?.gender ?? "MEN") as
    | "MEN"
    | "WOMEN";

  const ageGroupSource = selectedSeasonId
    ? await prisma.competitionRow.findMany({
        where: {
          seasonId: selectedSeasonId,
          gender: selectedGender,
          pools: { some: {} },
        },
        select: { ageGroup: true },
      })
    : [];

  const availableAgeGroups = Array.from(
    new Set(ageGroupSource.map((r) => r.ageGroup))
  ).filter((g): g is AgeGroupValue => isAgeGroupValue(String(g)));

  const ageGroups = availableAgeGroups.map((value) => ({
    value,
    label: getAgeGroupLabel(value),
  }));

  const userAgeGroup = user?.ageGroup ?? "";
  let selectedAgeGroup: AgeGroupValue | null =
    (session.selectedAgeGroup ?? (isAgeGroupValue(userAgeGroup) ? userAgeGroup : null)) ?? null;

  if (selectedAgeGroup && !availableAgeGroups.includes(selectedAgeGroup)) {
    selectedAgeGroup = null;
  }
  if (!selectedAgeGroup) {
    selectedAgeGroup = availableAgeGroups[0] ?? null;
  }

  const rows =
    selectedSeasonId && selectedAgeGroup
      ? await prisma.competitionRow.findMany({
          where: {
            seasonId: selectedSeasonId,
            gender: selectedGender,
            ageGroup: selectedAgeGroup,
            pools: { some: {} },
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [];

  const pokalRows = rows.filter((r) => isPokalRowName(r.name));
  const rowsForSlicer = pokalRows.length
    ? [{ id: POKAL_ROW_ID, name: POKAL_NAME }, ...rows.filter((r) => !isPokalRowName(r.name))]
    : rows;

  let selectedRowId: string | null =
    session.selectedCompetitionRowId ?? user?.competitionRowId ?? rowsForSlicer[0]?.id ?? null;

  // Map any previously-selected Pokal row to the virtual Pokalturneringen row.
  if (selectedRowId && pokalRows.some((r) => r.id === selectedRowId)) {
    selectedRowId = POKAL_ROW_ID;
  }

  if (selectedRowId && !rowsForSlicer.some((r) => r.id === selectedRowId)) {
    selectedRowId = rowsForSlicer[0]?.id ?? null;
  }

  const isPokalturnering = selectedRowId === POKAL_ROW_ID;
  const pokalRowIds = pokalRows.map((r) => r.id);

  const pokalUnderlyingPools = isPokalturnering
    ? await prisma.competitionPool.findMany({
        where: { rowId: { in: pokalRowIds } },
        select: { id: true, puljeId: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const pools = isPokalturnering
    ? [{ id: POKAL_POOL_ID, puljeId: 0, name: POKAL_NAME }]
    : selectedRowId
      ? await prisma.competitionPool.findMany({
          where: { rowId: selectedRowId },
          select: { id: true, puljeId: true, name: true },
          orderBy: { name: "asc" },
        })
      : [];

  let selectedPoolId: string | null =
    session.selectedCompetitionPoolId ?? user?.competitionPoolId ?? pools[0]?.id ?? null;

  // Map any previously-selected Pokal pool to the virtual Pokal pool.
  if (isPokalturnering) {
    if (selectedPoolId && pokalUnderlyingPools.some((p) => p.id === selectedPoolId)) {
      selectedPoolId = POKAL_POOL_ID;
    }
    if (!selectedPoolId) selectedPoolId = POKAL_POOL_ID;
  }

  if (selectedPoolId && !pools.some((p) => p.id === selectedPoolId)) {
    selectedPoolId = pools[0]?.id ?? null;
  }

  const effectivePoolIds = isPokalturnering
    ? pokalUnderlyingPools.map((p) => p.id)
    : selectedPoolId && selectedPoolId !== POKAL_POOL_ID
      ? [selectedPoolId]
      : [];

  let poolTeams: Array<{ name: string }> = [];
  if (isPokalturnering) {
    // Unique teams that have played a match in Pokalturneringen (across underlying pools)
    const matches = await prisma.competitionMatch.findMany({
      where: { poolId: { in: effectivePoolIds } },
      select: { homeTeam: true, awayTeam: true },
    });
    const set = new Set<string>();
    for (const m of matches) {
      if (m.homeTeam) set.add(m.homeTeam);
      if (m.awayTeam) set.add(m.awayTeam);
    }
    poolTeams = Array.from(set)
      .sort((a, b) => a.localeCompare(b, "da-DK"))
      .map((name) => ({ name }));
  } else if (selectedPoolId && selectedPoolId !== POKAL_POOL_ID) {
    poolTeams = await prisma.competitionPoolTeam.findMany({
      where: { poolId: selectedPoolId },
      select: { name: true },
      orderBy: [{ rank: "asc" }, { name: "asc" }],
    });
  }

  // If no pool-team table exists (some competitions), derive unique team names from matches.
  let poolTeamsFinal: Array<{ name: string }> = poolTeams;

  if (!isPokalturnering && poolTeamsFinal.length === 0 && effectivePoolIds.length === 1) {
    const matches = await prisma.competitionMatch.findMany({
      where: { poolId: effectivePoolIds[0]! },
      select: { homeTeam: true, awayTeam: true },
    });
    const set = new Set<string>();
    for (const m of matches) {
      if (m.homeTeam) set.add(m.homeTeam);
      if (m.awayTeam) set.add(m.awayTeam);
    }
    const derived = Array.from(set)
      .sort((a, b) => a.localeCompare(b, "da-DK"))
      .map((name) => ({ name }));
    poolTeamsFinal = derived;
  }

  let selectedTeamName: string | null =
    session.selectedCompetitionTeamName ??
    user?.competitionTeamName ??
    poolTeamsFinal[0]?.name ??
    null;

  if (selectedTeamName && !poolTeamsFinal.some((t) => t.name === selectedTeamName)) {
    selectedTeamName = poolTeamsFinal[0]?.name ?? null;
  }

  return {
    seasons,
    selectedSeasonStartYear,
    selectedSeasonId,
    selectedSeasonIsCurrent,
    selectedGender,
    ageGroups,
    selectedAgeGroup,
    rows: rowsForSlicer,
    selectedRowId,
    pools,
    selectedPoolId,
    effectivePoolIds,
    isPokalturnering,
    poolTeams: poolTeamsFinal,
    selectedTeamName,
  };
}
