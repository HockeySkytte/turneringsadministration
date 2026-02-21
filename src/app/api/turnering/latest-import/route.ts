import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTournamentAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function tableExists(): Promise<boolean> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT 1 AS ok FROM information_schema.tables WHERE table_name = 'ta_turnering_imports' LIMIT 1;`
  )) as Array<{ ok: number }>;
  return rows.length > 0;
}

export async function GET() {
  await requireTournamentAdmin();

  const exists = await tableExists();
  if (!exists) {
    return NextResponse.json({ ok: true, latest: null });
  }

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT id, created_at, filename, kampe, holdliste, klubliste
     FROM ta_turnering_imports
     ORDER BY created_at DESC
     LIMIT 1;`
  )) as Array<{
    id: string;
    created_at: Date;
    filename: string | null;
    kampe: unknown;
    holdliste: unknown;
    klubliste: unknown;
  }>;

  const latest = rows[0];
  if (!latest) return NextResponse.json({ ok: true, latest: null });

  const kampe = Array.isArray(latest.kampe) ? (latest.kampe as Array<Record<string, unknown>>) : [];
  const holdliste = Array.isArray(latest.holdliste)
    ? (latest.holdliste as Array<Record<string, unknown>>)
    : [];
  const klubliste = Array.isArray(latest.klubliste)
    ? (latest.klubliste as Array<Record<string, unknown>>)
    : [];

  return NextResponse.json({
    ok: true,
    latest: {
      id: latest.id,
      createdAt: latest.created_at.toISOString(),
      filename: latest.filename,
      counts: {
        kampe: kampe.length,
        holdliste: holdliste.length,
        klubliste: klubliste.length,
      },
      preview: {
        kampe: kampe.slice(0, 20),
        holdliste: holdliste.slice(0, 20),
        klubliste: klubliste.slice(0, 20),
      },
    },
  });
}
