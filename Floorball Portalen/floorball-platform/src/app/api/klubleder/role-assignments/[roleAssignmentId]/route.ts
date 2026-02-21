import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClubLeader } from "@/lib/auth";
import { ensureTaUserRoleMetadataColumns, ensureTurneringDomainTables } from "@/lib/turnering/db";

export const dynamic = "force-dynamic";

async function getActorClubId() {
  const actor = await requireClubLeader();
  const actorClubIds = actor.roles
    .filter((r: any) => r.role === "CLUB_LEADER" && r.status === "APPROVED" && r.clubId)
    .map((r: any) => String(r.clubId))
    .filter(Boolean);
  return { actor, actorClubIds };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ roleAssignmentId: string }> }
) {
  const { actorClubIds } = await getActorClubId();
  await ensureTurneringDomainTables();
  await ensureTaUserRoleMetadataColumns();

  if (!actorClubIds.length) {
    return NextResponse.json({ message: "Ikke autoriseret." }, { status: 403 });
  }

  const { roleAssignmentId } = await params;
  const body = await req.json().catch(() => null);

  const assignment = await (prisma as any).taUserRole.findUnique({
    where: { id: roleAssignmentId },
    select: {
      id: true,
      role: true,
      clubId: true,
      team: { select: { id: true, clubId: true } },
    },
  });

  if (!assignment || (assignment.role !== "TEAM_LEADER" && assignment.role !== "SECRETARIAT")) {
    return NextResponse.json({ message: "Ugyldig anmodning." }, { status: 404 });
  }

  // Ensure scope is within actor club.
  if (assignment.role === "TEAM_LEADER") {
    const assignmentClubId = assignment.team?.clubId ?? null;
    if (!assignmentClubId || !actorClubIds.includes(String(assignmentClubId))) {
      return NextResponse.json({ message: "Ikke autoriseret." }, { status: 403 });
    }

    const teamId = String(body?.teamId ?? "").trim() || null;
    if (!teamId) {
      return NextResponse.json({ message: "Vælg et hold." }, { status: 400 });
    }

    const team = await prisma.taTeam.findUnique({ where: { id: teamId }, select: { id: true, clubId: true } });
    if (!team || !actorClubIds.includes(String(team.clubId))) {
      return NextResponse.json({ message: "Det valgte hold findes ikke." }, { status: 400 });
    }

    await (prisma as any).taUserRole.update({
      where: { id: assignment.id },
      data: { teamId, clubId: null },
    });

    return NextResponse.json({ ok: true });
  }

  // SECRETARIAT: club-scoped (can only stay within own club)
  const clubId = String(body?.clubId ?? "").trim() || null;
  if (!clubId) {
    return NextResponse.json({ message: "Vælg en klub." }, { status: 400 });
  }
  if (!actorClubIds.includes(String(clubId))) {
    return NextResponse.json({ message: "Ikke autoriseret." }, { status: 403 });
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
  const { actorClubIds } = await getActorClubId();
  await ensureTurneringDomainTables();
  await ensureTaUserRoleMetadataColumns();

  if (!actorClubIds.length) {
    return NextResponse.json({ message: "Ikke autoriseret." }, { status: 403 });
  }

  const { roleAssignmentId } = await params;

  const assignment = await (prisma as any).taUserRole.findUnique({
    where: { id: roleAssignmentId },
    select: {
      id: true,
      role: true,
      clubId: true,
      team: { select: { id: true, clubId: true } },
    },
  });

  if (!assignment || (assignment.role !== "TEAM_LEADER" && assignment.role !== "SECRETARIAT")) {
    return NextResponse.json({ message: "Ugyldig anmodning." }, { status: 404 });
  }

  if (assignment.role === "TEAM_LEADER") {
    const assignmentClubId = assignment.team?.clubId ?? null;
    if (!assignmentClubId || !actorClubIds.includes(String(assignmentClubId))) {
      return NextResponse.json({ message: "Ikke autoriseret." }, { status: 403 });
    }
  }

  if (assignment.role === "SECRETARIAT") {
    const assignmentClubId = assignment.clubId ?? null;
    if (!assignmentClubId || !actorClubIds.includes(String(assignmentClubId))) {
      return NextResponse.json({ message: "Ikke autoriseret." }, { status: 403 });
    }
  }

  await (prisma as any).taUserRole.delete({ where: { id: assignment.id } });

  return NextResponse.json({ ok: true });
}
