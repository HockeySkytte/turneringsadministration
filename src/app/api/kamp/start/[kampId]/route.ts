import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";

function parseKampId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
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

export async function POST(_req: Request, { params }: { params: Promise<{ kampId: string }> }) {
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
    select: { venue: true },
  });
  const venues = new Set((approvals ?? []).map((a: any) => String(a.venue)));
  if (!venues.has("Hjemme") || !venues.has("Ude")) {
    return NextResponse.json({ ok: false, error: "MISSING_APPROVALS" }, { status: 409 });
  }

  const started = await (prisma as any).matchStart.upsert({
    where: { kampId },
    create: { kampId, startedById: user.id },
    update: {},
    select: { startedAt: true },
  });

  // Ensure match is considered live by the status-derivation logic.
  await prisma.$transaction([
    prisma.matchUploadLineup.updateMany({
      where: { kampId, OR: [{ status: null }, { status: "open" }] } as any,
      data: { status: "live" },
    }) as any,
    prisma.matchUploadEvent.updateMany({
      where: { kampId, OR: [{ status: null }, { status: "open" }] } as any,
      data: { status: "live" },
    }) as any,
    prisma.matchProtocolPlayer.updateMany({
      where: { kampId, OR: [{ status: null }, { status: "open" }] } as any,
      data: { status: "live" },
    }) as any,
    prisma.matchProtocolEvent.updateMany({
      where: { kampId, OR: [{ status: null }, { status: "open" }] } as any,
      data: { status: "live" },
    }) as any,
  ]);

  return NextResponse.json({ ok: true, started });
}
