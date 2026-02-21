import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type MatchStatus = "open" | "live" | "closed";

function normalizeStatus(s: unknown): MatchStatus | null {
  const v = String(s ?? "").trim().toLowerCase();
  if (v === "open" || v === "live" || v === "closed") return v;
  return null;
}

function deriveStatus(statuses: Array<string | null | undefined>): MatchStatus {
  const norm = statuses.map(normalizeStatus).filter(Boolean) as MatchStatus[];
  if (norm.includes("closed")) return "closed";
  if (norm.includes("live")) return "live";
  return "open";
}

async function getHomeClubIdForMatch(kampId: number) {
  const match = await prisma.taMatch.findFirst({
    where: { externalId: String(kampId) },
    select: { league: true, homeTeam: true },
  });
  if (!match?.league || !match?.homeTeam) return null;

  const team = await prisma.taTeam.findFirst({
    where: { league: match.league, name: match.homeTeam },
    select: { clubId: true },
  });
  return team?.clubId ?? null;
}

async function getMatchStatus(kampId: number): Promise<MatchStatus> {
  const [protoPlayers, protoEvents, uploadPlayers, uploadEvents] = await Promise.all([
    prisma.matchProtocolPlayer.findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    }),
    prisma.matchProtocolEvent.findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    }),
    prisma.matchUploadLineup.findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    }),
    prisma.matchUploadEvent.findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    }),
  ]);

  return deriveStatus([
    ...protoPlayers.map((r) => r.status),
    ...protoEvents.map((r) => r.status),
    ...uploadPlayers.map((r) => r.status),
    ...uploadEvents.map((r) => r.status),
  ]);
}

type PlayerRow = {
  role?: string | null;
  number?: string | null;
  name?: string | null;
  born?: string | null;
  reserve?: string | null;
  leader?: string | null;
};

type EventRow = {
  period?: string | null;
  time?: string | null;
  side?: string | null;
  number?: string | null;
  goal?: string | null;
  assist?: string | null;
  penalty?: string | null;
  code?: string | null;
};

function parseKampId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isNonEmptyPlayer(r: PlayerRow): boolean {
  return Boolean(
    String(r.role ?? "").trim() ||
      String(r.number ?? "").trim() ||
      String(r.name ?? "").trim() ||
      String(r.born ?? "").trim() ||
      String(r.reserve ?? "").trim() ||
      String(r.leader ?? "").trim()
  );
}

