import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTournamentAdmin } from "@/lib/auth";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireTournamentAdmin();
    await ensureTurneringDomainTables();

    const [clubLeaderApprovals, moveRequests, playerLicenseRequests] = await Promise.all([
      prisma.taUserRole.count({ where: { role: "CLUB_LEADER", status: "PENDING" } }),
      prisma.taMatchMoveRequest.count({ where: { status: "PENDING_TA" } }),
      prisma.taPlayerLicenseRequest.count({ where: { status: "PENDING_TA" } }),
    ]);

    const total = clubLeaderApprovals + moveRequests + playerLicenseRequests;

    return NextResponse.json({
      ok: true,
      pending: { clubLeaderApprovals, moveRequests, playerLicenseRequests, total },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "NOT_AUTHENTICATED") {
      return NextResponse.json({ ok: false, message: "Du er ikke logget ind." }, { status: 401 });
    }
    if (message === "NOT_APPROVED") {
      return NextResponse.json({ ok: false, message: "Din bruger er ikke godkendt endnu." }, { status: 403 });
    }
    if (message === "NOT_AUTHORIZED") {
      return NextResponse.json({ ok: false, message: "Du har ikke adgang." }, { status: 403 });
    }

    console.error("/api/turnering/notifications failed", err);
    return NextResponse.json({ ok: false, message: "Kunne ikke hente notifikationer.", debug: message }, { status: 500 });
  }
}
