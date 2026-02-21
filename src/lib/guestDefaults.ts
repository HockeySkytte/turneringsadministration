import { prisma } from "@/lib/prisma";
import type { SessionData } from "@/lib/session";

export const GUEST_DEFAULTS = {
  gender: "MEN" as const,
  ageGroup: "SENIOR" as const,
  leagueName: "Unihoc Floorball Liga Herrer",
  competitionRowName: "Unihoc Floorball Liga Herrer",
  poolName: "Pulje 1",
  teamName: "Alliancen København",
};

export async function ensureGuestDefaults(session: SessionData): Promise<{ changed: boolean }> {
  if (session.userId) return { changed: false };

  // Once a guest has any saved selection, we should not keep forcing defaults.
  // This allows guests to change slicers freely without being overwritten.
  if (session.guestDefaultsApplied) return { changed: false };

  const hasAnySelection = Boolean(
    session.selectedGender ||
      session.selectedAgeGroup ||
      session.selectedCompetitionSeasonStartYear ||
      session.selectedLeagueId ||
      session.selectedTeamId ||
      session.selectedCompetitionRowId ||
      session.selectedCompetitionPoolId ||
      session.selectedCompetitionTeamName
  );

  if (hasAnySelection) {
    session.guestDefaultsApplied = true;
    return { changed: true };
  }

  let changed = false;

  if (!session.selectedGender) {
    session.selectedGender = GUEST_DEFAULTS.gender;
    changed = true;
  }

  if (!session.selectedAgeGroup) {
    session.selectedAgeGroup = GUEST_DEFAULTS.ageGroup;
    changed = true;
  }

  if (!session.selectedCompetitionSeasonStartYear) {
    const currentSeason = await prisma.competitionSeason.findFirst({
      where: { isCurrent: true },
      select: { startYear: true },
    });

    if (currentSeason?.startYear != null) {
      session.selectedCompetitionSeasonStartYear = currentSeason.startYear;
      changed = true;
    }
  }

  // App league + team (for theme/team selection)
  if (!session.selectedLeagueId) {
    const league = await prisma.league.findFirst({
      where: { name: { contains: GUEST_DEFAULTS.leagueName, mode: "insensitive" } },
      select: { id: true },
    });

    if (league?.id) {
      session.selectedLeagueId = league.id;
      changed = true;
    }
  }

  if (!session.selectedTeamId) {
    const team = await prisma.team.findFirst({
      where: {
        name: { contains: GUEST_DEFAULTS.teamName, mode: "insensitive" },
        ...(session.selectedLeagueId ? { leagueId: session.selectedLeagueId } : {}),
      },
      select: { id: true, leagueId: true },
    });

    if (team?.id) {
      session.selectedTeamId = team.id;
      if (!session.selectedLeagueId && team.leagueId) {
        session.selectedLeagueId = team.leagueId;
      }
      changed = true;
    }
  }

  // Competition filters (row/pool/team)
  if (!session.selectedCompetitionRowId && session.selectedCompetitionSeasonStartYear) {
    const season = await prisma.competitionSeason.findFirst({
      where: { startYear: session.selectedCompetitionSeasonStartYear },
      select: { id: true },
    });

    if (season?.id) {
      const row = await prisma.competitionRow.findFirst({
        where: {
          seasonId: season.id,
          gender: session.selectedGender ?? GUEST_DEFAULTS.gender,
          ageGroup: session.selectedAgeGroup ?? GUEST_DEFAULTS.ageGroup,
          name: { contains: GUEST_DEFAULTS.competitionRowName, mode: "insensitive" },
          pools: { some: {} },
        },
        select: { id: true },
      });

      if (row?.id) {
        session.selectedCompetitionRowId = row.id;
        changed = true;
      }
    }
  }

  if (!session.selectedCompetitionPoolId && session.selectedCompetitionRowId) {
    const pool = await prisma.competitionPool.findFirst({
      where: {
        rowId: session.selectedCompetitionRowId,
        name: { contains: GUEST_DEFAULTS.poolName, mode: "insensitive" },
        teams: { some: {} },
      },
      select: { id: true },
    });

    if (pool?.id) {
      session.selectedCompetitionPoolId = pool.id;
      changed = true;
    }
  }

  if (!session.selectedCompetitionTeamName) {
    session.selectedCompetitionTeamName = GUEST_DEFAULTS.teamName;
    changed = true;
  }

  // Mark initialized so we don't overwrite future guest changes.
  session.guestDefaultsApplied = true;
  changed = true;

  // NOTE: Do not call session.save() here. Layouts/server components cannot modify cookies.
  // Persistence is handled by a dedicated Route Handler invoked from the client.
  return { changed };
}
