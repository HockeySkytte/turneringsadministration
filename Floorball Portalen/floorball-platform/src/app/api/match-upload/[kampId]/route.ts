import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

type MatchStatus = "open" | "live" | "closed";

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

async function getMatchStatus(kampId: number): Promise<MatchStatus> {
  // NOTE: Prisma Client types can be stale in-editor when schema drift has occurred.
  // Casting keeps compile-time unblocked while we still read/write the DB columns.
  const [protoPlayers, protoEvents] = await Promise.all([
    (prisma.matchProtocolPlayer as any).findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    }) as Promise<Array<{ status: string | null }>>,
    (prisma.matchProtocolEvent as any).findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    }) as Promise<Array<{ status: string | null }>>,
  ]);

  return deriveStatus([
    ...protoPlayers.map((r) => r.status),
    ...protoEvents.map((r) => r.status),
  ]);
}

async function getHomeClubIdForMatch(kampId: number) {
  await ensureTurneringDomainTables();
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

function parseKampId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

function venueFromSide(value: string, fallback = ""): string {
  const v = norm(value).toLowerCase();
  if (!v) return fallback;
  if (v === "h" || v === "home" || v === "hjemme") return "Hjemme";
  if (v === "u" || v === "away" || v === "ude") return "Ude";
  return fallback;
}

function deriveEventType({ score, pim, code }: { score: string; pim: string; code: string }): string {
  if (norm(score)) return "Goal";
  const c = norm(code);
  if (c === "401") return "Time Out";
  if (c === "402") return "Straffeslag";
  return "";
}

function isNonEmptyLineup(r: {
  cG: string | null;
  number: string | null;
  name: string | null;
  birthday: string | null;
}): boolean {
  return Boolean(norm(r.cG) || norm(r.number) || norm(r.name) || norm(r.birthday));
}

function isNonEmptyUploadEvent(r: {
  period: string | null;
  time: string | null;
  venue: string;
  player1: string | null;
  player2: string | null;
  score: string | null;
  event: string | null;
  pim: string | null;
  code: string | null;
}): boolean {
  return Boolean(
    norm(r.period) ||
      norm(r.time) ||
      norm(r.venue) ||
      norm(r.player1) ||
      norm(r.player2) ||
      norm(r.score) ||
      norm(r.event) ||
      norm(r.pim) ||
      norm(r.code)
  );
}

async function resolveMatchMeta(kampId: number) {
  await ensureTurneringDomainTables();
  const m = await prisma.taMatch.findFirst({
    where: { externalId: String(kampId) },
    select: { date: true, league: true, pool: true },
  });
  if (!m) return null;
  return {
    date: m.date ?? null,
    liga: m.league ?? "",
    pulje: m.pool ?? "",
  };
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ kampId: string }> }
) {
  // Auth is required; resolveMatchMeta will also validate selection if the match is not in DB.
  const user = await requireApprovedUser();

  const { kampId: raw } = await params;
  const kampId = parseKampId(raw);
  if (!kampId) {
    return NextResponse.json({ message: "Ugyldigt kampId." }, { status: 400 });
  }

  const canOverride = Boolean(user.isAdmin || user.isTournamentAdmin || user.isSuperuser);
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

  if (!canOverride && !isHomeSecretariat) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const meta = await resolveMatchMeta(kampId);
  if (!meta) {
    return NextResponse.json(
      { message: "Kampen findes ikke i Kalender/Turnering (DB-only policy)." },
      { status: 404 }
    );
  }

  const status = await getMatchStatus(kampId);
  if (!canOverride && status === "closed") {
    return NextResponse.json(
      { message: `Match is ${status} and cannot be uploaded` },
      { status: 409 },
    );
  }

  const [existingUploadLineup, players, events] = await Promise.all([
    prisma.matchUploadLineup.findMany({ where: { kampId }, orderBy: [{ venue: "asc" }, { rowIndex: "asc" }] }),
    prisma.matchProtocolPlayer.findMany({
      where: { kampId },
      orderBy: [{ side: "asc" }, { rowIndex: "asc" }],
      // NOTE: Prisma Client types can be stale in-editor when schema drift has occurred.
      // Casting keeps compile-time unblocked while we still read/write the DB columns.
      select: {
        side: true,
        rowIndex: true,
        role: true,
        number: true,
        name: true,
        born: true,
        reserve: true,
        leader: true,
      } as any,
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
  ]);

  const hasUploadedLineup = existingUploadLineup.some((r: any) => isNonEmptyLineup(r));

  const lineups = players
    .map((p) => {
      const venue = p.side === "HOME" ? "Hjemme" : "Ude";
      const cG = (norm(p.role) || "").toUpperCase();

      const leader = norm((p as any).leader).toUpperCase() === "L" ? "L" : null;
      const reserve = norm((p as any).reserve).toUpperCase() === "R" ? "R" : null;
      return {
        kampId,
        rowIndex: p.rowIndex,
        date: meta.date,
        liga: meta.liga || "",
        pulje: meta.pulje || "",
        venue,
        status,
        cG: cG === "C" || cG === "G" ? cG : null,
        number: norm(p.number) || null,
        name: norm(p.name) || null,
        birthday: norm(p.born) || null,
        leader,
        reserve: leader ? null : reserve,
      };
    })
    .filter((r) => isNonEmptyLineup(r));

  const uploadEvents = events
    .map((e) => {
      const venue = venueFromSide(e.side ?? "", "");
      const score = norm(e.goal) || "";
      const pim = norm(e.penalty) || "";
      const code = norm(e.code) || "";
      const event = deriveEventType({ score, pim, code });

      return {
        kampId,
        rowIndex: e.rowIndex,
        date: meta.date,
        liga: meta.liga || "",
        pulje: meta.pulje || "",
        venue,
        status,
        period: norm(e.period) || null,
        time: norm(e.time) || null,
        player1: norm(e.number) || null,
        player2: norm(e.assist) || null,
        score: score || null,
        event: event || null,
        pim: pim || null,
        code: code || null,
      };
    })
    .filter((r) => isNonEmptyUploadEvent(r));

  await prisma.$transaction(async (tx) => {
    await tx.matchUploadEvent.deleteMany({ where: { kampId } });

    // IMPORTANT: Never wipe existing uploaded lineups when uploading events.
    // The app's holdliste flow writes directly to matchUploadLineup.
    // Only rebuild matchUploadLineup from protocol if there is no uploaded lineup at all.
    if (!hasUploadedLineup) {
      await tx.matchUploadLineup.deleteMany({ where: { kampId } });
      if (lineups.length) {
        await tx.matchUploadLineup.createMany({ data: lineups });
      }
    }
    if (uploadEvents.length) {
      await tx.matchUploadEvent.createMany({ data: uploadEvents });
    }
  });

  const lineupCount = hasUploadedLineup ? existingUploadLineup.filter((r: any) => isNonEmptyLineup(r)).length : lineups.length;

  return NextResponse.json({
    ok: true,
    counts: {
      lineups: lineupCount,
      events: uploadEvents.length,
    },
  });
}
