import { NextResponse } from "next/server";
import { ApprovalStatus, TeamRole } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await requireAdmin();

  const memberships = await prisma.teamMembership.findMany({
    where: { role: TeamRole.LEADER, status: ApprovalStatus.PENDING_ADMIN },
    include: { user: true, team: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    memberships: memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      username: m.user.username,
      teamName: m.team.name,
      createdAt: m.createdAt,
    })),
  });
}
