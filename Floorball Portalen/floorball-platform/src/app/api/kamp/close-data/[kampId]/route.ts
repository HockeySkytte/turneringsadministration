import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

type MatchStatus = "open" | "live" | "closed";

type Venue = "Hjemme" | "Ude";

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

async function resolveHomeClubId(kampId: number) {
  const taMatch = await prisma.taMatch.findFirst({
    where: { externalId: String(kampId) },
    select: { homeHoldId: true, league: true, homeTeam: true },
  });
  if (!taMatch) return null;

  const homeHoldId = String((taMatch as any).homeHoldId ?? "").trim();
  if (homeHoldId) {
    const homeTeam = await prisma.taTeam.findFirst({
      where: { holdId: homeHoldId },
      orderBy: { updatedAt: "desc" },
      select: { clubId: true },
    });
    return homeTeam?.clubId ?? null;
  }

  // Legacy fallback for older rows where holdId is missing.
  if (!taMatch.league || !taMatch.homeTeam) return null;
  const homeTeam = await prisma.taTeam.findFirst({
    where: { league: taMatch.league, name: taMatch.homeTeam },
    select: { clubId: true },
  });
  return homeTeam?.clubId ?? null;
}

function userIsHomeSecretariat(user: any, homeClubId: string | null): boolean {
  if (!homeClubId) return false;
  return Boolean(
    user?.roles?.some(
      (r: any) =>
        r.status === "APPROVED" &&
        r.role === "SECRETARIAT" &&
        r.clubId != null &&
        r.clubId === homeClubId,
    ),
  );
}

function canOverride(user: any): boolean {
  if (!user) return false;
  if (user.isSuperuser && !user.isSuperuserApproved && !user.isAdmin) return false;
  return Boolean(user.isAdmin || user.isTournamentAdmin || user.isSuperuser);
}

export async function GET(_req: Request, { params }: { params: Promise<{ kampId: string }> }) {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  await ensureTurneringDomainTables();

  const { kampId: raw } = await params;
  const kampId = parseKampId(raw);
  if (!kampId) {
    return NextResponse.json({ ok: false, error: "INVALID_KAMP" }, { status: 400 });
  }

  const homeClubId = await resolveHomeClubId(kampId);
  const isHome = userIsHomeSecretariat(user, homeClubId);
  const override = canOverride(user);

  if (!isHome && !override) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  const [status, started, lineups, events, lineupApprovals, refereeApprovals, taMatch] = await Promise.all([
    getMatchStatus(kampId),
    (prisma as any).matchStart?.findUnique({ where: { kampId }, select: { startedAt: true } }) ?? Promise.resolve(null),
    prisma.matchUploadLineup.findMany({
      where: { kampId },
      orderBy: [{ venue: "asc" }, { rowIndex: "asc" }],
      select: {
        venue: true,
        rowIndex: true,
        cG: true,
        number: true,
        name: true,
        birthday: true,
        leader: true,
        reserve: true,
      } as any,
    }),
    prisma.matchProtocolEvent.findMany({
      where: { kampId },
      orderBy: { rowIndex: "asc" },
      select: {
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
    }),
    (prisma as any).matchLineupApproval?.findMany({ where: { kampId }, select: { venue: true, leaderName: true, approvedAt: true } }) ??
      Promise.resolve([]),
    (prisma as any).matchRefereeApproval?.findMany({ where: { kampId }, select: { refIndex: true, name: true, refereeNo: true, noRef2: true, approvedAt: true } }) ??
      Promise.resolve([]),
    prisma.taMatch.findFirst({
      where: { externalId: String(kampId) },
      select: { dommer1: true, dommer1Id: true, dommer2: true, dommer2Id: true },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    status,
    startedAt: started?.startedAt ?? null,
    match: taMatch
      ? {
          dommer1: taMatch.dommer1 ?? null,
          dommer1Id: taMatch.dommer1Id ?? null,
          dommer2: taMatch.dommer2 ?? null,
          dommer2Id: taMatch.dommer2Id ?? null,
        }
      : null,
    lineups,
    events,
    lineupApprovals,
    refereeApprovals,
  });
}
