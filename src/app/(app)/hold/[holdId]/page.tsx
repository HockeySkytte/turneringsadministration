import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import type { StatsAggregationMode } from "@/components/StatsAggregationModeSlicer";
import type { ReactNode } from "react";
import KalenderTableClient, { type KalenderRow } from "../../kalender/KalenderTableClient";
import StatistikOverviewClient from "../../statistik/StatistikOverviewClient";
import type { StatistikOverviewData, StatistikPlayerRow, StatistikTeamRow } from "../../statistik/statistikTypes";
import HoldTabsClient, { type HoldTabKey } from "./HoldTabsClient";

export const dynamic = "force-dynamic";

function firstParam(v: string | string[] | undefined) {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

function asHoldTabKey(value: unknown): HoldTabKey {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "stilling" || v === "spillere") return v;
  return "kampe";
}

function normKey(value: unknown): string {
  return norm(value).toLocaleLowerCase("da-DK");
}

function canonicalKey(value: unknown): string {
  return norm(value)
    .toLocaleLowerCase("da-DK")
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchGender(text: string, gender: "MEN" | "WOMEN") {
  const t = text.toLowerCase();
  const womenHints = ["dame", "kvinde", "pige"];
  const menHints = ["herre", "mand", "drenge"];
  const isWomen = womenHints.some((h) => t.includes(h));
  const isMen = menHints.some((h) => t.includes(h));

  if (gender === "WOMEN") return isWomen;
  if (isMen) return true;
  return !isWomen;
}

function genderHint(text: string): "MEN" | "WOMEN" | null {
  const t = text.toLowerCase();
  const womenHints = ["dame", "kvinde", "pige"];
  const menHints = ["herre", "mand", "drenge"];
  const isWomen = womenHints.some((h) => t.includes(h));
  const isMen = menHints.some((h) => t.includes(h));
  if (isWomen && !isMen) return "WOMEN";
  if (isMen && !isWomen) return "MEN";
  return null;
}

function normalizeStoredGender(gender: unknown): "MEN" | "WOMEN" | null {
  const raw = String(gender ?? "").trim();
  if (!raw) return null;

  const upper = raw
    .toUpperCase()
    .replace(/Æ/g, "AE")
    .replace(/Ø/g, "OE")
    .replace(/Å/g, "AA");

  const compact = upper.replace(/[^A-Z]/g, "");
  if (!compact) return null;

  const men = new Set(["MEN", "MALE", "M", "MAEND", "MAENDENE", "MAND", "MANDEN", "HERRER", "HERRE", "DRENGE", "DRENG"]);
  const women = new Set([
    "WOMEN",
    "FEMALE",
    "W",
    "K",
    "KVINDER",
    "KVINDE",
    "DAMER",
    "DAME",
    "PIGER",
    "PIGE",
  ]);

  if (men.has(compact)) return "MEN";
  if (women.has(compact)) return "WOMEN";

  if (compact.includes("KVIN") || compact.includes("DAME") || compact.includes("PIGE")) return "WOMEN";
  if (compact.includes("HERR") || compact.includes("MAND") || compact.includes("DRENG") || compact.includes("MAEND")) return "MEN";

  return null;
}

function matchGenderForMatch(args: { text: string; storedGender: unknown }, gender: "MEN" | "WOMEN") {
  const stored = normalizeStoredGender(args.storedGender);
  if (stored) return stored === gender;
  return matchGender(args.text, gender);
}

function matchAge(text: string, age: string) {
  const t = text.toLowerCase();
  const normalized = age.trim().toUpperCase();
  if (!normalized) return true;

  if (/^U\d{1,2}$/.test(normalized)) {
    return t.includes(normalized.toLowerCase());
  }

  if (normalized === "SENIOR") {
    return !/\bu\s?\d{1,2}\b/i.test(t);
  }

  if (normalized === "OLDIES") {
    return t.includes("oldies") || t.includes("veteran") || t.includes("motion");
  }

  return true;
}

function parseScoreText(text: string): { home: number; away: number; overtime: boolean } | null {
  const cleaned = String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  const m = cleaned.match(/^(\d+)\s*-\s*(\d+)(?:\s*(?:\(?\s*SV\s*\)?))?$/i);
  if (!m) return null;

  const home = Number.parseInt(m[1]!, 10);
  const away = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;

  const overtime = /\bSV\b/i.test(cleaned);
  return { home, away, overtime };
}

function jerseyKey(value: unknown): string {
  const s = norm(value);
  if (!s) return "";
  const m = s.match(/(\d+)/);
  if (!m?.[1]) return s;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? String(n) : s;
}

function venueFromAny(value: string): "Hjemme" | "Ude" | null {
  const v = normKey(value);
  if (v === "h" || v === "home" || v === "hjemme") return "Hjemme";
  if (v === "u" || v === "away" || v === "ude") return "Ude";
  return null;
}

function parseTimeSeconds(time: string): number {
  const t = norm(time);
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  const mm = Number.parseInt(m[1], 10);
  const ss = Number.parseInt(m[2], 10);
  if (!Number.isFinite(mm) || !Number.isFinite(ss)) return 0;
  return mm * 60 + ss;
}

function parsePeriod(period: string): number {
  const p = norm(period).toUpperCase();
  if (p === "OT") return 4;
  const n = Number.parseInt(p, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
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

function parseBirthday(birthday: string): Date | null {
  const v = norm(birthday);
  if (!v) return null;

  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const y = Number.parseInt(iso[1], 10);
    const m = Number.parseInt(iso[2], 10);
    const d = Number.parseInt(iso[3], 10);
    const dt = new Date(y, m - 1, d);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  const compact = v.replace(/\D/g, "");
  if (compact.length === 6 || compact.length === 8) {
    const d = Number.parseInt(compact.slice(0, 2), 10);
    const m = Number.parseInt(compact.slice(2, 4), 10);
    const yy = compact.length === 8 ? compact.slice(4, 8) : compact.slice(4, 6);
    let y = Number.parseInt(yy, 10);
    if (compact.length === 6) {
      y = y <= 30 ? 2000 + y : 1900 + y;
    }
    const dt = new Date(y, m - 1, d);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  const m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const d = Number.parseInt(m[1], 10);
    const mo = Number.parseInt(m[2], 10);
    let y = Number.parseInt(m[3], 10);
    if (m[3].length === 2) {
      y = y <= 30 ? 2000 + y : 1900 + y;
    }
    const dt = new Date(y, mo - 1, d);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  return null;
}

function computeAge(birthday: string, ref: Date): number | null {
  const dob = parseBirthday(birthday);
  if (!dob) return null;
  let age = ref.getFullYear() - dob.getFullYear();
  const m = ref.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) age -= 1;
  return Number.isFinite(age) && age >= 0 ? age : null;
}

type PenSeg = { team: "Hjemme" | "Ude"; start: number; end: number };

function activeCount(segs: PenSeg[], team: "Hjemme" | "Ude", t: number): number {
  return segs.filter((s) => s.team === team && s.start <= t && t < s.end).length;
}

function cancelOnePenalty(segs: PenSeg[], defending: "Hjemme" | "Ude", t: number) {
  let bestIdx = -1;
  let bestEnd = Infinity;
  for (let i = 0; i < segs.length; i += 1) {
    const s = segs[i];
    if (s.team !== defending) continue;
    if (!(s.start <= t && t < s.end)) continue;
    if (s.end < bestEnd) {
      bestEnd = s.end;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) {
    segs[bestIdx] = { ...segs[bestIdx], end: t };
  }
}

function attemptCount(pimMin: number): number {
  if (!Number.isFinite(pimMin) || pimMin <= 0) return 0;
  return pimMin === 4 ? 2 : 1;
}

function parsePimMinutes(pim: string, code?: string): number {
  const p = norm(pim);
  const c = norm(code);
  if (!p) return 0;
  if (/^2\s*\+\s*10$/i.test(p)) return 2;
  if (p === "12" && c === "101") return 2;
  const n = Number.parseInt(p, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatMode(mode: StatsAggregationMode) {
  return mode === "TOTAL" ? "Total" : "Per kamp";
}

function isMergedTopLeague(league: string | null): boolean {
  const l = String(league ?? "").trim();
  return l === "Unihoc Floorball Liga" || l === "Select Ligaen";
}

function leagueWhere(
  league: string | null,
  opts?: { mergeTopLeagues?: boolean }
): { league?: string | { in: string[] } } {
  if (!league) return {};
  if (opts?.mergeTopLeagues && isMergedTopLeague(league)) {
    return { league: { in: ["Unihoc Floorball Liga", "Select Ligaen"] } };
  }
  return { league };
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function HoldPage({
  params,
  searchParams,
}: {
  params: Promise<{ holdId: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { statsAggregationMode } = await getAppContext();
  await ensureTurneringDomainTables();

  const sp = (await searchParams) ?? {};
  const activeTab = asHoldTabKey(firstParam(sp?.tab));

  const season = firstParam(sp?.season);
  const clubId = firstParam(sp?.clubId);
  const gender = firstParam(sp?.gender);
  const age = firstParam(sp?.age);
  const leagueFilter = firstParam(sp?.league);
  const stageFilter = firstParam(sp?.stage);
  const poolFilter = firstParam(sp?.pool);
  const teamId = firstParam(sp?.teamId);
  const matchesMode = (firstParam(sp?.matches) ?? "ALL").toUpperCase();

  const { holdId } = await params;
  const holdIdNorm = norm(holdId);

  const seasonStartYear = season ? Number.parseInt(season, 10) : null;
  const seasonStart =
    seasonStartYear && Number.isFinite(seasonStartYear)
      ? new Date(seasonStartYear, 7, 1)
      : null;
  const seasonEnd =
    seasonStartYear && Number.isFinite(seasonStartYear)
      ? new Date(seasonStartYear + 1, 6, 31, 23, 59, 59, 999)
      : null;

  const selectedGender = gender === "MEN" || gender === "WOMEN" ? gender : null;
  const otherGender = selectedGender === "MEN" ? "WOMEN" : selectedGender === "WOMEN" ? "MEN" : null;

  const [team, clubTeamNames] = await Promise.all([
    teamId
      ? prisma.taTeam.findUnique({ where: { id: teamId }, select: { id: true, name: true, clubId: true } })
      : Promise.resolve(null),
    clubId
      ? prisma.taTeam
          .findMany({ where: { clubId }, select: { name: true } })
          .then((rows) => new Set(rows.map((t) => t.name)))
      : Promise.resolve(null),
  ]);

  const teams = await prisma.taTeam.findMany({
    where: { holdId: holdIdNorm },
    select: { name: true, league: true, club: { select: { name: true } } },
    orderBy: [{ league: "asc" }, { name: "asc" }],
  });

  const teamNames = Array.from(new Set(teams.map((t) => norm(t.name)).filter(Boolean)));
  const displayName = teamNames.length === 1 ? teamNames[0]! : teamNames[0] ?? `Hold ${holdIdNorm}`;

  const holdTeamNameKeys = new Set(teamNames.map((n) => canonicalKey(n)).filter(Boolean));

  const holdIdKey = holdIdNorm;

  if (teamNames.length === 0) {
    const empty: StatistikOverviewData = {
      scopeLabel: `HoldId: ${holdIdNorm} · ${formatMode(statsAggregationMode)}`,
      mode: statsAggregationMode,
      selectedTeamName: null,
      players: [],
      teams: [],
    };

    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold">Hold</h1>
        <div className="mt-4">
          <HoldTabsClient activeTab={activeTab} />
        </div>
        <p className="mt-4 text-sm text-zinc-600">Holdet blev ikke fundet (holdId: {holdIdNorm}).</p>
        <div className="mt-6">
          <StatistikOverviewClient data={empty} hideTeams title="Hold" />
        </div>
      </div>
    );
  }

  const mergeTopLeaguesForSpillere = activeTab === "spillere" && isMergedTopLeague(leagueFilter);

  const matches = await prisma.taMatch.findMany({
    where: {
      OR: [{ homeHoldId: holdIdKey }, { awayHoldId: holdIdKey }],
      ...leagueWhere(leagueFilter, { mergeTopLeagues: mergeTopLeaguesForSpillere }),
      ...(poolFilter ? { pool: poolFilter } : {}),
      ...(stageFilter ? { stage: stageFilter } : {}),
      ...(seasonStart && seasonEnd ? { date: { gte: seasonStart, lte: seasonEnd } } : {}),
      ...(otherGender ? { NOT: { gender: { equals: otherGender, mode: "insensitive" } } } : {}),
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
      result: true,
      gender: true,
    },
    orderBy: [{ date: "asc" }, { time: "asc" }, { id: "asc" }],
  });

  const filteredMatches = matches.filter((m) => {
    const text = `${m.league ?? ""} ${m.pool ?? ""}`.trim();

    if (selectedGender) {
      if (!matchGenderForMatch({ text, storedGender: (m as { gender?: unknown }).gender }, selectedGender)) return false;
    }

    if (age) {
      if (!matchAge(text, age)) return false;
    }

    // stageFilter handled in DB where (keep no-op here for safety)

    const clubMatch = clubTeamNames ? clubTeamNames.has(m.homeTeam) || clubTeamNames.has(m.awayTeam) : false;
    const teamMatch = team ? m.homeTeam === team.name || m.awayTeam === team.name : false;

    if (matchesMode === "CLUB") {
      if (!clubMatch) return false;
    }
    if (matchesMode === "TEAM") {
      if (!teamMatch) return false;
    }

    return true;
  });

  const teamNameSet = new Set(teamNames);

  const kampSideById = new Map<number, "Hjemme" | "Ude">();
  const matchDateById = new Map<number, number>();

  const matchTeamsByKampId = new Map<number, { homeTeam: string; awayTeam: string }>();

  for (const m of filteredMatches) {
    const kampId = m.externalId ? Number.parseInt(String(m.externalId).trim(), 10) : NaN;
    if (!Number.isFinite(kampId) || kampId <= 0) continue;

    const homeTeam = norm(m.homeTeam);
    const awayTeam = norm(m.awayTeam);

    const isHome = String(m.homeHoldId ?? "").trim() === holdIdKey;
    const isAway = String(m.awayHoldId ?? "").trim() === holdIdKey;
    if (!isHome && !isAway) continue;

    const side: "Hjemme" | "Ude" = isHome ? "Hjemme" : "Ude";
    kampSideById.set(kampId, side);
    matchDateById.set(kampId, m.date ? m.date.getTime() : -Infinity);
    matchTeamsByKampId.set(kampId, { homeTeam, awayTeam });
  }

  const kampIds = Array.from(kampSideById.keys());

  const emptyData: StatistikOverviewData = {
    scopeLabel: `Hold: ${displayName} · Kampe: ${kampIds.length} · ${formatMode(statsAggregationMode)}`,
    mode: statsAggregationMode,
    selectedTeamName: displayName,
    players: [],
    teams: [],
  };

  const pageShell = (content: ReactNode) => (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold">{displayName}</h1>
      <div className="mt-4">
        <HoldTabsClient activeTab={activeTab} />
      </div>
      <div className="mt-6">{content}</div>
    </div>
  );

  if (activeTab === "kampe") {
    const kampIdsForRows = filteredMatches
      .map((m) => Number.parseInt(String(m.externalId ?? "").trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);

    const lastGoals = kampIdsForRows.length
      ? await prisma.matchProtocolEvent.findMany({
          where: { kampId: { in: kampIdsForRows }, goal: { not: null } },
          orderBy: [{ kampId: "asc" }, { rowIndex: "desc" }],
          select: { kampId: true, goal: true, period: true },
        })
      : [];

    const lastGoalByKampId = new Map<number, { goal: string; period: string | null }>();
    for (const g of lastGoals) {
      if (!lastGoalByKampId.has(g.kampId)) {
        lastGoalByKampId.set(g.kampId, { goal: String(g.goal ?? "").trim(), period: g.period ?? null });
      }
    }

    const formatterDate = new Intl.DateTimeFormat("da-DK", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    function pad2(n: number) {
      return String(n).padStart(2, "0");
    }

    function formatDate(d: Date | null) {
      return d ? formatterDate.format(d) : "";
    }
    function formatTime(t: Date | null) {
      // IMPORTANT: `ta_matches.time` is a TIME-without-timezone value.
      // We must render the raw hh/mm as stored (no timezone conversion).
      if (!t) return "";
      return `${pad2(t.getUTCHours())}.${pad2(t.getUTCMinutes())}`;
    }

    const rows: KalenderRow[] = filteredMatches.map((m) => {
      const isClubMatch = clubTeamNames ? clubTeamNames.has(m.homeTeam) || clubTeamNames.has(m.awayTeam) : false;
      const isTeamMatch = team ? m.homeTeam === team.name || m.awayTeam === team.name : false;

      const kampId = Number.parseInt(String(m.externalId ?? "").trim(), 10);
      const last = Number.isFinite(kampId) && kampId > 0 ? lastGoalByKampId.get(kampId) ?? null : null;

      const resultText = (() => {
        const fromEvents = last?.goal ? parseScoreText(last.goal) : null;
        if (fromEvents) {
          const isOt = isOvertimePeriod(last?.period);
          const base = `${fromEvents.home}-${fromEvents.away}`;
          return isOt ? `${base} (SV)` : base;
        }

        const fallback = parseScoreText(String((m as { result?: unknown }).result ?? ""));
        if (!fallback) return "";
        const base = `${fallback.home}-${fallback.away}`;
        return fallback.overtime ? `${base} (SV)` : base;
      })();

      const kampIdStr = String(m.externalId ?? "").trim() || m.id;

      return {
        id: kampIdStr,
        dateText: formatDate(m.date),
        timeText: formatTime(m.time),
        league: m.league ?? "",
        pool: m.pool ?? "",
        stage: (m.stage ?? "").trim(),
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeHoldId: String(m.homeHoldId ?? "").trim() || null,
        awayHoldId: String(m.awayHoldId ?? "").trim() || null,
        resultText,
        isClubMatch,
        isTeamMatch,
      };
    });

    return pageShell(
      rows.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">Ingen kampe fundet.</p>
      ) : (
        <KalenderTableClient rows={rows} />
      )
    );
  }

  if (activeTab === "stilling") {
    const selectedGender = gender === "MEN" || gender === "WOMEN" ? gender : null;

    if (!selectedGender) {
      return pageShell(<p className="mt-2 text-sm text-zinc-600">Vælg køn for at se stillingen.</p>);
    }

    if (!leagueFilter) {
      return pageShell(<p className="mt-2 text-sm text-zinc-600">Vælg en liga for at se stillingen.</p>);
    }

    if (!poolFilter) {
      return pageShell(<p className="mt-2 text-sm text-zinc-600">Vælg en pulje for at se stillingen.</p>);
    }

    const standingMatches = await prisma.taMatch.findMany({
      where: {
        ...leagueWhere(leagueFilter, { mergeTopLeagues: true }),
        ...(poolFilter ? { pool: poolFilter } : {}),
        ...(stageFilter ? { stage: stageFilter } : {}),
        ...(seasonStart && seasonEnd ? { date: { gte: seasonStart, lte: seasonEnd } } : {}),
        NOT: { gender: { equals: otherGender ?? "__NONE__", mode: "insensitive" } },
      },
      select: {
        id: true,
        externalId: true,
        date: true,
        league: true,
        stage: true,
        pool: true,
        homeTeam: true,
        awayTeam: true,
        homeHoldId: true,
        awayHoldId: true,
        result: true,
        gender: true,
      },
    });

    const filteredStandingMatches = standingMatches.filter((m) => {
      const text = `${m.league ?? ""} ${m.pool ?? ""}`.trim();

      const stored = normalizeStoredGender((m as { gender?: unknown }).gender);
      if (stored) {
        if (stored !== selectedGender) return false;
      } else {
        const hint = genderHint(text);
        if (!hint) return false;
        if (hint !== selectedGender) return false;
      }

      if (age) {
        if (!matchAge(text, age)) return false;
      }

      // stageFilter + season handled in DB where

      return true;
    });

    const kampIdsForStanding = filteredStandingMatches
      .map((m) => Number.parseInt(String(m.externalId ?? "").trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);

    const lastGoals = kampIdsForStanding.length
      ? await prisma.matchProtocolEvent.findMany({
          where: { kampId: { in: kampIdsForStanding }, goal: { not: null } },
          orderBy: [{ kampId: "asc" }, { rowIndex: "desc" }],
          select: { kampId: true, goal: true, period: true },
        })
      : [];

    const lastGoalByKampId = new Map<number, { goal: string; period: string | null }>();
    for (const g of lastGoals) {
      if (!lastGoalByKampId.has(g.kampId)) {
        lastGoalByKampId.set(g.kampId, { goal: String(g.goal ?? "").trim(), period: g.period ?? null });
      }
    }

    type TeamAgg = {
      team: string;
      played: number;
      wins: number;
      otWins: number;
      otLosses: number;
      losses: number;
      gf: number;
      ga: number;
      points: number;
    };

    function computeRows(groupMatches: typeof filteredStandingMatches) {
      const byTeam = new Map<string, TeamAgg>();
      const ensure = (teamName: string) => {
        const key = String(teamName ?? "").trim();
        if (!key) return null;
        const existing = byTeam.get(key);
        if (existing) return existing;
        const created: TeamAgg = {
          team: key,
          played: 0,
          wins: 0,
          otWins: 0,
          otLosses: 0,
          losses: 0,
          gf: 0,
          ga: 0,
          points: 0,
        };
        byTeam.set(key, created);
        return created;
      };

      for (const m of groupMatches) {
        ensure(m.homeTeam);
        ensure(m.awayTeam);
      }

      for (const m of groupMatches) {
        const homeAgg = ensure(m.homeTeam);
        const awayAgg = ensure(m.awayTeam);
        if (!homeAgg || !awayAgg) continue;

        const kampId = Number.parseInt(String(m.externalId ?? "").trim(), 10);
        const last = Number.isFinite(kampId) && kampId > 0 ? lastGoalByKampId.get(kampId) ?? null : null;

        const scoreFromEvents = last?.goal ? parseScoreText(last.goal) : null;
        const isOtFromEvents = Boolean(scoreFromEvents) && isOvertimePeriod(last?.period);

        const scoreFallback = parseScoreText(String((m as { result?: unknown }).result ?? ""));
        const score = scoreFromEvents ?? scoreFallback;
        const isOt = scoreFromEvents ? isOtFromEvents : Boolean(scoreFallback?.overtime);

        if (!score) continue;

        const homeGoals = score.home;
        const awayGoals = score.away;

        homeAgg.played += 1;
        awayAgg.played += 1;
        homeAgg.gf += homeGoals;
        homeAgg.ga += awayGoals;
        awayAgg.gf += awayGoals;
        awayAgg.ga += homeGoals;

        if (homeGoals > awayGoals) {
          if (isOt) {
            homeAgg.otWins += 1;
            homeAgg.points += 2;
            awayAgg.otLosses += 1;
            awayAgg.points += 1;
          } else {
            homeAgg.wins += 1;
            homeAgg.points += 3;
            awayAgg.losses += 1;
          }
        } else if (awayGoals > homeGoals) {
          if (isOt) {
            awayAgg.otWins += 1;
            awayAgg.points += 2;
            homeAgg.otLosses += 1;
            homeAgg.points += 1;
          } else {
            awayAgg.wins += 1;
            awayAgg.points += 3;
            homeAgg.losses += 1;
          }
        }
      }

      const rows = Array.from(byTeam.values());
      rows.sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points;
        const aDiff = a.gf - a.ga;
        const bDiff = b.gf - b.ga;
        if (aDiff !== bDiff) return bDiff - aDiff;
        if (a.gf !== b.gf) return b.gf - a.gf;
        return a.team.localeCompare(b.team, "da-DK");
      });
      return rows;
    }

    const rows = computeRows(filteredStandingMatches);

    return pageShell(
      rows.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600">Ingen data til stilling.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-700">Hold</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-zinc-700">K</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-zinc-700">V</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-zinc-700">SV</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-zinc-700">ST</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-zinc-700">T</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-zinc-700">Mål</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-zinc-700">P</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const isSelected = holdTeamNameKeys.has(canonicalKey(r.team));
                return (
                  <tr
                    key={r.team}
                    className={
                      isSelected
                        ? "bg-[color:var(--row-highlight)]"
                        : idx % 2 === 0
                          ? "bg-white"
                          : "bg-zinc-50/50"
                    }
                  >
                    <td className="px-3 py-2 text-left text-zinc-900">{r.team}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.played}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.wins}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.otWins}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.otLosses}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.losses}</td>
                    <td className="px-3 py-2 text-center tabular-nums">
                      {r.gf}-{r.ga}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums font-semibold">{r.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )
    );
  }

  if (kampIds.length === 0) {
    const emptyPlayersOnly: StatistikOverviewData = { ...emptyData, selectedTeamName: null, teams: [] };

    return pageShell(
      <StatistikOverviewClient
        data={emptyPlayersOnly}
        title={displayName}
        hideTeams
        hideHeader
        hideInternalTabs
        forceTab="players"
        hidePlayerViewModeToggle
      />
    );
  }

  const [protocolPlayers, protocolEvents] = await Promise.all([
    prisma.matchProtocolPlayer.findMany({
      where: { kampId: { in: kampIds } },
      select: { kampId: true, side: true, number: true, name: true, born: true },
    }),
    prisma.matchProtocolEvent.findMany({
      where: {
        kampId: { in: kampIds },
        OR: [
          { goal: { not: null } },
          { assist: { not: null } },
          { penalty: { not: null } },
          { code: { not: null } },
          { number: { not: null } },
          { time: { not: null } },
        ],
      },
      select: {
        kampId: true,
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
      orderBy: [{ kampId: "asc" }, { rowIndex: "asc" }],
    }),
  ]);

  const kampIdsWithProtoLineup = new Set<number>();
  for (const p of protocolPlayers) kampIdsWithProtoLineup.add(p.kampId);
  const kampIdsWithProtoEvents = new Set<number>();
  for (const e of protocolEvents) kampIdsWithProtoEvents.add(e.kampId);

  const kampIdsNeedUploadLineup = kampIds.filter((k) => !kampIdsWithProtoLineup.has(k));
  const kampIdsNeedUploadEvents = kampIds.filter((k) => !kampIdsWithProtoEvents.has(k));

  const [uploadLineups, uploadEvents] = await Promise.all([
    kampIdsNeedUploadLineup.length
      ? prisma.matchUploadLineup.findMany({
          where: { kampId: { in: kampIdsNeedUploadLineup } },
          select: { kampId: true, venue: true, number: true, name: true, birthday: true },
        })
      : Promise.resolve([]),
    kampIdsNeedUploadEvents.length
      ? prisma.matchUploadEvent.findMany({
          where: {
            kampId: { in: kampIdsNeedUploadEvents },
            OR: [
              { score: { not: null } },
              { pim: { not: null } },
              { event: { not: null } },
              { player1: { not: null } },
              { player2: { not: null } },
              { code: { not: null } },
              { time: { not: null } },
            ],
          },
          select: {
            kampId: true,
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
          orderBy: [{ kampId: "asc" }, { rowIndex: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  const protocolPlayersByKamp = new Map<
    number,
    Array<{ venue: "Hjemme" | "Ude"; number: string; name: string; birthday: string }>
  >();
  for (const p of protocolPlayers) {
    const venue: "Hjemme" | "Ude" = p.side === "HOME" ? "Hjemme" : "Ude";
    const name = norm(p.name);
    if (!name) continue;
    const arr = protocolPlayersByKamp.get(p.kampId) ?? [];
    arr.push({ venue, number: norm(p.number), name, birthday: norm(p.born) });
    protocolPlayersByKamp.set(p.kampId, arr);
  }

  const uploadLineupsByKamp = new Map<
    number,
    Array<{ venue: "Hjemme" | "Ude"; number: string; name: string; birthday: string }>
  >();
  for (const l of uploadLineups) {
    const venue = venueFromAny(l.venue);
    if (!venue) continue;
    const name = norm(l.name);
    if (!name) continue;
    const arr = uploadLineupsByKamp.get(l.kampId) ?? [];
    arr.push({ venue, number: norm(l.number), name, birthday: norm(l.birthday) });
    uploadLineupsByKamp.set(l.kampId, arr);
  }

  const protocolEventsByKamp = new Map<number, typeof protocolEvents>();
  for (const e of protocolEvents) {
    const arr = protocolEventsByKamp.get(e.kampId) ?? [];
    arr.push(e);
    protocolEventsByKamp.set(e.kampId, arr);
  }

  const uploadEventsByKamp = new Map<number, typeof uploadEvents>();
  for (const e of uploadEvents) {
    const arr = uploadEventsByKamp.get(e.kampId) ?? [];
    arr.push(e);
    uploadEventsByKamp.set(e.kampId, arr);
  }

  const now = new Date();

  const playerAgg = new Map<
    string,
    {
      name: string;
      birthday: string;
      lastPlayedAt: number;
      games: Set<number>;
      goals: number;
      assists: number;
      points: number;
      pim: number;
      ppm: number;
      ppa: number;
      ppp: number;
      bpm: number;
      bpa: number;
      bpp: number;
    }
  >();

  const teamAgg = new Map<
    string,
    {
      team: string;
      games: number;
      goalsFor: number;
      goalsAgainst: number;
      ppGoalsFor: number;
      ppGoalsAgainst: number;
      ppAttempts: number;
      bpGoalsFor: number;
      bpGoalsAgainst: number;
      bpAttempts: number;
    }
  >();

  function ensureTeam(teamName: string) {
    const key = norm(teamName);
    const existing = teamAgg.get(key);
    if (existing) return existing;
    const row = {
      team: key,
      games: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      ppGoalsFor: 0,
      ppGoalsAgainst: 0,
      ppAttempts: 0,
      bpGoalsFor: 0,
      bpGoalsAgainst: 0,
      bpAttempts: 0,
    };
    teamAgg.set(key, row);
    return row;
  }

  function ensurePlayer(name: string, birthday: string | null | undefined) {
    const display = norm(name);
    const key = normKey(display);
    const existing = playerAgg.get(key);
    if (existing) {
      if (!existing.birthday && birthday) existing.birthday = norm(birthday);
      return existing;
    }
    const row = {
      name: display,
      birthday: norm(birthday),
      lastPlayedAt: -Infinity,
      games: new Set<number>(),
      goals: 0,
      assists: 0,
      points: 0,
      pim: 0,
      ppm: 0,
      ppa: 0,
      ppp: 0,
      bpm: 0,
      bpa: 0,
      bpp: 0,
    };
    playerAgg.set(key, row);
    return row;
  }

  for (const kampId of kampIds) {
    const ourVenue = kampSideById.get(kampId);
    if (!ourVenue) continue;

    const matchTeams = matchTeamsByKampId.get(kampId);
    if (!matchTeams) continue;

    const homeTeam = norm(matchTeams.homeTeam);
    const awayTeam = norm(matchTeams.awayTeam);
    const homeTeamAgg = ensureTeam(homeTeam);
    const awayTeamAgg = ensureTeam(awayTeam);

    const protoLineup = protocolPlayersByKamp.get(kampId) ?? [];
    const protoEvents = protocolEventsByKamp.get(kampId) ?? [];

    const uploadLineup = uploadLineupsByKamp.get(kampId) ?? [];
    const uploadEvts = uploadEventsByKamp.get(kampId) ?? [];

    const lineupAll = protoLineup.length > 0 ? protoLineup : uploadLineup;
    const rawEvents = protoEvents.length > 0 ? protoEvents : uploadEvts;

    const hasReport = lineupAll.length > 0 || rawEvents.length > 0;
    if (!hasReport) continue;

    homeTeamAgg.games += 1;
    awayTeamAgg.games += 1;

    const lineup = lineupAll.filter((l) => l.venue === ourVenue);

    const canResolvePlayers = lineup.length > 0;

    const lineupByVenueNo = new Map<string, { name: string; birthday: string; venue: "Hjemme" | "Ude" }>();
    const lineupByNo = new Map<string, Array<{ name: string; birthday: string; venue: "Hjemme" | "Ude" }>>();

    if (canResolvePlayers) {
      for (const l of lineup) {
        const number = jerseyKey(l.number);
        if (!number) continue;
        lineupByVenueNo.set(`${l.venue}:${number}`, { name: l.name, birthday: l.birthday, venue: l.venue });

        const arr = lineupByNo.get(number) ?? [];
        arr.push({ name: l.name, birthday: l.birthday, venue: l.venue });
        lineupByNo.set(number, arr);

        const p = ensurePlayer(l.name, l.birthday);
        p.games.add(kampId);

        const matchDateMs = matchDateById.get(kampId) ?? -Infinity;
        if (matchDateMs > p.lastPlayedAt) p.lastPlayedAt = matchDateMs;
      }
    }

    function resolvePlayer(
      numberRaw: string,
      venue: "Hjemme" | "Ude" | null
    ): { name: string; birthday: string; venue: "Hjemme" | "Ude" } | null {
      const number = jerseyKey(numberRaw);
      if (!number) return null;

      if (venue) {
        const li = lineupByVenueNo.get(`${venue}:${number}`);
        if (li?.name) return li;
      }

      const candidates = lineupByNo.get(number) ?? [];
      if (candidates.length === 1) return candidates[0] ?? null;
      if (candidates.length > 1) return candidates[0] ?? null;

      return null;
    }

    type NormEvent = {
      venue: "Hjemme" | "Ude" | null;
      periodNum: number;
      timeAbsSeconds: number;
      rowIndex: number;
      player1: string;
      player2: string;
      scoreText: string;
      pimMin: number;
      isGoal: boolean;
    };

    const eventsNorm: NormEvent[] = (Array.isArray(rawEvents) ? rawEvents : [])
      .map((e: unknown): NormEvent | null => {
        if (typeof e !== "object" || !e) return null;
        const r = e as Record<string, unknown>;

        // Protocol shape
        if (Object.prototype.hasOwnProperty.call(r, "side") && Object.prototype.hasOwnProperty.call(r, "goal")) {
          const venue = venueFromAny(String(r.side ?? ""));
          const periodNum = parsePeriod(norm(r.period));
          const sec = (periodNum - 1) * 20 * 60 + parseTimeSeconds(norm(r.time));
          const pimMin = parsePimMinutes(norm(r.penalty), norm(r.code));
          const hasPim = pimMin > 0;
          const scoreText = norm(r.goal);
          const isGoal = Boolean(scoreText);

          return {
            venue,
            periodNum,
            timeAbsSeconds: sec,
            rowIndex: Number(r.rowIndex ?? 0),
            player1: jerseyKey(r.number),
            player2: jerseyKey(r.assist),
            scoreText,
            pimMin: hasPim ? pimMin : 0,
            isGoal,
          };
        }

        // Upload shape
        const venue = venueFromAny(String(r.venue ?? ""));
        const periodNum = parsePeriod(norm(r.period));
        const sec = (periodNum - 1) * 20 * 60 + parseTimeSeconds(norm(r.time));
        const pimMin = parsePimMinutes(norm(r.pim), norm(r.code));
        const hasPim = pimMin > 0;
        const scoreText = norm(r.score);
        const isGoal = Boolean(scoreText) || normKey(r.event) === "goal";

        return {
          venue,
          periodNum,
          timeAbsSeconds: sec,
          rowIndex: Number(r.rowIndex ?? 0),
          player1: jerseyKey(r.player1),
          player2: jerseyKey(r.player2),
          scoreText,
          pimMin: hasPim ? pimMin : 0,
          isGoal,
        };
      })
      .filter((v): v is NormEvent => Boolean(v))
      .sort((a, b) => a.timeAbsSeconds - b.timeAbsSeconds || a.rowIndex - b.rowIndex);

    const penaltySegs: PenSeg[] = [];

    let lastScore: { home: number; away: number } | null = null;
    function parseScore(scoreText: string): { home: number; away: number } | null {
      const s = norm(scoreText);
      const m = s.match(/(\d+)\s*-\s*(\d+)/);
      if (!m?.[1] || !m?.[2]) return null;
      const home = Number.parseInt(m[1], 10);
      const away = Number.parseInt(m[2], 10);
      if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
      return { home, away };
    }

    for (const e of eventsNorm) {
      if (e.venue && e.pimMin > 0) {
        const attempts = attemptCount(e.pimMin);
        const penalizedTeamName = e.venue === "Hjemme" ? homeTeam : awayTeam;
        const otherTeamName = e.venue === "Hjemme" ? awayTeam : homeTeam;

        ensureTeam(otherTeamName).ppAttempts += attempts;
        ensureTeam(penalizedTeamName).bpAttempts += attempts;

        const t = e.timeAbsSeconds;
        if (e.pimMin === 4) {
          penaltySegs.push({ team: e.venue, start: t, end: t + 120 });
          penaltySegs.push({ team: e.venue, start: t + 120, end: t + 240 });
        } else {
          penaltySegs.push({ team: e.venue, start: t, end: t + e.pimMin * 60 });
        }

        if (canResolvePlayers && e.venue === ourVenue && e.player1) {
          const li = resolvePlayer(e.player1, e.venue);
          if (li?.name) ensurePlayer(li.name, li.birthday).pim += e.pimMin;
        }
      }

      if (e.isGoal) {
        const t = e.timeAbsSeconds;
        let scoringVenue: "Hjemme" | "Ude" | null = e.venue;

        const curScore = e.scoreText ? parseScore(e.scoreText) : null;

        if (!scoringVenue) {
          if (curScore) {
            if (lastScore) {
              if (curScore.home === lastScore.home + 1 && curScore.away === lastScore.away) scoringVenue = "Hjemme";
              else if (curScore.away === lastScore.away + 1 && curScore.home === lastScore.home) scoringVenue = "Ude";
            } else {
              if (curScore.home > curScore.away) scoringVenue = "Hjemme";
              else if (curScore.away > curScore.home) scoringVenue = "Ude";
            }
          }
        }

        if (curScore) lastScore = curScore;

        let strength: "PP" | "BP" | "" = "";
        if (scoringVenue) {
          const defendingVenue: "Hjemme" | "Ude" = scoringVenue === "Hjemme" ? "Ude" : "Hjemme";

          const scoringTeamName = scoringVenue === "Hjemme" ? homeTeam : awayTeam;
          const defendingTeamName = scoringVenue === "Hjemme" ? awayTeam : homeTeam;

          const a = activeCount(penaltySegs, scoringVenue, t);
          const b = activeCount(penaltySegs, defendingVenue, t);

          if (b > a) strength = "PP";
          else if (a > b) strength = "BP";

          if (strength === "PP") {
            cancelOnePenalty(penaltySegs, defendingVenue, t);
          }

          ensureTeam(scoringTeamName).goalsFor += 1;
          ensureTeam(defendingTeamName).goalsAgainst += 1;

          if (strength === "PP") {
            ensureTeam(scoringTeamName).ppGoalsFor += 1;
            ensureTeam(defendingTeamName).bpGoalsAgainst += 1;
          } else if (strength === "BP") {
            ensureTeam(scoringTeamName).bpGoalsFor += 1;
            ensureTeam(defendingTeamName).ppGoalsAgainst += 1;
          }
        }

        if (canResolvePlayers && scoringVenue === ourVenue && e.player1) {
          const li = resolvePlayer(e.player1, scoringVenue);
          if (li?.name) {
            const p = ensurePlayer(li.name, li.birthday);
            p.goals += 1;
            p.points += 1;
            if (strength === "PP") {
              p.ppm += 1;
              p.ppp += 1;
            } else if (strength === "BP") {
              p.bpm += 1;
              p.bpp += 1;
            }
          }
        }

        if (canResolvePlayers && scoringVenue === ourVenue && e.player2) {
          const li = resolvePlayer(e.player2, scoringVenue);
          if (li?.name) {
            const p = ensurePlayer(li.name, li.birthday);
            p.assists += 1;
            p.points += 1;
            if (strength === "PP") {
              p.ppa += 1;
              p.ppp += 1;
            } else if (strength === "BP") {
              p.bpa += 1;
              p.bpp += 1;
            }
          }
        }
      }
    }
  }

  const players: StatistikPlayerRow[] = Array.from(playerAgg.values())
    .map((p) => {
      const games = p.games.size;
      return {
        name: p.name,
        team: displayName,
        holdId: holdIdNorm,
        age: p.birthday ? computeAge(p.birthday, now) : null,
        games,
        goals: p.goals,
        assists: p.assists,
        points: p.points,
        pim: p.pim,
        ppm: p.ppm,
        ppa: p.ppa,
        ppp: p.ppp,
        bpm: p.bpm,
        bpa: p.bpa,
        bpp: p.bpp,
        highlight: null,
      };
    })
    .sort((a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name, "da-DK"));

  const teamsOut: StatistikTeamRow[] = Array.from(teamAgg.values())
    .filter((t) => t.games > 0)
    .map((t) => ({
      team: t.team,
      holdId: null,
      games: t.games,
      goalsFor: t.goalsFor,
      goalsAgainst: t.goalsAgainst,
      goalsDiff: t.goalsFor - t.goalsAgainst,
      ppGoalsFor: t.ppGoalsFor,
      ppGoalsAgainst: t.ppGoalsAgainst,
      ppAttempts: t.ppAttempts,
      bpGoalsFor: t.bpGoalsFor,
      bpGoalsAgainst: t.bpGoalsAgainst,
      bpAttempts: t.bpAttempts,
      highlight: null,
    }));

  // Map team names to holdId (for unique hold rows) and pick latest used name per holdId.
  const teamNamesNeeded = new Set<string>();
  for (const t of teamsOut) {
    const name = norm(t.team);
    if (name) teamNamesNeeded.add(name);
  }

  const teamsForLinks = teamNamesNeeded.size
    ? await prisma.taTeam.findMany({
        where: {
          ...(leagueFilter ? { league: leagueFilter } : {}),
          name: { in: Array.from(teamNamesNeeded) },
        },
        select: { name: true, holdId: true },
      })
    : [];

  const holdIdsByTeamKey = new Map<string, Set<string>>();
  for (const t of teamsForLinks) {
    const hid = norm(t.holdId);
    if (!hid) continue;
    const key = canonicalKey(t.name);
    if (!key) continue;
    const s = holdIdsByTeamKey.get(key) ?? new Set<string>();
    s.add(hid);
    holdIdsByTeamKey.set(key, s);
  }

  function holdIdForTeamName(teamName: string): string | null {
    const key = canonicalKey(teamName);
    if (!key) return null;
    const s = holdIdsByTeamKey.get(key);
    if (!s || s.size !== 1) return null;
    return Array.from(s)[0] ?? null;
  }

  const lastUsedByTeamName = new Map<string, number>();
  for (const m of filteredMatches) {
    const ms = Math.max(m.date?.getTime() ?? -Infinity, m.time?.getTime() ?? -Infinity);
    if (!Number.isFinite(ms)) continue;
    const h = norm(m.homeTeam);
    const a = norm(m.awayTeam);
    if (h) lastUsedByTeamName.set(h, Math.max(lastUsedByTeamName.get(h) ?? -Infinity, ms));
    if (a) lastUsedByTeamName.set(a, Math.max(lastUsedByTeamName.get(a) ?? -Infinity, ms));
  }

  const grouped = new Map<
    string,
    {
      holdId: string | null;
      names: Set<string>;
      lastUsedMs: number;
      games: number;
      goalsFor: number;
      goalsAgainst: number;
      ppGoalsFor: number;
      ppGoalsAgainst: number;
      ppAttempts: number;
      bpGoalsFor: number;
      bpGoalsAgainst: number;
      bpAttempts: number;
    }
  >();

  for (const t of teamsOut) {
    const hid = holdIdForTeamName(t.team);
    const key = hid ? `hold:${hid}` : `name:${canonicalKey(t.team) || normKey(t.team)}`;
    const existing = grouped.get(key);

    const nameNorm = norm(t.team);
    const lastUsed = nameNorm ? lastUsedByTeamName.get(nameNorm) ?? -Infinity : -Infinity;

    if (!existing) {
      grouped.set(key, {
        holdId: hid,
        names: new Set(nameNorm ? [nameNorm] : []),
        lastUsedMs: lastUsed,
        games: t.games,
        goalsFor: t.goalsFor,
        goalsAgainst: t.goalsAgainst,
        ppGoalsFor: t.ppGoalsFor,
        ppGoalsAgainst: t.ppGoalsAgainst,
        ppAttempts: t.ppAttempts,
        bpGoalsFor: t.bpGoalsFor,
        bpGoalsAgainst: t.bpGoalsAgainst,
        bpAttempts: t.bpAttempts,
      });
      continue;
    }

    if (nameNorm) existing.names.add(nameNorm);
    existing.lastUsedMs = Math.max(existing.lastUsedMs, lastUsed);
    existing.games += t.games;
    existing.goalsFor += t.goalsFor;
    existing.goalsAgainst += t.goalsAgainst;
    existing.ppGoalsFor += t.ppGoalsFor;
    existing.ppGoalsAgainst += t.ppGoalsAgainst;
    existing.ppAttempts += t.ppAttempts;
    existing.bpGoalsFor += t.bpGoalsFor;
    existing.bpGoalsAgainst += t.bpGoalsAgainst;
    existing.bpAttempts += t.bpAttempts;
  }

  const teamsOutDedup: StatistikTeamRow[] = Array.from(grouped.values())
    .map((g) => {
      const names = Array.from(g.names);
      const chosenName = (() => {
        if (names.length === 0) return "";
        let best = names[0]!;
        let bestMs = lastUsedByTeamName.get(best) ?? -Infinity;
        for (const n of names) {
          const ms = lastUsedByTeamName.get(n) ?? -Infinity;
          if (ms > bestMs) {
            best = n;
            bestMs = ms;
          }
        }
        return best;
      })();

      const isThisHold = g.holdId && g.holdId === holdIdNorm;
      return {
        team: chosenName || names[0] || "",
        holdId: g.holdId,
        games: g.games,
        goalsFor: g.goalsFor,
        goalsAgainst: g.goalsAgainst,
        goalsDiff: g.goalsFor - g.goalsAgainst,
        ppGoalsFor: g.ppGoalsFor,
        ppGoalsAgainst: g.ppGoalsAgainst,
        ppAttempts: g.ppAttempts,
        bpGoalsFor: g.bpGoalsFor,
        bpGoalsAgainst: g.bpGoalsAgainst,
        bpAttempts: g.bpAttempts,
        highlight: isThisHold ? ("team" as const) : null,
      };
    })
    // Prefer linked hold rows, and deterministic ordering.
    .sort((a, b) => {
      const aH = a.holdId ? 0 : 1;
      const bH = b.holdId ? 0 : 1;
      if (aH !== bH) return aH - bH;
      return b.goalsDiff - a.goalsDiff || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team, "da-DK");
    });

  const data: StatistikOverviewData = {
    scopeLabel: `Hold: ${displayName} · Kampe: ${kampIds.length} · ${formatMode(statsAggregationMode)}`,
    mode: statsAggregationMode,
    selectedTeamName: null,
    players,
    teams: [],
  };

  return pageShell(
    <StatistikOverviewClient
      data={data}
      title={displayName}
      hideTeams
      hideHeader
      hideInternalTabs
      forceTab="players"
      hidePlayerViewModeToggle
    />
  );
}
