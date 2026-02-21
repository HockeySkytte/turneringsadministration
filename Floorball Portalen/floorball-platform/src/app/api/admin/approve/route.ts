import { NextResponse } from "next/server";
import { ApprovalStatus, TeamRole } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const membershipId = String(body?.membershipId ?? "").trim();
  const approve = Boolean(body?.approve);

  if (!membershipId) {
    return NextResponse.json(
      { message: "membershipId mangler." },
      { status: 400 }
    );
  }

  const membership = await prisma.teamMembership.findUnique({
    where: { id: membershipId },
  });
  if (!membership || membership.role !== TeamRole.LEADER) {
    return NextResponse.json(
      { message: "Ugyldig medlemsskab." },
      { status: 404 }
    );
  }

  if (membership.status !== ApprovalStatus.PENDING_ADMIN) {
    return NextResponse.json(
      { message: "Medlemsskab afventer ikke admin-godkendelse." },
      { status: 409 }
    );
  }

  await prisma.teamMembership.update({
    where: { id: membershipId },
    data: {
      status: approve ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
      approvedById: admin.id,
      approvedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
