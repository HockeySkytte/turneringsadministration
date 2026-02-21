import { NextResponse } from "next/server";
import { ApprovalStatus, TeamRole } from "@prisma/client";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireApprovedUser();
  const teamId = user.activeTeamId;
  if (!teamId) return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });

  const canPickAllPlayers = user.isAdmin || user.activeRole === TeamRole.LEADER;

  if (!canPickAllPlayers) {
    // Player can only see themselves.
    const me = user as unknown as {
      id: string;
      username: string;
      email: string;
      name?: string | null;
      imageUrl?: string | null;
      position?: string | null;
      birthDate?: Date | null;
    };

    return NextResponse.json({
      ok: true,
      canPickAllPlayers: false,
      players: [
        {
          id: me.id,
          displayName: String(me.name ?? me.username).trim(),
          username: me.username,
          email: me.email,
          imageUrl: me.imageUrl ?? null,
          position: me.position ?? null,
          birthDate: me.birthDate ?? null,
        },
      ],
    });
  }

  const db = prisma as any;

  const players = await db.teamMembership.findMany({
    where: {
      teamId,
      role: TeamRole.PLAYER,
      status: ApprovalStatus.APPROVED,
    },
    select: {
      user: {
        select: { id: true, username: true, email: true, name: true, imageUrl: true, position: true, birthDate: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    ok: true,
    canPickAllPlayers: true,
    players: players
      .map((m: any) => m.user)
      .filter(Boolean)
      .map((u: any) => ({
        id: u.id,
        displayName: (u.name ?? u.username).trim(),
        username: u.username,
        email: u.email,
        imageUrl: u.imageUrl ?? null,
        position: u.position ?? null,
        birthDate: u.birthDate ?? null,
      }))
      .sort((a: any, b: any) => a.displayName.localeCompare(b.displayName, "da-DK")),
  });
}
