import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTournamentAdmin } from "@/lib/auth";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

export const dynamic = "force-dynamic";

function seasonWindow(startYear: number) {
  // Same season semantics as Kalender: Aug 1 -> Jul 31
  const seasonStart = new Date(startYear, 7, 1);
  const seasonEnd = new Date(startYear + 1, 6, 31, 23, 59, 59, 999);
  return { seasonStart, seasonEnd };
}

export async function GET(req: Request) {
  await requireTournamentAdmin();
  await ensureTurneringDomainTables();

  const url = new URL(req.url);
  const seasonStartYearRaw = url.searchParams.get("seasonStartYear");
  const seasonStartYear = seasonStartYearRaw ? Number.parseInt(seasonStartYearRaw, 10) : null;

  const availableSeasonStartYearsRows = await prisma.competitionSeason.findMany({
    select: { startYear: true },
    orderBy: { startYear: "desc" },
  });
  const availableSeasonStartYears = Array.from(
    new Set(availableSeasonStartYearsRows.map((s) => s.startYear).filter((x) => Number.isFinite(x)))
  );

  const effectiveSeasonStartYear =
    seasonStartYear && Number.isFinite(seasonStartYear)
      ? seasonStartYear
      : availableSeasonStartYears[0] ?? null;

  const window = effectiveSeasonStartYear ? seasonWindow(effectiveSeasonStartYear) : null;

  const taMatches = (await (prisma as any).taMatch.findMany({
    where: {
      ...(window ? { date: { gte: window.seasonStart, lte: window.seasonEnd } } : {}),
      externalId: { not: null },
    },
    select: {
      externalId: true,
      date: true,
      time: true,
      league: true,
      stage: true,
      pool: true,
      homeTeam: true,
      awayTeam: true,
    },
  })) as Array<{
    externalId: string | null;
    date: Date | null;
    time: Date | null;
    league: string | null;
    stage: string | null;
    pool: string | null;
    homeTeam: string;
    awayTeam: string;
  }>;

  const kalenderKampIdSet = new Set<number>();
  for (const m of taMatches) {
    const kampId = m.externalId ? Number.parseInt(String(m.externalId), 10) : NaN;
    if (Number.isFinite(kampId)) kalenderKampIdSet.add(kampId);
  }

  const [protoEvents, protoPlayers, uploadEvents, uploadLineups] = await Promise.all([
    prisma.matchProtocolEvent.findMany({ distinct: ["kampId"], select: { kampId: true } }),
    prisma.matchProtocolPlayer.findMany({ distinct: ["kampId"], select: { kampId: true } }),
    prisma.matchUploadEvent.findMany({ distinct: ["kampId"], select: { kampId: true } }),
    prisma.matchUploadLineup.findMany({ distinct: ["kampId"], select: { kampId: true } }),
  ]);

  const protocolKampIdSet = new Set<number>();
  for (const r of [...protoEvents, ...protoPlayers, ...uploadEvents, ...uploadLineups]) {
    if (Number.isFinite(r.kampId)) protocolKampIdSet.add(r.kampId);
  }

  const missingKampIds = Array.from(protocolKampIdSet).filter((id) => !kalenderKampIdSet.has(id));
  missingKampIds.sort((a, b) => a - b);

  const missingMeta = missingKampIds.length
    ? await prisma.competitionMatch.findMany({
        where: {
          kampId: { in: missingKampIds },
          ...(effectiveSeasonStartYear
            ? { pool: { row: { season: { startYear: effectiveSeasonStartYear } } } }
            : {}),
        },
        select: {
          kampId: true,
          startAt: true,
          homeTeam: true,
          awayTeam: true,
          pool: { select: { name: true, row: { select: { name: true } } } },
        },
      })
    : [];

  const metaByKampId = new Map<number, (typeof missingMeta)[number]>();
  for (const m of missingMeta) metaByKampId.set(m.kampId, m);

  const items = missingKampIds.map((kampId) => {
    const m = metaByKampId.get(kampId);
    return {
      kampId,
      startAt: m?.startAt ?? null,
      league: m?.pool?.row?.name ?? null,
      pool: m?.pool?.name ?? null,
      homeTeam: m?.homeTeam ?? null,
      awayTeam: m?.awayTeam ?? null,
    };
  });

  return NextResponse.json({
    ok: true,
    seasonStartYear: effectiveSeasonStartYear,
    availableSeasonStartYears,
    counts: {
      kalenderKampIds: kalenderKampIdSet.size,
      protocolKampIds: protocolKampIdSet.size,
      missing: missingKampIds.length,
    },
    items,
  });
}