function isNonEmptyEvent(r: EventRow): boolean {
  return Boolean(
    String(r.period ?? "").trim() ||
      String(r.time ?? "").trim() ||
      String(r.side ?? "").trim() ||
      String(r.number ?? "").trim() ||
      String(r.goal ?? "").trim() ||
      String(r.assist ?? "").trim() ||
      String(r.penalty ?? "").trim() ||
      String(r.code ?? "").trim()
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kampId: string }> }
) {
  const { kampId: raw } = await params;
  const kampId = parseKampId(raw);
  if (!kampId) {
    return NextResponse.json({ message: "Ugyldigt kampId." }, { status: 400 });
  }

  const user = await requireApprovedUser();
  const isOverride = !!(user.isAdmin || user.isTournamentAdmin);

  const homeClubId = await getHomeClubIdForMatch(kampId);
  const isHomeSecretariat =
    !!homeClubId &&
    user.roles.some(
      (r) =>
        r.status === "APPROVED" &&
        r.role === "SECRETARIAT" &&
        r.clubId != null &&
        r.clubId === homeClubId,
    );

  if (!isOverride && !isHomeSecretariat) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const status = await getMatchStatus(kampId);

  const [home, away, events, uploadedLineups, uploadedEvents] = await Promise.all([
    prisma.matchProtocolPlayer.findMany({
      where: { kampId, side: "HOME" },
      orderBy: { rowIndex: "asc" },
      select: { rowIndex: true, role: true, number: true, name: true, born: true, reserve: true, leader: true },
    }),
    prisma.matchProtocolPlayer.findMany({
      where: { kampId, side: "AWAY" },
      orderBy: { rowIndex: "asc" },
      select: { rowIndex: true, role: true, number: true, name: true, born: true, reserve: true, leader: true },
    }),
    prisma.matchProtocolEvent.findMany({
      where: { kampId },
      orderBy: { rowIndex: "asc" },
      select: {
        rowIndex: true,
        period: true,
        time: true,
        side: true,
        number: true,
        goal: true,
        assist: true,
        penalty: true,
        code: true,
      },
    }),
    prisma.matchUploadLineup.findMany({
      where: { kampId },
      orderBy: [{ venue: "asc" }, { rowIndex: "asc" }],
      select: { venue: true, rowIndex: true, cG: true, number: true, name: true, birthday: true, reserve: true, leader: true },
    }),
    prisma.matchUploadEvent.findMany({
      where: { kampId },
      orderBy: { rowIndex: "asc" },
      select: {
        rowIndex: true,
        venue: true,
        period: true,
        time: true,
        player1: true,
        player2: true,
        score: true,
        pim: true,
        code: true,
      },
    }),
  ]);

  const uploadedHome = (uploadedLineups as Array<{
    venue: string;
    rowIndex: number;
    cG: string | null;
    number: string | null;
    name: string | null;
    birthday: string | null;
    reserve: string | null;
    leader: string | null;
  }>)
    .filter((r) => String(r.venue ?? "").toLowerCase().startsWith("h"))
    .map((r) => ({
      rowIndex: r.rowIndex,
      role: r.cG,
      number: r.number,
      name: r.name,
      born: r.birthday,
      reserve: r.reserve,
      leader: r.leader,
    }));

  const uploadedAway = (uploadedLineups as Array<{
    venue: string;
    rowIndex: number;
    cG: string | null;
    number: string | null;
    name: string | null;
    birthday: string | null;
    reserve: string | null;
    leader: string | null;
  }>)
    .filter((r) => String(r.venue ?? "").toLowerCase().startsWith("u"))
    .map((r) => ({
      rowIndex: r.rowIndex,
      role: r.cG,
      number: r.number,
      name: r.name,
      born: r.birthday,
      reserve: r.reserve,
      leader: r.leader,
    }));

  const uploadedEventsMapped = (uploadedEvents as Array<{
    rowIndex: number;
    venue: string;
    period: string | null;
    time: string | null;
    player1: string | null;
    player2: string | null;
    score: string | null;
    pim: string | null;
    code: string | null;
  }>).map((r) => ({
    rowIndex: r.rowIndex,
    period: r.period,
    time: r.time,
    side: String(r.venue ?? "").toLowerCase().startsWith("h")
      ? "H"
      : String(r.venue ?? "").toLowerCase().startsWith("u")
        ? "U"
        : null,
    number: r.player1,
    goal: r.score,
    assist: r.player2,
    penalty: r.pim,
    code: r.code,
  }));

  // Prefer protocol rows (draft edits) per section; fall back to uploaded rows if protocol is empty.
  const playersHomeOut = home.length > 0 ? home : uploadedHome;
  const playersAwayOut = away.length > 0 ? away : uploadedAway;
  const eventsOut = events.length > 0 ? events : uploadedEventsMapped;

  // If nothing exists, return empty (caller will render blank inputs).
  return NextResponse.json({
    status,
    players: {
      home: playersHomeOut,
      away: playersAwayOut,
    },
    events: eventsOut,
  });

}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ kampId: string }> }
) {
  const { kampId: raw } = await params;
  const kampId = parseKampId(raw);
  if (!kampId) {
    return NextResponse.json({ message: "Ugyldigt kampId." }, { status: 400 });
  }

  const user = await requireApprovedUser();
  const isOverride = !!(user.isAdmin || user.isTournamentAdmin);

  const homeClubId = await getHomeClubIdForMatch(kampId);
  const isHomeSecretariat =
    !!homeClubId &&
    user.roles.some(
      (r) =>
        r.status === "APPROVED" &&
        r.role === "SECRETARIAT" &&
        r.clubId != null &&
        r.clubId === homeClubId,
    );

  if (!isOverride && !isHomeSecretariat) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const currentStatus = await getMatchStatus(kampId);
  if (!isOverride && (currentStatus === "live" || currentStatus === "closed")) {
    return NextResponse.json(
      { message: `Match is ${currentStatus} and cannot be edited` },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  const playersHome: PlayerRow[] = Array.isArray(body?.playersHome) ? body.playersHome : [];
  const playersAway: PlayerRow[] = Array.isArray(body?.playersAway) ? body.playersAway : [];
  const events: EventRow[] = Array.isArray(body?.events) ? body.events : [];

  await prisma.$transaction(async (tx) => {
    await tx.matchProtocolPlayer.deleteMany({ where: { kampId } });
    await tx.matchProtocolEvent.deleteMany({ where: { kampId } });

    const homeData = playersHome
      .slice(0, 20)
      .map((r, idx) => ({
        kampId,
        side: "HOME" as const,
        rowIndex: idx,
        status: currentStatus,
        role: String(r.role ?? "").trim() || null,
        number: String(r.number ?? "").trim() || null,
        name: String(r.name ?? "").trim() || null,
        born: String(r.born ?? "").trim() || null,
        leader: String(r.leader ?? "").trim().toUpperCase() === "L" ? "L" : null,
        reserve: String(r.reserve ?? "").trim().toUpperCase() === "R" ? "R" : null,
      }))
      .filter((r) => isNonEmptyPlayer(r));

    const awayData = playersAway
      .slice(0, 20)
      .map((r, idx) => ({
        kampId,
        side: "AWAY" as const,
        rowIndex: idx,
        status: currentStatus,
        role: String(r.role ?? "").trim() || null,
        number: String(r.number ?? "").trim() || null,
        name: String(r.name ?? "").trim() || null,
        born: String(r.born ?? "").trim() || null,
        leader: String(r.leader ?? "").trim().toUpperCase() === "L" ? "L" : null,
        reserve: String(r.reserve ?? "").trim().toUpperCase() === "R" ? "R" : null,
      }))
      .filter((r) => isNonEmptyPlayer(r));

    // Enforce mutual exclusion (one player can't be both leader and reserve).
    for (const r of homeData) {
      if (r.leader) r.reserve = null;
    }
    for (const r of awayData) {
      if (r.leader) r.reserve = null;
    }

    const eventData = events
      .slice(0, 60)
      .map((r, idx) => ({
        kampId,
        rowIndex: idx,
        status: currentStatus,
        period: String(r.period ?? "").trim() || null,
        time: String(r.time ?? "").trim() || null,
        side: String(r.side ?? "").trim() || null,
        number: String(r.number ?? "").trim() || null,
        goal: String(r.goal ?? "").trim() || null,
        assist: String(r.assist ?? "").trim() || null,
        penalty: String(r.penalty ?? "").trim() || null,
        code: String(r.code ?? "").trim() || null,
      }))
      .filter((r) => isNonEmptyEvent(r));

    if (homeData.length) {
      await tx.matchProtocolPlayer.createMany({ data: homeData });
    }
    if (awayData.length) {
      await tx.matchProtocolPlayer.createMany({ data: awayData });
    }
    if (eventData.length) {
      await tx.matchProtocolEvent.createMany({ data: eventData });
    }
  });

  return NextResponse.json({ ok: true, status: currentStatus });
}
