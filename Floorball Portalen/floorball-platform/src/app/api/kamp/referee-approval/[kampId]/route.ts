import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

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

export async function POST(req: Request, { params }: { params: Promise<{ kampId: string }> }) {
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

  const status = await getMatchStatus(kampId);
  if (status === "closed" && !override) {
    return NextResponse.json({ ok: false, error: "MATCH_LOCKED", status }, { status: 409 });
  }

  const started = await (prisma as any).matchStart?.findUnique({ where: { kampId }, select: { startedAt: true } });
  if (!started?.startedAt) {
    return NextResponse.json({ ok: false, error: "MATCH_NOT_STARTED" }, { status: 409 });
  }

  const body = (await req.json().catch(() => null)) as any;
  const refIndex = Number.parseInt(String(body?.refIndex ?? ""), 10);
  if (refIndex !== 1 && refIndex !== 2) {
    return NextResponse.json({ ok: false, error: "INVALID_REF_INDEX" }, { status: 400 });
  }

  const name = norm(body?.name);
  const refereeNo = norm(body?.refereeNo);
  if (!name) return NextResponse.json({ ok: false, error: "MISSING_NAME" }, { status: 400 });
  if (!refereeNo) return NextResponse.json({ ok: false, error: "MISSING_REFNO" }, { status: 400 });

  const signatureDataUrl = norm(body?.signatureDataUrl);
  const png = parseDataUrlPng(signatureDataUrl);
  if (!png) return NextResponse.json({ ok: false, error: "INVALID_SIGNATURE" }, { status: 400 });

  const noRef2 = refIndex === 1 ? Boolean(body?.noRef2) : false;

  const approval = await (prisma as any).matchRefereeApproval.upsert({
    where: { kampId_refIndex: { kampId, refIndex } },
    create: { kampId, refIndex, name, refereeNo, signaturePng: png, noRef2 },
    update: { name, refereeNo, signaturePng: png, noRef2 },
    select: { refIndex: true, name: true, refereeNo: true, noRef2: true, approvedAt: true },
  });

  // Overwrite referee identity on the match itself (driven from Excel, but editable here).
  if (refIndex === 1) {
    await prisma.taMatch.updateMany({
      where: { externalId: String(kampId) },
      data: {
        dommer1: name,
        dommer1Id: refereeNo,
        ...(noRef2 ? { dommer2: null, dommer2Id: null } : {}),
      },
    });
  } else {
    await prisma.taMatch.updateMany({
      where: { externalId: String(kampId) },
      data: { dommer2: name, dommer2Id: refereeNo },
    });
  }

  return NextResponse.json({ ok: true, approval });
}
