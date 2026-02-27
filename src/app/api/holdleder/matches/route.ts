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
  // Same season semantics as other TA flows: Aug 1 -> Jul 31
  const start = new Date(Date.UTC(startYear, 7, 1));
  const end = new Date(Date.UTC(startYear + 1, 6, 31, 23, 59, 59, 999));
  return { start, end };
}

function toIntOrNull(value: string | null | undefined): number | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (String(i) !== v && String(n) !== v) return null;
  if (i <= 0) return null;
  return i;
}

export async function GET(req: Request) {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  await ensureTurneringDomainTables();

  const prismaAny: any = prisma;

  const currentSeasonStartYear = await getCurrentSeasonStartYearFromTaTeams();
  const window = currentSeasonStartYear ? seasonWindow(currentSeasonStartYear) : null;

  const url = new URL(req.url);
  const teamId = String(url.searchParams.get("teamId") ?? "").trim();
  if (!teamId) {
    return NextResponse.json({ ok: true, items: [] });
  }

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

  const selectedTeam = await prisma.taTeam.findFirst({
    where: {
      id: teamId,
      ...(currentSeasonStartYear ? { seasonStartYear: currentSeasonStartYear } : null),
      OR: [
        directTeamIds.length ? { id: { in: directTeamIds } } : undefined,
        allowedHoldIds.length ? { holdId: { in: allowedHoldIds } } : undefined,
      ].filter(Boolean) as any,
    },
    select: { id: true, holdId: true },
  });

  if (!selectedTeam) {
    return NextResponse.json({ ok: false, message: "Du har ikke adgang til holdet." }, { status: 403 });
  }

  const holdId = String(selectedTeam.holdId ?? "").trim();
  if (!holdId) {
    return NextResponse.json({ ok: true, items: [] });
  }

  const matches = await prisma.taMatch.findMany({
    where: {
      OR: [{ homeHoldId: holdId }, { awayHoldId: holdId }],
      ...(window ? { date: { gte: window.start, lte: window.end } } : null),
    },
    orderBy: [{ date: "asc" }, { time: "asc" }, { homeTeam: "asc" }],
    select: {
      id: true,
      externalId: true,
      date: true,
      time: true,
      league: true,
      stage: true,
      pool: true,
      venue: true,
      homeTeam: true,
      homeHoldId: true,
      awayTeam: true,
      awayHoldId: true,
    },
  });

  const kampIds = Array.from(
    new Set(matches.map((m) => toIntOrNull(m.externalId)).filter((n): n is number => typeof n === "number"))
  );

  const unreadCommentKampIds = new Set<number>();
  if (kampIds.length) {
    const rows = (await prisma.$queryRawUnsafe(
      `
        SELECT c."kampId" AS "kampId"
        FROM ta_match_comments c
        LEFT JOIN ta_match_comment_reads r
          ON r."kampId" = c."kampId" AND r."userId" = $2
        WHERE c."kampId" = ANY($1)
          AND c."createdById" <> $2
        GROUP BY c."kampId", r."lastReadAt"
        HAVING MAX(c."createdAt") > COALESCE(r."lastReadAt", 'epoch'::timestamptz);
      `,
      kampIds,
      user.id
    )) as Array<{ kampId: number }>;
    for (const r of rows) unreadCommentKampIds.add(Number(r.kampId));
  }

  const pendingMoveRequestKampIds = new Set<number>();
  if (kampIds.length) {
    const rows = await prismaAny.taMatchMoveRequest.findMany({
      where: { kampId: { in: kampIds }, status: "PENDING_AWAY" },
      select: { kampId: true },
      distinct: ["kampId"],
    });
    for (const r of rows) pendingMoveRequestKampIds.add(r.kampId);
  }

  const items = matches.map((m) => {
    const kampId = toIntOrNull(m.externalId);
    const hasUnreadComments = kampId != null ? unreadCommentKampIds.has(kampId) : false;
    const needsMoveRequestResponse =
      kampId != null && pendingMoveRequestKampIds.has(kampId) && String(m.awayHoldId ?? "").trim() === holdId;

    return {
      id: m.id,
      kampId,
      date: m.date ? m.date.toISOString().slice(0, 10) : null,
      time: m.time ? m.time.toISOString().slice(11, 16) : null,
      league: m.league ?? null,
      stage: m.stage ?? null,
      pool: m.pool ?? null,
      venue: m.venue ?? null,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      hasUnreadComments,
      needsMoveRequestResponse,
      needsAttention: hasUnreadComments || needsMoveRequestResponse,
    };
  });

  return NextResponse.json({ ok: true, items });
}
