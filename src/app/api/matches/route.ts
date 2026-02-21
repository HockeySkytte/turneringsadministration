import { NextResponse } from "next/server";
import { requireTeamId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { teamId } = await requireTeamId();

  const matches = await prisma.match.findMany({
    where: { teamId },
    orderBy: [{ matchDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      videoUrl: true,
      matchDate: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ teamId, matches });
}
