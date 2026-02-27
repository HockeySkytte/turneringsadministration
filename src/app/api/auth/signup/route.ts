import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { TaRole } from "@prisma/client";
import {
  ensureTaUserRoleMetadataColumns,
  ensureTurneringDomainTables,
} from "@/lib/turnering/db";

function parseRole(value: unknown): TaRole | null {
  const v = String(value ?? "").trim().toUpperCase();
  return (Object.values(TaRole) as string[]).includes(v) ? (v as TaRole) : null;
}

function parseClubLeaderTitle(value: unknown): string | null {
  const v = String(value ?? "").trim().toUpperCase();
  if (!v) return null;
  return ["FORMAND", "KASSER", "BESTYRELSESMEDLEM"].includes(v) ? v : null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const role = parseRole(body?.role);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  const name = String(body?.name ?? "").trim() || null;

  const clubId = String(body?.clubId ?? "").trim() || null;
  const teamId = String(body?.teamId ?? "").trim() || null;
  const clubLeaderTitle = parseClubLeaderTitle(body?.clubLeaderTitle);
  const refereeId = String(body?.refereeId ?? "").trim() || null;

  if (!role || !email || !username || !password) {
    return NextResponse.json(
      { message: "Udfyld venligst alle felter." },
      { status: 400 }
    );
  }

  if (role === TaRole.ADMIN) {
    return NextResponse.json(
      { message: "Admin kan ikke oprettes via tilmelding." },
      { status: 400 }
    );
  }

  if (role === TaRole.TOURNAMENT_ADMIN || role === TaRole.REF_ADMIN) {
    return NextResponse.json(
      {
        message:
          "Turneringsadmin og Dommeradmin kan kun oprettes af en Admin.",
      },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { message: "Kodeord skal være mindst 6 tegn." },
      { status: 400 }
    );
  }

  await ensureTurneringDomainTables();
  await ensureTaUserRoleMetadataColumns();

  let holdId: string | null = null;

  // Leader metadata validation (requires that Turnering data is published).
  if (role === TaRole.CLUB_LEADER || role === TaRole.SECRETARIAT) {
    if (!clubId) {
      return NextResponse.json({ message: "Vælg en klub." }, { status: 400 });
    }

    const club = await prisma.taClub.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) {
      return NextResponse.json({ message: "Den valgte klub findes ikke." }, { status: 400 });
    }
  }

  if (role === TaRole.CLUB_LEADER) {
    if (!clubLeaderTitle) {
      return NextResponse.json(
        { message: "Vælg en rolle (Formand/Kassér/Bestyrelsesmedlem)." },
        { status: 400 }
      );
    }
  }

  if (role === TaRole.REFEREE) {
    if (!refereeId) {
      return NextResponse.json(
        { message: "Vælg en dommer fra dommerlisten." },
        { status: 400 }
      );
    }

    const referee = await prisma.taReferee.findUnique({ where: { id: refereeId }, select: { id: true } });
    if (!referee) {
      return NextResponse.json(
        { message: "Den valgte dommer findes ikke i dommerlisten." },
        { status: 400 }
      );
    }
  }

  if (role === TaRole.TEAM_LEADER) {
    if (!teamId) {
      return NextResponse.json({ message: "Vælg et hold." }, { status: 400 });
    }

    const team = await prisma.taTeam.findUnique({ where: { id: teamId }, select: { id: true, holdId: true } });
    if (!team) {
      return NextResponse.json({ message: "Det valgte hold findes ikke." }, { status: 400 });
    }

    holdId = String(team.holdId ?? "").trim() || null;
  }

  const existing = await prisma.taUser.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json(
      { message: "Email eller brugernavn er allerede i brug." },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);

  await prisma.taUser.create({
    data: {
      email,
      username,
      passwordHash,
      name,
      roles: {
        create: {
          role,
          status: "PENDING",
          clubId: role === TaRole.CLUB_LEADER || role === TaRole.SECRETARIAT ? clubId : null,
          teamId: role === TaRole.TEAM_LEADER ? teamId : null,
          holdId: role === TaRole.TEAM_LEADER ? holdId : null,
          clubLeaderTitle: role === TaRole.CLUB_LEADER ? clubLeaderTitle : null,
          refereeId: role === TaRole.REFEREE ? refereeId : null,
          scopeKey:
            role === TaRole.TEAM_LEADER
              ? holdId
                ? `hold:${holdId}`
                : teamId
                  ? `team:${teamId}`
                  : "GLOBAL"
              : role === TaRole.CLUB_LEADER || role === TaRole.SECRETARIAT
                ? clubId
                  ? `club:${clubId}`
                  : "GLOBAL"
                : "GLOBAL",
        },
      },
    },
  });

  return NextResponse.json({ ok: true });
}
