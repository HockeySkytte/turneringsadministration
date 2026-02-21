import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClubLeader } from "@/lib/auth";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actor = await requireClubLeader();
  await ensureTurneringDomainTables();

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

  if (!actorClubId) return NextResponse.json({ ok: true, actorClubId: null, teams: [] });

  const teams = await prisma.taTeam.findMany({
    where: { clubId: actorClubId },
    select: { id: true, name: true, league: true },
    orderBy: [{ league: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ ok: true, actorClubId, teams });
}
