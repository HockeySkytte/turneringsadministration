import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTournamentAdmin } from "@/lib/auth";
import { ensureTaUserRoleMetadataColumns, ensureTurneringDomainTables } from "@/lib/turnering/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireTournamentAdmin();
  await ensureTurneringDomainTables();
  await ensureTaUserRoleMetadataColumns();

  const items = await (prisma as any).taUserRole.findMany({
    where: { role: "CLUB_LEADER" },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      role: true,
      status: true,
      createdAt: true,
      clubLeaderTitle: true,
      club: { select: { id: true, name: true, clubNo: true } },
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({ ok: true, items });
}
