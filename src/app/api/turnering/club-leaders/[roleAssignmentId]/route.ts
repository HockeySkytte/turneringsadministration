import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTournamentAdmin } from "@/lib/auth";
import { ensureTaUserRoleMetadataColumns, ensureTurneringDomainTables } from "@/lib/turnering/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ roleAssignmentId: string }> }
) {
  await requireTournamentAdmin();
  await ensureTurneringDomainTables();
  await ensureTaUserRoleMetadataColumns();

  const { roleAssignmentId } = await params;
  const body = await req.json().catch(() => null);

  const clubId = String(body?.clubId ?? "").trim() || null;
  if (!clubId) {
    return NextResponse.json({ message: "Vælg en klub." }, { status: 400 });
  }

  const assignment = await (prisma as any).taUserRole.findUnique({
    where: { id: roleAssignmentId },
    select: { id: true, role: true },
  });

  if (!assignment || assignment.role !== "CLUB_LEADER") {
    return NextResponse.json({ message: "Ugyldig anmodning." }, { status: 404 });
  }

  const club = await prisma.taClub.findUnique({ where: { id: clubId }, select: { id: true } });
  if (!club) {
    return NextResponse.json({ message: "Den valgte klub findes ikke." }, { status: 400 });
  }

  await (prisma as any).taUserRole.update({
    where: { id: assignment.id },
    data: { clubId, teamId: null },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ roleAssignmentId: string }> }
) {
  await requireTournamentAdmin();
  await ensureTurneringDomainTables();
  await ensureTaUserRoleMetadataColumns();

  const { roleAssignmentId } = await params;

  const assignment = await (prisma as any).taUserRole.findUnique({
    where: { id: roleAssignmentId },
    select: { id: true, role: true },
  });

  if (!assignment || assignment.role !== "CLUB_LEADER") {
    return NextResponse.json({ message: "Ugyldig anmodning." }, { status: 404 });
  }

  await (prisma as any).taUserRole.delete({ where: { id: assignment.id } });

  return NextResponse.json({ ok: true });
}
