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

function parseKampId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function getActorRefereeNo(user: Awaited<ReturnType<typeof requireApprovedUser>>): Promise<string | null> {
  const role = user.roles.find((r) => r.role === TaRole.REFEREE && r.status === TaRoleStatus.APPROVED && r.refereeId);
  const refereeId = norm(role?.refereeId);
  if (!refereeId) return null;

  const ref = await prisma.taReferee.findUnique({ where: { id: refereeId }, select: { refereeNo: true } });
  const no = norm(ref?.refereeNo);
  return no || null;
}

async function canAccessMatchComments(user: Awaited<ReturnType<typeof requireApprovedUser>>, kampId: number) {
  await ensureTurneringDomainTables();

  const taMatch = await prisma.taMatch.findFirst({
    where: { externalId: String(kampId) },
    select: {
      homeHoldId: true,
      awayHoldId: true,
      dommer1Id: true,
      dommer2Id: true,
    },
  });

  if (!taMatch) return { ok: false as const, reason: "NOT_FOUND" as const, taMatch: null };

  const homeHoldId = norm(taMatch.homeHoldId) || null;
  const awayHoldId = norm(taMatch.awayHoldId) || null;

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

  const homeClubId = homeTeamRecord?.clubId ?? null;
  const awayClubId = awayTeamRecord?.clubId ?? null;
  const homeTeamId = homeTeamRecord?.id ?? null;
  const awayTeamId = awayTeamRecord?.id ?? null;

  const isAdminLike = Boolean(user.isAdmin || user.isTournamentAdmin || user.isRefAdmin);

  const isTeamLeaderForMatch = Boolean(
    user.roles.some(
      (r) =>
        r.status === TaRoleStatus.APPROVED &&
        r.role === TaRole.TEAM_LEADER &&
        ((r.teamId != null && (r.teamId === homeTeamId || r.teamId === awayTeamId)) ||
          (r.holdId != null && (r.holdId === homeHoldId || r.holdId === awayHoldId)))
    )
  );

  const isClubLeaderForMatch = Boolean(
    user.roles.some(
      (r) =>
        r.status === TaRoleStatus.APPROVED &&
        r.role === TaRole.CLUB_LEADER &&
        r.clubId != null &&
        (r.clubId === homeClubId || r.clubId === awayClubId)
    )
  );

  const dommer1Id = norm(taMatch.dommer1Id);
  const dommer2Id = norm(taMatch.dommer2Id);
  const actorRefereeId = norm(
    user.roles.find((r) => r.role === TaRole.REFEREE && r.status === TaRoleStatus.APPROVED && r.refereeId)?.refereeId
  );
  const actorRefereeNo = await getActorRefereeNo(user);
  const isAssignedReferee = Boolean(
    (actorRefereeNo && (dommer1Id === actorRefereeNo || dommer2Id === actorRefereeNo)) ||
      (actorRefereeId && (dommer1Id === actorRefereeId || dommer2Id === actorRefereeId))
  );

  const ok = isAdminLike || isTeamLeaderForMatch || isClubLeaderForMatch || isAssignedReferee;
  return {
    ok,
    reason: ok ? null : "NOT_AUTHORIZED",
    taMatch,
    flags: { isAdminLike, isTeamLeaderForMatch, isClubLeaderForMatch, isAssignedReferee },
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ kampId: string }> }) {
  try {
    const user = await requireApprovedUser();

    const { kampId: raw } = await params;
    const kampId = parseKampId(raw);
    if (!kampId) return NextResponse.json({ message: "Ugyldig kamp." }, { status: 400 });

    const access = await canAccessMatchComments(user, kampId);
    if (!access.ok) {
      if (access.reason === "NOT_FOUND") return NextResponse.json({ message: "Kamp ikke fundet." }, { status: 404 });
      return NextResponse.json({ message: "Du har ikke adgang til kommentarer for denne kamp." }, { status: 403 });
    }

    const matchComments = (prisma as unknown as Record<string, any>)["taMatchComment"];

    const items = matchComments?.findMany
      ? ((await matchComments.findMany({
          where: { kampId },
          orderBy: [{ createdAt: "asc" }],
          select: {
            id: true,
            message: true,
            createdAt: true,
            createdBy: { select: { username: true, name: true } },
          },
        })) as Array<{ id: string; message: string; createdAt: Date; createdBy: { username: string; name: string | null } | null }>)
      : ((await prisma.$queryRawUnsafe(
          `
            SELECT
              c.id,
              c.message,
              c."createdAt" AS "createdAt",
              u.username AS username,
              u.name AS name
            FROM ta_match_comments c
            LEFT JOIN ta_users u ON u.id = c."createdById"
            WHERE c."kampId" = $1
            ORDER BY c."createdAt" ASC
          `,
          kampId
        )) as Array<{ id: string; message: string; createdAt: Date; username: string | null; name: string | null }>).map((r) => ({
          id: r.id,
          message: r.message,
          createdAt: r.createdAt,
          createdBy: r.username ? { username: r.username, name: r.name } : null,
        }));

    // Mark comments as read for this user when the comments are successfully fetched.
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO ta_match_comment_reads ("kampId", "userId", "lastReadAt", "createdAt", "updatedAt")
        VALUES ($1, $2, now(), now(), now())
        ON CONFLICT ("kampId", "userId")
        DO UPDATE SET "lastReadAt" = EXCLUDED."lastReadAt", "updatedAt" = EXCLUDED."updatedAt";
      `,
      kampId,
      user.id
    );

    return NextResponse.json({
      comments: items.map((c) => ({
        id: c.id,
        message: c.message,
        createdAt: c.createdAt.toISOString(),
        author: norm(c.createdBy?.name) || norm(c.createdBy?.username) || "Ukendt",
      })),
    });
  } catch (err) {
    console.error("[api/kamp/comments] GET failed", err);
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_APPROVED" ? 403 : 500;
    return NextResponse.json({ message: "Kunne ikke hente kommentarer." }, { status });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ kampId: string }> }) {
  try {
    const user = await requireApprovedUser();

    const { kampId: raw } = await params;
    const kampId = parseKampId(raw);
    if (!kampId) return NextResponse.json({ message: "Ugyldig kamp." }, { status: 400 });

    const access = await canAccessMatchComments(user, kampId);
    if (!access.ok) {
      if (access.reason === "NOT_FOUND") return NextResponse.json({ message: "Kamp ikke fundet." }, { status: 404 });
      return NextResponse.json({ message: "Du har ikke adgang til at kommentere på denne kamp." }, { status: 403 });
    }

    await ensureTurneringDomainTables();

    const body = (await req.json().catch(() => null)) as any;
    const messageText = norm(body?.message);
    if (!messageText) return NextResponse.json({ message: "Skriv en kommentar." }, { status: 400 });
    if (messageText.length > 2000) return NextResponse.json({ message: "Kommentar er for lang." }, { status: 400 });

    const matchComments = (prisma as unknown as Record<string, any>)["taMatchComment"];

    if (matchComments?.create) {
      const created = await matchComments.create({
        data: {
          kampId,
          message: messageText,
          createdById: user.id,
        },
        select: { id: true },
      });

      // Author has effectively "read" the comment thread by posting.
      await prisma.$executeRawUnsafe(
        `
          INSERT INTO ta_match_comment_reads ("kampId", "userId", "lastReadAt", "createdAt", "updatedAt")
          VALUES ($1, $2, now(), now(), now())
          ON CONFLICT ("kampId", "userId")
          DO UPDATE SET "lastReadAt" = EXCLUDED."lastReadAt", "updatedAt" = EXCLUDED."updatedAt";
        `,
        kampId,
        user.id
      );

      return NextResponse.json({ ok: true, id: created.id });
    }

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO ta_match_comments (id, "kampId", message, "createdById", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, now(), now())
      `,
      id,
      kampId,
      messageText,
      user.id
    );

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO ta_match_comment_reads ("kampId", "userId", "lastReadAt", "createdAt", "updatedAt")
        VALUES ($1, $2, now(), now(), now())
        ON CONFLICT ("kampId", "userId")
        DO UPDATE SET "lastReadAt" = EXCLUDED."lastReadAt", "updatedAt" = EXCLUDED."updatedAt";
      `,
      kampId,
      user.id
    );

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[api/kamp/comments] POST failed", err);
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_APPROVED" ? 403 : 500;
    return NextResponse.json({ message: "Kunne ikke gemme kommentar." }, { status });
  }
}
