import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import type { StatsAggregationMode } from "@/components/StatsAggregationModeSlicer";
import type { StatistikOverviewData, StatistikPlayerRow, StatistikTeamRow } from "./statistikTypes";
import StatistikOverviewClient from "./StatistikOverviewClient";

function firstParam(v: string | string[] | undefined) {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function norm(value: unknown): string {
  return String(value ?? "").trim();
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

function jerseyKey(value: unknown): string {
  const s = norm(value);
  if (!s) return "";
  const m = s.match(/(\d+)/);
  if (!m?.[1]) return s;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? String(n) : s;
}

function toLabelSeason(startYear: number) {
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
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

type SearchParams = Record<string, string | string[] | undefined>;

export default async function StatistikOverviewTaServer({
  searchParams,
  mode,
}: {
  searchParams: Promise<SearchParams> | SearchParams;
  mode: StatsAggregationMode;
}) {
  await ensureTurneringDomainTables();

  const sp = await Promise.resolve(searchParams);

  const season = firstParam(sp?.season);
  const clubId = firstParam(sp?.clubId);
  const gender = firstParam(sp?.gender);
  const age = firstParam(sp?.age);
  const leagueFilter = firstParam(sp?.league);
  const stageFilter = firstParam(sp?.stage);
  const poolFilter = firstParam(sp?.pool);
  const teamId = firstParam(sp?.teamId);

  const leagueIn = (() => {
    const v = String(leagueFilter ?? "").trim();
    if (!v) return null;
    if (v === "Unihoc Floorball Liga" || v === "Select Ligaen") {
      return ["Unihoc Floorball Liga", "Select Ligaen"];
    }
    return [v];
  })();

  const debug = firstParam(sp?.debug);
  const debugKampId = (() => {
    const v = firstParam(sp?.debugKampId);
    if (!v) return null;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  })();
  const debugNo = (() => {
    const v = firstParam(sp?.debugNo);
    if (!v) return null;
    const k = jerseyKey(v);
    return k ? k : null;
  })();
  const debugNameKey = (() => {
    const v = firstParam(sp?.debugName);
    if (!v) return null;
    const k = normKey(v);
    return k ? k : null;
  })();

  const seasonStartYear = season ? Number.parseInt(season, 10) : null;
  const seasonStart =
    seasonStartYear && Number.isFinite(seasonStartYear) ? new Date(seasonStartYear, 7, 1) : null;
  const seasonEnd =
    seasonStartYear && Number.isFinite(seasonStartYear)
      ? new Date(seasonStartYear + 1, 6, 31, 23, 59, 59, 999)
      : null;

  const [team, clubsAll, clubTeams] = await Promise.all([
    teamId
      ? prisma.taTeam.findUnique({ where: { id: teamId }, select: { id: true, name: true, clubId: true } })
      : Promise.resolve(null),
    prisma.taClub.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    clubId ? prisma.taTeam.findMany({ where: { clubId }, select: { name: true } }) : Promise.resolve([]),
  ]);

  // Club/team selections are used for highlighting (like Kalender), not for filtering stats.
  const clubTeamKeys = clubId
    ? new Set(clubTeams.map((t) => canonicalKey(t.name)).filter(Boolean))
    : null;

  const clubName = clubId ? clubsAll.find((c) => c.id === clubId)?.name ?? null : null;
  const clubNameKey = clubName ? canonicalKey(clubName) : "";

  const matches = await prisma.taMatch.findMany({
    where: {
      ...(leagueIn ? { league: { in: leagueIn } } : {}),
      ...(poolFilter ? { pool: poolFilter } : {}),
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
      homeHoldId: true,
      awayTeam: true,
      awayHoldId: true,
    },
  });

  const filteredMatches = matches.filter((m) => {
    const text = `${m.league ?? ""} ${m.pool ?? ""}`.trim();

    if (seasonStart && seasonEnd) {
      if (!m.date) return false;
      if (m.date < seasonStart || m.date > seasonEnd) return false;
    }

    if (gender === "MEN" || gender === "WOMEN") {
      if (!matchGender(text, gender)) return false;
    }

    if (age) {
      if (!matchAge(text, age)) return false;
    }

    if (stageFilter) {
      const stage = String(m.stage ?? "").trim();
      if (!stage) return false;
      if (stage !== stageFilter) return false;
    }

    return true;
  });

  const kampItems = filteredMatches
    .map((m) => {
      const kampId = m.externalId ? Number.parseInt(String(m.externalId), 10) : NaN;
      if (!Number.isFinite(kampId)) return null;
      return {
        kampId,
        homeTeam: norm(m.homeTeam),
        awayTeam: norm(m.awayTeam),
        homeHoldId: norm((m as { homeHoldId?: unknown }).homeHoldId),
        awayHoldId: norm((m as { awayHoldId?: unknown }).awayHoldId),
        matchDateMs: m.date ? m.date.getTime() : -Infinity,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const kampIds = Array.from(new Set(kampItems.map((x) => x.kampId)));

  if (kampIds.length === 0) {
    const seasonLabel = seasonStartYear && Number.isFinite(seasonStartYear) ? toLabelSeason(seasonStartYear) : null;
    const modeLabel = mode === "TOTAL" ? "Total" : "Per kamp";

    const empty: StatistikOverviewData = {
      scopeLabel: [
        `Sæson: ${seasonLabel ?? "-"}`,
        `Forening: ${clubName ?? "-"}`,
        `Liga: ${leagueFilter ?? "-"}`,
        `Pulje: ${poolFilter ?? "-"}`,
        modeLabel,
      ].join(" · "),
      mode,
      selectedTeamName: team?.name ?? null,
      players: [],
      teams: [],
    };

    return <StatistikOverviewClient data={empty} />;
  }

  const [protocolPlayers, protocolEvents, uploadLineups, uploadEvents] = await Promise.all([
    prisma.matchProtocolPlayer.findMany({
      where: { kampId: { in: kampIds } },
      select: { kampId: true, side: true, number: true, name: true, born: true },
    }),
    prisma.matchProtocolEvent.findMany({
      where: { kampId: { in: kampIds } },
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
    prisma.matchUploadLineup.findMany({
      where: { kampId: { in: kampIds } },
      select: { kampId: true, venue: true, number: true, name: true, birthday: true },
    }),
    prisma.matchUploadEvent.findMany({
      where: { kampId: { in: kampIds } },
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
    }),
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

  const uploadLineupsByKamp = new Map<number, Array<{ venue: "Hjemme" | "Ude"; number: string; name: string; birthday: string }>>();
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

  const matchByKampId = new Map<
    number,
    { homeTeam: string; awayTeam: string; homeHoldId: string; awayHoldId: string; matchDateMs: number }
  >();
  for (const m of kampItems) {
    matchByKampId.set(m.kampId, {
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeHoldId: m.homeHoldId,
      awayHoldId: m.awayHoldId,
      matchDateMs: m.matchDateMs,
    });
  }

  // Prefer holdId linking from published matches (ta_matches.homeHoldId/awayHoldId).
  // This stays stable even when team names vary across seasons or a player has multiple teams.
  const latestHoldByTeamKey = new Map<string, { holdId: string; at: number }>();
  for (const m of kampItems) {
    const at = m.matchDateMs;

    const homeKey = canonicalKey(m.homeTeam);
    const homeHoldId = norm(m.homeHoldId);
    if (homeKey && homeHoldId) {
      const prev = latestHoldByTeamKey.get(homeKey);
      if (!prev || at >= prev.at) latestHoldByTeamKey.set(homeKey, { holdId: homeHoldId, at });
    }

    const awayKey = canonicalKey(m.awayTeam);
    const awayHoldId = norm(m.awayHoldId);
    if (awayKey && awayHoldId) {
      const prev = latestHoldByTeamKey.get(awayKey);
      if (!prev || at >= prev.at) latestHoldByTeamKey.set(awayKey, { holdId: awayHoldId, at });
    }
  }

  const now = new Date();

  const playerAgg = new Map<
    string,
    {
      name: string;
      birthday: string;
      lastTeam: string;
      lastHoldId: string;
      lastPlayedAt: number;
      teamKeysPlayed: Set<string>;
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
      lastTeam: "",
      lastHoldId: "",
      lastPlayedAt: -Infinity,
      teamKeysPlayed: new Set<string>(),
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
    const match = matchByKampId.get(kampId);
    if (!match) continue;

    const homeTeam = norm(match.homeTeam);
    const awayTeam = norm(match.awayTeam);
    const homeTeamAgg = ensureTeam(homeTeam);
    const awayTeamAgg = ensureTeam(awayTeam);

    const protoLineup = protocolPlayersByKamp.get(kampId) ?? [];
    const protoEvents = protocolEventsByKamp.get(kampId) ?? [];

    const uploadLineup = uploadLineupsByKamp.get(kampId) ?? [];
    const uploadEvts = uploadEventsByKamp.get(kampId) ?? [];

    const lineup = protoLineup.length > 0 ? protoLineup : uploadLineup;
    const rawEvents = protoEvents.length > 0 ? protoEvents : uploadEvts;

    const hasReport = lineup.length > 0 || rawEvents.length > 0;
    if (!hasReport) continue;

    homeTeamAgg.games += 1;
    awayTeamAgg.games += 1;

    const lineupByVenueNo = new Map<string, { name: string; birthday: string; venue: "Hjemme" | "Ude" }>();
    const lineupByNo = new Map<string, Array<{ name: string; birthday: string; venue: "Hjemme" | "Ude" }>>();
    for (const l of lineup) {
      const number = jerseyKey(l.number);
      if (!number) continue;
      lineupByVenueNo.set(`${l.venue}:${number}`, { name: l.name, birthday: l.birthday, venue: l.venue });

      const arr = lineupByNo.get(number) ?? [];
      arr.push({ name: l.name, birthday: l.birthday, venue: l.venue });
      lineupByNo.set(number, arr);

      const p = ensurePlayer(l.name, l.birthday);
      p.games.add(kampId);

      const teamName = l.venue === "Hjemme" ? homeTeam : awayTeam;
      p.teamKeysPlayed.add(canonicalKey(teamName));

      const holdId = l.venue === "Hjemme" ? norm(match.homeHoldId) : norm(match.awayHoldId);

      if (match.matchDateMs > p.lastPlayedAt) {
        p.lastPlayedAt = match.matchDateMs;
        p.lastTeam = teamName;
        p.lastHoldId = holdId;
      }
    }

    function resolvePlayer(numberRaw: string, venue: "Hjemme" | "Ude" | null): { name: string; birthday: string; venue: "Hjemme" | "Ude" } | null {
      const number = jerseyKey(numberRaw);
      if (!number) return null;

      if (venue) {
        const li = lineupByVenueNo.get(`${venue}:${number}`);
        if (li?.name) return li;
      }

      const candidates = lineupByNo.get(number) ?? [];
      if (candidates.length === 1) return candidates[0] ?? null;
      if (candidates.length > 1) {
        return candidates[0] ?? null;
      }

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

        if (e.player1) {
          const li = resolvePlayer(e.player1, e.venue);
          if (li?.name) ensurePlayer(li.name, li.birthday).pim += e.pimMin;
        }
      }

      if (e.isGoal) {
        const t = e.timeAbsSeconds;
        let scoringVenue = e.venue;

        const curScore = e.scoreText ? parseScore(e.scoreText) : null;

        // If venue/side is missing on the event, infer it from score progression.
        // This removes discrepancies where club/team filtering affects ambiguous jersey-number resolution.
        if (!scoringVenue) {
          if (curScore) {
            if (lastScore) {
              if (curScore.home === lastScore.home + 1 && curScore.away === lastScore.away) scoringVenue = "Hjemme";
              else if (curScore.away === lastScore.away + 1 && curScore.home === lastScore.home) scoringVenue = "Ude";
            } else {
              // First goal in match: whichever side leads after this goal is assumed to have scored.
              if (curScore.home > curScore.away) scoringVenue = "Hjemme";
              else if (curScore.away > curScore.home) scoringVenue = "Ude";
            }
          }
        }

        // Always advance score tracking when a score is present (even if venue was already known),
        // so later goal rows missing venue can still be inferred correctly.
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

        if (e.player1) {
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

        if (e.player2) {
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

        if (debug === "1" && (!debugKampId || debugKampId === kampId)) {
          const p1 = e.player1 ? resolvePlayer(e.player1, scoringVenue) : null;
          const p2 = e.player2 ? resolvePlayer(e.player2, scoringVenue) : null;

          const p1NameKey = p1?.name ? normKey(p1.name) : null;
          const p2NameKey = p2?.name ? normKey(p2.name) : null;

          const matchDebugNo = debugNo && (e.player1 === debugNo || e.player2 === debugNo);
          const matchDebugName =
            debugNameKey && (p1NameKey === debugNameKey || p2NameKey === debugNameKey);

          if (!debugNo && !debugNameKey) {
            // No specific selector => don't spam logs.
          } else if (matchDebugNo || matchDebugName) {
            // eslint-disable-next-line no-console
            console.log("[statistik-debug]", {
              kampId,
              rowIndex: e.rowIndex,
              timeAbsSeconds: e.timeAbsSeconds,
              scoreText: e.scoreText,
              eventVenue: e.venue,
              scoringVenue,
              player1No: e.player1,
              player1Resolved: p1?.name ?? null,
              player2No: e.player2,
              player2Resolved: p2?.name ?? null,
            });
          }
        }
      }
    }
  }

  const highlightTeamKey = team?.name ? canonicalKey(team.name) : "";

  const players: StatistikPlayerRow[] = Array.from(playerAgg.values())
    .map((p) => {
      const games = p.games.size;

      let highlight: "club" | "team" | null = null;
      if (highlightTeamKey !== "" && p.teamKeysPlayed.has(highlightTeamKey)) highlight = "team";
      else if (clubTeamKeys && clubTeamKeys.size > 0) {
        for (const k of p.teamKeysPlayed) {
          if (clubTeamKeys.has(k)) {
            highlight = "club";
            break;
          }
        }
      }

      return {
        name: p.name,
        team: p.lastTeam,
        holdId: norm(p.lastHoldId) || null,
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
        highlight,
      };
    })
    .sort((a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name, "da-DK"));

  const teams: StatistikTeamRow[] = Array.from(teamAgg.values())
    .filter((t) => t.games > 0)
    .map((t) => {
      const teamKey = canonicalKey(t.team);
      const isTeam = highlightTeamKey !== "" && teamKey === highlightTeamKey;
      const isClub = !isTeam && Boolean(clubTeamKeys && clubTeamKeys.has(teamKey));

      const highlight = isTeam ? ("team" as const) : isClub ? ("club" as const) : null;

      return {
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
        highlight,
      };
    })
    .sort((a, b) => b.goalsDiff - a.goalsDiff || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team, "da-DK"));

  function holdIdForTeamName(teamName: string): string | null {
    const key = canonicalKey(teamName);
    if (!key) return null;
    return latestHoldByTeamKey.get(key)?.holdId ?? null;
  }

  const playersWithHold: StatistikPlayerRow[] = players.map((p) => ({
    ...p,
    holdId: p.holdId ?? holdIdForTeamName(p.team),
  }));

  const teamsWithHold: StatistikTeamRow[] = teams.map((t) => ({
    ...t,
    holdId: holdIdForTeamName(t.team),
  }));

  const seasonLabel = seasonStartYear && Number.isFinite(seasonStartYear) ? toLabelSeason(seasonStartYear) : null;
  const modeLabel = mode === "TOTAL" ? "Total" : "Per kamp";
  const scopeLabel = [
    `Sæson: ${seasonLabel ?? "-"}`,
    `Forening${clubId ? " (markering)" : ""}: ${clubName ?? "-"}`,
    `Køn: ${gender === "MEN" ? "Herre" : gender === "WOMEN" ? "Dame" : "-"}`,
    `Alder: ${age ?? "-"}`,
    `Liga: ${leagueFilter ?? "-"}`,
    `Stadie: ${stageFilter ?? "-"}`,
    `Pulje: ${poolFilter ?? "-"}`,
    `Hold${teamId ? " (markering)" : ""}: ${team?.name ?? "-"}`,
    modeLabel,
  ].join(" · ");

  const data: StatistikOverviewData = {
    scopeLabel,
    mode,
    selectedTeamName: team?.name ?? null,
    players: playersWithHold,
    teams: teamsWithHold,
  };

  return <StatistikOverviewClient data={data} />;
}
