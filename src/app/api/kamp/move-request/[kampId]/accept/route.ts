import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { requireApprovedUser } from "@/lib/auth";
import { TaRole, TaRoleStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseKampId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function getMatchContext(kampId: number) {
  await ensureTurneringDomainTables();

  const taMatch = await prisma.taMatch.findFirst({
    where: { externalId: String(kampId) },
    select: { homeHoldId: true, awayHoldId: true },
  });
  if (!taMatch) return null;

  const homeHoldId = norm(taMatch.homeHoldId) || null;
  const awayHoldId = norm(taMatch.awayHoldId) || null;

  const [homeTeamRecord, awayTeamRecord] = await Promise.all([
    homeHoldId
      ? prisma.taTeam.findFirst({ where: { holdId: homeHoldId }, orderBy: { updatedAt: "desc" }, select: { id: true } })
      : Promise.resolve(null),
    awayHoldId
      ? prisma.taTeam.findFirst({ where: { holdId: awayHoldId }, orderBy: { updatedAt: "desc" }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  return { homeHoldId, awayHoldId, homeTeamId: homeTeamRecord?.id ?? null, awayTeamId: awayTeamRecord?.id ?? null };
}

function isAwayTeamLeader(user: Awaited<ReturnType<typeof requireApprovedUser>>, ctx: Awaited<ReturnType<typeof getMatchContext>>) {
  if (!ctx) return false;
  return user.roles.some(
    (r) =>
      r.status === TaRoleStatus.APPROVED &&
      r.role === TaRole.TEAM_LEADER &&
      ((r.teamId != null && r.teamId === ctx.awayTeamId) || (r.holdId != null && r.holdId === ctx.awayHoldId))
  );
}

export async function POST(_req: Request, { params }: { params: Promise<{ kampId: string }> }) {
  try {
    const user = await requireApprovedUser();

    const { kampId: raw } = await params;
    const kampId = parseKampId(raw);
    if (!kampId) return NextResponse.json({ message: "Ugyldig kamp." }, { status: 400 });

    const ctx = await getMatchContext(kampId);
    if (!ctx) return NextResponse.json({ message: "Kamp ikke fundet." }, { status: 404 });

    if (!isAwayTeamLeader(user, ctx)) {
      return NextResponse.json({ message: "Kun udeholdets holdleder kan acceptere." }, { status: 403 });
    }

    const now = new Date();

    const moveRequests = (prisma as unknown as Record<string, any>)["taMatchMoveRequest"];

    const updatedCount = moveRequests?.updateMany
      ? ((await moveRequests.updateMany({
          where: { kampId, status: "PENDING_AWAY" },
          data: {
            status: "PENDING_TA",
            awayDecidedById: user.id,
            awayDecidedAt: now,
            updatedAt: now,
          },
        })) as { count: number }).count
      : Number(
          await prisma.$executeRawUnsafe(
            `
              UPDATE ta_match_move_requests
              SET status = $1,
                  "awayDecidedById" = $2,
                  "awayDecidedAt" = $3,
                  "updatedAt" = $3
              WHERE "kampId" = $4 AND status = 'PENDING_AWAY'
            `,
            "PENDING_TA",
            user.id,
            now,
            kampId
          )
        );

    if (updatedCount === 0) {
      return NextResponse.json({ message: "Ingen aktiv anmodning at acceptere." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/kamp/move-request/accept] POST failed", err);
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_APPROVED" ? 403 : 500;
    return NextResponse.json({ message: "Kunne ikke acceptere anmodning." }, { status });
  }
}
