import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureTurneringDomainTables();
  const url = new URL(req.url);
  const clubId = String(url.searchParams.get("clubId") ?? "").trim();
  const league = String(url.searchParams.get("league") ?? "").trim();
  const genderRaw = String(url.searchParams.get("gender") ?? "").trim().toUpperCase();
  const gender: "MEN" | "WOMEN" | "UNKNOWN" | "" =
    genderRaw === "MEN" || genderRaw === "WOMEN" || genderRaw === "UNKNOWN" ? (genderRaw as any) : "";

  if (!clubId || !league) {
    return NextResponse.json({ ok: true, teams: [] });
  }

  const genderSql =
    gender === "MEN" || gender === "WOMEN"
      ? Prisma.sql`AND gender = ${gender}`
      : gender === "UNKNOWN"
        ? Prisma.sql`AND (gender IS NULL OR TRIM(gender) = '')`
        : Prisma.sql``;

  const teamsRaw = await prisma.$queryRaw<Array<{ id: string; name: string; holdId: string | null }>>(
    Prisma.sql`
      SELECT id, name, "holdId"
      FROM ta_teams
      WHERE "clubId" = ${clubId} AND league = ${league}
      ${genderSql}
      ORDER BY name ASC
    `
  );

  const withHoldId = teamsRaw
    .map((t) => ({ ...t, holdId: String(t.holdId ?? "").trim() }))
    .filter((t) => Boolean(t.holdId));

  const withoutHoldId = teamsRaw
    .map((t) => ({ id: t.id, name: t.name, holdId: String(t.holdId ?? "").trim() }))
    .filter((t) => !t.holdId)
    .map((t) => ({ id: t.id, name: t.name }));

  const latestMatchDateMsByHoldIdAndName = new Map<string, number>();
  if (withHoldId.length > 0) {
    const holdIds = Array.from(new Set(withHoldId.map((t) => t.holdId).filter(Boolean)));
    const matchRows = holdIds.length
      ? await prisma.taMatch.findMany({
          where: {
            league,
            date: { not: null },
            OR: [{ homeHoldId: { in: holdIds } }, { awayHoldId: { in: holdIds } }],
          },
          select: { date: true, homeTeam: true, awayTeam: true, homeHoldId: true, awayHoldId: true },
        })
      : [];

    for (const m of matchRows) {
      if (!m.date) continue;
      const ms = m.date.getTime();

      const homeHoldId = String(m.homeHoldId ?? "").trim();
      if (homeHoldId) {
        const homeName = String(m.homeTeam ?? "").trim();
        if (homeName) {
          const k = `${homeHoldId}||${homeName}`;
          const prev = latestMatchDateMsByHoldIdAndName.get(k) ?? -Infinity;
          if (ms > prev) latestMatchDateMsByHoldIdAndName.set(k, ms);
        }
      }

      const awayHoldId = String(m.awayHoldId ?? "").trim();
      if (awayHoldId) {
        const awayName = String(m.awayTeam ?? "").trim();
        if (awayName) {
          const k = `${awayHoldId}||${awayName}`;
          const prev = latestMatchDateMsByHoldIdAndName.get(k) ?? -Infinity;
          if (ms > prev) latestMatchDateMsByHoldIdAndName.set(k, ms);
        }
      }
    }
  }

  const bestByHoldId = new Map<string, { id: string; name: string }>();
  for (const t of withHoldId) {
    const key = t.holdId;
    const curr = bestByHoldId.get(key);
    const tName = String(t.name ?? "").trim();
    const tMs = latestMatchDateMsByHoldIdAndName.get(`${key}||${tName}`) ?? -Infinity;
    if (!curr) {
      bestByHoldId.set(key, { id: t.id, name: t.name });
      continue;
    }
    const currName = String(curr.name ?? "").trim();
    const currMs = latestMatchDateMsByHoldIdAndName.get(`${key}||${currName}`) ?? -Infinity;
    if (tMs > currMs) {
      bestByHoldId.set(key, { id: t.id, name: t.name });
    } else if (tMs === currMs) {
      // Stable tie-breaker: prefer longer (usually more descriptive) name.
      if (tName.length > currName.length) {
        bestByHoldId.set(key, { id: t.id, name: t.name });
      }
    }
  }

  const teams = [...Array.from(bestByHoldId.values()), ...withoutHoldId].sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? ""), "da-DK", { numeric: true, sensitivity: "base" })
  );

  return NextResponse.json({ ok: true, teams });
}
