import { prisma } from "@/lib/prisma";
import type { CompetitionFilterContext } from "@/lib/competitionFilters";
import type { StatsAggregationMode } from "@/components/StatsAggregationModeSlicer";
import type { StatistikOverviewData, StatistikPlayerRow, StatistikTeamRow } from "./statistikTypes";
import StatistikOverviewClient from "./StatistikOverviewClient";

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

function normKey(value: unknown): string {
  return norm(value).toLocaleLowerCase("da-DK");
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

export default async function StatistikOverviewServer({
  ctx,
  mode,
  leagueName,
}: {
  ctx: CompetitionFilterContext;
  mode: StatsAggregationMode;
  leagueName: string | null;
}) {
  const where = ctx.effectivePoolIds.length
    ? { poolId: { in: ctx.effectivePoolIds } }
    : ctx.selectedPoolId
      ? { poolId: ctx.selectedPoolId }
      : ctx.selectedRowId
        ? { pool: { rowId: ctx.selectedRowId } }
        : ctx.selectedSeasonId
          ? { pool: { row: { seasonId: ctx.selectedSeasonId } } }
          : {};

  const matches = await prisma.competitionMatch.findMany({
    where,
    select: {
      kampId: true,
      startAt: true,
      homeTeam: true,
      awayTeam: true,
    },
    orderBy: [{ startAt: "desc" }],
  });

  const kampIds = matches.map((m) => m.kampId);

  if (kampIds.length === 0) {
    const poolLabel = ctx.selectedPoolId ? ctx.pools.find((p) => p.id === ctx.selectedPoolId)?.name ?? null : null;
    const seasonLabel = ctx.selectedSeasonStartYear ? `${ctx.selectedSeasonStartYear}-${ctx.selectedSeasonStartYear + 1}` : null;
    const modeLabel = mode === "TOTAL" ? "Total" : "Per kamp";

    const empty: StatistikOverviewData = {
      scopeLabel: [
        `Liga: ${leagueName ?? "-"}`,
        `Pulje: ${poolLabel ?? "-"}`,
        `Sæson: ${seasonLabel ?? "-"}`,
        modeLabel,
      ].join(" · "),
      mode,
      selectedTeamName: ctx.selectedTeamName ?? null,
      players: [],
      teams: [],
    };

    return <StatistikOverviewClient data={empty} />;
  }

  const [lineups, events] = await Promise.all([
    prisma.matchUploadLineup.findMany({
      where: { kampId: { in: kampIds } },
      select: {
        kampId: true,
        venue: true,
        number: true,
        name: true,
        birthday: true,
      },
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

  const matchByKampId = new Map<number, { homeTeam: string; awayTeam: string; startAt: Date | null }>();
  for (const m of matches) {
    matchByKampId.set(m.kampId, {
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      startAt: m.startAt ?? null,
    });
  }

  const lineupsByKamp = new Map<number, Array<{ venue: "Hjemme" | "Ude"; number: string; name: string; birthday: string }>>();
  for (const l of lineups) {
    const venue = venueFromAny(l.venue);
    if (!venue) continue;
    const number = norm(l.number);
    const name = norm(l.name);
    const birthday = norm(l.birthday);
    if (!name) continue;
    const arr = lineupsByKamp.get(l.kampId) ?? [];
    arr.push({ venue, number, name, birthday });
    lineupsByKamp.set(l.kampId, arr);
  }

  const eventsByKamp = new Map<number, typeof events>();
  for (const e of events) {
    const arr = eventsByKamp.get(e.kampId) ?? [];
    arr.push(e);
    eventsByKamp.set(e.kampId, arr);
  }

  const now = new Date();

  const playerAgg = new Map<
    string,
    {
      name: string;
      birthday: string;
      lastTeam: string;
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

  function ensureTeam(team: string) {
    const key = norm(team);
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
    const match = matchByKampId.get(kampId);
    if (!match) continue;

    const homeTeam = norm(match.homeTeam);
    const awayTeam = norm(match.awayTeam);
    const matchDateMs = match.startAt ? match.startAt.getTime() : -Infinity;

    const homeTeamAgg = ensureTeam(homeTeam);
    const awayTeamAgg = ensureTeam(awayTeam);

    const lineup = lineupsByKamp.get(kampId) ?? [];
    const rawEvents = eventsByKamp.get(kampId) ?? [];
    const hasUpload = lineup.length > 0 || rawEvents.length > 0;

    // Only count games for matches that have uploaded match report data.
    if (hasUpload) {
      homeTeamAgg.games += 1;
      awayTeamAgg.games += 1;
    } else {
      continue;
    }

    const lineupByVenueNo = new Map<string, { name: string; birthday: string }>();
    for (const l of lineup) {
      lineupByVenueNo.set(`${l.venue}:${norm(l.number)}`, { name: l.name, birthday: l.birthday });

      const p = ensurePlayer(l.name, l.birthday);
      p.games.add(kampId);

      const teamName = l.venue === "Hjemme" ? homeTeam : awayTeam;
      if (matchDateMs > p.lastPlayedAt) {
        p.lastPlayedAt = matchDateMs;
        p.lastTeam = teamName;
      }
    }

    const eventsNorm = rawEvents
      .map((e) => {
        const venue = venueFromAny(e.venue ?? "");
        const periodNum = parsePeriod(norm(e.period));
        const sec = (periodNum - 1) * 20 * 60 + parseTimeSeconds(norm(e.time));
        const pimMin = parsePimMinutes(norm(e.pim), norm((e as any).code));
        const hasPim = pimMin > 0;
        const isGoal = Boolean(norm(e.score)) || normKey(e.event) === "goal";

        return {
          venue,
          periodNum,
          timeAbsSeconds: sec,
          rowIndex: e.rowIndex,
          player1: norm(e.player1),
          player2: norm(e.player2),
          pimMin: hasPim ? pimMin : 0,
          isGoal,
        };
      })
      .sort((a, b) => a.timeAbsSeconds - b.timeAbsSeconds || a.rowIndex - b.rowIndex);

    const penaltySegs: PenSeg[] = [];

    for (const e of eventsNorm) {
      if (e.venue && e.pimMin > 0) {
        const attempts = attemptCount(e.pimMin);
        const penalizedTeamName = e.venue === "Hjemme" ? homeTeam : awayTeam;
        const otherTeamName = e.venue === "Hjemme" ? awayTeam : homeTeam;

        // PP/BP attempts
        ensureTeam(otherTeamName).ppAttempts += attempts;
        ensureTeam(penalizedTeamName).bpAttempts += attempts;

        // Segments (4-min = two 2-min segments)
        const t = e.timeAbsSeconds;
        if (e.pimMin === 4) {
          penaltySegs.push({ team: e.venue, start: t, end: t + 120 });
          penaltySegs.push({ team: e.venue, start: t + 120, end: t + 240 });
        } else {
          penaltySegs.push({ team: e.venue, start: t, end: t + e.pimMin * 60 });
        }

        // Player penalty minutes
        if (e.player1) {
          const li = lineupByVenueNo.get(`${e.venue}:${e.player1}`);
          if (li?.name) {
            ensurePlayer(li.name, li.birthday).pim += e.pimMin;
          }
        }
      }

      if (e.venue && e.isGoal) {
        const t = e.timeAbsSeconds;
        const scoringVenue = e.venue;
        const defendingVenue: "Hjemme" | "Ude" = scoringVenue === "Hjemme" ? "Ude" : "Hjemme";

        const scoringTeamName = scoringVenue === "Hjemme" ? homeTeam : awayTeam;
        const defendingTeamName = scoringVenue === "Hjemme" ? awayTeam : homeTeam;

        const a = activeCount(penaltySegs, scoringVenue, t);
        const b = activeCount(penaltySegs, defendingVenue, t);

        let strength: "PP" | "BP" | "" = "";
        if (b > a) strength = "PP";
        else if (a > b) strength = "BP";

        if (strength === "PP") {
          cancelOnePenalty(penaltySegs, defendingVenue, t);
        }

        // Goals for/against
        ensureTeam(scoringTeamName).goalsFor += 1;
        ensureTeam(defendingTeamName).goalsAgainst += 1;

        if (strength === "PP") {
          ensureTeam(scoringTeamName).ppGoalsFor += 1;
          ensureTeam(defendingTeamName).bpGoalsAgainst += 1;
        } else if (strength === "BP") {
          ensureTeam(scoringTeamName).bpGoalsFor += 1;
          ensureTeam(defendingTeamName).ppGoalsAgainst += 1;
        }

        // Player goal/assist attribution (from lineup)
        if (e.player1) {
          const li = lineupByVenueNo.get(`${scoringVenue}:${e.player1}`);
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
          const li = lineupByVenueNo.get(`${scoringVenue}:${e.player2}`);
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

  // Ensure all teams in selected pool show up (even with 0 uploaded matches)
  for (const t of ctx.poolTeams) {
    if (t?.name) ensureTeam(t.name);
  }

  const players: StatistikPlayerRow[] = Array.from(playerAgg.values())
    .map((p) => {
      const games = p.games.size;
      return {
        name: p.name,
        team: p.lastTeam,
        holdId: null,
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

  const teams: StatistikTeamRow[] = Array.from(teamAgg.values())
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
    }))
    .sort((a, b) => b.goalsDiff - a.goalsDiff || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team, "da-DK"));

  const poolLabel = ctx.selectedPoolId ? ctx.pools.find((p) => p.id === ctx.selectedPoolId)?.name ?? null : null;
  const seasonLabel = ctx.selectedSeasonStartYear ? `${ctx.selectedSeasonStartYear}-${ctx.selectedSeasonStartYear + 1}` : null;
  const modeLabel = mode === "TOTAL" ? "Total" : "Per kamp";
  const scopeLabel = [
    `Liga: ${leagueName ?? "-"}`,
    `Pulje: ${poolLabel ?? "-"}`,
    `Sæson: ${seasonLabel ?? "-"}`,
    modeLabel,
  ].join(" · ");

  const data: StatistikOverviewData = {
    scopeLabel,
    mode,
    selectedTeamName: ctx.selectedTeamName ?? null,
    players,
    teams,
  };

  return <StatistikOverviewClient data={data} />;
}
