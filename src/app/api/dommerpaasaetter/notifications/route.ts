import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { requireRefAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRefAdmin();
    await ensureTurneringDomainTables();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const issuesCount = await prisma.taMatch.count({
      where: {
        date: { gt: startOfToday },
        OR: [
          { dommer1Status: { in: ["DECLINED", "WITHDRAWN"] } },
          { dommer2Status: { in: ["DECLINED", "WITHDRAWN"] } },
        ],
      },
    });

    return NextResponse.json({ ok: true, issuesCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_AUTHORIZED" ? 403 : 500;
    return NextResponse.json({ ok: false, message: "Kunne ikke hente notifikationer." }, { status });
  }
}
