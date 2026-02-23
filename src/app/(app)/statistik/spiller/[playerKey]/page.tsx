import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import PlayerStatsClient, { type SeasonBlock } from "./PlayerStatsClient";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type PlayerAgg = {
  games: number;
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
};

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

function normKey(value: unknown): string {
  return norm(value).toLocaleLowerCase("da-DK");
}

function jerseyKey(value: unknown): string {
  const v = norm(value);
  if (!v) return "";
  const m = v.match(/\d{1,3}/);
  return m ? m[0] : "";
}

function venueFromAny(value: unknown): "Hjemme" | "Ude" | null {
  const v = normKey(value);
  if (v === "home" || v === "hjemme" || v === "h") return "Hjemme";
  if (v === "away" || v === "ude" || v === "u") return "Ude";
  return null;
}

function parsePeriod(value: string): number {
  const v = norm(value).toUpperCase();
  if (v === "OT") return 4;
  const n = Number.parseInt(v, 10);
  if (Number.isFinite(n) && n > 0) return n;
  return 1;
}

function parseTimeSeconds(value: string): number {
  const v = norm(value);
  const m = v.match(/^(\d{1,2})\s*[:.]\s*(\d{2})$/);
  if (!m) return 0;
  const mm = Number.parseInt(m[1]!, 10);
  const ss = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(mm) || !Number.isFinite(ss)) return 0;
  return Math.max(0, mm * 60 + ss);
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

function seasonStartYearFromDate(d: Date): number {
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-based
  // Season: Aug -> Jul
  return m >= 7 ? y : y - 1;
}

