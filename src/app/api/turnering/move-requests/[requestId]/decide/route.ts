import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { requireApprovedUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export async function POST(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    const user = await requireApprovedUser();
    if (!user.isTournamentAdmin && !user.isAdmin) {
      return NextResponse.json({ message: "Du har ikke adgang." }, { status: 403 });
    }

    await ensureTurneringDomainTables();

    const requestId = norm((await params).requestId);
    if (!requestId) return NextResponse.json({ message: "Ugyldig anmodning." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as
      | {
          decision?: "APPROVE" | "REJECT" | string;
          reason?: string | null;
        }
      | null;

    const decision = norm(body?.decision).toUpperCase();
    const reason = norm(body?.reason) || null;

    if (decision !== "APPROVE" && decision !== "REJECT") {
      return NextResponse.json({ message: "Ugyldig beslutning." }, { status: 400 });
    }

    const moveRequests = (prisma as unknown as Record<string, any>)["taMatchMoveRequest"];

    const row = moveRequests?.findUnique
      ? ((await moveRequests.findUnique({
          where: { id: requestId },
          select: { id: true, status: true, kampId: true, proposedDate: true, proposedTime: true },
        })) as
          | { id: string; status: string; kampId: number; proposedDate: Date | null; proposedTime: Date | null }
          | null)
      : (((await prisma.$queryRawUnsafe(
          `
            SELECT id, status, "kampId" AS "kampId", "proposedDate" AS "proposedDate", "proposedTime" AS "proposedTime"
            FROM ta_match_move_requests
            WHERE id = $1
            LIMIT 1
          `,
          requestId
        )) as Array<{ id: string; status: string; kampId: number; proposedDate: Date | string | null; proposedTime: Date | string | null }>)[0] ?? null);

    if (!row) return NextResponse.json({ message: "Anmodning ikke fundet." }, { status: 404 });
    if (row.status !== "PENDING_TA") {
      return NextResponse.json({ message: "Anmodningen kan ikke behandles." }, { status: 400 });
    }

    const proposedDate =
      (row as any).proposedDate instanceof Date
        ? ((row as any).proposedDate as Date)
        : norm((row as any).proposedDate)
          ? new Date(String((row as any).proposedDate))
          : null;

    const proposedTime =
      (row as any).proposedTime instanceof Date
        ? ((row as any).proposedTime as Date)
        : (() => {
            const v = norm((row as any).proposedTime);
            const m = v.match(/^(\d{2}):(\d{2})/);
            if (!m) return null;
            const hh = Number.parseInt(m[1]!, 10);
            const mm = Number.parseInt(m[2]!, 10);
            if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
            return new Date(Date.UTC(1970, 0, 1, hh, mm, 0, 0));
          })();

    const now = new Date();

    if (decision === "APPROVE") {
      if (!proposedDate && !proposedTime) {
        return NextResponse.json({ message: "Der er ikke angivet ny dato/tid." }, { status: 400 });
      }

      await prisma.$transaction(async (tx) => {
        const txMoveRequests = (tx as unknown as Record<string, any>)["taMatchMoveRequest"];

        if (txMoveRequests?.update) {
          await txMoveRequests.update({
            where: { id: requestId },
            data: {
              status: "APPROVED",
              taDecidedById: user.id,
              taDecidedAt: now,
            },
          });
        } else {
          await tx.$executeRawUnsafe(
            `
              UPDATE ta_match_move_requests
              SET status = $1,
                  "taDecidedById" = $2,
                  "taDecidedAt" = $3,
                  "updatedAt" = $3
              WHERE id = $4
            `,
            "APPROVED",
            user.id,
            now,
            requestId
          );
        }

        await tx.taMatch.updateMany({
          where: { externalId: String(row.kampId) },
          data: {
            date: proposedDate ?? undefined,
            time: proposedTime ?? undefined,
          },
        });
      });

      return NextResponse.json({ ok: true });
    }

    if (moveRequests?.update) {
      await moveRequests.update({
        where: { id: requestId },
        data: {
          status: "REJECTED",
          rejectionReason: reason || "Afvist",
          taDecidedById: user.id,
          taDecidedAt: now,
        },
      });
    } else {
      await prisma.$executeRawUnsafe(
        `
          UPDATE ta_match_move_requests
          SET status = $1,
              "rejectionReason" = $2,
              "taDecidedById" = $3,
              "taDecidedAt" = $4,
              "updatedAt" = $4
          WHERE id = $5
        `,
        "REJECTED",
        reason || "Afvist",
        user.id,
        now,
        requestId
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/turnering/move-requests/decide] POST failed", err);
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_APPROVED" ? 403 : 500;
    return NextResponse.json({ message: "Kunne ikke behandle anmodning." }, { status });
  }
}
