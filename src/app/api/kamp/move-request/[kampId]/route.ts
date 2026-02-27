import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { requireApprovedUser } from "@/lib/auth";
import { TaRole, TaRoleStatus } from "@prisma/client";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseKampId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDateOnlyUTC(value: unknown): Date | null {
  const v = norm(value);
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number.parseInt(m[1]!, 10);
  const mo = Number.parseInt(m[2]!, 10);
  const d = Number.parseInt(m[3]!, 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function parseTimeHHMM(value: unknown): Date | null {
  const v = norm(value);
  if (!v) return null;
  const m = v.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number.parseInt(m[1]!, 10);
  const mm = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return new Date(Date.UTC(1970, 0, 1, hh, mm, 0, 0));
}

function formatDateOnlyUTC(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function formatTimeAsStored(t: Date | null): string | null {
  if (!t) return null;
  return `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
}

function formatDateOnlyFromDb(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return formatDateOnlyUTC(value);
  const v = norm(value);
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1]! : v || null;
}

function formatTimeHHMMFromDb(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return formatTimeAsStored(value);
  const v = norm(value);
  const m = v.match(/^(\d{2}:\d{2})/);
  return m ? m[1]! : v || null;
}

async function getMatchContext(kampId: number) {
  await ensureTurneringDomainTables();

  const taMatch = await prisma.taMatch.findFirst({
    where: { externalId: String(kampId) },
    select: { homeHoldId: true, awayHoldId: true, dommer1Id: true, dommer2Id: true },
  });
  if (!taMatch) return null;

  const homeHoldId = norm(taMatch.homeHoldId) || null;
  const awayHoldId = norm(taMatch.awayHoldId) || null;
  const dommer1Id = norm(taMatch.dommer1Id) || null;
  const dommer2Id = norm(taMatch.dommer2Id) || null;

  const [homeTeamRecord, awayTeamRecord] = await Promise.all([
    homeHoldId
      ? prisma.taTeam.findFirst({
          where: { holdId: homeHoldId },
          orderBy: { updatedAt: "desc" },
          select: { id: true, clubId: true },
        })
      : Promise.resolve(null),
    awayHoldId
      ? prisma.taTeam.findFirst({
          where: { holdId: awayHoldId },
          orderBy: { updatedAt: "desc" },
          select: { id: true, clubId: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    homeHoldId,
    awayHoldId,
    homeTeamId: homeTeamRecord?.id ?? null,
    awayTeamId: awayTeamRecord?.id ?? null,
    homeClubId: homeTeamRecord?.clubId ?? null,
    awayClubId: awayTeamRecord?.clubId ?? null,
    dommer1Id,
    dommer2Id,
  };
}

async function getActorRefereeNo(user: Awaited<ReturnType<typeof requireApprovedUser>>): Promise<string | null> {
  const role = user.roles.find((r) => r.role === TaRole.REFEREE && r.status === TaRoleStatus.APPROVED && r.refereeId);
  const refereeId = norm(role?.refereeId);
  if (!refereeId) return null;

  const ref = await prisma.taReferee.findUnique({ where: { id: refereeId }, select: { refereeNo: true } });
  const no = norm(ref?.refereeNo);
  return no || null;
}

function isHomeTeamLeader(user: Awaited<ReturnType<typeof requireApprovedUser>>, ctx: Awaited<ReturnType<typeof getMatchContext>>) {
  if (!ctx) return false;
  return user.roles.some(
    (r) =>
      r.status === TaRoleStatus.APPROVED &&
      r.role === TaRole.TEAM_LEADER &&
      ((r.teamId != null && r.teamId === ctx.homeTeamId) || (r.holdId != null && r.holdId === ctx.homeHoldId))
  );
}

function isAwayTeamLeader(user: Awaited<ReturnType<typeof requireApprovedUser>>, ctx: Awaited<ReturnType<typeof getMatchContext>>) {
  if (!ctx) return false;
  return user.roles.some(
    (r) =>
      r.status === TaRoleStatus.APPROVED &&
      r.role === TaRole.TEAM_LEADER &&
      ((r.teamId != null && r.teamId === ctx.awayTeamId) || (r.holdId != null && r.holdId === ctx.awayHoldId))
  );
}

function isClubLeaderForMatch(user: Awaited<ReturnType<typeof requireApprovedUser>>, ctx: Awaited<ReturnType<typeof getMatchContext>>) {
  if (!ctx) return false;
  return user.roles.some(
    (r) =>
      r.status === TaRoleStatus.APPROVED &&
      r.role === TaRole.CLUB_LEADER &&
      r.clubId != null &&
      (r.clubId === ctx.homeClubId || r.clubId === ctx.awayClubId)
  );
}

function isHomeClubLeader(user: Awaited<ReturnType<typeof requireApprovedUser>>, ctx: Awaited<ReturnType<typeof getMatchContext>>) {
  if (!ctx) return false;
  return user.roles.some(
    (r) =>
      r.status === TaRoleStatus.APPROVED &&
      r.role === TaRole.CLUB_LEADER &&
      r.clubId != null &&
      ctx.homeClubId != null &&
      r.clubId === ctx.homeClubId
  );
}

function isAwayClubLeader(user: Awaited<ReturnType<typeof requireApprovedUser>>, ctx: Awaited<ReturnType<typeof getMatchContext>>) {
  if (!ctx) return false;
  return user.roles.some(
    (r) =>
      r.status === TaRoleStatus.APPROVED &&
      r.role === TaRole.CLUB_LEADER &&
      r.clubId != null &&
      ctx.awayClubId != null &&
      r.clubId === ctx.awayClubId
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ kampId: string }> }) {
  try {
    const user = await requireApprovedUser();

    const { kampId: raw } = await params;
    const kampId = parseKampId(raw);
    if (!kampId) return NextResponse.json({ message: "Ugyldig kamp." }, { status: 400 });

    const ctx = await getMatchContext(kampId);
    if (!ctx) return NextResponse.json({ message: "Kamp ikke fundet." }, { status: 404 });

    const actorRefereeId = norm(
      user.roles.find((r) => r.role === TaRole.REFEREE && r.status === TaRoleStatus.APPROVED && r.refereeId)?.refereeId
    );
    const actorRefereeNo = await getActorRefereeNo(user);
    const isAssignedReferee = Boolean(
      (actorRefereeNo && (ctx.dommer1Id === actorRefereeNo || ctx.dommer2Id === actorRefereeNo)) ||
        (actorRefereeId && (ctx.dommer1Id === actorRefereeId || ctx.dommer2Id === actorRefereeId))
    );

    const canRead =
      user.isAdmin ||
      user.isTournamentAdmin ||
      user.isRefAdmin ||
      isHomeTeamLeader(user, ctx) ||
      isAwayTeamLeader(user, ctx) ||
      isClubLeaderForMatch(user, ctx) ||
      isAssignedReferee;

    if (!canRead) return NextResponse.json({ message: "Du har ikke adgang." }, { status: 403 });

    const moveRequests = (prisma as unknown as Record<string, any>)["taMatchMoveRequest"];

    let latest:
      | {
          id: string;
          status: string;
          proposedDate: Date | null;
          proposedTime: Date | null;
          note: string | null;
          rejectionReason: string | null;
          createdAt: Date;
          createdBy: { username: string; name: string | null } | null;
          awayDecidedAt: Date | null;
          awayDecidedBy: { username: string; name: string | null } | null;
          taDecidedAt: Date | null;
          taDecidedBy: { username: string; name: string | null } | null;
        }
      | {
          id: string;
          status: string;
          proposedDate: unknown;
          proposedTime: unknown;
          note: string | null;
          rejectionReason: string | null;
          createdAt: Date;
          created_username: string | null;
          created_name: string | null;
          awayDecidedAt: Date | null;
          away_username: string | null;
          away_name: string | null;
          taDecidedAt: Date | null;
          ta_username: string | null;
          ta_name: string | null;
        }
      | null = null;

    if (moveRequests?.findFirst) {
      latest = (await moveRequests.findFirst({
        where: { kampId },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          status: true,
          proposedDate: true,
          proposedTime: true,
          note: true,
          rejectionReason: true,
          createdAt: true,
          createdBy: { select: { username: true, name: true } },
          awayDecidedAt: true,
          awayDecidedBy: { select: { username: true, name: true } },
          taDecidedAt: true,
          taDecidedBy: { select: { username: true, name: true } },
        },
      })) as any;
    } else {
      const sql = [
        'SELECT',
        '  r.id,',
        '  r.status,',
        '  r."proposedDate" AS "proposedDate",',
        '  r."proposedTime" AS "proposedTime",',
        '  r.note,',
        '  r."rejectionReason" AS "rejectionReason",',
        '  r."createdAt" AS "createdAt",',
        '  uc.username AS "created_username",',
        '  uc.name AS "created_name",',
        '  r."awayDecidedAt" AS "awayDecidedAt",',
        '  ua.username AS "away_username",',
        '  ua.name AS "away_name",',
        '  r."taDecidedAt" AS "taDecidedAt",',
        '  ut.username AS "ta_username",',
        '  ut.name AS "ta_name"',
        'FROM ta_match_move_requests r',
        'LEFT JOIN ta_users uc ON uc.id = r."createdById"',
        'LEFT JOIN ta_users ua ON ua.id = r."awayDecidedById"',
        'LEFT JOIN ta_users ut ON ut.id = r."taDecidedById"',
        'WHERE r."kampId" = $1',
        'ORDER BY r."createdAt" DESC',
        'LIMIT 1',
      ].join("\n");

      const rows = (await prisma.$queryRawUnsafe(sql, kampId)) as Array<{
        id: string;
        status: string;
        proposedDate: unknown;
        proposedTime: unknown;
        note: string | null;
        rejectionReason: string | null;
        createdAt: Date;
        created_username: string | null;
        created_name: string | null;
        awayDecidedAt: Date | null;
        away_username: string | null;
        away_name: string | null;
        taDecidedAt: Date | null;
        ta_username: string | null;
        ta_name: string | null;
      }>;

      latest = rows[0] ?? null;
    }

    return NextResponse.json({
      moveRequest: latest
        ? {
            id: latest.id,
            status: latest.status,
            proposedDate:
              "createdBy" in latest
                ? formatDateOnlyUTC((latest as any).proposedDate ?? null)
                : formatDateOnlyFromDb((latest as any).proposedDate),
            proposedTime:
              "createdBy" in latest
                ? formatTimeAsStored((latest as any).proposedTime ?? null)
                : formatTimeHHMMFromDb((latest as any).proposedTime),
            note: (latest as any).note,
            rejectionReason: (latest as any).rejectionReason,
            createdAt: latest.createdAt.toISOString(),
            createdBy:
              "createdBy" in latest
                ? norm((latest as any).createdBy?.name) || norm((latest as any).createdBy?.username) || "Ukendt"
                : norm((latest as any).created_name) || norm((latest as any).created_username) || "Ukendt",
            awayDecidedAt: latest.awayDecidedAt ? latest.awayDecidedAt.toISOString() : null,
            awayDecidedBy:
              "awayDecidedBy" in latest
                ? norm((latest as any).awayDecidedBy?.name) || norm((latest as any).awayDecidedBy?.username) || null
                : norm((latest as any).away_name) || norm((latest as any).away_username) || null,
            taDecidedAt: latest.taDecidedAt ? latest.taDecidedAt.toISOString() : null,
            taDecidedBy:
              "taDecidedBy" in latest
                ? norm((latest as any).taDecidedBy?.name) || norm((latest as any).taDecidedBy?.username) || null
                : norm((latest as any).ta_name) || norm((latest as any).ta_username) || null,
          }
        : null,
      flags: {
        isHomeLeader: isHomeTeamLeader(user, ctx),
        isAwayLeader: isAwayTeamLeader(user, ctx),
        isHomeClubLeader: isHomeClubLeader(user, ctx),
        isAwayClubLeader: isAwayClubLeader(user, ctx),
        isAdminLike: Boolean(user.isAdmin || user.isTournamentAdmin || user.isRefAdmin),
      },
    });
  } catch (err) {
    console.error("[api/kamp/move-request] GET failed", err);
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_APPROVED" ? 403 : 500;
    return NextResponse.json({ message: "Kunne ikke hente kampflytning." }, { status });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ kampId: string }> }) {
  try {
    const user = await requireApprovedUser();

    const { kampId: raw } = await params;
    const kampId = parseKampId(raw);
    if (!kampId) return NextResponse.json({ message: "Ugyldig kamp." }, { status: 400 });

    const ctx = await getMatchContext(kampId);
    if (!ctx) return NextResponse.json({ message: "Kamp ikke fundet." }, { status: 404 });

    if (!isHomeTeamLeader(user, ctx) && !isHomeClubLeader(user, ctx)) {
      return NextResponse.json({ message: "Kun hjemmeholdets holdleder eller klubleder kan anmode om kampflytning." }, { status: 403 });
    }

    const moveRequests = (prisma as unknown as Record<string, any>)["taMatchMoveRequest"];

    const existingOpen = moveRequests?.findFirst
      ? ((await moveRequests.findFirst({
          where: {
            kampId,
            status: { in: ["PENDING_AWAY", "PENDING_TA"] },
          },
          select: { id: true },
        })) as { id: string } | null)
      : (((await prisma.$queryRawUnsafe(
          `
            SELECT id
            FROM ta_match_move_requests
            WHERE "kampId" = $1
              AND status IN ('PENDING_AWAY', 'PENDING_TA')
            ORDER BY "createdAt" DESC
            LIMIT 1
          `,
          kampId
        )) as Array<{ id: string }>)[0] ?? null);

    if (existingOpen) {
      return NextResponse.json({ message: "Der findes allerede en aktiv anmodning for denne kamp." }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as any;
    const proposedDateParsed = parseDateOnlyUTC(body?.proposedDate ?? null);
    const proposedTimeParsed = parseTimeHHMM(body?.proposedTime ?? null);
    const proposedDate = formatDateOnlyUTC(proposedDateParsed);
    const proposedTime = formatTimeAsStored(proposedTimeParsed);
    const note = norm(body?.note) || null;

    if (moveRequests?.create) {
      const created = await moveRequests.create({
        data: {
          kampId,
          status: "PENDING_AWAY",
          proposedDate: proposedDateParsed,
          proposedTime: proposedTimeParsed,
          note,
          createdById: user.id,
        },
        select: { id: true },
      });

      return NextResponse.json({ ok: true, id: created.id });
    }

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO ta_match_move_requests (
          id, "kampId", status, "proposedDate", "proposedTime", note,
          "createdById", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
      `,
      id,
      kampId,
      "PENDING_AWAY",
      proposedDate,
      proposedTime,
      note,
      user.id
    );

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[api/kamp/move-request] POST failed", err);
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_APPROVED" ? 403 : 500;
    return NextResponse.json({ message: "Kunne ikke oprette anmodning." }, { status });
  }
}
