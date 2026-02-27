import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

export const dynamic = "force-dynamic";

function normalizeText(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function dateOnlyUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function getCurrentSeasonStartYearFromTaTeams(): Promise<number | null> {
  const agg = await prisma.taTeam.aggregate({ _max: { seasonStartYear: true } });
  const y = agg._max.seasonStartYear;
  return typeof y === "number" && Number.isFinite(y) ? y : null;
}

function canManageHoldRoster(user: any, args: { teamId: string; holdId: string | null }) {
  const teamId = args.teamId;
  const holdId = (args.holdId ?? "").trim();
  return Boolean(
    user?.roles?.some((r: any) => {
      if (r.status !== "APPROVED" || r.role !== "TEAM_LEADER") return false;
      if (r.teamId && String(r.teamId) === teamId) return true;
      if (holdId && r.holdId && String(r.holdId) === holdId) return true;
      return false;
    }),
  );
}

export async function GET(req: Request) {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  await ensureTurneringDomainTables();

  const currentSeasonStartYear = await getCurrentSeasonStartYearFromTaTeams();

  const url = new URL(req.url);
  const teamId = normalizeText(url.searchParams.get("teamId"));
  if (!teamId) {
    return NextResponse.json({ ok: false, error: "MISSING_TEAM" }, { status: 400 });
  }

  const team = await prisma.taTeam.findUnique({
    where: { id: teamId },
    select: { id: true, clubId: true, holdId: true, seasonStartYear: true },
  });
  if (!team) {
    return NextResponse.json({ ok: false, error: "TEAM_NOT_FOUND" }, { status: 404 });
  }

  if (currentSeasonStartYear && team.seasonStartYear !== currentSeasonStartYear) {
    return NextResponse.json({ ok: false, error: "TEAM_NOT_FOUND" }, { status: 404 });
  }

  const holdId = String(team.holdId ?? "").trim() || null;
  if (!canManageHoldRoster(user, { teamId, holdId })) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  const today = dateOnlyUtc(new Date());

  const items = await prisma.taPlayerLicense.findMany({
    where: {
      OR: [
        { clubId: team.clubId },
        {
          doubleClubId: team.clubId,
          OR: [{ doubleClubExpiresAt: null }, { doubleClubExpiresAt: { gt: today } }],
        },
      ],
    },
    orderBy: [{ name: "asc" }, { licenseNumber: "asc" }],
    select: {
      id: true,
      licenseNumber: true,
      name: true,
      birthDate: true,
      gender: true,
      clubId: true,
      doubleClubId: true,
      doubleClubExpiresAt: true,
    },
  });

  return NextResponse.json({ ok: true, clubId: team.clubId, items });
}
