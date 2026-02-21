import { NextResponse } from "next/server";
import { ApprovalStatus, TeamRole } from "@prisma/client";
import { requireLeader } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const leader = await requireLeader();

  const teamId = leader.activeTeamId;
  if (!teamId) {
    return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });
  }

  const memberships = await prisma.teamMembership.findMany({
    where: {
      teamId,
      status: ApprovalStatus.PENDING_LEADER,
      role: { in: [TeamRole.PLAYER, TeamRole.SUPPORTER] },
    },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    memberships: memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      username: m.user.username,
      role: m.role,
      createdAt: m.createdAt,
    })),
  });
}
