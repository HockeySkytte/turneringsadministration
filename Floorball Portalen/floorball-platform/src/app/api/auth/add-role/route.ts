import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApprovedUser } from "@/lib/auth";
import { TaRole, TaRoleStatus } from "@prisma/client";
import {
  ensureTaUserRoleMetadataColumns,
  ensureTurneringDomainTables,
} from "@/lib/turnering/db";

function isPrismaUniqueError(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      (err as any).code === "P2002"
  );
}

function parseRole(value: unknown): TaRole | null {
  const v = String(value ?? "").trim().toUpperCase();
  return (Object.values(TaRole) as string[]).includes(v) ? (v as TaRole) : null;
}

export async function POST(req: Request) {
  const user = await requireApprovedUser();
  const body = await req.json().catch(() => null);

  const role = parseRole(body?.role);
  const clubId = String(body?.clubId ?? "").trim() || null;
  const teamId = String(body?.teamId ?? "").trim() || null;

  if (!role) {
    return NextResponse.json({ message: "Vælg venligst en rolle." }, { status: 400 });
  }

  if (role === TaRole.ADMIN || role === TaRole.TOURNAMENT_ADMIN || role === TaRole.REF_ADMIN) {
    return NextResponse.json(
      { message: "Denne rolle kan ikke tilføjes her." },
      { status: 400 }
    );
  }

  await ensureTurneringDomainTables();
  await ensureTaUserRoleMetadataColumns();

  let holdId: string | null = null;

  if (role === TaRole.TEAM_LEADER) {
    if (!teamId) return NextResponse.json({ message: "Vælg et hold." }, { status: 400 });
    const team = await prisma.taTeam.findUnique({ where: { id: teamId }, select: { id: true, holdId: true } });
    if (!team) return NextResponse.json({ message: "Det valgte hold findes ikke." }, { status: 400 });
    holdId = String(team.holdId ?? "").trim() || null;
  }

  const scopeKey =
    role === TaRole.CLUB_LEADER || role === TaRole.SECRETARIAT
      ? clubId
        ? `club:${clubId}`
        : "GLOBAL"
      : role === TaRole.TEAM_LEADER
        ? holdId
          ? `hold:${holdId}`
          : teamId
            ? `team:${teamId}`
            : "GLOBAL"
        : "GLOBAL";

  if (role === TaRole.CLUB_LEADER || role === TaRole.SECRETARIAT) {
    if (!clubId) return NextResponse.json({ message: "Vælg en klub." }, { status: 400 });
    const club = await prisma.taClub.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) return NextResponse.json({ message: "Den valgte klub findes ikke." }, { status: 400 });
  }

  // Extra guard: if a HoldID exists, prevent duplicate TEAM_LEADER requests across leagues.
  if (role === TaRole.TEAM_LEADER && holdId) {
    const existingHold = await prisma.taUserRole.findFirst({
      where: { userId: user.id, role, holdId },
      select: { id: true, status: true },
    });
    if (existingHold) {
      if (existingHold.status === TaRoleStatus.REJECTED) {
        await prisma.taUserRole.update({
          where: { id: existingHold.id },
          data: {
            status: TaRoleStatus.PENDING,
            approvedById: null,
            approvedAt: null,
            teamId,
            holdId,
            scopeKey,
          },
          select: { id: true },
        });
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ message: "Du har allerede denne rolle." }, { status: 409 });
    }
  }

  const existing = await prisma.taUserRole.findFirst({
    where: { userId: user.id, role, scopeKey },
    select: { id: true, status: true },
  });

  if (existing) {
    // Allow re-request if previously rejected (keep id stable).
    if (existing.status === TaRoleStatus.REJECTED) {
      await prisma.taUserRole.update({
        where: { id: existing.id },
        data: {
          status: TaRoleStatus.PENDING,
          approvedById: null,
          approvedAt: null,
          clubId: role === TaRole.CLUB_LEADER || role === TaRole.SECRETARIAT ? clubId : null,
          teamId: role === TaRole.TEAM_LEADER ? teamId : null,
          holdId: role === TaRole.TEAM_LEADER ? holdId : null,
          scopeKey,
        },
        select: { id: true },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ message: "Du har allerede denne rolle." }, { status: 409 });
  }

  try {
    await prisma.taUserRole.create({
      data: {
        userId: user.id,
        role,
        status: TaRoleStatus.PENDING,
        clubId: role === TaRole.CLUB_LEADER || role === TaRole.SECRETARIAT ? clubId : null,
        teamId: role === TaRole.TEAM_LEADER ? teamId : null,
        holdId: role === TaRole.TEAM_LEADER ? holdId : null,
        scopeKey,
      },
      select: { id: true },
    });
  } catch (err) {
    // Handles old DBs still enforcing legacy uniqueness.
    if (isPrismaUniqueError(err)) {
      return NextResponse.json({ message: "Du har allerede denne rolle." }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
