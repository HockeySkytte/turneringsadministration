import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { requireRefAdmin } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIso(d: Date | null) {
  return d ? d.toISOString() : null;
}

function dateKey(d: Date): string {
  // `ta_matches.date` and `ta_referee_availability.entryDate` are DATE columns.
  // Use the ISO date part as a stable key.
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    await requireRefAdmin();
    await ensureTurneringDomainTables();

    const url = new URL(req.url);
    const league = url.searchParams.get("league");
    const genderRaw = url.searchParams.get("gender");

    // Only include matches with a match date later than today().
    // `ta_matches.date` is a DATE column; we compare using start-of-today in local time.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const baseWhere: Prisma.TaMatchWhereInput = {
      date: { gt: startOfToday },
    };

    const where: Prisma.TaMatchWhereInput = { ...baseWhere };

    if (league && league !== "ALL") where.league = league;

    if (genderRaw && genderRaw !== "ALL") {
      if (genderRaw === "__NULL__") where.gender = null;
      else where.gender = genderRaw;
    }

    const [matches, referees, metaRows] = await Promise.all([
      prisma.taMatch.findMany({
        where,
        select: {
          id: true,
          date: true,
          time: true,
          league: true,
          gender: true,
          stage: true,
          pool: true,
          venue: true,
          venueKey: true,
          venueRef: { select: { lat: true, lng: true } },
          homeTeam: true,
          awayTeam: true,
          dommer1Id: true,
          dommer1: true,
          dommer1Status: true,
          dommer2Id: true,
          dommer2: true,
          dommer2Status: true,
        },
        orderBy: [{ date: "asc" }, { time: "asc" }],
      }),
      prisma.taReferee.findMany({
        select: {
          id: true,
          refereeNo: true,
          name: true,
          partner1: true,
          partner2: true,
          partner3: true,
          eligibleLeagues: true,
          lat: true,
          lng: true,
        },
        orderBy: [{ name: "asc" }],
      }),
      prisma.taMatch.findMany({
        where: baseWhere,
        select: { league: true, gender: true },
      }),
    ]);

    // Transition helper: some installs may have stored `dommer1Id/dommer2Id` as TaReferee.id (cuid).
    // We normalize the response to always expose refereeNo in the `dommer*Id` fields.
    const refereeNoById = new Map(referees.map((r) => [r.id, r.refereeNo] as const));
    const refereeByNo = new Map(referees.map((r) => [r.refereeNo, r] as const));

    const matchDates = matches.map((m) => m.date).filter(Boolean) as Date[];
    const minDate = matchDates.length
      ? new Date(Math.min(...matchDates.map((d) => d.getTime())))
      : null;
    const maxDate = matchDates.length
      ? new Date(Math.max(...matchDates.map((d) => d.getTime())))
      : null;

    const refereeIds = referees.map((r) => r.id);

    const availability = (prisma as any)["taRefereeAvailability"] as any;
    const availabilityRule = (prisma as any)["taRefereeAvailabilityRule"] as any;

    const [segments, rules]: [any[], any[]] = await Promise.all([
      minDate && maxDate && refereeIds.length
        ? availability.findMany({
            where: {
              refereeId: { in: refereeIds },
              entryDate: { gte: minDate, lte: maxDate },
            },
            select: {
              refereeId: true,
              entryDate: true,
              status: true,
              startTime: true,
              endTime: true,
            },
          })
        : Promise.resolve([]),
      refereeIds.length
        ? availabilityRule.findMany({
            where: { refereeId: { in: refereeIds } },
            select: {
              refereeId: true,
              weekday: true,
              status: true,
              startTime: true,
              endTime: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const refereeNoByIdSafe = (id: string) => refereeNoById.get(id) ?? null;

    const availabilitySegments = segments
      .map((s) => {
        const refereeNo = refereeNoByIdSafe(s.refereeId);
        if (!refereeNo) return null;
        return {
          refereeNo,
          entryDate: dateKey(s.entryDate),
          status: s.status,
          startTime: toIso(s.startTime),
          endTime: toIso(s.endTime),
        };
      })
      .filter(Boolean);

    const availabilityRules = rules
      .map((r) => {
        const refereeNo = refereeNoByIdSafe(r.refereeId);
        if (!refereeNo) return null;
        return {
          refereeNo,
          weekday: r.weekday,
          status: r.status,
          startTime: toIso(r.startTime),
          endTime: toIso(r.endTime),
        };
      })
      .filter(Boolean);

    const leagueSet = new Set<string>();
    const genderSet = new Set<string | null>();

    for (const r of metaRows) {
      if (r.league && r.league.trim()) leagueSet.add(r.league);
      genderSet.add(r.gender ?? null);
    }

    const leagues = Array.from(leagueSet).sort((a, b) => a.localeCompare(b, "da"));
    const genders = Array.from(genderSet);
    genders.sort((a, b) => {
      if (a === b) return 0;
      if (a === null) return -1;
      if (b === null) return 1;
      return a.localeCompare(b, "da");
    });

    return NextResponse.json({
      matches: matches.map((m) => {
        const dommer1IdNorm =
          m.dommer1Id && refereeNoById.has(m.dommer1Id) ? refereeNoById.get(m.dommer1Id)! : m.dommer1Id;
        const dommer2IdNorm =
          m.dommer2Id && refereeNoById.has(m.dommer2Id) ? refereeNoById.get(m.dommer2Id)! : m.dommer2Id;

        const dommer1NameNorm =
          !m.dommer1 && dommer1IdNorm ? (refereeByNo.get(dommer1IdNorm)?.name ?? null) : m.dommer1;
        const dommer2NameNorm =
          !m.dommer2 && dommer2IdNorm ? (refereeByNo.get(dommer2IdNorm)?.name ?? null) : m.dommer2;

        return {
          ...m,
          dommer1Id: dommer1IdNorm,
          dommer2Id: dommer2IdNorm,
          dommer1: dommer1NameNorm,
          dommer2: dommer2NameNorm,
          date: toIso(m.date),
          time: toIso(m.time),
          venueLat: m.venueRef?.lat ?? null,
          venueLng: m.venueRef?.lng ?? null,
        };
      }),
      referees: referees.map((r) => ({
        refereeNo: r.refereeNo,
        name: r.name,
        partner1: r.partner1,
        partner2: r.partner2,
        partner3: r.partner3,
        eligibleLeagues: r.eligibleLeagues,
        lat: r.lat,
        lng: r.lng,
      })),
      leagues,
      genders,
      availabilitySegments,
      availabilityRules,
    });
  } catch (err) {
    console.error("/api/dommerpaasaetter/kamppaasetning GET failed", err);
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_AUTHORIZED" ? 403 : 500;
    return NextResponse.json({ message: "Kunne ikke hente kamppåsætning." }, { status });
  }
}
