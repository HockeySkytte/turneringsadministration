import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { requireApprovedUser } from "@/lib/auth";
import { TaRole, TaRoleStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIso(d: Date | null) {
  return d ? d.toISOString() : null;
}

function getRefereeIdFromUser(user: Awaited<ReturnType<typeof requireApprovedUser>>) {
  const role = user.roles.find(
    (r) => r.role === TaRole.REFEREE && r.status === TaRoleStatus.APPROVED && r.refereeId
  );
  return role?.refereeId ?? null;
}

async function resolveRefereeNo(refereeId: string): Promise<string | null> {
  const r = await prisma.taReferee.findUnique({ where: { id: refereeId }, select: { refereeNo: true } });
  return r?.refereeNo ?? null;
}

export async function GET() {
  try {
    const user = await requireApprovedUser();
    if (!user.isReferee) throw new Error("NOT_AUTHORIZED");

    const refereeId = getRefereeIdFromUser(user);
    if (!refereeId) return NextResponse.json({ assignments: [] });

    await ensureTurneringDomainTables();

    const refereeNo = await resolveRefereeNo(refereeId);

    const pendingMatches = await prisma.taMatch.findMany({
      where: {
        OR: [
          { dommer1Id: refereeId, dommer1Status: "PENDING" },
          { dommer2Id: refereeId, dommer2Status: "PENDING" },
          ...(refereeNo
            ? [
                { dommer1Id: refereeNo, dommer1Status: "PENDING" },
                { dommer2Id: refereeNo, dommer2Status: "PENDING" },
              ]
            : []),
        ],
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
        dommer1Status: true,
        dommer2Id: true,
        dommer2Status: true,
      },
      orderBy: [{ date: "asc" }, { time: "asc" }],
    });

    const assignments = pendingMatches.flatMap((m) => {
      const rows: Array<{ match: any; slot: 1 | 2 }> = [];

      const isSlot1 = m.dommer1Id === refereeId || (refereeNo ? m.dommer1Id === refereeNo : false);
      const isSlot2 = m.dommer2Id === refereeId || (refereeNo ? m.dommer2Id === refereeNo : false);

      if (isSlot1 && m.dommer1Status === "PENDING") {
        rows.push({
          match: {
            id: m.id,
            date: toIso(m.date),
            time: toIso(m.time),
            league: m.league,
            gender: m.gender,
            stage: m.stage,
            pool: m.pool,
            venue: m.venue,
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
          },
          slot: 1,
        });
      }

      if (isSlot2 && m.dommer2Status === "PENDING") {
        rows.push({
          match: {
            id: m.id,
            date: toIso(m.date),
            time: toIso(m.time),
            league: m.league,
            gender: m.gender,
            stage: m.stage,
            pool: m.pool,
            venue: m.venue,
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
          },
          slot: 2,
        });
      }

      return rows;
    });

    return NextResponse.json({ assignments });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_AUTHORIZED" ? 403 : 500;
    return NextResponse.json({ message: "Kunne ikke hente påsætninger." }, { status });
  }
}
