import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApprovedUser } from "@/lib/auth";

type TaRole =
  | "ADMIN"
  | "TOURNAMENT_ADMIN"
  | "REF_ADMIN"
  | "CLUB_LEADER"
  | "TEAM_LEADER"
  | "SECRETARIAT"
  | "REFEREE";

function canApprove(
  actor: {
    isAdmin: boolean;
    isTournamentAdmin: boolean;
    isClubLeader: boolean;
    isRefAdmin: boolean;
  },
  role: TaRole
): boolean {
  if (actor.isAdmin && (role === "TOURNAMENT_ADMIN" || role === "REF_ADMIN")) {
    return true;
  }
  if (actor.isTournamentAdmin && role === "CLUB_LEADER") {
    return true;
  }
  if (actor.isClubLeader && (role === "TEAM_LEADER" || role === "SECRETARIAT")) {
    return true;
  }
  if (actor.isRefAdmin && role === "REFEREE") {
    return true;
  }
  return false;
}

export async function POST(req: Request) {
  const actor = await requireApprovedUser();
  const body = await req.json().catch(() => null);

  const actorClubIds = actor.roles
    .filter((r: any) => r.role === "CLUB_LEADER" && r.status === "APPROVED" && r.clubId)
    .map((r: any) => String(r.clubId))
    .filter(Boolean);

  const roleAssignmentId = String(body?.roleAssignmentId ?? "").trim();
  const approve = Boolean(body?.approve);

  if (!roleAssignmentId) {
    return NextResponse.json(
      { message: "roleAssignmentId mangler." },
      { status: 400 }
    );
  }

  const assignment = await (prisma as any).taUserRole.findUnique({
    where: { id: roleAssignmentId },
    select: {
      id: true,
      role: true,
      status: true,
      clubId: true,
      team: {
        select: {
          id: true,
          clubId: true,
        },
      },
    },
  });

  if (!assignment) {
    return NextResponse.json({ message: "Ugyldig anmodning." }, { status: 404 });
  }

  if (assignment.status !== "PENDING") {
    return NextResponse.json(
      { message: "Anmodningen afventer ikke godkendelse." },
      { status: 409 }
    );
  }

  if (!canApprove(actor, assignment.role)) {
    return NextResponse.json({ message: "Ikke autoriseret." }, { status: 403 });
  }

  // Club leaders can only approve within their own club.
  if (
    actor.isClubLeader &&
    (assignment.role === "TEAM_LEADER" || assignment.role === "SECRETARIAT")
  ) {
    if (!actorClubIds.length) {
      return NextResponse.json({ message: "Ikke autoriseret." }, { status: 403 });
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
  }

  await (prisma as any).taUserRole.update({
    where: { id: assignment.id },
    data: {
      status: approve ? "APPROVED" : "REJECTED",
      approvedById: actor.id,
      approvedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
