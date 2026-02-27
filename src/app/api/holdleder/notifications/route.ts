import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppContext } from "@/lib/appContext";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCurrentSeasonStartYearFromTaTeams(): Promise<number | null> {
  const agg = await prisma.taTeam.aggregate({ _max: { seasonStartYear: true } });
  const y = agg._max.seasonStartYear;
  return typeof y === "number" && Number.isFinite(y) ? y : null;
}

function seasonWindow(startYear: number) {
  const start = new Date(Date.UTC(startYear, 7, 1));
  const end = new Date(Date.UTC(startYear + 1, 6, 31, 23, 59, 59, 999));
  return { start, end };
}

export async function GET() {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  await ensureTurneringDomainTables();

  const approvedLeaderRoles = user.roles.filter((r) => r.status === "APPROVED" && r.role === "TEAM_LEADER");

  const directTeamIds = approvedLeaderRoles
    .map((r) => String((r as any).teamId ?? "").trim())
    .filter(Boolean);

  const holdIdsFromRoles = approvedLeaderRoles
    .map((r) => String((r as any).holdId ?? "").trim())
    .filter(Boolean);

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

  if (allowedHoldIds.length === 0) {
    return NextResponse.json({ ok: true, attentionCount: 0 });
  }

  const currentSeasonStartYear = await getCurrentSeasonStartYearFromTaTeams();
  const window = currentSeasonStartYear ? seasonWindow(currentSeasonStartYear) : null;

  const seasonWhere = window ? ` AND m.date >= $3 AND m.date <= $4` : ``;
  const params = window ? [allowedHoldIds, user.id, window.start, window.end] : [allowedHoldIds, user.id];

  // A match needs attention if:
  // - it has unread comments for this user, OR
  // - it has a move request awaiting this team's response (PENDING_AWAY for away team).
  const rows = (await prisma.$queryRawUnsafe(
    `
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT m.id
        FROM ta_matches m
        JOIN (
          SELECT c."kampId"
          FROM ta_match_comments c
          LEFT JOIN ta_match_comment_reads r
            ON r."kampId" = c."kampId" AND r."userId" = $2
          WHERE c."createdById" <> $2
          GROUP BY c."kampId", r."lastReadAt"
          HAVING MAX(c."createdAt") > COALESCE(r."lastReadAt", 'epoch'::timestamptz)
        ) uc
          ON m."externalId" = uc."kampId"::text
        WHERE (m."homeHoldId" = ANY($1) OR m."awayHoldId" = ANY($1))
          ${seasonWhere}
        GROUP BY m.id

        UNION

        SELECT m.id
        FROM ta_matches m
        JOIN ta_match_move_requests r
          ON m."externalId" = r."kampId"::text
        WHERE r.status = 'PENDING_AWAY'
          AND m."awayHoldId" = ANY($1)
          ${seasonWhere}
        GROUP BY m.id
      ) x;
    `,
    ...(params as any)
  )) as Array<{ count: number }>;

  const attentionCount = Number(rows?.[0]?.count ?? 0) || 0;

  return NextResponse.json({ ok: true, attentionCount });
}
