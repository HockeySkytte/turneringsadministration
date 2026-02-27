import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";
import { ensureTaRosterTables, ensureTurneringDomainTables } from "@/lib/turnering/db";

export const dynamic = "force-dynamic";

const prismaAny = prisma as any;

async function getCurrentSeasonStartYearFromTaTeams(): Promise<number | null> {
  const agg = await prisma.taTeam.aggregate({ _max: { seasonStartYear: true } });
  const y = agg._max.seasonStartYear;
  return typeof y === "number" && Number.isFinite(y) ? y : null;
}

function normalizeText(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function parseDateOnly(value: string | null) {
  const v = normalizeText(value);
  if (!v) return null;
  const v2 = v.replace(/\//g, "-");

  // Accept both ISO (yyyy-mm-dd) and Danish (dd-mm-yyyy)
  const iso = v2.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dk = v2.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  let y: number;
  let mo: number;
  let d: number;

  if (iso) {
    y = Number.parseInt(iso[1]!, 10);
    mo = Number.parseInt(iso[2]!, 10);
    d = Number.parseInt(iso[3]!, 10);
  } else if (dk) {
    d = Number.parseInt(dk[1]!, 10);
    mo = Number.parseInt(dk[2]!, 10);
    y = Number.parseInt(dk[3]!, 10);
  } else {
    return null;
  }

  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  const mm = String(mo).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return new Date(`${y}-${mm}-${dd}T00:00:00.000Z`);
}

function dateOnlyUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function normalizeKey(name: string, birthDate: Date): string {
  const n = normalizeText(name).toLowerCase();
  const d = dateOnlyUtc(birthDate).toISOString().slice(0, 10);
  return `${n}|${d}`;
}

function parsePlayerRole(value: unknown): string | null {
  const v = normalizeText(value).toUpperCase();
  if (!v) return null;
  return v === "C" || v === "G" ? v : null;
}

function parseLeaderRole(value: unknown): string | null {
  const v = normalizeText(value);
  if (!v) return null;
  if (v === "Træner" || v === "Assistentræner" || v === "Holdleder") return v;
  return null;
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
  await ensureTaRosterTables();

  const currentSeasonStartYear = await getCurrentSeasonStartYearFromTaTeams();

  const url = new URL(req.url);
  const teamId = normalizeText(url.searchParams.get("teamId"));
  if (!teamId) {
    return NextResponse.json({ ok: false, error: "MISSING_TEAM" }, { status: 400 });
  }

  const team = await prisma.taTeam.findUnique({
    where: { id: teamId },
    select: { id: true, league: true, name: true, holdId: true, clubId: true, seasonStartYear: true },
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

  const roster = await prismaAny.taRoster.findFirst({
    where: holdId ? { holdId } : { teamId },
    include: {
      players: { orderBy: { rowIndex: "asc" } },
      leaders: { orderBy: { rowIndex: "asc" } },
    },
  });

  return NextResponse.json({ ok: true, roster });
}

export async function POST(req: Request) {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  await ensureTurneringDomainTables();
  await ensureTaRosterTables();

  const currentSeasonStartYear = await getCurrentSeasonStartYearFromTaTeams();

  const body = (await req.json().catch(() => null)) as any;
  const teamId = normalizeText(body?.teamId);
  if (!teamId) {
    return NextResponse.json({ ok: false, error: "MISSING_TEAM" }, { status: 400 });
  }

  const team = await prisma.taTeam.findUnique({
    where: { id: teamId },
    select: { id: true, league: true, name: true, holdId: true, clubId: true, seasonStartYear: true },
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

  const rawPlayers = Array.isArray(body?.players) ? body.players : [];
  const rawLeaders = Array.isArray(body?.leaders) ? body.leaders : [];

  const today = dateOnlyUtc(new Date());
  const eligibleLicenses = await prisma.taPlayerLicense.findMany({
    where: {
      OR: [
        { clubId: team.clubId },
        {
          doubleClubId: team.clubId,
          OR: [{ doubleClubExpiresAt: null }, { doubleClubExpiresAt: { gt: today } }],
        },
      ],
    },
    select: { id: true, name: true, birthDate: true },
  });

  const licenseById = new Map<string, { id: string; name: string; birthDate: Date }>();
  const licensesByKey = new Map<string, Array<{ id: string; name: string; birthDate: Date }>>();
  for (const l of eligibleLicenses) {
    licenseById.set(l.id, l);
    const key = normalizeKey(l.name, l.birthDate);
    const list = licensesByKey.get(key) ?? [];
    list.push(l);
    licensesByKey.set(key, list);
  }

  const players = rawPlayers
    .slice(0, 60)
    .map((p: any, idx: number) => {
      const licenseId = normalizeText(p?.licenseId) || null;
      const role = parsePlayerRole(p?.role);
      const number = normalizeText(p?.number) || null;
      const imageUrl = normalizeText(p?.imageUrl) || null;

      if (licenseId) {
        const l = licenseById.get(licenseId);
        if (!l) return null;
        return {
          rowIndex: idx,
          number,
          role,
          licenseId: l.id,
          name: l.name,
          birthDate: dateOnlyUtc(l.birthDate),
          imageUrl,
        };
      }

      const name = normalizeText(p?.name);
      const birthDate = parseDateOnly(p?.birthDate ?? null);
      if (!name || !birthDate) return null;

      const matches = licensesByKey.get(normalizeKey(name, birthDate)) ?? [];
      if (matches.length !== 1) return null;
      const l = matches[0]!;
      return {
        rowIndex: idx,
        number,
        role,
        licenseId: l.id,
        name: l.name,
        birthDate: dateOnlyUtc(l.birthDate),
        imageUrl,
      };
    })
    .filter(Boolean) as Array<{
    rowIndex: number;
    number: string | null;
    role: string | null;
    licenseId: string;
    name: string;
    birthDate: Date;
    imageUrl: string | null;
  }>;

  // Enforce: same license cannot be added twice on the same hold.
  {
    const seen = new Set<string>();
    for (const p of players) {
      const id = String(p.licenseId ?? "").trim();
      if (!id) continue;
      if (seen.has(id)) {
        return NextResponse.json(
          { ok: false, error: "Den samme spiller/licens kan ikke tilføjes flere gange på samme hold." },
          { status: 400 },
        );
      }
      seen.add(id);
    }
  }

  if (rawPlayers.length && players.length !== rawPlayers.slice(0, 60).filter((p: any) => normalizeText(p?.licenseId) || normalizeText(p?.name)).length) {
    return NextResponse.json(
      {
        ok: false,
        error: "Spillere skal vælges fra licenslisten (eller have entydigt match på navn + fødselsdato).",
      },
      { status: 400 },
    );
  }

  const leaders = rawLeaders
    .slice(0, 20)
    .map((l: any, idx: number) => ({
      rowIndex: idx,
      role: parseLeaderRole(l?.role),
      name: normalizeText(l?.name),
      imageUrl: normalizeText(l?.imageUrl) || null,
    }))
    .filter((l: any) => l.name);

  const roster = await prisma.$transaction(async (tx: any) => {
    const upserted = await tx.taRoster.upsert({
      where: holdId ? { holdId } : { teamId },
      create: {
        teamId,
        holdId,
        league: team.league,
        teamName: team.name,
        createdById: user.id,
      },
      update: {
        teamId,
        holdId,
        league: team.league,
        teamName: team.name,
      },
    });

    await tx.taRosterPlayer.deleteMany({ where: { rosterId: upserted.id } });
    await tx.taRosterLeader.deleteMany({ where: { rosterId: upserted.id } });

    if (players.length) {
      await tx.taRosterPlayer.createMany({
        data: players.map((p: any) => ({ ...p, rosterId: upserted.id })),
      });
    }

    if (leaders.length) {
      await tx.taRosterLeader.createMany({
        data: leaders.map((l: any) => ({ ...l, rosterId: upserted.id })),
      });
    }

    return tx.taRoster.findFirst({
      where: { id: upserted.id },
      include: {
        players: { orderBy: { rowIndex: "asc" } },
        leaders: { orderBy: { rowIndex: "asc" } },
      },
    });
  });

  return NextResponse.json({ ok: true, roster });
}

export async function DELETE(req: Request) {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  await ensureTurneringDomainTables();
  await ensureTaRosterTables();

  const url = new URL(req.url);
  const teamId = normalizeText(url.searchParams.get("teamId"));
  if (!teamId) {
    return NextResponse.json({ ok: false, error: "MISSING_TEAM" }, { status: 400 });
  }

  const team = await prisma.taTeam.findUnique({ where: { id: teamId }, select: { holdId: true } });
  const holdId = String(team?.holdId ?? "").trim() || null;

  if (!canManageHoldRoster(user, { teamId, holdId })) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  await prismaAny.taRoster.deleteMany({ where: holdId ? { holdId } : { teamId } });
  return NextResponse.json({ ok: true });
}