function labelSeason(startYear: number): string {
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

function emptyAgg(): PlayerAgg {
  return { games: 0, goals: 0, assists: 0, points: 0, pim: 0, ppm: 0, ppa: 0, ppp: 0, bpm: 0, bpa: 0, bpp: 0 };
}

function addAgg(a: PlayerAgg, b: PlayerAgg): PlayerAgg {
  return {
    games: a.games + b.games,
    goals: a.goals + b.goals,
    assists: a.assists + b.assists,
    points: a.points + b.points,
    pim: a.pim + b.pim,
    ppm: a.ppm + b.ppm,
    ppa: a.ppa + b.ppa,
    ppp: a.ppp + b.ppp,
    bpm: a.bpm + b.bpm,
    bpa: a.bpa + b.bpa,
    bpp: a.bpp + b.bpp,
  };
}

export default async function StatistikSpillerPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerKey: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  await ensureTurneringDomainTables();

  const { playerKey: rawKey } = await params;
  const playerKey = normKey(decodeURIComponent(String(rawKey ?? "")));
  if (!playerKey) redirect("/statistik");

  const sp = (await searchParams) ?? {};
  const displayName = (() => {
    const v = sp?.name;
    const first = Array.isArray(v) ? v[0] : v;
    return norm(first) || null;
  })();

  // Find matches where the player appears in lineups (protocol preferred).
  const kampIdsRaw = await prisma.$queryRaw<Array<{ kampId: number }>>`
    SELECT DISTINCT "kampId" AS "kampId" FROM "MatchProtocolPlayer"
    WHERE lower(trim(coalesce(name, ''))) = ${playerKey}
    UNION
    SELECT DISTINCT "kampId" AS "kampId" FROM "MatchUploadLineup"
    WHERE lower(trim(coalesce(name, ''))) = ${playerKey}
  `;

  const kampIds = kampIdsRaw
    .map((r) => Number(r.kampId))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (kampIds.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-3">
        <div>
          <h1 className="text-2xl font-semibold">{displayName ?? playerKey}</h1>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
          Ingen data for spilleren.
        </div>
      </div>
    );
  }

  const matches = await prisma.taMatch.findMany({
    where: { externalId: { in: kampIds.map((k) => String(k)) } },
    select: {
      externalId: true,
      date: true,
      league: true,
      stage: true,
      homeTeam: true,
      awayTeam: true,
    },
  });

  const matchByKampId = new Map<number, { date: Date | null; league: string; stage: string; homeTeam: string; awayTeam: string }>();
  for (const m of matches) {
    const kampId = Number.parseInt(String(m.externalId ?? "").trim(), 10);
    if (!Number.isFinite(kampId)) continue;
    matchByKampId.set(kampId, {
      date: m.date ?? null,
      league: norm(m.league),
      stage: norm(m.stage),
      homeTeam: norm(m.homeTeam),
      awayTeam: norm(m.awayTeam),
    });
  }

  // We only need lineup rows for this player (to map jersey number -> player for this match).
  const protocolPlayers = await prisma.$queryRaw<
    Array<{ kampId: number; side: "HOME" | "AWAY"; number: string | null; name: string | null; born: string | null }>
  >`
    SELECT "kampId", side, number, name, born
    FROM "MatchProtocolPlayer"
    WHERE "kampId" IN (${Prisma.join(kampIds)})
      AND lower(trim(coalesce(name, ''))) = ${playerKey}
  `;

  const kampIdsWithProtoLineup = new Set<number>(protocolPlayers.map((p) => Number(p.kampId)));
  const kampIdsNeedUploadLineup = kampIds.filter((k) => !kampIdsWithProtoLineup.has(k));

  const uploadLineups = kampIdsNeedUploadLineup.length
    ? await prisma.$queryRaw<
        Array<{ kampId: number; venue: string | null; number: string | null; name: string | null; birthday: string | null }>
      >`
        SELECT "kampId", venue, number, name, birthday
        FROM "MatchUploadLineup"
        WHERE "kampId" IN (${Prisma.join(kampIdsNeedUploadLineup)})
          AND lower(trim(coalesce(name, ''))) = ${playerKey}
      `
    : [];

  const protocolEvents = await prisma.matchProtocolEvent.findMany({
    where: {
      kampId: { in: kampIds },
      OR: [{ goal: { not: null } }, { penalty: { not: null } }, { code: { not: null } }, { time: { not: null } }],
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
  });

  const kampIdsWithProtoEvents = new Set<number>(protocolEvents.map((e) => e.kampId));
  const kampIdsNeedUploadEvents = kampIds.filter((k) => !kampIdsWithProtoEvents.has(k));

  const uploadEvents = kampIdsNeedUploadEvents.length
    ? await prisma.matchUploadEvent.findMany({
        where: {
          kampId: { in: kampIdsNeedUploadEvents },
          OR: [{ score: { not: null } }, { pim: { not: null } }, { event: { not: null } }, { code: { not: null } }, { time: { not: null } }],
        },
        select: {
          kampId: true,
          rowIndex: true,
          venue: true,
          period: true,
          time: true,
          player1: true,
          player2: true,
          score: true,
          event: true,
          pim: true,
          code: true,
        },
        orderBy: [{ kampId: "asc" }, { rowIndex: "asc" }],
      })
    : [];

  const protocolPlayersByKamp = new Map<number, Array<{ venue: "Hjemme" | "Ude"; number: string; name: string; birthday: string }>>();
  for (const p of protocolPlayers) {
    const venue: "Hjemme" | "Ude" = p.side === "HOME" ? "Hjemme" : "Ude";
    const numKey = jerseyKey(p.number);
    const name = norm(p.name);
    if (!numKey || !name) continue;
    const birthday = norm(p.born);
    const arr = protocolPlayersByKamp.get(p.kampId) ?? [];
    arr.push({ venue, number: numKey, name, birthday });
    protocolPlayersByKamp.set(p.kampId, arr);
  }

  const protocolEventsByKamp = new Map<number, typeof protocolEvents>();
  for (const e of protocolEvents) {
    const arr = protocolEventsByKamp.get(e.kampId) ?? [];
    arr.push(e);
    protocolEventsByKamp.set(e.kampId, arr);
  }

  const uploadLineupsByKamp = new Map<number, Array<{ venue: "Hjemme" | "Ude"; number: string; name: string; birthday: string }>>();
  for (const l of uploadLineups) {
    const venue = venueFromAny(l.venue);
    const numKey = jerseyKey(l.number);
    const name = norm(l.name);
    if (!venue || !numKey || !name) continue;
    const birthday = norm(l.birthday);
    const arr = uploadLineupsByKamp.get(l.kampId) ?? [];
    arr.push({ venue, number: numKey, name, birthday });
    uploadLineupsByKamp.set(l.kampId, arr);
  }

  const uploadEventsByKamp = new Map<number, typeof uploadEvents>();
  for (const e of uploadEvents) {
    const arr = uploadEventsByKamp.get(e.kampId) ?? [];
    arr.push(e);
    uploadEventsByKamp.set(e.kampId, arr);
  }

  const resolvedName = (() => {
    type Candidate = { dateMs: number; name: string };
    const candidates: Candidate[] = [];

    for (const p of protocolPlayers) {
      const name = norm(p.name);
      if (!name || normKey(name) !== playerKey) continue;
      const match = matchByKampId.get(p.kampId);
      const dateMs = match?.date ? match.date.getTime() : 0;
      candidates.push({ dateMs, name });
    }

    for (const l of uploadLineups) {
      const name = norm(l.name);
      if (!name || normKey(name) !== playerKey) continue;
      const match = matchByKampId.get(l.kampId);
      const dateMs = match?.date ? match.date.getTime() : 0;
      candidates.push({ dateMs, name });
    }

    candidates.sort((a, b) => b.dateMs - a.dateMs);
    return candidates[0]?.name || displayName || playerKey;
  })();

  type GroupKey = string;
  const aggBySeasonGroup = new Map<number, Map<GroupKey, PlayerAgg>>();

  const overall = emptyAgg();

  for (const kampId of kampIds) {
    const match = matchByKampId.get(kampId);
    if (!match || !match.date) continue;

    const protoLineup = protocolPlayersByKamp.get(kampId) ?? [];
    const uploadLineup = uploadLineupsByKamp.get(kampId) ?? [];

    const lineup = protoLineup.length > 0 ? protoLineup : uploadLineup;
    if (lineup.length === 0) continue;

    const playerLineupRows = lineup.filter((l) => normKey(l.name) === playerKey);
    if (playerLineupRows.length === 0) continue;

    // Determine player's team (venue) for grouping.
    const venue = playerLineupRows[0]!.venue;
    const teamName = venue === "Hjemme" ? match.homeTeam : match.awayTeam;

    const rawEvents = (protocolEventsByKamp.get(kampId) ?? []).length > 0 ? (protocolEventsByKamp.get(kampId) ?? []) : (uploadEventsByKamp.get(kampId) ?? []);

    // Map jersey number -> player row for resolution.
    const lineupByVenueNo = new Map<string, { name: string; birthday: string; venue: "Hjemme" | "Ude" }>();
    const lineupByNo = new Map<string, Array<{ name: string; birthday: string; venue: "Hjemme" | "Ude" }>>();
    for (const l of lineup) {
      lineupByVenueNo.set(`${l.venue}:${l.number}`, { name: l.name, birthday: l.birthday, venue: l.venue });
      const arr = lineupByNo.get(l.number) ?? [];
      arr.push({ name: l.name, birthday: l.birthday, venue: l.venue });
      lineupByNo.set(l.number, arr);
    }

    function resolvePlayer(numberRaw: string, venueHint: "Hjemme" | "Ude" | null) {
      const number = jerseyKey(numberRaw);
      if (!number) return null;

      if (venueHint) {
        const li = lineupByVenueNo.get(`${venueHint}:${number}`);
        if (li?.name) return li;
      }

      const candidates = lineupByNo.get(number) ?? [];
      if (candidates.length >= 1) return candidates[0] ?? null;
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
      .filter(Boolean)
      .sort((a, b) => (a!.timeAbsSeconds - b!.timeAbsSeconds) || (a!.rowIndex - b!.rowIndex)) as NormEvent[];

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

    const matchAgg = emptyAgg();
    matchAgg.games = 1;

    for (const e of eventsNorm) {
      if (e.venue && e.pimMin > 0) {
        const t = e.timeAbsSeconds;
        const attempts = attemptCount(e.pimMin);
        void attempts; // attempts are not shown on player page, but kept for parity.

        if (e.pimMin === 4) {
          penaltySegs.push({ team: e.venue, start: t, end: t + 120 });
          penaltySegs.push({ team: e.venue, start: t + 120, end: t + 240 });
        } else {
          penaltySegs.push({ team: e.venue, start: t, end: t + e.pimMin * 60 });
        }

        if (e.player1) {
          const li = resolvePlayer(e.player1, e.venue);
          if (li?.name && normKey(li.name) === playerKey) {
            matchAgg.pim += e.pimMin;
          }
        }
      }

      if (e.isGoal) {
        const t = e.timeAbsSeconds;
        let scoringVenue = e.venue;

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
          const a = activeCount(penaltySegs, scoringVenue, t);
          const b = activeCount(penaltySegs, defendingVenue, t);

          if (b > a) strength = "PP";
          else if (a > b) strength = "BP";

          if (strength === "PP") cancelOnePenalty(penaltySegs, defendingVenue, t);
        }

        if (e.player1) {
          const li = resolvePlayer(e.player1, scoringVenue);
          if (li?.name && normKey(li.name) === playerKey) {
            matchAgg.goals += 1;
            matchAgg.points += 1;
            if (strength === "PP") {
              matchAgg.ppm += 1;
              matchAgg.ppp += 1;
            } else if (strength === "BP") {
              matchAgg.bpm += 1;
              matchAgg.bpp += 1;
            }
          }
        }

        if (e.player2) {
          const li = resolvePlayer(e.player2, scoringVenue);
          if (li?.name && normKey(li.name) === playerKey) {
            matchAgg.assists += 1;
            matchAgg.points += 1;
            if (strength === "PP") {
              matchAgg.ppa += 1;
              matchAgg.ppp += 1;
            } else if (strength === "BP") {
              matchAgg.bpa += 1;
              matchAgg.bpp += 1;
            }
          }
        }
      }
    }

    const seasonStartYear = seasonStartYearFromDate(match.date);
    const seasonMap = aggBySeasonGroup.get(seasonStartYear) ?? new Map<GroupKey, PlayerAgg>();

    const groupKey = [teamName || "-", match.league || "-", match.stage || "-"]
      .map((s) => s.trim() || "-")
      .join("|~|");

    const existing = seasonMap.get(groupKey) ?? emptyAgg();
    seasonMap.set(groupKey, addAgg(existing, matchAgg));
    aggBySeasonGroup.set(seasonStartYear, seasonMap);

    const updatedOverall = addAgg(overall, matchAgg);
    overall.games = updatedOverall.games;
    overall.goals = updatedOverall.goals;
    overall.assists = updatedOverall.assists;
    overall.points = updatedOverall.points;
    overall.pim = updatedOverall.pim;
    overall.ppm = updatedOverall.ppm;
    overall.ppa = updatedOverall.ppa;
    overall.ppp = updatedOverall.ppp;
    overall.bpm = updatedOverall.bpm;
    overall.bpa = updatedOverall.bpa;
    overall.bpp = updatedOverall.bpp;
  }

  const seasons = Array.from(aggBySeasonGroup.keys()).sort((a, b) => b - a);

  const seasonBlocks = seasons.map((seasonStartYear) => {
    const groups = aggBySeasonGroup.get(seasonStartYear) ?? new Map();

    const rows = Array.from(groups.entries())
      .map(([k, agg]) => {
        const parts = k.split("|~|");
        const team = parts[0] ?? "-";
        const league = parts[1] ?? "-";
        const stage = parts[2] ?? "-";
        return { team, league, stage, agg };
      })
      .sort((a, b) => (a.team ?? "").localeCompare(b.team ?? "", "da-DK", { numeric: true, sensitivity: "base" }) || (a.league ?? "").localeCompare(b.league ?? "", "da-DK", { sensitivity: "base" }) || (a.stage ?? "").localeCompare(b.stage ?? "", "da-DK", { sensitivity: "base" }));

    let subtotal = emptyAgg();
    for (const r of rows) subtotal = addAgg(subtotal, r.agg);

    return { seasonStartYear, seasonLabel: labelSeason(seasonStartYear), rows, subtotal } satisfies SeasonBlock;
  });

  const initiallyOpenSeasonStartYear = seasons[0];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{resolvedName}</h1>
      </div>

      <PlayerStatsClient
        seasons={seasonBlocks}
        overall={overall}
        initiallyOpenSeasonStartYear={initiallyOpenSeasonStartYear}
      />
    </div>
  );
}
