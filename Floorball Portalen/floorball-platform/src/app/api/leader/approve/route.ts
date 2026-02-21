import { NextResponse } from "next/server";
import { ApprovalStatus, TeamRole } from "@prisma/client";
import { requireLeader } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const leader = await requireLeader();
  const body = await req.json().catch(() => null);
  const membershipId = String(body?.membershipId ?? "").trim();
  const approve = Boolean(body?.approve);

  if (!membershipId) {
    return NextResponse.json(
      { message: "membershipId mangler." },
      { status: 400 }
    );
  }

  const teamId = leader.activeTeamId;
  if (!teamId) {
    return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });
  }

  const membership = await prisma.teamMembership.findUnique({
    where: { id: membershipId },
  });

  if (!membership || membership.teamId !== teamId) {
    return NextResponse.json(
      { message: "Ugyldig medlemsskab." },
      { status: 404 }
    );
  }

  const allowedRoles = [TeamRole.PLAYER, TeamRole.SUPPORTER] as const;
  if (!allowedRoles.includes(membership.role as (typeof allowedRoles)[number])) {
    return NextResponse.json({ message: "Ugyldig rolle." }, { status: 400 });
  }

  if (membership.status !== ApprovalStatus.PENDING_LEADER) {
    return NextResponse.json(
      { message: "Medlemsskab afventer ikke leder-godkendelse." },
      { status: 409 }
    );
  }

  await prisma.teamMembership.update({
    where: { id: membershipId },
    data: {
      status: approve ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
      approvedById: leader.id,
      approvedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
