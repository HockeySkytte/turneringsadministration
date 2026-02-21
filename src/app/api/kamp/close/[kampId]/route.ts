import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";

type MatchStatus = "open" | "live" | "closed";

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

export async function POST(_req: Request, { params }: { params: Promise<{ kampId: string }> }) {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

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

  const status = await getMatchStatus(kampId);
  if (status === "closed") {
    return NextResponse.json({ ok: false, error: "ALREADY_CLOSED", status }, { status: 409 });
  }

  const started = await (prisma as any).matchStart?.findUnique({ where: { kampId }, select: { startedAt: true } });
  if (!started?.startedAt) {
    return NextResponse.json({ ok: false, error: "MATCH_NOT_STARTED" }, { status: 409 });
  }

  const ref1 = await (prisma as any).matchRefereeApproval?.findFirst({ where: { kampId, refIndex: 1 } });
  if (!ref1) {
    return NextResponse.json({ ok: false, error: "MISSING_REF1" }, { status: 409 });
  }

  if (!ref1.noRef2) {
    const ref2 = await (prisma as any).matchRefereeApproval?.findFirst({ where: { kampId, refIndex: 2 } });
    if (!ref2) {
      return NextResponse.json({ ok: false, error: "MISSING_REF2" }, { status: 409 });
    }
  }

  await prisma.$transaction([
    prisma.matchUploadLineup.updateMany({ where: { kampId } as any, data: { status: "closed" } } as any),
    prisma.matchUploadEvent.updateMany({ where: { kampId } as any, data: { status: "closed" } } as any),
    prisma.matchProtocolPlayer.updateMany({ where: { kampId } as any, data: { status: "closed" } } as any),
    prisma.matchProtocolEvent.updateMany({ where: { kampId } as any, data: { status: "closed" } } as any),
  ]);

  return NextResponse.json({ ok: true, status: "closed" });
}
