import { NextResponse } from "next/server";
import { requireAdmin, requireTeamId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await requireAdmin();
  const { teamId } = await requireTeamId();

  const memberships = await prisma.teamMembership.findMany({
    where: { teamId },
    include: { user: { select: { id: true, username: true, email: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    teamId,
    memberships: memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      username: m.user.username,
      email: m.user.email,
      role: m.role,
      status: m.status,
      createdAt: m.createdAt,
      approvedAt: m.approvedAt,
    })),
  });
}
