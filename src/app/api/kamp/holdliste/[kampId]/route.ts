import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";

type MatchStatus = "open" | "live" | "closed";

type Venue = "Hjemme" | "Ude";

function norm(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeStatus(s: unknown): MatchStatus | null {
  const v = String(s ?? "").trim().toLowerCase();
  if (v === "open" || v === "live" || v === "closed") return v;
  return null;
}

function deriveStatus(statuses: Array<string | null | undefined>): MatchStatus {
  const normed = statuses.map(normalizeStatus).filter(Boolean) as MatchStatus[];
  if (normed.includes("closed")) return "closed";
  if (normed.includes("live")) return "live";
  return "open";
}

function parseKampId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function getMatchStatus(kampId: number): Promise<MatchStatus> {
  const [protoPlayersStatus, protoEventsStatus, uploadPlayersStatus, uploadEventsStatus] = await Promise.all([
    prisma.matchProtocolPlayer.findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    } as any),
    prisma.matchProtocolEvent.findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    } as any),
    prisma.matchUploadLineup.findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    } as any),
    prisma.matchUploadEvent.findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    } as any),
  ]);

  return deriveStatus([
    ...protoPlayersStatus.map((r: any) => r.status),
    ...protoEventsStatus.map((r: any) => r.status),
    ...uploadPlayersStatus.map((r: any) => r.status),
    ...uploadEventsStatus.map((r: any) => r.status),
  ]);
}

async function resolveMatchTeams(kampId: number) {
  const taMatch = await prisma.taMatch.findFirst({
    where: { externalId: String(kampId) },
    select: {
      date: true,
      league: true,
      pool: true,
      homeTeam: true,
      awayTeam: true,
      homeHoldId: true,
      awayHoldId: true,
    },
  });
  if (!taMatch?.league || !taMatch.homeTeam || !taMatch.awayTeam) return null;

  const homeHoldId = norm((taMatch as any).homeHoldId) || null;
  const awayHoldId = norm((taMatch as any).awayHoldId) || null;

  // Fallback for legacy rows: if match doesn't have holdIds, resolve side teamIds by (league + name).
  let homeTeamId: string | null = null;
  let awayTeamId: string | null = null;
  if (!homeHoldId || !awayHoldId) {
    const [home, away] = await Promise.all([
      prisma.taTeam.findFirst({
        where: { league: taMatch.league, name: taMatch.homeTeam },
        select: { id: true },
      }),
      prisma.taTeam.findFirst({
        where: { league: taMatch.league, name: taMatch.awayTeam },
        select: { id: true },
      }),
    ]);
    homeTeamId = home?.id ?? null;
    awayTeamId = away?.id ?? null;
  }

  return {
    date: taMatch.date ?? null,
    liga: taMatch.league ?? "",
    pulje: taMatch.pool ?? "",
    homeHoldId,
    awayHoldId,
    homeTeamId,
    awayTeamId,
  };
}

function venueFromHoldId(meta: { homeHoldId: string | null; awayHoldId: string | null }, holdId: string): Venue | null {
  if (meta.homeHoldId && meta.homeHoldId === holdId) return "Hjemme";
  if (meta.awayHoldId && meta.awayHoldId === holdId) return "Ude";
  return null;
}

function venueFromTeamId(meta: { homeTeamId: string | null; awayTeamId: string | null }, teamId: string): Venue | null {
  if (meta.homeTeamId && meta.homeTeamId === teamId) return "Hjemme";
  if (meta.awayTeamId && meta.awayTeamId === teamId) return "Ude";
  return null;
}

async function holdIdFromTeamId(teamId: string): Promise<string | null> {
  const team = await prisma.taTeam.findUnique({ where: { id: teamId }, select: { holdId: true } });
  const holdId = norm((team as any)?.holdId);
  return holdId || null;
}

function userIsTeamLeaderFor(user: any, args: { teamId: string; holdId: string | null }): boolean {
  return Boolean(
    user?.roles?.some((r: any) => {
      if (r?.status !== "APPROVED" || r?.role !== "TEAM_LEADER") return false;
      if (args.holdId && r?.holdId && norm(r.holdId) === args.holdId) return true;
      if (r?.teamId && norm(r.teamId) === args.teamId) return true;
      return false;
    }),
  );
}

