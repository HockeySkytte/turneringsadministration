import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { requireApprovedUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export async function GET() {
  try {
    const user = await requireApprovedUser();
    if (!user.isTournamentAdmin && !user.isAdmin) {
      return NextResponse.json({ message: "Du har ikke adgang." }, { status: 403 });
    }

    await ensureTurneringDomainTables();

    const moveRequests = (prisma as unknown as Record<string, any>)["taMatchMoveRequest"];

    const rows = moveRequests?.findMany
      ? ((await moveRequests.findMany({
          where: { status: "PENDING_TA" },
          orderBy: [{ createdAt: "asc" }],
          select: {
            id: true,
            kampId: true,
            proposedDate: true,
            proposedTime: true,
            note: true,
            createdAt: true,
            createdBy: { select: { username: true, name: true } },
          },
        })) as Array<{
          id: string;
          kampId: number;
          proposedDate: Date | null;
          proposedTime: Date | null;
          note: string | null;
          createdAt: Date;
          createdBy: { username: string; name: string | null } | null;
        }>)
      : ((await prisma.$queryRawUnsafe(
          `
            SELECT
              r.id,
              r."kampId" AS "kampId",
              r."proposedDate" AS "proposedDate",
              r."proposedTime" AS "proposedTime",
              r.note,
              r."createdAt" AS "createdAt",
              u.username AS username,
              u.name AS name
            FROM ta_match_move_requests r
            LEFT JOIN ta_users u ON u.id = r."createdById"
            WHERE r.status = 'PENDING_TA'
            ORDER BY r."createdAt" ASC
          `
        )) as Array<{
          id: string;
          kampId: number;
          proposedDate: Date | string | null;
          proposedTime: Date | string | null;
          note: string | null;
          createdAt: Date;
          username: string | null;
          name: string | null;
        }>).map((r) => ({
          id: r.id,
          kampId: r.kampId,
          proposedDate: r.proposedDate instanceof Date ? r.proposedDate : r.proposedDate ? new Date(String(r.proposedDate)) : null,
          proposedTime:
            r.proposedTime instanceof Date
              ? r.proposedTime
              : (() => {
                  const v = norm(r.proposedTime);
                  const m = v.match(/^(\d{2}):(\d{2})/);
                  if (!m) return null;
                  const hh = Number.parseInt(m[1]!, 10);
                  const mm = Number.parseInt(m[2]!, 10);
                  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
                  return new Date(Date.UTC(1970, 0, 1, hh, mm, 0, 0));
                })(),
          note: r.note,
          createdAt: r.createdAt,
          createdBy: r.username ? { username: r.username, name: r.name } : null,
        }));

    const kampIds = Array.from(new Set(rows.map((r) => r.kampId)));

    const matches = kampIds.length
      ? await prisma.taMatch.findMany({
          where: { externalId: { in: kampIds.map(String) } },
          select: { externalId: true, date: true, time: true, league: true, homeTeam: true, awayTeam: true },
        })
      : [];

    const matchByKampId = new Map<number, { date: Date | null; time: Date | null; league: string | null; homeTeam: string; awayTeam: string }>();
    for (const m of matches) {
      const kid = Number.parseInt(norm(m.externalId), 10);
      if (!Number.isFinite(kid)) continue;
      matchByKampId.set(kid, {
        date: m.date ?? null,
        time: m.time ?? null,
        league: norm(m.league) || null,
        homeTeam: norm(m.homeTeam) || "",
        awayTeam: norm(m.awayTeam) || "",
      });
    }

    return NextResponse.json({
      items: rows.map((r) => {
        const m = matchByKampId.get(r.kampId);
        return {
          id: r.id,
          kampId: r.kampId,
          current: m
            ? {
                date: m.date ? m.date.toISOString().slice(0, 10) : null,
                time: m.time ? m.time.toISOString().slice(11, 16) : null,
                league: m.league,
                homeTeam: m.homeTeam,
                awayTeam: m.awayTeam,
              }
            : null,
          proposed: {
            date: r.proposedDate ? r.proposedDate.toISOString().slice(0, 10) : null,
            time: r.proposedTime ? r.proposedTime.toISOString().slice(11, 16) : null,
            note: r.note,
          },
          createdAt: r.createdAt.toISOString(),
          createdBy: norm(r.createdBy?.name) || norm(r.createdBy?.username) || "Ukendt",
        };
      }),
    });
  } catch (err) {
    console.error("[api/turnering/move-requests/pending] GET failed", err);
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_APPROVED" ? 403 : 500;
    return NextResponse.json({ message: "Kunne ikke hente kampflytninger." }, { status });
  }
}
