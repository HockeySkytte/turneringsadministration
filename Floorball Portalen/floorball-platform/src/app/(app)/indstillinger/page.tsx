import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getSession } from "@/lib/session";
import IndstillingerClient from "./IndstillingerClient";
import { getCompetitionFilterContext } from "@/lib/competitionFilters";

export default async function IndstillingerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.isSuperuser && !user.isSuperuserApproved && !user.isAdmin) {
    redirect("/afventer");
  }

  const session = await getSession();

  const currentSeason = await prisma.competitionSeason.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });

  const rows = currentSeason
    ? await prisma.competitionRow.findMany({
        where: { seasonId: currentSeason.id, pools: { some: {} } },
        select: { id: true, name: true, gender: true, ageGroup: true },
        orderBy: [{ gender: "asc" }, { name: "asc" }],
      })
    : [];

  const pools = currentSeason
    ? await prisma.competitionPool.findMany({
        where: { row: { seasonId: currentSeason.id }, teams: { some: {} } },
        select: { id: true, name: true, rowId: true },
        orderBy: [{ rowId: "asc" }, { name: "asc" }],
      })
    : [];

  const poolTeams = currentSeason
    ? await prisma.competitionPoolTeam.findMany({
        where: { pool: { row: { seasonId: currentSeason.id } } },
        select: { poolId: true, name: true, rank: true },
        orderBy: [{ poolId: "asc" }, { rank: "asc" }, { name: "asc" }],
      })
    : [];

  const ctx = await getCompetitionFilterContext({
    user: {
      gender: user.gender === "WOMEN" ? "WOMEN" : "MEN",
      ageGroup: user.ageGroup,
      competitionRowId: user.competitionRowId,
      competitionPoolId: user.competitionPoolId,
      competitionTeamName: user.competitionTeamName,
    },
    session,
  });

  const initialGender = ctx.selectedGender === "WOMEN" ? "WOMEN" : "MEN";

  return (
    <IndstillingerClient
      rows={rows}
      pools={pools}
      poolTeams={poolTeams}
      initialGender={initialGender}
      initialAgeGroup={ctx.selectedAgeGroup}
      initialRowId={ctx.selectedRowId}
      initialPoolId={ctx.selectedPoolId}
      initialTeamName={ctx.selectedTeamName}
    />
  );
}
