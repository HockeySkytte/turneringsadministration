import { NextResponse } from "next/server";
import { requireSuperuserOrAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

function normKey(value: unknown): string {
  return norm(value).toLocaleLowerCase("da-DK");
}

function venueFromMatch(teamName: string, homeTeam: string, awayTeam: string): "Hjemme" | "Ude" | null {
  const t = normKey(teamName);
  if (!t) return null;
  if (normKey(homeTeam) === t) return "Hjemme";
  if (normKey(awayTeam) === t) return "Ude";
  return null;
}

function matchHasTeam(teamName: string, homeTeam: string, awayTeam: string): boolean {
  const t = normKey(teamName);
  return Boolean(t && (normKey(homeTeam) === t || normKey(awayTeam) === t));
}

function toPlayerRow(p: { rowIndex: number; role: string | null; number: string | null; name: string | null; born: string | null }) {
  return {
    rowIndex: p.rowIndex,
    role: p.role ?? "",
    number: p.number ?? "",
    name: p.name ?? "",
    born: p.born ?? "",
  };
}

type MatchRow = { kampId: number; startAt: Date | null; homeTeam: string; awayTeam: string };

type PlayerRow = { rowIndex: number; role: string; number: string; name: string; born: string };

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

function sortAndReindexRows(rows: PlayerRow[]): PlayerRow[] {
  const sorted = [...rows].sort((a, b) => {
    const ra = roleRank(a.role);
    const rb = roleRank(b.role);
    if (ra !== rb) return ra - rb;

    const na = numberKey(a.number);
    const nb = numberKey(b.number);
    if (na !== nb) return na - nb;

    return normKey(a.name).localeCompare(normKey(b.name), "da-DK");
  });

  return sorted.slice(0, 20).map((r, idx) => ({ ...r, rowIndex: idx }));
}

function isNonEmptyRosterRow(r: { role: string; number: string; name: string; born: string }): boolean {
  return Boolean(norm(r.role) || norm(r.number) || norm(r.name) || norm(r.born));
}

function uniqKey(r: { name: string; born: string }): string {
  // Use name as primary key (case-insensitive); add birth if present to reduce collisions.
  const n = normKey(r.name);
  const b = normKey(r.born);
  return b ? `${n}::${b}` : n;
}

export async function GET(req: Request) {
  await requireSuperuserOrAdmin();

  const url = new URL(req.url);
  const teamName = norm(url.searchParams.get("teamName"));
  const excludeKampId = Number.parseInt(String(url.searchParams.get("excludeKampId") ?? ""), 10);

  if (!teamName) {
    return NextResponse.json({ message: "Mangler teamName." }, { status: 400 });
  }

  const taMatches = await prisma.taMatch.findMany({
    where: {
      externalId: excludeKampId ? { not: String(excludeKampId) } : { not: null },
      date: { not: null },
      OR: [
        { homeTeam: { equals: teamName, mode: "insensitive" } },
        { awayTeam: { equals: teamName, mode: "insensitive" } },
      ],
    },
    orderBy: [{ date: "desc" }, { time: "desc" }],
    select: { externalId: true, date: true, time: true, homeTeam: true, awayTeam: true },
    take: 50,
  });

  const teamMatches: MatchRow[] = taMatches
    .map((m) => {
      const kampId = m.externalId ? Number.parseInt(String(m.externalId), 10) : NaN;
      if (!Number.isFinite(kampId)) return null;
      const startAt = m.date ?? null;
      return { kampId, startAt, homeTeam: m.homeTeam, awayTeam: m.awayTeam };
    })
    .filter((x): x is MatchRow => Boolean(x));

  if (teamMatches.length === 0) {
    return NextResponse.json(
      { message: "Ingen kamp fundet for det valgte hold i databasen." },
      { status: 404 }
    );
  }

  const matchIds = teamMatches.map((m) => m.kampId);
  const uploadedAll = await prisma.matchUploadLineup.findMany({
    where: { kampId: { in: matchIds } },
    orderBy: [{ kampId: "desc" }, { venue: "asc" }, { rowIndex: "asc" }],
    select: { kampId: true, venue: true, rowIndex: true, cG: true, number: true, name: true, birthday: true },
  });

  const uploadedByMatchVenue = new Map<string, Array<{ cG: string | null; number: string | null; name: string | null; birthday: string | null }>>();
  for (const r of uploadedAll) {
    const venue = norm(r.venue);
    const key = `${r.kampId}|${venue}`;
    const arr = uploadedByMatchVenue.get(key) ?? [];
    arr.push({ cG: r.cG, number: r.number, name: r.name, birthday: r.birthday });
    uploadedByMatchVenue.set(key, arr);
  }

  let chosen: { match: MatchRow; venue: "Hjemme" | "Ude" } | null = null;
  for (const m of teamMatches) {
    const venue = venueFromMatch(teamName, m.homeTeam, m.awayTeam);
    if (!venue) continue;
    const key = `${m.kampId}|${venue}`;
    const rows = uploadedByMatchVenue.get(key) ?? [];
    if (rows.length > 0) {
      chosen = { match: m, venue };
      break;
    }
  }

  if (chosen) {
    const chosenKey = `${chosen.match.kampId}|${chosen.venue}`;
    const primaryUploaded = uploadedByMatchVenue.get(chosenKey) ?? [];

    const merged: PlayerRow[] = [];
    const seen = new Set<string>();

    for (const r of primaryUploaded) {
      const row = {
        rowIndex: 0,
        role: r.cG ?? "",
        number: r.number ?? "",
        name: r.name ?? "",
        born: r.birthday ?? "",
      };
      if (!isNonEmptyRosterRow(row)) continue;
      const key = uniqKey(row);
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }

    // Fill up to 20 with unique names from older uploaded lineups.
    if (merged.length < 20) {
      for (const m of teamMatches) {
        if (m.kampId === chosen.match.kampId) continue;
        const venue = venueFromMatch(teamName, m.homeTeam, m.awayTeam);
        if (!venue) continue;
        const key = `${m.kampId}|${venue}`;
        const uploaded = uploadedByMatchVenue.get(key) ?? [];
        if (uploaded.length === 0) continue;

        for (const r of uploaded) {
          const row = {
            rowIndex: 0,
            role: r.cG ?? "",
            number: r.number ?? "",
            name: r.name ?? "",
            born: r.birthday ?? "",
          };
          if (!isNonEmptyRosterRow(row)) continue;
          const u = uniqKey(row);
          if (!u) continue;
          if (seen.has(u)) continue;
          seen.add(u);
          merged.push(row);
          if (merged.length >= 20) break;
        }

        if (merged.length >= 20) break;
      }
    }

    const rows = sortAndReindexRows(merged);

    return NextResponse.json({
      sourceKampId: chosen.match.kampId,
      venue: chosen.venue,
      rows,
    });
  }

  // If no uploaded Lineups exist, fall back to latest saved protocol roster (still sorted).
  for (const m of teamMatches) {
    if (!matchHasTeam(teamName, m.homeTeam, m.awayTeam)) continue;
    const venue = venueFromMatch(teamName, m.homeTeam, m.awayTeam);
    if (!venue) continue;
    const side = venue === "Hjemme" ? "HOME" : "AWAY";

    const protocol = await prisma.matchProtocolPlayer.findMany({
      where: { kampId: m.kampId, side },
      orderBy: { rowIndex: "asc" },
      select: { role: true, number: true, name: true, born: true },
      take: 50,
    });

    if (protocol.length > 0) {
      const rows = sortAndReindexRows(
        protocol.map((p: { role: string | null; number: string | null; name: string | null; born: string | null }) => ({
          rowIndex: 0,
          role: p.role ?? "",
          number: p.number ?? "",
          name: p.name ?? "",
          born: p.born ?? "",
        }))
      );

      return NextResponse.json({
        sourceKampId: m.kampId,
        venue,
        rows,
      });
    }
  }

  return NextResponse.json(
    {
      message:
        "Der er ingen uploadet holdliste (Lineups) for holdets seneste kampe, og der er heller ingen gemt holdliste i kladden.",
    },
    { status: 404 }
  );
}
