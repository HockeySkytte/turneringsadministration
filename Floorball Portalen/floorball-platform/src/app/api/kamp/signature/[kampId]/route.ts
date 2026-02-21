import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";

type Venue = "Hjemme" | "Ude";

function norm(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

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
        r.status === "APPROVED" &&
        r.role === "SECRETARIAT" &&
        r.clubId != null &&
        r.clubId === homeClubId,
    ),
  );
}

export async function GET(req: Request, { params }: { params: Promise<{ kampId: string }> }) {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { kampId: raw } = await params;
  const kampId = parseKampId(raw);
  if (!kampId) {
    return NextResponse.json({ ok: false, error: "INVALID_KAMP" }, { status: 400 });
  }

  const url = new URL(req.url);
  const venue = norm(url.searchParams.get("venue")) as Venue;
  if (venue !== "Hjemme" && venue !== "Ude") {
    return NextResponse.json({ ok: false, error: "INVALID_VENUE" }, { status: 400 });
  }

  const homeClubId = await resolveHomeClubId(kampId);
  if (!userIsHomeSecretariat(user, homeClubId)) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  const approval = await (prisma as any).matchLineupApproval.findUnique({
    where: { kampId_venue: { kampId, venue } },
    select: { signaturePng: true, approvedAt: true },
  });

  if (!approval?.signaturePng) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const download = url.searchParams.get("download") === "1";

  return new NextResponse(approval.signaturePng as any, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store, max-age=0",
      ...(download
        ? {
            "Content-Disposition": `attachment; filename="kamp-${kampId}-${venue}.png"`,
          }
        : null),
    },
  });
}
