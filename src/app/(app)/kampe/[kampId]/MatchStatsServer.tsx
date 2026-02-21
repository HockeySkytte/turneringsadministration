import { prisma } from "@/lib/prisma";
import MatchStatsClient from "./MatchStatsClient";
import type { MatchEventRow, MatchPlayerStatsRow, MatchStatsData, TeamVenue } from "./matchStatsTypes";

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

function normKey(value: unknown): string {
  return norm(value).toLocaleLowerCase("da-DK");
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

function parsePimMinutes(pim: string, code?: string): number {
  const p = norm(pim);
  const c = norm(code);
  if (!p) return 0;
  if (/^2\s*\+\s*10$/i.test(p)) return 2;
  if (p === "12" && c === "101") return 2;
  const n = Number.parseInt(p, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatAbsTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function parseBirthday(birthday: string): Date | null {
  const v = norm(birthday);
  if (!v) return null;

  // yyyy-mm-dd
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const y = Number.parseInt(iso[1], 10);
    const m = Number.parseInt(iso[2], 10);
    const d = Number.parseInt(iso[3], 10);
    const dt = new Date(y, m - 1, d);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  // ddmmyy or ddmmyyyy
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

  // dd/mm-yy, dd/mm/yyyy, dd-mm-yy, dd-mm-yyyy
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

function computeAge(birthday: string, matchDate: Date | null): number | null {
  const dob = parseBirthday(birthday);
  if (!dob) return null;
  const ref = matchDate ?? new Date();
  let age = ref.getFullYear() - dob.getFullYear();
  const m = ref.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) age -= 1;
  return Number.isFinite(age) && age >= 0 ? age : null;
}

function venueFromAny(value: string): TeamVenue | null {
  const v = normKey(value);
  if (v === "h" || v === "home" || v === "hjemme") return "Hjemme";
  if (v === "u" || v === "away" || v === "ude") return "Ude";
  return null;
}

function roleRank(role: string): number {
  const r = normKey(role);
  if (r === "c") return 0;
  if (r === "g") return 1;
  return 2;
}

function numberKey(numberValue: string): number {
  const cleaned = norm(numberValue);
  if (!cleaned) return 999999;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : 999999;
}

function sortLineup(rows: MatchPlayerStatsRow[]): MatchPlayerStatsRow[] {
  return [...rows].sort((a, b) => {
    const ra = roleRank(a.role);
    const rb = roleRank(b.role);
    if (ra !== rb) return ra - rb;
    const na = numberKey(a.number);
    const nb = numberKey(b.number);
    if (na !== nb) return na - nb;
    return normKey(a.name).localeCompare(normKey(b.name), "da-DK");
  });
}

type PenSeg = { team: TeamVenue; start: number; end: number };

function activeCount(segs: PenSeg[], team: TeamVenue, t: number): number {
  return segs.filter((s) => s.team === team && s.start <= t && t < s.end).length;
}

function cancelOnePenalty(segs: PenSeg[], defending: TeamVenue, t: number) {
  // Cancel the active segment that ends soonest.
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

function playerKey(venue: TeamVenue, number: string): string {
  return `${venue}:${norm(number)}`;
}

export default async function MatchStatsServer({
  kampId,
  matchDate,
  homeTeam,
  awayTeam,
}: {
  kampId: number;
  matchDate: Date | null;
  homeTeam: string;
  awayTeam: string;
}) {
  const [uploadLineups, uploadEvents] = await Promise.all([
    prisma.matchUploadLineup.findMany({
      where: { kampId },
      orderBy: [{ venue: "asc" }, { rowIndex: "asc" }],
      select: { venue: true, cG: true, number: true, name: true, birthday: true, leader: true, reserve: true },
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
  ]);

  let source: MatchStatsData["source"] = "none";

  let lineups: Array<{ venue: TeamVenue; role: string; number: string; name: string; birthday: string }> = [];
  let eventsRaw: Array<{ rowIndex: number; venue: TeamVenue | null; period: string; time: string; player1: string; player2: string; score: string; event: string; pim: string; code: string }> = [];

  if (uploadLineups.length || uploadEvents.length) {
    source = "upload";
    lineups = uploadLineups
      // Only include players in Statistik (exclude leaders)
      .filter((l: any) => norm(l?.leader).toUpperCase() !== "L" && norm(l?.reserve).toUpperCase() !== "R" && Boolean(norm(l?.number)))
      .map((l) => ({
        venue: (venueFromAny(l.venue) ?? ("Hjemme" as TeamVenue)) as TeamVenue,
        role: norm(l.cG),
        number: norm(l.number),
        name: norm(l.name),
        birthday: norm(l.birthday),
      }));

    eventsRaw = uploadEvents.map((e) => ({
      rowIndex: e.rowIndex,
      venue: venueFromAny(e.venue),
      period: norm(e.period),
      time: norm(e.time),
      player1: norm(e.player1),
      player2: norm(e.player2),
      score: norm(e.score),
      event: norm(e.event),
      pim: norm(e.pim),
      code: norm(e.code),
    }));
  } else {
    const [protocolPlayers, protocolEvents] = await Promise.all([
      prisma.matchProtocolPlayer.findMany({
        where: { kampId },
        orderBy: [{ side: "asc" }, { rowIndex: "asc" }],
        select: { side: true, role: true, number: true, name: true, born: true, leader: true },
      }),
      prisma.matchProtocolEvent.findMany({
        where: { kampId },
        orderBy: { rowIndex: "asc" },
        select: { rowIndex: true, period: true, time: true, side: true, number: true, goal: true, assist: true, penalty: true, code: true },
      }),
    ]);

    if (protocolPlayers.length || protocolEvents.length) {
      source = "protocol";
      lineups = protocolPlayers
        .filter((p: any) => norm(p?.leader).toUpperCase() !== "L" && Boolean(norm(p?.number)))
        .map((p) => ({
          venue: (p.side === "HOME" ? "Hjemme" : "Ude") as TeamVenue,
          role: norm(p.role),
          number: norm(p.number),
          name: norm(p.name),
          birthday: norm(p.born),
        }));

      eventsRaw = protocolEvents.map((e) => ({
        rowIndex: e.rowIndex,
        venue: venueFromAny(norm(e.side)),
        period: norm(e.period),
        time: norm(e.time),
        player1: norm(e.number),
        player2: norm(e.assist),
        score: norm(e.goal),
        event: norm(e.goal) ? "Goal" : norm(e.penalty) ? "Penalty" : norm(e.code) === "401" ? "Time Out" : norm(e.code) === "402" ? "Straffeslag" : "",
        pim: norm(e.penalty),
        code: norm(e.code),
      }));
    }
  }

  if (source === "none") {
    const data: MatchStatsData = {
      kampId,
      matchDateISO: matchDate ? matchDate.toISOString() : null,
      homeTeam,
      awayTeam,
      homeLineup: [],
      awayLineup: [],
      events: [],
      table: [],
      source,
    };
    return <MatchStatsClient data={data} />;
  }

  // Build players map from lineups and events.
  const players = new Map<string, MatchPlayerStatsRow>();

  function ensurePlayer(venue: TeamVenue, number: string) {
    const k = playerKey(venue, number);
    const existing = players.get(k);
    if (existing) return existing;
    const row: MatchPlayerStatsRow = {
      venue,
      number: norm(number),
      role: "",
      name: "",
      age: null,
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
    players.set(k, row);
    return row;
  }

  for (const l of lineups) {
    const p = ensurePlayer(l.venue, l.number);
    p.role = l.role;
    p.name = l.name;
    p.age = l.birthday ? computeAge(l.birthday, matchDate) : null;
  }

  // Normalize events and compute PP/BP timeline.
  const eventsNorm = eventsRaw
    .map((e) => {
      const periodNum = parsePeriod(e.period);
      const sec = (periodNum - 1) * 20 * 60 + parseTimeSeconds(e.time);
      return {
        ...e,
        periodNum,
        timeAbsSeconds: sec,
        timeAbs: formatAbsTime(sec),
      };
    })
    .sort((a, b) => a.timeAbsSeconds - b.timeAbsSeconds || a.rowIndex - b.rowIndex);

  const penaltySegs: PenSeg[] = [];
  const eventsOut: MatchEventRow[] = [];

  for (const e of eventsNorm) {
    const venue = e.venue;
    const t = e.timeAbsSeconds;

    const pimMin = parsePimMinutes(e.pim, e.code);
    const hasPim = pimMin > 0;

    const isGoal = Boolean(norm(e.score));

    if (venue && hasPim) {
      if (pimMin === 4) {
        penaltySegs.push({ team: venue, start: t, end: t + 120 });
        penaltySegs.push({ team: venue, start: t + 120, end: t + 240 });
      } else {
        penaltySegs.push({ team: venue, start: t, end: t + pimMin * 60 });
      }

      // Attribute penalty minutes to player1 if possible.
      if (e.player1) {
        const penPlayer = ensurePlayer(venue, e.player1);
        penPlayer.pim += pimMin;
      }
    }

    let strength: "PP" | "BP" | "" = "";

    if (venue && isGoal) {
      const other: TeamVenue = venue === "Hjemme" ? "Ude" : "Hjemme";
      const a = activeCount(penaltySegs, venue, t);
      const b = activeCount(penaltySegs, other, t);

      if (b > a) strength = "PP";
      else if (a > b) strength = "BP";

      if (strength === "PP") {
        cancelOnePenalty(penaltySegs, other, t);
      }

      // Attribute goal/assist.
      if (e.player1) {
        const scorer = ensurePlayer(venue, e.player1);
        scorer.goals += 1;
        scorer.points += 1;
        if (strength === "PP") {
          scorer.ppm += 1;
          scorer.ppp += 1;
        } else if (strength === "BP") {
          scorer.bpm += 1;
          scorer.bpp += 1;
        }
      }
      if (e.player2) {
        const assister = ensurePlayer(venue, e.player2);
        assister.assists += 1;
        assister.points += 1;
        if (strength === "PP") {
          assister.ppa += 1;
          assister.ppp += 1;
        } else if (strength === "BP") {
          assister.bpa += 1;
          assister.bpp += 1;
        }
      }
    }

    // Build readable player strings for Events view.
    const p1 = venue && e.player1 ? players.get(playerKey(venue, e.player1)) : undefined;
    const p2 = venue && e.player2 ? players.get(playerKey(venue, e.player2)) : undefined;
    const player1Text = e.player1 ? `${e.player1}${p1?.name ? ` ${p1.name}` : ""}` : "";
    const player2Text = e.player2 ? `${e.player2}${p2?.name ? ` ${p2.name}` : ""}` : "";

    eventsOut.push({
      rowIndex: e.rowIndex,
      venue: venue ?? null,
      period: e.period,
      time: e.time,
      timeAbs: e.timeAbs,
      timeAbsSeconds: e.timeAbsSeconds,
      event: e.event || (isGoal ? "Goal" : hasPim ? "Penalty" : ""),
      player1: player1Text,
      player2: player2Text,
      score: e.score,
      pim: e.pim,
      code: e.code,
      strength: isGoal ? strength : "",
    });
  }

  // Fill missing names/roles from lineups where we only have event-based players.
  // (Already covered by ensurePlayer + earlier lineup import.)

  const allRows = Array.from(players.values());
  const homeLineup = sortLineup(allRows.filter((p) => p.venue === "Hjemme" && (p.number || p.name)));
  const awayLineup = sortLineup(allRows.filter((p) => p.venue === "Ude" && (p.number || p.name)));

  const table = [...allRows].map((p) => ({ ...p, points: p.goals + p.assists }));

  const data: MatchStatsData = {
    kampId,
    matchDateISO: matchDate ? matchDate.toISOString() : null,
    homeTeam,
    awayTeam,
    homeLineup,
    awayLineup,
    events: eventsOut,
    table,
    source,
  };

  return <MatchStatsClient data={data} />;
}
