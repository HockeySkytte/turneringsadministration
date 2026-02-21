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

function getApprovableRoles(actor: {
  isAdmin: boolean;
  isTournamentAdmin: boolean;
  isClubLeader: boolean;
  isRefAdmin: boolean;
}): TaRole[] {
  const roles: TaRole[] = [];

  if (actor.isAdmin) {
    roles.push("TOURNAMENT_ADMIN", "REF_ADMIN");
  }
  if (actor.isTournamentAdmin) {
    roles.push("CLUB_LEADER");
  }
  if (actor.isClubLeader) {
    roles.push("TEAM_LEADER", "SECRETARIAT");
  }
  if (actor.isRefAdmin) {
    roles.push("REFEREE");
  }

  return Array.from(new Set(roles));
}

export async function GET(req: Request) {
  const actor = await requireApprovedUser();

  const actorClubIds = actor.roles
    .filter((r: any) => r.role === "CLUB_LEADER" && r.status === "APPROVED" && r.clubId)
    .map((r: any) => String(r.clubId))
    .filter(Boolean);

  const url = new URL(req.url);
  const requestedClubId = String(url.searchParams.get("clubId") ?? "").trim() || null;
  const scopedClubIds = requestedClubId && actorClubIds.includes(requestedClubId)
    ? [requestedClubId]
    : actorClubIds;

  // Important: a user can have multiple approver roles (e.g. TOURNAMENT_ADMIN + CLUB_LEADER).
  // We must show the union of all approvable requests.
  const approvableRoles = getApprovableRoles(actor);
  if (!approvableRoles.length) return NextResponse.json({ ok: true, items: [] });

  const or: any[] = [];

  if (actor.isAdmin) {
    or.push({ role: { in: ["TOURNAMENT_ADMIN", "REF_ADMIN"] } });
  }

  if (actor.isTournamentAdmin) {
    or.push({ role: "CLUB_LEADER" });
  }

  if (actor.isRefAdmin) {
    or.push({ role: "REFEREE" });
  }

  if (actor.isClubLeader && scopedClubIds.length) {
    or.push({
      OR: [
        {
          role: "TEAM_LEADER",
          team: {
            is: {
              clubId: { in: scopedClubIds },
            },
          },
        },
        {
          role: "SECRETARIAT",
          clubId: { in: scopedClubIds },
        },
      ],
    });
  }

  if (!or.length) return NextResponse.json({ ok: true, items: [] });

  const where: any = {
    status: "PENDING",
    OR: or,
  };

  const items = await (prisma as any).taUserRole.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      role: true,
      status: true,
      createdAt: true,
      club: {
        select: {
          id: true,
          name: true,
          clubNo: true,
        },
      },
      team: {
        select: {
          id: true,
          name: true,
          league: true,
          club: {
            select: {
              id: true,
              name: true,
              clubNo: true,
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({ ok: true, items });
}
