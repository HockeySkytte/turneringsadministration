import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import KalenderTableClient, { type KalenderRow } from "./KalenderTableClient";

export const dynamic = "force-dynamic";

function firstParam(v: string | string[] | undefined) {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function matchGender(text: string, gender: "MEN" | "WOMEN") {
  const t = text.toLowerCase();
  const womenHints = ["dame", "kvinde", "pige"];
  const menHints = ["herre", "mand", "drenge"];
  const isWomen = womenHints.some((h) => t.includes(h));
  const isMen = menHints.some((h) => t.includes(h));

  if (gender === "WOMEN") return isWomen;
  // MEN: include explicitly men, and also unknown (but exclude explicit women)
  if (isMen) return true;
  return !isWomen;
}

function normalizeStoredGender(gender: unknown): "MEN" | "WOMEN" | null {
  const v = String(gender ?? "")
    .trim()
    .toUpperCase();
  if (v === "MEN" || v === "WOMEN") return v;
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
    // Include anything not marked as Uxx.
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

function isOvertimePeriod(period: string | null | undefined): boolean {
  const p = String(period ?? "").trim().toUpperCase();
  if (!p) return false;
  if (p === "OT") return true;
  const n = Number.parseInt(p, 10);
  return Number.isFinite(n) && n > 3;
}

export default async function KalenderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getAppContext();

  await ensureTurneringDomainTables();

  const sp = await searchParams;

  const season = firstParam(sp?.season);
  const clubId = firstParam(sp?.clubId);
  const gender = firstParam(sp?.gender);
  const age = firstParam(sp?.age);
  const leagueFilter = firstParam(sp?.league);
  const stageFilter = firstParam(sp?.stage);
  const poolFilter = firstParam(sp?.pool);
  const teamId = firstParam(sp?.teamId);
  const matchesMode = (firstParam(sp?.matches) ?? "ALL").toUpperCase();

  const seasonStartYear = season ? Number.parseInt(season, 10) : null;
  const seasonStart =
    seasonStartYear && Number.isFinite(seasonStartYear)
      ? new Date(seasonStartYear, 7, 1)
      : null;
  const seasonEnd =
    seasonStartYear && Number.isFinite(seasonStartYear)
      ? new Date(seasonStartYear + 1, 6, 31, 23, 59, 59, 999)
      : null;

  const team = teamId
    ? await prisma.taTeam.findUnique({
        where: { id: teamId },
        select: { id: true, name: true, clubId: true },
      })
    : null;

  const clubTeamNames = clubId
    ? new Set(
        (
          await prisma.taTeam.findMany({
            where: { clubId },
            select: { name: true },
          })
        ).map((t) => t.name)
      )
    : null;

  const matches = await prisma.taMatch.findMany({
    where: {
      ...(leagueFilter ? { league: leagueFilter } : {}),
      ...(poolFilter ? { pool: poolFilter } : {}),
    },
  });

  const kampIds = matches
    .map((m) => Number.parseInt(String(m.externalId ?? "").trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const lastGoals = kampIds.length
    ? await prisma.matchProtocolEvent.findMany({
        where: { kampId: { in: kampIds }, goal: { not: null } },
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

  const filteredMatches = matches.filter((m) => {
    const text = `${m.league ?? ""} ${m.pool ?? ""}`.trim();

    if (seasonStart && seasonEnd) {
      // If a season is selected, matches without a date must not leak into the results.
      if (!m.date) return false;
      if (m.date < seasonStart || m.date > seasonEnd) return false;
    }

    if (gender === "MEN" || gender === "WOMEN") {
      if (!matchGenderForMatch({ text, storedGender: (m as { gender?: unknown }).gender }, gender)) return false;
    }

    if (age) {
      if (!matchAge(text, age)) return false;
    }

    if (stageFilter) {
      const stage = (m.stage ?? "").trim();
      if (!stage) return false;
      if (stage !== stageFilter) return false;
    }

    const clubMatch = clubTeamNames ? clubTeamNames.has(m.homeTeam) || clubTeamNames.has(m.awayTeam) : false;
    const teamMatch = team ? m.homeTeam === team.name || m.awayTeam === team.name : false;

    // Match mode semantics:
    // ALL: ignore club/team as filters (they are used only for highlighting)
    // CLUB: show only matches for selected club (team is still highlight)
    // TEAM: show only matches for selected team
    if (matchesMode === "CLUB") {
      if (!clubMatch) return false;
    }
    if (matchesMode === "TEAM") {
      if (!teamMatch) return false;
    }

    return true;
  });

  filteredMatches.sort((a, b) => {
    const aDate = a.date?.getTime() ?? Number.POSITIVE_INFINITY;
    const bDate = b.date?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aDate !== bDate) return aDate - bDate;

    const aTime = a.time?.getTime() ?? Number.POSITIVE_INFINITY;
    const bTime = b.time?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;

    return a.id.localeCompare(b.id);
  });

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

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">Kalender</h1>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">
          Ingen kampe fundet. Importér Excel under{" "}
          <a className="underline" href="/turnering">
            Turnering
          </a>
          , og tryk “Overskriv database”.
        </p>
      ) : (
        <KalenderTableClient rows={rows} />
      )}
    </div>
  );
}
