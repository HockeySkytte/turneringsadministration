import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureTurneringDomainTables();
  const clubs = await prisma.taClub.findMany({
    select: { id: true, name: true, clubNo: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ ok: true, clubs });
}
