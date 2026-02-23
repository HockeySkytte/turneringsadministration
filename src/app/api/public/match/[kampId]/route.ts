import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { assertPublicApiAuth, jsonResponse, optionsResponse } from "@/lib/publicApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MatchStatus = "open" | "live" | "closed";

function parseKampId(raw: string): number | null {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function norm(value: unknown): string {
  return String(value ?? "").trim();
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

async function getMatchStatus(kampId: number): Promise<MatchStatus> {
  // Prisma client typing can drift; keep it resilient.
  const [protoPlayers, protoEvents, uploadPlayers, uploadEvents] = await Promise.all([
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
    (prisma.matchUploadLineup as any).findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    }) as Promise<Array<{ status: string | null }>>,
    (prisma.matchUploadEvent as any).findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    }) as Promise<Array<{ status: string | null }>>,
  ]);

  return deriveStatus([
    ...protoPlayers.map((r) => r.status),
    ...protoEvents.map((r) => r.status),
    ...uploadPlayers.map((r) => r.status),
    ...uploadEvents.map((r) => r.status),
  ]);
}

function isOvertimePeriod(period: unknown): boolean {
  const p = norm(period).toUpperCase();
  if (!p) return false;
  if (p === "OT") return true;
  if (p === "SO" || p === "S.O." || p === "SHOOTOUT") return true;
  if (p === "STRAFFESLAG" || p === "STRAFFESLAGS" || p === "PENALTY") return true;
  const n = Number.parseInt(p, 10);
  return Number.isFinite(n) && n > 3;
}

function truthyQueryFlag(raw: string | null): boolean {
  const v = norm(raw).toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function parseScoreText(text: unknown): { home: number; away: number } | null {
  const cleaned = norm(text).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const m = cleaned.match(/(\d+)\s*-\s*(\d+)/);
  if (!m?.[1] || !m?.[2]) return null;
  const home = Number.parseInt(m[1], 10);
  const away = Number.parseInt(m[2], 10);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home, away };
}

function storedResultHasSv(result: unknown): boolean {
  return /\bSV\b/i.test(norm(result));
}

function isUploadEventEmpty(e: { period: string | null; time: string | null; venue: string | null; player1: string | null; player2: string | null; score: string | null; event: string | null; pim: string | null; code: string | null }): boolean {
  return !(
    norm(e.period) ||
    norm(e.time) ||
    norm(e.venue) ||
    norm(e.player1) ||
    norm(e.player2) ||
    norm(e.score) ||
    norm(e.event) ||
    norm(e.pim) ||
    norm(e.code)
  );
}

type LineupEntry = {
  rowIndex: number;
  role: string | null;
  number: string | null;
  name: string | null;
  born: string | null;
  reserve: string | null;
  leader: string | null;
};

function hasAnyLineup(entries: LineupEntry[]): boolean {
  return entries.some((r) => Boolean(norm(r.number) || norm(r.name) || norm(r.role) || norm(r.born)));
}

function mapProtocolLineup(entries: Array<{ rowIndex: number; role: string | null; number: string | null; name: string | null; born: string | null; reserve: string | null; leader: string | null }>): LineupEntry[] {
  return entries.map((r) => ({
    rowIndex: r.rowIndex,
    role: r.role ?? null,
    number: r.number ?? null,
    name: r.name ?? null,
    born: r.born ?? null,
    reserve: r.reserve ?? null,
    leader: r.leader ?? null,
  }));
}

function mapUploadLineup(entries: Array<{ venue: string; rowIndex: number; cG: string | null; number: string | null; name: string | null; birthday: string | null; reserve: string | null; leader: string | null }>) {
  const home = entries
    .filter((r) => norm(r.venue).toLowerCase().startsWith("h"))
    .map((r) => ({
      rowIndex: r.rowIndex,
      role: r.cG ?? null,
      number: r.number ?? null,
      name: r.name ?? null,
      born: r.birthday ?? null,
      reserve: r.reserve ?? null,
      leader: r.leader ?? null,
    }));

  const away = entries
    .filter((r) => norm(r.venue).toLowerCase().startsWith("u"))
    .map((r) => ({
      rowIndex: r.rowIndex,
      role: r.cG ?? null,
      number: r.number ?? null,
      name: r.name ?? null,
      born: r.birthday ?? null,
      reserve: r.reserve ?? null,
      leader: r.leader ?? null,
    }));

  return { home, away };
}

export async function OPTIONS(req: Request) {
  return optionsResponse(req);
}

