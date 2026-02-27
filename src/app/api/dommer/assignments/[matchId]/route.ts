import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { requireApprovedUser } from "@/lib/auth";
import { TaRole, TaRoleStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRefereeIdFromUser(user: Awaited<ReturnType<typeof requireApprovedUser>>) {
  const role = user.roles.find(
    (r) => r.role === TaRole.REFEREE && r.status === TaRoleStatus.APPROVED && r.refereeId
  );
  return role?.refereeId ?? null;
}

async function resolveReferee(refereeId: string): Promise<{ refereeNo: string; name: string } | null> {
  const r = await prisma.taReferee.findUnique({ where: { id: refereeId }, select: { refereeNo: true, name: true } });
  if (!r?.refereeNo) return null;
  return { refereeNo: r.refereeNo, name: r.name };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const user = await requireApprovedUser();
    if (!user.isReferee) throw new Error("NOT_AUTHORIZED");

    const refereeId = getRefereeIdFromUser(user);
    if (!refereeId) throw new Error("NO_REFEREE_ID");

    const { matchId } = await params;
    const body = (await req.json()) as { decision?: string };

    const decision = String(body.decision ?? "").toUpperCase();
    if (decision !== "ACCEPTED" && decision !== "DECLINED" && decision !== "WITHDRAWN") {
      return NextResponse.json({ message: "Ugyldigt svar." }, { status: 400 });
    }

    await ensureTurneringDomainTables();

    const referee = await resolveReferee(refereeId);
    const refereeNo = referee?.refereeNo ?? null;

    const match = await prisma.taMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        dommer1Id: true,
        dommer2Id: true,
      },
    });

    if (!match) return NextResponse.json({ message: "Kamp ikke fundet." }, { status: 404 });

    const isSlot1 = match.dommer1Id === refereeId || (refereeNo ? match.dommer1Id === refereeNo : false);
    const isSlot2 = match.dommer2Id === refereeId || (refereeNo ? match.dommer2Id === refereeNo : false);

    if (!isSlot1 && !isSlot2) {
      return NextResponse.json({ message: "Du er ikke påsat denne kamp." }, { status: 403 });
    }

    if (decision === "WITHDRAWN") {
      const full = await prisma.taMatch.findUnique({
        where: { id: matchId },
        select: {
          id: true,
          result: true,
          dommer1Status: true,
          dommer2Status: true,
        },
      });

      if (!full) return NextResponse.json({ message: "Kamp ikke fundet." }, { status: 404 });
      if (full.result && String(full.result).trim()) {
        return NextResponse.json({ message: "Kampen er allerede afsluttet." }, { status: 400 });
      }

      if (isSlot1 && String(full.dommer1Status ?? "").toUpperCase() !== "ACCEPTED") {
        return NextResponse.json({ message: "Du kan kun afmelde en godkendt kamp." }, { status: 400 });
      }

      if (isSlot2 && String(full.dommer2Status ?? "").toUpperCase() !== "ACCEPTED") {
        return NextResponse.json({ message: "Du kan kun afmelde en godkendt kamp." }, { status: 400 });
      }
    }

    const now = new Date();

    await prisma.taMatch.update({
      where: { id: matchId },
      data: {
        ...(isSlot1
          ? {
              dommer1Status: decision,
              dommer1RespondedAt: now,
              ...(decision === "ACCEPTED" && referee
                ? {
                    dommer1: referee.name,
                    dommer1Id: referee.refereeNo,
                  }
                : {}),
            }
          : {}),
        ...(isSlot2
          ? {
              dommer2Status: decision,
              dommer2RespondedAt: now,
              ...(decision === "ACCEPTED" && referee
                ? {
                    dommer2: referee.name,
                    dommer2Id: referee.refereeNo,
                  }
                : {}),
            }
          : {}),
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status =
      message === "NOT_AUTHENTICATED"
        ? 401
        : message === "NOT_AUTHORIZED"
          ? 403
          : message === "NO_REFEREE_ID"
            ? 400
            : 500;

    return NextResponse.json({ message: "Kunne ikke gemme svar." }, { status });
  }
}
