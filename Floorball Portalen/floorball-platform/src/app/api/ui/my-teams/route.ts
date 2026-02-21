import { NextResponse } from "next/server";
import { ApprovalStatus } from "@prisma/client";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireApprovedUser();

  if (user.isAdmin) {
    const teams = await prisma.team.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      teams,
      activeTeamId: user.activeTeamId ?? null,
      isAdmin: true,
    });
  }

  const teams = user.memberships
    .filter((m) => m.status === ApprovalStatus.APPROVED)
    .map((m) => ({ id: m.team.id, name: m.team.name }));

  // De-dup just in case
  const seen = new Set<string>();
  const unique = teams.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  return NextResponse.json({
    teams: unique,
    activeTeamId: user.activeTeamId ?? null,
    isAdmin: false,
  });
}
