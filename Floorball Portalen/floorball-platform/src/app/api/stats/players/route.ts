import { NextResponse } from "next/server";
import { requireTeamId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { teamId } = await requireTeamId();

  const prismaAny = prisma as any;

  const players = await prismaAny.statsPlayer.findMany({
    where: { teamId },
    orderBy: [{ number: "asc" }, { name: "asc" }],
    select: {
      id: true,
      number: true,
      name: true,
      line: true,
      teamName: true,
      teamColor: true,
      gameId: true,
    },
  });

  return NextResponse.json({ players });
}
