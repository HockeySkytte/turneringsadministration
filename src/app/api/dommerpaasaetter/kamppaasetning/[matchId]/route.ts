import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { requireRefAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIso(d: Date | null) {
  return d ? d.toISOString() : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    await requireRefAdmin();
    await ensureTurneringDomainTables();

    const { matchId } = await params;
    // NOTE: `dommer1Id/dommer2Id` are stored as the referee's official refereeNo.
    const body = (await req.json()) as { dommer1Id?: string | null; dommer2Id?: string | null };

    const nextDommer1Id = body.dommer1Id === "" ? null : (body.dommer1Id ?? null);
    const nextDommer2Id = body.dommer2Id === "" ? null : (body.dommer2Id ?? null);

    const current = await prisma.taMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        dommer1Id: true,
        dommer1: true,
        dommer1Status: true,
        dommer1RespondedAt: true,
        dommer2Id: true,
        dommer2: true,
        dommer2Status: true,
        dommer2RespondedAt: true,
      },
    });

    if (!current) return NextResponse.json({ message: "Kamp ikke fundet." }, { status: 404 });

    const changed1 = nextDommer1Id !== current.dommer1Id;
    const changed2 = nextDommer2Id !== current.dommer2Id;

    const refereeNos = [changed1 ? nextDommer1Id : null, changed2 ? nextDommer2Id : null].filter(
      Boolean
    ) as string[];

    const referees = refereeNos.length
      ? await prisma.taReferee.findMany({
          where: { refereeNo: { in: refereeNos } },
          select: { refereeNo: true, name: true },
        })
      : [];

    const refereeNameByNo = new Map(referees.map((r) => [r.refereeNo, r.name] as const));

    if (changed1 && nextDommer1Id && !refereeNameByNo.has(nextDommer1Id)) {
      return NextResponse.json({ message: "Ukendt Dommer1." }, { status: 400 });
    }

    if (changed2 && nextDommer2Id && !refereeNameByNo.has(nextDommer2Id)) {
      return NextResponse.json({ message: "Ukendt Dommer2." }, { status: 400 });
    }

    const slot1Data = !changed1
      ? {
          dommer1Id: current.dommer1Id,
          dommer1: current.dommer1,
          dommer1Status: current.dommer1Status,
          dommer1RespondedAt: current.dommer1RespondedAt,
        }
      : nextDommer1Id
        ? {
            dommer1Id: nextDommer1Id,
            dommer1: refereeNameByNo.get(nextDommer1Id) ?? null,
            dommer1Status: "PENDING",
            dommer1RespondedAt: null,
          }
        : {
            dommer1Id: null,
            dommer1: null,
            dommer1Status: null,
            dommer1RespondedAt: null,
          };

    const slot2Data = !changed2
      ? {
          dommer2Id: current.dommer2Id,
          dommer2: current.dommer2,
          dommer2Status: current.dommer2Status,
          dommer2RespondedAt: current.dommer2RespondedAt,
        }
      : nextDommer2Id
        ? {
            dommer2Id: nextDommer2Id,
            dommer2: refereeNameByNo.get(nextDommer2Id) ?? null,
            dommer2Status: "PENDING",
            dommer2RespondedAt: null,
          }
        : {
            dommer2Id: null,
            dommer2: null,
            dommer2Status: null,
            dommer2RespondedAt: null,
          };

    const updated = await prisma.taMatch.update({
      where: { id: matchId },
      data: {
        ...slot1Data,
        ...slot2Data,
      },
      select: {
        id: true,
        date: true,
        time: true,
        league: true,
        gender: true,
        stage: true,
        pool: true,
        venue: true,
        homeTeam: true,
        awayTeam: true,
        dommer1Id: true,
        dommer1: true,
        dommer1Status: true,
        dommer2Id: true,
        dommer2: true,
        dommer2Status: true,
      },
    });

    return NextResponse.json({
      match: {
        ...updated,
        date: toIso(updated.date),
        time: toIso(updated.time),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_AUTHORIZED" ? 403 : 500;
    return NextResponse.json({ message: "Kunne ikke opdatere kampen." }, { status });
  }
}
