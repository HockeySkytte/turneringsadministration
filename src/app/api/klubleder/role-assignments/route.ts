import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClubLeader } from "@/lib/auth";
import { ensureTaUserRoleMetadataColumns, ensureTurneringDomainTables } from "@/lib/turnering/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actor = await requireClubLeader();
  await ensureTurneringDomainTables();
  await ensureTaUserRoleMetadataColumns();

  const actorClubIds = actor.roles
    .filter((r: any) => r.role === "CLUB_LEADER" && r.status === "APPROVED" && r.clubId)
    .map((r: any) => String(r.clubId))
    .filter(Boolean);

  const url = new URL(req.url);
  const requestedClubId = String(url.searchParams.get("clubId") ?? "").trim() || null;
  const actorClubId = requestedClubId && actorClubIds.includes(requestedClubId)
    ? requestedClubId
    : actorClubIds.length === 1
      ? actorClubIds[0]
      : null;

  if (!actorClubId) {
    return NextResponse.json({ ok: true, actorClubId: null, items: [] });
  }

  const clubHoldIdsRows = await prisma.taTeam.findMany({
    where: { clubId: actorClubId, holdId: { not: null } },
    select: { holdId: true },
  });
  const clubHoldIds = clubHoldIdsRows
    .map((r) => String(r.holdId ?? "").trim())
    .filter(Boolean);

  const teamLeaderWhere: any = {
    role: "TEAM_LEADER",
    OR: [
      { team: { is: { clubId: actorClubId } } },
      { clubId: actorClubId },
      ...(clubHoldIds.length ? [{ holdId: { in: clubHoldIds } }] : []),
    ],
  };

  const items = await (prisma as any).taUserRole.findMany({
    where: {
      OR: [
        {
          ...teamLeaderWhere,
        },
        {
          role: "SECRETARIAT",
          clubId: actorClubId,
        },
      ],
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      role: true,
      status: true,
      createdAt: true,
      holdId: true,
      club: { select: { id: true, name: true, clubNo: true } },
      team: {
        select: {
          id: true,
          name: true,
          league: true,
          club: { select: { id: true, name: true, clubNo: true } },
        },
      },
      user: {
        select: { id: true, username: true, email: true, name: true, createdAt: true },
      },
    },
  });

  const missingTeamHoldIds: string[] = Array.from(
    new Set(
      (items ?? [])
        .filter((i: any) => i?.role === "TEAM_LEADER" && !i?.team && i?.holdId)
        .map((i: any) => String(i.holdId))
        .filter(Boolean)
    )
  );

  if (missingTeamHoldIds.length) {
    const teams = await prisma.taTeam.findMany({
      where: {
        clubId: actorClubId,
        holdId: { in: missingTeamHoldIds },
      },
      select: {
        id: true,
        name: true,
        league: true,
        holdId: true,
        seasonStartYear: true,
        club: { select: { id: true, name: true, clubNo: true } },
      },
      orderBy: [{ seasonStartYear: "desc" }, { name: "asc" }],
    });

    const byHoldId = new Map<string, any>();
    for (const t of teams) {
      const hid = String(t.holdId ?? "").trim();
      if (!hid) continue;
      if (!byHoldId.has(hid)) {
        byHoldId.set(hid, {
          id: t.id,
          name: t.name,
          league: t.league,
          club: t.club,
        });
      }
    }

    const enriched = (items ?? []).map((i: any) => {
      if (i?.role !== "TEAM_LEADER" || i?.team || !i?.holdId) return i;
      const team = byHoldId.get(String(i.holdId));
      return team ? { ...i, team } : i;
    });

    return NextResponse.json({ ok: true, actorClubId, items: enriched });
  }

  return NextResponse.json({ ok: true, actorClubId, items });
}
