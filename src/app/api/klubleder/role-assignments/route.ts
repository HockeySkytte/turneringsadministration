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

  const items = await (prisma as any).taUserRole.findMany({
    where: {
      OR: [
        {
          role: "TEAM_LEADER",
          team: { is: { clubId: actorClubId } },
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

  return NextResponse.json({ ok: true, actorClubId, items });
}