function pickRole(value: unknown): "C" | "G" | "" {
  const v = norm(value).toUpperCase();
  if (v === "C" || v === "G") return v;
  return "";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ kampId: string }> },
) {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { kampId: raw } = await params;
  const kampId = parseKampId(raw);
  if (!kampId) {
    return NextResponse.json({ ok: false, error: "INVALID_KAMP" }, { status: 400 });
  }

  const url = new URL(req.url);
  const teamId = norm(url.searchParams.get("teamId"));
  if (!teamId) {
    return NextResponse.json({ ok: false, error: "MISSING_TEAM" }, { status: 400 });
  }

  const meta = await resolveMatchTeams(kampId);
  if (!meta) {
    return NextResponse.json({ ok: false, error: "MATCH_NOT_FOUND" }, { status: 404 });
  }

  const holdId = await holdIdFromTeamId(teamId);
  const venue = holdId ? venueFromHoldId(meta, holdId) : null;
  const venueFallback = venue ?? venueFromTeamId(meta, teamId);
  const effectiveVenue = venueFallback;

  if (!effectiveVenue) {
    return NextResponse.json({ ok: false, error: "TEAM_NOT_IN_MATCH" }, { status: 400 });
  }

  if (!userIsTeamLeaderFor(user, { teamId, holdId })) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  const approved = Boolean(
    await (prisma as any).matchLineupApproval?.findFirst({
      where: { kampId, venue: effectiveVenue },
      select: { id: true },
    }),
  );

  const rows = await prisma.matchUploadLineup.findMany({
    where: { kampId, venue: effectiveVenue },
    orderBy: { rowIndex: "asc" },
    select: {
      rowIndex: true,
      cG: true,
      number: true,
      name: true,
      birthday: true,
      leader: true,
      reserve: true,
    } as any,
  });

  return NextResponse.json({ ok: true, venue: effectiveVenue, approved, rows });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ kampId: string }> },
) {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { kampId: raw } = await params;
  const kampId = parseKampId(raw);
  if (!kampId) {
    return NextResponse.json({ ok: false, error: "INVALID_KAMP" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as any;
  const teamId = norm(body?.teamId);
  if (!teamId) {
    return NextResponse.json({ ok: false, error: "MISSING_TEAM" }, { status: 400 });
  }

  const meta = await resolveMatchTeams(kampId);
  if (!meta) {
    return NextResponse.json({ ok: false, error: "MATCH_NOT_FOUND" }, { status: 404 });
  }

  const holdId = await holdIdFromTeamId(teamId);
  const venue = holdId ? venueFromHoldId(meta, holdId) : null;
  const venueFallback = venue ?? venueFromTeamId(meta, teamId);
  const effectiveVenue = venueFallback;

  if (!effectiveVenue) {
    return NextResponse.json({ ok: false, error: "TEAM_NOT_IN_MATCH" }, { status: 400 });
  }

  if (!userIsTeamLeaderFor(user, { teamId, holdId })) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  const existingApproval = await (prisma as any).matchLineupApproval?.findFirst({
    where: { kampId, venue: effectiveVenue },
    select: { id: true },
  });
  if (existingApproval) {
    return NextResponse.json({ ok: false, error: "LINEUP_APPROVED" }, { status: 409 });
  }

  const status = await getMatchStatus(kampId);
  if (status === "closed") {
    return NextResponse.json({ ok: false, error: "MATCH_LOCKED", status }, { status: 409 });
  }

  const rawPlayers = Array.isArray(body?.players) ? body.players : [];
  const rawLeaders = Array.isArray(body?.leaders) ? body.leaders : [];

  if (rawPlayers.length > 20) {
    return NextResponse.json({ ok: false, error: "TOO_MANY_PLAYERS" }, { status: 400 });
  }

  if (rawLeaders.length > 5) {
    return NextResponse.json({ ok: false, error: "TOO_MANY_LEADERS" }, { status: 400 });
  }

  const players = rawPlayers
    .slice(0, 20)
    .map((p: any) => ({
      cG: pickRole(p?.role) || null,
      number: norm(p?.number) || null,
      name: norm(p?.name) || null,
      birthday: norm(p?.birthday) || null,
    }))
    .filter((p: any) => p.name || p.number);

  const leaders = rawLeaders
    .slice(0, 5)
    .map((l: any) => ({ name: norm(l?.name) }))
    .filter((l: any) => l.name);

  const captainCount = players.filter((p: any) => norm(p?.cG).toUpperCase() === "C").length;
  const goalieCount = players.filter((p: any) => norm(p?.cG).toUpperCase() === "G").length;

  if (leaders.length < 1) {
    return NextResponse.json({ ok: false, error: "MISSING_LEADER" }, { status: 400 });
  }

  if (goalieCount < 1) {
    return NextResponse.json({ ok: false, error: "MISSING_GOALIE" }, { status: 400 });
  }

  if (captainCount !== 1) {
    return NextResponse.json(
      { ok: false, error: captainCount < 1 ? "MISSING_CAPTAIN" : "TOO_MANY_CAPTAINS" },
      { status: 400 },
    );
  }

  const rows = [
    ...players.map((p: any, idx: number) => ({
      kampId,
      rowIndex: idx,
      date: meta.date,
      liga: meta.liga || "",
      pulje: meta.pulje || "",
      venue: effectiveVenue,
      status: "open",
      cG: p.cG,
      number: p.number,
      name: p.name,
      birthday: p.birthday,
      reserve: null,
      leader: null,
    })),
    ...leaders.map((l: any, idx: number) => ({
      kampId,
      rowIndex: players.length + idx,
      date: meta.date,
      liga: meta.liga || "",
      pulje: meta.pulje || "",
      venue: effectiveVenue,
      status: "open",
      cG: null,
      number: null,
      name: l.name,
      birthday: null,
      reserve: null,
      leader: "L",
    })),
  ];

  await prisma.$transaction(async (tx) => {
    await tx.matchUploadLineup.deleteMany({ where: { kampId, venue: effectiveVenue } });
    if (rows.length) {
      await tx.matchUploadLineup.createMany({ data: rows });
    }
  });

  const saved = await prisma.matchUploadLineup.findMany({
    where: { kampId, venue: effectiveVenue },
    orderBy: { rowIndex: "asc" },
    select: {
      rowIndex: true,
      cG: true,
      number: true,
      name: true,
      birthday: true,
      leader: true,
      reserve: true,
    } as any,
  });

  return NextResponse.json({ ok: true, venue: effectiveVenue, rows: saved });
}
