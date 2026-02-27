import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApprovedUser } from "@/lib/auth";
import { TaRole } from "@prisma/client";
import { ensureTaUserRoleMetadataColumns, ensureTurneringDomainTables } from "@/lib/turnering/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ roleAssignmentId: string }> }) {
  try {
    const user = await requireApprovedUser();

    const { roleAssignmentId: rawId } = await params;
    const roleAssignmentId = norm(rawId);
    if (!roleAssignmentId) {
      return NextResponse.json({ message: "Ugyldigt roleAssignmentId." }, { status: 400 });
    }

    await ensureTurneringDomainTables();
    await ensureTaUserRoleMetadataColumns();

    const assignment = await prisma.taUserRole.findUnique({
      where: { id: roleAssignmentId },
      select: { id: true, userId: true, role: true },
    });

    if (!assignment || assignment.userId !== user.id) {
      return NextResponse.json({ message: "Rolle ikke fundet." }, { status: 404 });
    }

    if (assignment.role === TaRole.ADMIN || assignment.role === TaRole.TOURNAMENT_ADMIN || assignment.role === TaRole.REF_ADMIN) {
      return NextResponse.json({ message: "Denne rolle kan ikke slettes her." }, { status: 400 });
    }

    await prisma.taUserRole.delete({ where: { id: assignment.id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/auth/my-roles] DELETE failed", err);
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_APPROVED" ? 403 : 500;
    return NextResponse.json({ message: "Kunne ikke slette rolle." }, { status });
  }
}
