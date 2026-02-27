import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApprovedUser } from "@/lib/auth";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireApprovedUser();
  await ensureTurneringDomainTables();

  const referees = await prisma.taReferee.findMany({
    orderBy: [{ name: "asc" }, { refereeNo: "asc" }],
    select: { id: true, name: true, refereeNo: true, club: true },
  });

  return NextResponse.json({ ok: true, referees });
}
