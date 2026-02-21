import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

function firstParam(v: string | string[] | undefined) {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
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

function isMergedTopLeague(league: string | null): boolean {
  const l = String(league ?? "").trim();
  return l === "Unihoc Floorball Liga" || l === "Select Ligaen";
}

function leagueWhere(
  league: string | null
): { league?: string | { in: string[] } } {
  if (!league) return {};
  if (isMergedTopLeague(league)) {
    return { league: { in: ["Unihoc Floorball Liga", "Select Ligaen"] } };
  }
  return { league };
}

type TeamAgg = {
  team: string;
  holdId: string | null;
  played: number;
  wins: number;
  otWins: number;
  otLosses: number;
  losses: number;
  gf: number;
  ga: number;
  points: number;
};

export default async function StillingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getAppContext();

  await ensureTurneringDomainTables();

  const sp = (await searchParams) ?? {};

  const season = firstParam(sp?.season);
  const clubId = firstParam(sp?.clubId);
  const gender = firstParam(sp?.gender);
  const age = firstParam(sp?.age);
  const leagueFilter = firstParam(sp?.league);
  const stageFilter = firstParam(sp?.stage);
  const poolFilter = firstParam(sp?.pool);
  const teamId = firstParam(sp?.teamId);

  const selectedGender = gender === "MEN" || gender === "WOMEN" ? gender : null;

  if (!selectedGender) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold">Stilling</h1>
        <p className="mt-2 text-sm text-zinc-600">Vælg køn for at se stillingen.</p>
      </div>
    );
  }

  if (!leagueFilter) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold">Stilling</h1>
        <p className="mt-2 text-sm text-zinc-600">Vælg en liga for at se stillingen.</p>
      </div>
    );
  }

  if (!poolFilter) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold">Stilling</h1>
        <p className="mt-2 text-sm text-zinc-600">Vælg en pulje for at se stillingen.</p>
      </div>
    );
  }

  const seasonStartYear = season ? Number.parseInt(season, 10) : null;
  const seasonStart =
    seasonStartYear && Number.isFinite(seasonStartYear)
      ? new Date(seasonStartYear, 7, 1)
      : null;
  const seasonEnd =
    seasonStartYear && Number.isFinite(seasonStartYear)
      ? new Date(seasonStartYear + 1, 6, 31, 23, 59, 59, 999)
      : null;

  const matches = await prisma.taMatch.findMany({
    where: {
      ...leagueWhere(leagueFilter),
      ...(poolFilter ? { pool: poolFilter } : {}),
    },
  });

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

  const filteredMatches = matches.filter((m) => {
    const text = `${m.league ?? ""} ${m.pool ?? ""}`.trim();

    if (seasonStart && seasonEnd) {
      if (!m.date) return false;
      if (m.date < seasonStart || m.date > seasonEnd) return false;
    }

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

    if (stageFilter) {
      const stage = (m.stage ?? "").trim();
      if (!stage) return false;
      if (stage !== stageFilter) return false;
    }

    return true;
  });

  const kampIds = filteredMatches
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

  function computeRows(groupMatches: typeof filteredMatches) {
    const byTeam = new Map<string, TeamAgg>();
    const ensure = (teamName: string, holdId: string | null | undefined) => {
      const name = String(teamName ?? "").trim();
      if (!name) return null;

      const hid = String(holdId ?? "").trim() || null;
      const key = hid ? `hold:${hid}` : `name:${name}`;
      const existing = byTeam.get(key);
      if (existing) return existing;
      const created: TeamAgg = {
        team: name,
        holdId: hid,
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

    // Ensure all teams show up even if no played games yet.
    for (const m of groupMatches) {
      ensure(m.homeTeam, m.homeHoldId);
      ensure(m.awayTeam, m.awayHoldId);
    }

    for (const m of groupMatches) {
      const homeAgg = ensure(m.homeTeam, m.homeHoldId);
      const awayAgg = ensure(m.awayTeam, m.awayHoldId);
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

      if (homeGoals === awayGoals) {
        // Not expected in this competition format, but keep it stable.
        homeAgg.points += 1;
        awayAgg.points += 1;
        continue;
      }

      const homeWon = homeGoals > awayGoals;
      if (homeWon) {
        if (isOt) {
          homeAgg.otWins += 1;
          awayAgg.otLosses += 1;
          homeAgg.points += 2;
          awayAgg.points += 1;
        } else {
          homeAgg.wins += 1;
          awayAgg.losses += 1;
          homeAgg.points += 3;
        }
      } else {
        if (isOt) {
          awayAgg.otWins += 1;
          homeAgg.otLosses += 1;
          awayAgg.points += 2;
          homeAgg.points += 1;
        } else {
          awayAgg.wins += 1;
          homeAgg.losses += 1;
          awayAgg.points += 3;
        }
      }
    }

    return Array.from(byTeam.values())
      .map((r) => ({
        ...r,
        gd: r.gf - r.ga,
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.gd !== a.gd) return b.gd - a.gd;
        if (b.gf !== a.gf) return b.gf - a.gf;
        return a.team.localeCompare(b.team);
      });
  }

  const groups = new Map<string, { league: string; pool: string; matches: typeof filteredMatches }>();
  for (const m of filteredMatches) {
    const league = String(m.league ?? "").trim();
    const pool = String(m.pool ?? "").trim();
    const key = `${league}||${pool}`;
    const existing = groups.get(key);
    if (existing) {
      existing.matches.push(m);
    } else {
      groups.set(key, { league, pool, matches: [m] });
    }
  }

  const groupList = Array.from(groups.values()).sort((a, b) => {
    const l = a.league.localeCompare(b.league);
    if (l !== 0) return l;
    return a.pool.localeCompare(b.pool);
  });

  if (groupList.length > 1) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold">Stilling</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Den valgte pulje findes i flere rækker. Vælg også en række for at se én stilling.
        </p>
      </div>
    );
  }

  const activeGroup = groupList[0] ?? null;
  const activeRows = activeGroup ? computeRows(activeGroup.matches) : [];
  const activeTitle = activeGroup
    ? [activeGroup.league, activeGroup.pool].filter(Boolean).join(" · ") || "Ukendt"
    : "Ukendt";

  function holdHref(holdId: string): string {
    const qs = new URLSearchParams();
    if (season) qs.set("season", season);
    qs.set("gender", selectedGender!);
    if (age) qs.set("age", age);
    qs.set("league", leagueFilter!);
    if (stageFilter) qs.set("stage", stageFilter);
    qs.set("pool", poolFilter!);
    qs.set("tab", "stilling");
    const q = qs.toString();
    return `/hold/${encodeURIComponent(holdId)}${q ? `?${q}` : ""}`;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">Stilling</h1>
      {!activeGroup ? (
        <p className="mt-2 text-sm text-zinc-600">Ingen kampe fundet for de valgte filtre.</p>
      ) : (
        <div className="mt-4 space-y-2">
          <h2 className="text-sm font-semibold text-zinc-700">{activeTitle}</h2>

          {activeRows.length === 0 ? (
            <p className="text-sm text-zinc-600">Ingen kampe fundet.</p>
          ) : (
            <div className="overflow-auto rounded-xl border border-zinc-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">#</th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Hold</th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-right text-xs font-semibold text-zinc-700">K</th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-right text-xs font-semibold text-zinc-700">V</th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-right text-xs font-semibold text-zinc-700">V-OT</th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-right text-xs font-semibold text-zinc-700">T-OT</th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-right text-xs font-semibold text-zinc-700">T</th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-right text-xs font-semibold text-zinc-700">MF</th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-right text-xs font-semibold text-zinc-700">MA</th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-right text-xs font-semibold text-zinc-700">+/-</th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-right text-xs font-semibold text-zinc-700">P</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRows.map((r, idx) => {
                    const isClub = clubTeamNames ? clubTeamNames.has(r.team) : false;
                    const isTeam = team ? r.team === team.name : false;
                    const base = idx % 2 === 0 ? "bg-white" : "bg-zinc-50/50";
                    const highlight = isTeam ? " bg-yellow-50" : isClub ? " bg-blue-50" : "";

                    const holdId = r.holdId;

                    return (
                      <tr key={r.team} className={base + highlight}>
                        <td className="border-b border-zinc-100 px-3 py-2 align-top text-zinc-700">{idx + 1}</td>
                        <td className="border-b border-zinc-100 px-3 py-2 align-top font-medium text-zinc-900">
                          {holdId ? (
                            <Link href={holdHref(holdId)} className="hover:underline">
                              {r.team}
                            </Link>
                          ) : (
                            r.team
                          )}
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-2 align-top text-right text-zinc-700">{r.played}</td>
                        <td className="border-b border-zinc-100 px-3 py-2 align-top text-right text-zinc-700">{r.wins}</td>
                        <td className="border-b border-zinc-100 px-3 py-2 align-top text-right text-zinc-700">{r.otWins}</td>
                        <td className="border-b border-zinc-100 px-3 py-2 align-top text-right text-zinc-700">{r.otLosses}</td>
                        <td className="border-b border-zinc-100 px-3 py-2 align-top text-right text-zinc-700">{r.losses}</td>
                        <td className="border-b border-zinc-100 px-3 py-2 align-top text-right text-zinc-700">{r.gf}</td>
                        <td className="border-b border-zinc-100 px-3 py-2 align-top text-right text-zinc-700">{r.ga}</td>
                        <td className="border-b border-zinc-100 px-3 py-2 align-top text-right text-zinc-700">{r.gd}</td>
                        <td className="border-b border-zinc-100 px-3 py-2 align-top text-right font-semibold text-zinc-900">{r.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
