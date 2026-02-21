import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";

type MatchStatus = "open" | "live" | "closed";

type Venue = "Hjemme" | "Ude";

type LineupRowIn = {
  rowIndex: number;
  cG?: string | null;
  number?: string | null;
  name?: string | null;
  birthday?: string | null;
  leader?: boolean | string | null;
  reserve?: boolean | string | null;
};

function norm(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseKampId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeStatus(s: unknown): MatchStatus | null {
  const v = String(s ?? "").trim().toLowerCase();
  if (v === "open" || v === "live" || v === "closed") return v;
  return null;
}

function deriveStatus(statuses: Array<string | null | undefined>): MatchStatus {
  const normed = statuses.map(normalizeStatus).filter(Boolean) as MatchStatus[];
  if (normed.includes("closed")) return "closed";
  if (normed.includes("live")) return "live";
  return "open";
}

async function getMatchStatus(kampId: number): Promise<MatchStatus> {
  const [protoPlayersStatus, protoEventsStatus, uploadPlayersStatus, uploadEventsStatus] = await Promise.all([
    prisma.matchProtocolPlayer.findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    } as any),
    prisma.matchProtocolEvent.findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    } as any),
    prisma.matchUploadLineup.findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    } as any),
    prisma.matchUploadEvent.findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    } as any),
  ]);

  return deriveStatus([
    ...protoPlayersStatus.map((r: any) => r.status),
    ...protoEventsStatus.map((r: any) => r.status),
    ...uploadPlayersStatus.map((r: any) => r.status),
    ...uploadEventsStatus.map((r: any) => r.status),
  ]);
}

function canOverride(user: any): boolean {
  if (!user) return false;
  if (user.isSuperuser && !user.isSuperuserApproved && !user.isAdmin) return false;
  return Boolean(user.isAdmin || user.isTournamentAdmin || user.isSuperuser);
}

async function resolveMatchMeta(kampId: number) {
  const m = await prisma.taMatch.findFirst({
    where: { externalId: String(kampId) },
    select: { date: true, league: true, pool: true },
  });
  if (!m) return null;
  return {
    date: m.date ?? null,
    liga: m.league ?? "",
    pulje: m.pool ?? "",
  };
}

function boolishToMark(value: unknown, mark: string): string | null {
  const v = norm(value);
  if (!v) return null;
  if (v === "1" || v.toLowerCase() === "true") return mark;
  if (v.toUpperCase() === mark) return mark;
  return null;
}

function cleanRow(row: LineupRowIn) {
  const rowIndex = Number(row?.rowIndex);
  const cG = norm(row?.cG);
  const number = norm(row?.number);
  const name = norm(row?.name);
  const birthday = norm(row?.birthday);

  const leaderMark =
    typeof row?.leader === "boolean" ? (row.leader ? "L" : null) : boolishToMark(row?.leader, "L");

  const reserveMark =
    typeof row?.reserve === "boolean" ? (row.reserve ? "R" : null) : boolishToMark(row?.reserve, "R");

  const cleaned = {
    rowIndex,
    leader: leaderMark,
    reserve: leaderMark ? null : reserveMark,
    cG: leaderMark ? null : (cG === "C" || cG === "G" ? cG : null),
    number: leaderMark ? null : (number || null),
    name: name || null,
    birthday: leaderMark ? null : (birthday || null),
  };

  return cleaned;
}

export async function GET(_req: Request, { params }: { params: Promise<{ kampId: string }> }) {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  if (!canOverride(user)) return NextResponse.json({ ok: false, error: "NOT_AUTHORIZED" }, { status: 403 });

  const { kampId: raw } = await params;
  const kampId = parseKampId(raw);
  if (!kampId) return NextResponse.json({ ok: false, error: "INVALID_KAMP" }, { status: 400 });

  const [status, meta, rows] = await Promise.all([
    getMatchStatus(kampId),
    resolveMatchMeta(kampId),
    prisma.matchUploadLineup.findMany({
      where: { kampId },
      orderBy: [{ venue: "asc" }, { rowIndex: "asc" }],
      select: { venue: true, rowIndex: true, cG: true, number: true, name: true, birthday: true, leader: true, reserve: true } as any,
    }),
  ]);

  if (!meta) return NextResponse.json({ ok: false, error: "MATCH_NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ ok: true, kampId, status, meta, rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ kampId: string }> }) {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  if (!canOverride(user)) return NextResponse.json({ ok: false, error: "NOT_AUTHORIZED" }, { status: 403 });

  const { kampId: raw } = await params;
  const kampId = parseKampId(raw);
  if (!kampId) return NextResponse.json({ ok: false, error: "INVALID_KAMP" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as any;
  const venue = norm(body?.venue) as Venue;
  if (venue !== "Hjemme" && venue !== "Ude") {
    return NextResponse.json({ ok: false, error: "INVALID_VENUE" }, { status: 400 });
  }

  const rowsIn = Array.isArray(body?.rows) ? (body.rows as LineupRowIn[]) : [];
  const limited = rowsIn.slice(0, 25);

  for (const r of limited) {
    const idx = Number(r?.rowIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx > 24) {
      return NextResponse.json({ ok: false, error: "INVALID_ROW_INDEX" }, { status: 400 });
    }
  }

  const [status, meta] = await Promise.all([
    getMatchStatus(kampId),
    resolveMatchMeta(kampId),
  ]);
  if (!meta) return NextResponse.json({ ok: false, error: "MATCH_NOT_FOUND" }, { status: 404 });

  const cleaned = limited.map(cleanRow);

  await prisma.$transaction(async (tx) => {
    for (const r of cleaned) {
      await (tx.matchUploadLineup as any).upsert({
        where: { kampId_venue_rowIndex: { kampId, venue, rowIndex: r.rowIndex } },
        update: {
          date: meta.date,
          liga: meta.liga,
          pulje: meta.pulje,
          status,
          cG: r.cG,
          number: r.number,
          name: r.name,
          birthday: r.birthday,
          leader: r.leader,
          reserve: r.reserve,
        },
        create: {
          kampId,
          venue,
          rowIndex: r.rowIndex,
          date: meta.date,
          liga: meta.liga,
          pulje: meta.pulje,
          status,
          cG: r.cG,
          number: r.number,
          name: r.name,
          birthday: r.birthday,
          leader: r.leader,
          reserve: r.reserve,
        },
      });
    }
  });

  const rows = await prisma.matchUploadLineup.findMany({
    where: { kampId, venue },
    orderBy: { rowIndex: "asc" },
    select: { venue: true, rowIndex: true, cG: true, number: true, name: true, birthday: true, leader: true, reserve: true } as any,
  });

  return NextResponse.json({ ok: true, kampId, venue, status, rows });
}
