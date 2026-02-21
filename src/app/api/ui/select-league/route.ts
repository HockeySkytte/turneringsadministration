import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const leagueId = String(body?.leagueId ?? "").trim();

  if (!leagueId) {
    return NextResponse.json({ message: "leagueId mangler." }, { status: 400 });
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true },
  });

  if (!league) {
    return NextResponse.json({ message: "Ugyldig liga." }, { status: 400 });
  }

  const firstTeam = await prisma.team.findFirst({
    where: { leagueId },
    orderBy: { name: "asc" },
    select: { id: true },
  });

  const session = await getSession();
  session.selectedLeagueId = leagueId;
  session.selectedTeamId = firstTeam?.id;
  if (!session.userId) session.guestDefaultsApplied = true;
  await session.save();

  return NextResponse.json({ ok: true });
}
