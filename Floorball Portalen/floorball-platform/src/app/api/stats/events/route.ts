import { NextResponse } from "next/server";
import { requireTeamId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { teamId } = await requireTeamId();

  const prismaAny = prisma as any;

  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? 200), 1),
    1000
  );

  const events = await prismaAny.statsEvent.findMany({
    where: { teamId },
    orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      timestamp: true,
      period: true,
      event: true,
      perspective: true,
      strength: true,
      goalieName: true,
      gNo: true,
      teamName: true,
      teamHome: true,
      teamAway: true,
      homePlayersNames: true,
      awayPlayersNames: true,
      p1No: true,
      p1Name: true,
      p2No: true,
      p2Name: true,
      xM: true,
      yM: true,
      videoUrl: true,
      videoTime: true,
      gameId: true,
      gameDate: true,
      competition: true,
      file: { select: { id: true, originalName: true, createdAt: true } },
    },
  });

  return NextResponse.json({ events });
}
