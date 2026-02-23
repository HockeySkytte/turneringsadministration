import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { assertPublicApiAuth, jsonResponse, optionsResponse } from "@/lib/publicApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaMatchRow = {
  id: string;
  externalId: string | null;
  date: Date | null;
  time: Date | null;
  league: string | null;
  stage: string | null;
  pool: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  homeHoldId: string | null;
  awayHoldId: string | null;
  venue: unknown;
  result: unknown;
  gender: string | null;
  dommer1: string | null;
  dommer1Id: string | null;
  dommer2: string | null;
  dommer2Id: string | null;
};

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatTimeAsStored(t: Date | null): string | null {
  // `ta_matches.time` is TIME-without-timezone; stored as Date but must be rendered in UTC fields.
  if (!t) return null;
  return `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
}

function formatDateOnly(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function formatSeasonYYYYYYYY(date: Date | null): string | null {
  if (!date) return null;
  // Season boundary matches earlier convention: Aug 1 -> Jul 31
  const y = date.getUTCFullYear();
  const isAugOrLater = date.getUTCMonth() >= 7; // 0-based: Aug = 7
  const startYear = isAugOrLater ? y : y - 1;
  return `${startYear}-${startYear + 1}`;
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

function parseDateParam(value: string | null): Date | null {
  const v = norm(value);
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number.parseInt(m[1], 10);
  const mo = Number.parseInt(m[2], 10);
  const d = Number.parseInt(m[3], 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function parseGenderParam(raw: string | null): "MEN" | "WOMEN" | null {
  const v = norm(raw);
  if (!v) return null;
  const u = v.toUpperCase();
  if (u === "MEN" || u === "M" || u === "HERRE" || u === "HERRER") return "MEN";
  if (u === "WOMEN" || u === "W" || u === "DAME" || u === "DAMER" || u === "KVINDE" || u === "KVINDER") return "WOMEN";
  return null;
}

function parseSeasonParam(raw: string | null): { start: Date; end: Date; startYear: number } | null {
  const v = norm(raw);
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{4})$/);
  if (!m?.[1] || !m?.[2]) return null;
  const y1 = Number.parseInt(m[1], 10);
  const y2 = Number.parseInt(m[2], 10);
  if (!Number.isFinite(y1) || !Number.isFinite(y2)) return null;
  if (y2 !== y1 + 1) return null;
  return {
    startYear: y1,
    start: new Date(Date.UTC(y1, 7, 1)),
    end: new Date(Date.UTC(y1 + 1, 6, 31, 23, 59, 59, 999)),
  };
}

export async function OPTIONS(req: Request) {
  return optionsResponse(req);
}

export async function GET(req: Request) {
  const auth = assertPublicApiAuth(req);
  if (auth) return auth;

  await ensureTurneringDomainTables();

  const url = new URL(req.url);

  const league = norm(url.searchParams.get("league"));
  const pool = norm(url.searchParams.get("pool"));
  const stage = norm(url.searchParams.get("stage"));
  const gender = parseGenderParam(url.searchParams.get("gender"));

  const referee = norm(url.searchParams.get("referee"));
  const refereeId = norm(url.searchParams.get("refereeId"));
  const team = norm(url.searchParams.get("team"));
  const teamId = norm(url.searchParams.get("teamId"));

  const season = parseSeasonParam(url.searchParams.get("season"));

  const seasonStartYearRaw = norm(url.searchParams.get("seasonStartYear"));
  const seasonStartYear = seasonStartYearRaw ? Number.parseInt(seasonStartYearRaw, 10) : NaN;

  const seasonStart = season
    ? season.start
    : Number.isFinite(seasonStartYear)
      ? new Date(Date.UTC(seasonStartYear, 7, 1))
      : null; // Aug 1
  const seasonEnd = season
    ? season.end
    : Number.isFinite(seasonStartYear)
      ? new Date(Date.UTC(seasonStartYear + 1, 6, 31, 23, 59, 59, 999))
      : null;

  const from = parseDateParam(url.searchParams.get("from"));
  const to = parseDateParam(url.searchParams.get("to"));

  const includeLive = url.searchParams.get("includeLive") === "1";

  const dateWhere = (() => {
    const hasSeason = Boolean(seasonStart && seasonEnd);
    const hasFrom = Boolean(from);
    const hasTo = Boolean(to);
    if (!hasSeason && !hasFrom && !hasTo) return {};

    const gte = hasSeason && seasonStart ? seasonStart : null;
    const lte = hasSeason && seasonEnd ? seasonEnd : null;

    const effectiveGte = hasFrom && from ? (gte ? new Date(Math.max(from.getTime(), gte.getTime())) : from) : gte;
    const effectiveLte = hasTo && to ? (lte ? new Date(Math.min(to.getTime(), lte.getTime())) : to) : lte;

    return {
      date: {
        not: null,
        ...(effectiveGte ? { gte: effectiveGte } : {}),
        ...(effectiveLte ? { lte: effectiveLte } : {}),
      },
    };
  })();

  const matches = (await prisma.taMatch.findMany({
    where: {
      ...(league ? { league } : {}),
      ...(pool ? { pool } : {}),
      ...(stage ? { stage } : {}),
      ...(gender ? { gender } : {}),
      ...(referee
        ? {
            OR: [
              { dommer1: { contains: referee, mode: "insensitive" } },
              { dommer2: { contains: referee, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(refereeId
        ? {
            OR: [{ dommer1Id: refereeId }, { dommer2Id: refereeId }],
          }
        : {}),
      ...(team
        ? {
            OR: [
              { homeTeam: { contains: team, mode: "insensitive" } },
              { awayTeam: { contains: team, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(teamId
        ? {
            OR: [{ homeHoldId: teamId }, { awayHoldId: teamId }],
          }
        : {}),
      ...dateWhere,
    },
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
      venue: true,
      result: true,
      gender: true,
      dommer1: true,
      dommer1Id: true,
      dommer2: true,
      dommer2Id: true,
    },
    orderBy: [{ date: "asc" }, { time: "asc" }, { id: "asc" }],
  })) as TaMatchRow[];

  const kampIds = matches
    .map((m: TaMatchRow) => Number.parseInt(norm(m.externalId), 10))
    .filter((n: number) => Number.isFinite(n) && n > 0);

  const needsProtocolForResult = includeLive || matches.some((m) => Boolean(parseScoreText(m.result)));

  const lastGoals = needsProtocolForResult && kampIds.length
    ? await prisma.matchProtocolEvent.findMany({
        where: { kampId: { in: kampIds }, goal: { not: null } },
        orderBy: [{ kampId: "asc" }, { rowIndex: "desc" }],
        select: { kampId: true, goal: true, period: true },
      })
    : [];

  const lastGoalByKampId = new Map<number, { goal: string; period: string | null }>();
  for (const g of lastGoals) {
    if (!lastGoalByKampId.has(g.kampId)) {
      lastGoalByKampId.set(g.kampId, { goal: norm(g.goal), period: g.period ?? null });
    }
  }

  const items = matches.map((m: TaMatchRow) => {
    const kampId = Number.parseInt(norm(m.externalId), 10);
    const last = Number.isFinite(kampId) ? lastGoalByKampId.get(kampId) ?? null : null;
    const storedSv = /\bSV\b/i.test(norm(m.result));
    const isSv = storedSv || Boolean(last && isOvertimePeriod(last.period));

    const liveResultText = (() => {
      if (!includeLive || !last?.goal) return null;
      const parsed = parseScoreText(last.goal);
      if (!parsed) return null;
      const base = `${parsed.home}-${parsed.away}`;
      return isOvertimePeriod(last.period) ? `${base} (SV)` : base;
    })();

    const storedResultText = (() => {
      const p = parseScoreText(m.result);
      if (!p) return null;
      const base = `${p.home}-${p.away}`;
      return isSv ? `${base} (SV)` : base;
    })();

    return {
      id: m.id,
      kampId: norm(m.externalId) || null,
      date: formatDateOnly(m.date),
      time: formatTimeAsStored(m.time),
      season: formatSeasonYYYYYYYY(m.date),
      gender: norm(m.gender) || null,
      league: norm(m.league) || null,
      stage: norm(m.stage) || null,
      pool: norm(m.pool) || null,
      venue: norm((m as any).venue) || null,
      homeTeam: norm(m.homeTeam) || null,
      awayTeam: norm(m.awayTeam) || null,
      homeHoldId: norm(m.homeHoldId) || null,
      awayHoldId: norm(m.awayHoldId) || null,
      referee1: norm(m.dommer1) || null,
      referee2: norm(m.dommer2) || null,
      referee1Id: norm(m.dommer1Id) || null,
      referee2Id: norm(m.dommer2Id) || null,
      result: includeLive ? (liveResultText ?? storedResultText) : storedResultText,
    };
  });

  return jsonResponse(req, { ok: true, count: items.length, items });
}
