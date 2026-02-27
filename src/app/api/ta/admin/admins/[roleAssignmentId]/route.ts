import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { TaRole, TaRoleStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

function parseStatus(value: unknown): TaRoleStatus | null {
  const v = String(value ?? "").trim().toUpperCase();
  return (Object.values(TaRoleStatus) as string[]).includes(v) ? (v as TaRoleStatus) : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ roleAssignmentId: string }> }
) {
  const actor = await requireAdmin();
  const { roleAssignmentId } = await params;

  const body = await req.json().catch(() => null);
  const status = parseStatus(body?.status);

  if (!status) {
    return NextResponse.json({ message: "Ugyldig status." }, { status: 400 });
  }

  const assignment = await prisma.taUserRole.findUnique({
    where: { id: roleAssignmentId },
    select: { id: true, role: true, userId: true },
  });

  if (!assignment || (assignment.role !== TaRole.TOURNAMENT_ADMIN && assignment.role !== TaRole.REF_ADMIN)) {
    return NextResponse.json({ message: "Ugyldig anmodning." }, { status: 404 });
  }

  await prisma.taUserRole.update({
    where: { id: assignment.id },
    data: {
      status,
      approvedById: status === TaRoleStatus.APPROVED ? actor.id : null,
      approvedAt: status === TaRoleStatus.APPROVED ? new Date() : null,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ roleAssignmentId: string }> }
) {
  const actor = await requireAdmin();
  const { roleAssignmentId } = await params;

  const assignment = await prisma.taUserRole.findUnique({
    where: { id: roleAssignmentId },
    select: { id: true, role: true, userId: true },
  });

  if (!assignment || (assignment.role !== TaRole.TOURNAMENT_ADMIN && assignment.role !== TaRole.REF_ADMIN)) {
    return NextResponse.json({ message: "Ugyldig anmodning." }, { status: 404 });
  }

  await prisma.taUserRole.delete({ where: { id: assignment.id } });

  return NextResponse.json({ ok: true });
}
