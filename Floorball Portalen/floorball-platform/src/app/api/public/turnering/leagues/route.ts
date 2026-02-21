import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureTurneringDomainTables();
  const url = new URL(req.url);
  const clubId = String(url.searchParams.get("clubId") ?? "").trim();

  if (!clubId) {
    return NextResponse.json({ ok: true, leagues: [] });
  }

  const rows = await prisma.taTeam.findMany({
    where: { clubId },
    select: { league: true },
    distinct: ["league"],
    orderBy: { league: "asc" },
  });

  return NextResponse.json({ ok: true, leagues: rows.map((r) => r.league) });
}
