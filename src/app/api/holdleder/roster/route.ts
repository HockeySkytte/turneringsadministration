import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";
import { ensureTaRosterTables, ensureTurneringDomainTables } from "@/lib/turnering/db";

export const dynamic = "force-dynamic";

const prismaAny = prisma as any;

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

  const url = new URL(req.url);
  const teamId = normalizeText(url.searchParams.get("teamId"));
  if (!teamId) {
    return NextResponse.json({ ok: false, error: "MISSING_TEAM" }, { status: 400 });
  }

  const team = await prisma.taTeam.findUnique({
    where: { id: teamId },
    select: { id: true, league: true, name: true, holdId: true },
  });
  if (!team) {
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

  const body = (await req.json().catch(() => null)) as any;
  const teamId = normalizeText(body?.teamId);
  if (!teamId) {
    return NextResponse.json({ ok: false, error: "MISSING_TEAM" }, { status: 400 });
  }

  const team = await prisma.taTeam.findUnique({
    where: { id: teamId },
    select: { id: true, league: true, name: true, holdId: true },
  });
  if (!team) {
    return NextResponse.json({ ok: false, error: "TEAM_NOT_FOUND" }, { status: 404 });
  }

  const holdId = String(team.holdId ?? "").trim() || null;

  if (!canManageHoldRoster(user, { teamId, holdId })) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  const rawPlayers = Array.isArray(body?.players) ? body.players : [];
  const rawLeaders = Array.isArray(body?.leaders) ? body.leaders : [];

  const players = rawPlayers
    .slice(0, 60)
    .map((p: any, idx: number) => ({
      rowIndex: idx,
      number: normalizeText(p?.number) || null,
      name: normalizeText(p?.name),
      birthDate: parseDateOnly(p?.birthDate ?? null),
      imageUrl: normalizeText(p?.imageUrl) || null,
    }))
    .filter((p: any) => p.name);

  const leaders = rawLeaders
    .slice(0, 20)
    .map((l: any, idx: number) => ({
      rowIndex: idx,
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
