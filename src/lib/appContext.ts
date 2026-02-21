import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { getCompetitionFilterContext } from "@/lib/competitionFilters";
import { ensureGuestDefaults } from "@/lib/guestDefaults";

export const getAppContext = cache(async () => {
  const user = await getCurrentUser();
  const session = await getSession();

  if (!user) {
    await ensureGuestDefaults(session);
  }

  const calendarMode = session.selectedCompetitionCalendarMode ?? "ALL";
  const statsAggregationMode = session.selectedStatsAggregationMode ?? "TOTAL";
  const viewMode = session.selectedViewMode ?? "LIGHT";

  const ctx = await getCompetitionFilterContext({
    user: user
      ? {
          gender: user.gender === "WOMEN" ? "WOMEN" : "MEN",
          ageGroup: user.ageGroup,
          competitionRowId: user.competitionRowId,
          competitionPoolId: user.competitionPoolId,
          competitionTeamName: user.competitionTeamName,
        }
      : null,
    session,
  });

  const leagueName = session.selectedLeagueId
    ? (await prisma.league.findUnique({
        where: { id: session.selectedLeagueId },
        select: { name: true },
      }))?.name ?? null
    : null;

  return {
    user,
    session,
    ctx,
    calendarMode,
    statsAggregationMode,
    viewMode,
    leagueName,
  };
});
