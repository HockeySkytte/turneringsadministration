import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";

type Venue = "Hjemme" | "Ude";

type MatchStatus = "open" | "live" | "closed";

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
        r.status === "APPROVED" && r.role === "SECRETARIAT" && r.clubId != null && r.clubId === homeClubId,
    ),
  );
}

function parseDataUrlPng(dataUrl: string): Buffer | null {
  const v = norm(dataUrl);
  const prefix = "data:image/png;base64,";
  if (!v.startsWith(prefix)) return null;
  const b64 = v.slice(prefix.length).trim();
  if (!b64) return null;
  try {
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ kampId: string }> }) {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });

  const { kampId: raw } = await params;
  const kampId = parseKampId(raw);
  if (!kampId) return NextResponse.json({ ok: false, error: "INVALID_KAMP" }, { status: 400 });

  const homeClubId = await resolveHomeClubId(kampId);
  if (!userIsHomeSecretariat(user, homeClubId)) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  const approvals = await (prisma as any).matchLineupApproval.findMany({
    where: { kampId },
    select: { venue: true, leaderName: true, approvedAt: true },
  });
  const started = await (prisma as any).matchStart.findUnique({
    where: { kampId },
    select: { startedAt: true },
  });

  return NextResponse.json({ ok: true, approvals, started });
}

export async function POST(req: Request, { params }: { params: Promise<{ kampId: string }> }) {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });

  const { kampId: raw } = await params;
  const kampId = parseKampId(raw);
  if (!kampId) return NextResponse.json({ ok: false, error: "INVALID_KAMP" }, { status: 400 });

  const status = await getMatchStatus(kampId);
  if (status === "closed") {
    return NextResponse.json({ ok: false, error: "MATCH_LOCKED", status }, { status: 409 });
  }

  const homeClubId = await resolveHomeClubId(kampId);
  if (!userIsHomeSecretariat(user, homeClubId)) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as any;
  const venue = norm(body?.venue) as Venue;
  if (venue !== "Hjemme" && venue !== "Ude") {
    return NextResponse.json({ ok: false, error: "INVALID_VENUE" }, { status: 400 });
  }

  const leaderName = norm(body?.leaderName);
  if (!leaderName) {
    return NextResponse.json({ ok: false, error: "MISSING_LEADER" }, { status: 400 });
  }

  const signatureDataUrl = norm(body?.signatureDataUrl);
  const png = parseDataUrlPng(signatureDataUrl);
  if (!png) {
    return NextResponse.json({ ok: false, error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  const lineup = await prisma.matchUploadLineup.findMany({
    where: { kampId, venue },
    orderBy: { rowIndex: "asc" },
  });

  const leaderNames = lineup
    .filter((r: any) => norm((r as any).leader).toUpperCase() === "L")
    .map((r: any) => norm(r.name))
    .filter(Boolean);

  if (lineup.length === 0) {
    return NextResponse.json({ ok: false, error: "NO_LINEUP" }, { status: 409 });
  }

  if (!leaderNames.some((n) => n.toLocaleLowerCase("da-DK") === leaderName.toLocaleLowerCase("da-DK"))) {
    return NextResponse.json({ ok: false, error: "LEADER_NOT_IN_LINEUP" }, { status: 400 });
  }

  const approval = await (prisma as any).matchLineupApproval.upsert({
    where: { kampId_venue: { kampId, venue } },
    create: {
      kampId,
      venue,
      leaderName,
      signaturePng: png,
      approvedById: user.id,
      approvedAt: new Date(),
    },
    update: {
      leaderName,
      signaturePng: png,
      approvedById: user.id,
      approvedAt: new Date(),
    },
    select: { venue: true, leaderName: true, approvedAt: true },
  });

  await prisma.matchUploadLineup.updateMany({
    where: { kampId, venue },
    data: { status: "live" },
  });

  return NextResponse.json({ ok: true, approval });
}
