import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const POKAL_ROW_ID = "__pokalturneringen__";
const POKAL_POOL_ID = "__pokal_pool__";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const rowId = String(body?.rowId ?? "").trim();

  if (!rowId) {
    return NextResponse.json({ message: "rowId mangler." }, { status: 400 });
  }

  const isPokal = rowId === POKAL_ROW_ID;

  const firstPool = isPokal
    ? { id: POKAL_POOL_ID }
    : await (async () => {
        const row = await prisma.competitionRow.findUnique({
          where: { id: rowId },
          select: { id: true },
        });

        if (!row) return null;

        const pool = await prisma.competitionPool.findFirst({
          where: { rowId },
          orderBy: { name: "asc" },
          select: { id: true },
        });

        return pool;
      })();

  if (!firstPool) {
    return NextResponse.json({ message: "Ugyldig liga." }, { status: 400 });
  }

  const session = await getSession();
  session.selectedCompetitionRowId = rowId;
  session.selectedCompetitionPoolId = firstPool?.id;
  session.selectedCompetitionTeamName = undefined;
  if (!session.userId) session.guestDefaultsApplied = true;
  await session.save();

  return NextResponse.json({ ok: true });
}
