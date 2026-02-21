import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const approvedLeaderRoles = user.roles.filter(
    (r) => r.status === "APPROVED" && r.role === "TEAM_LEADER"
  );

  const directTeamIds = approvedLeaderRoles
    .map((r) => String((r as any).teamId ?? "").trim())
    .filter(Boolean);

  const holdIdsFromRoles = approvedLeaderRoles
    .map((r) => String((r as any).holdId ?? "").trim())
    .filter(Boolean);

  // Derive HoldID from selected teamIds if role rows are old and missing holdId.
  const holdIdsFromTeams = directTeamIds.length
    ? (
        await prisma.taTeam.findMany({
          where: { id: { in: directTeamIds } },
          select: { holdId: true },
        })
      )
        .map((t) => String(t.holdId ?? "").trim())
        .filter(Boolean)
    : [];

  const allowedHoldIds = Array.from(new Set([...holdIdsFromRoles, ...holdIdsFromTeams]));

  const teams = await prisma.taTeam.findMany({
    where: {
      OR: [
        directTeamIds.length ? { id: { in: directTeamIds } } : undefined,
        allowedHoldIds.length ? { holdId: { in: allowedHoldIds } } : undefined,
      ].filter(Boolean) as any,
    },
    orderBy: [{ league: "asc" }, { name: "asc" }],
    select: { id: true, league: true, name: true, clubId: true, holdId: true },
  });

  return NextResponse.json({ ok: true, teams });
}