export async function GET(req: Request, { params }: { params: Promise<{ kampId: string }> }) {
  const auth = assertPublicApiAuth(req);
  if (auth) return auth;

  await ensureTurneringDomainTables();

  const { kampId: raw } = await params;
  const kampId = parseKampId(raw);
  if (!kampId) return jsonResponse(req, { ok: false, error: "INVALID_KAMP" }, { status: 400 });

  const url = new URL(req.url);
  const includeEvents =
    truthyQueryFlag(url.searchParams.get("includeEvents")) ||
    // Support common mistake: `/api/public/match/16073&includeEvents=1` (missing `?`)
    /[?&]includeEvents=(1|true|yes|on)\b/i.test(req.url);

  const match = await prisma.taMatch.findFirst({
    where: { externalId: String(kampId) },
    select: {
      id: true,
      externalId: true,
      date: true,
      time: true,
      league: true,
      stage: true,
      pool: true,
      homeTeam: true,
      awayTeam: true,
      homeHoldId: true,
      awayHoldId: true,
      result: true,
    },
  });

  const status = await getMatchStatus(kampId).catch(() => "open" as const);

  const [protoHome, protoAway, protoEvents, uploadLineups, uploadEvents] = await Promise.all([
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
        period: true,
        time: true,
        venue: true,
        player1: true,
        player2: true,
        score: true,
        event: true,
        pim: true,
        code: true,
      },
    }),
  ] as const);

  // Lineups: prefer protocol if it exists, otherwise uploaded lineups.
  const protoHomeMapped = mapProtocolLineup(protoHome);
  const protoAwayMapped = mapProtocolLineup(protoAway);

  const uploadMapped = mapUploadLineup(uploadLineups);

  const lineupSource = hasAnyLineup([...protoHomeMapped, ...protoAwayMapped])
    ? ("protocol" as const)
    : hasAnyLineup([...uploadMapped.home, ...uploadMapped.away])
      ? ("upload" as const)
      : ("none" as const);

  const lineups =
    lineupSource === "protocol"
      ? { source: lineupSource, home: protoHomeMapped, away: protoAwayMapped }
      : lineupSource === "upload"
        ? { source: lineupSource, home: uploadMapped.home, away: uploadMapped.away }
        : { source: lineupSource, home: [] as LineupEntry[], away: [] as LineupEntry[] };

  // Score: prefer protocol goals, fallback to uploaded goals.
  const scoreFromProtocol = (() => {
    let home = 0;
    let away = 0;
    const protoGoalEvents = protoEvents.filter((e: (typeof protoEvents)[number]) => Boolean(norm(e.goal)));
    for (const e of protoGoalEvents) {
      const side = norm(e.side).toUpperCase();
      if (side === "H") home += 1;
      if (side === "U") away += 1;
    }
    if (home === 0 && away === 0) return null;

    const last = protoGoalEvents[protoGoalEvents.length - 1] ?? null;
    const lastScore = last?.goal ? parseScoreText(last.goal) : null;

    return {
      home: lastScore?.home ?? home,
      away: lastScore?.away ?? away,
      lastGoal: last
        ? { period: norm(last.period) || null, time: norm(last.time) || null, rowIndex: last.rowIndex }
        : null,
      overtime: last ? isOvertimePeriod(last.period) : false,
    };
  })();

  const scoreFromUpload = (() => {
    let home = 0;
    let away = 0;
    const uploadGoalEvents = uploadEvents.filter((e: (typeof uploadEvents)[number]) => Boolean(norm(e.score)));
    for (const e of uploadGoalEvents) {
      const venue = norm(e.venue).toLowerCase();
      if (venue.startsWith("h")) home += 1;
      if (venue.startsWith("u")) away += 1;
    }
    if (home === 0 && away === 0) return null;

    const last = uploadGoalEvents[uploadGoalEvents.length - 1] ?? null;
    const lastScore = last?.score ? parseScoreText(last.score) : null;

    return {
      home: lastScore?.home ?? home,
      away: lastScore?.away ?? away,
      lastGoal: last
        ? { period: norm(last.period) || null, time: norm(last.time) || null, rowIndex: last.rowIndex }
        : null,
      overtime: last ? isOvertimePeriod(last.period) : false,
    };
  })();

  const score = scoreFromProtocol ?? scoreFromUpload;

  const svFromStored = storedResultHasSv(match?.result);
  const overtimeFlag = Boolean(score?.overtime || svFromStored);

  const resultText = (() => {
    if (score) {
      const base = `${score.home}-${score.away}`;
      return overtimeFlag ? `${base} (SV)` : base;
    }
    const fallback = parseScoreText(match?.result);
    if (!fallback) return "";
    const base = `${fallback.home}-${fallback.away}`;
    return svFromStored ? `${base} (SV)` : base;
  })();

  const events = includeEvents
    ? uploadEvents
        .filter((e: (typeof uploadEvents)[number]) => !isUploadEventEmpty(e))
        .map((e: (typeof uploadEvents)[number]) => ({
          rowIndex: e.rowIndex,
          period: norm(e.period) || null,
          time: norm(e.time) || null,
          venue: norm(e.venue) || null,
          player1: norm(e.player1) || null,
          player2: norm(e.player2) || null,
          score: norm(e.score) || null,
          event: norm(e.event) || null,
          pim: norm(e.pim) || null,
          code: norm(e.code) || null,
        }))
    : null;

  return jsonResponse(req, {
    ok: true,
    kampId,
    status,
    match: match
      ? {
          id: match.id,
          externalId: norm(match.externalId) || String(kampId),
          dateISO: match.date ? match.date.toISOString() : null,
          timeISO: match.time ? match.time.toISOString() : null,
          league: norm(match.league) || null,
          stage: norm(match.stage) || null,
          pool: norm(match.pool) || null,
          homeTeam: norm(match.homeTeam) || null,
          awayTeam: norm(match.awayTeam) || null,
          homeHoldId: norm(match.homeHoldId) || null,
          awayHoldId: norm(match.awayHoldId) || null,
          resultStored: norm(match.result) || null,
        }
      : null,
    score: score
      ? {
          home: score.home,
          away: score.away,
          overtime: overtimeFlag,
          text: resultText,
          lastGoal: score.lastGoal,
        }
      : {
          home: null,
          away: null,
          overtime: svFromStored,
          text: resultText,
          lastGoal: null,
        },
    lineups,
    events,
    generatedAt: new Date().toISOString(),
  });
}
