import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { requireApprovedUser } from "@/lib/auth";
import { TaRole, TaRoleStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatDateOnlyUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function parseDateOnlyUTC(value: string): Date | null {
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

function parseTimeHHMM(value: string | null): Date | null {
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

function formatTimeAsStored(t: Date | null): string | null {
  if (!t) return null;
  return `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
}

function isValidStatus(value: unknown): value is "AVAILABLE" | "UNAVAILABLE" {
  const v = norm(value).toUpperCase();
  return v === "AVAILABLE" || v === "UNAVAILABLE";
}

function getRefereeIdFromUser(user: Awaited<ReturnType<typeof requireApprovedUser>>) {
  const role = user.roles.find(
    (r) => r.role === TaRole.REFEREE && r.status === TaRoleStatus.APPROVED && r.refereeId
  );
  return role?.refereeId ?? null;
}

function parseYearMonth(url: URL): { year: number; month: number } | null {
  const year = Number.parseInt(norm(url.searchParams.get("year")), 10);
  const month = Number.parseInt(norm(url.searchParams.get("month")), 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export async function GET(req: Request) {
  try {
    const user = await requireApprovedUser();
    if (!user.isReferee) throw new Error("NOT_AUTHORIZED");

    const refereeId = getRefereeIdFromUser(user);
    if (!refereeId) return NextResponse.json({ segments: [], matches: [] });

    await ensureTurneringDomainTables();

    const url = new URL(req.url);
    const ym = parseYearMonth(url);
    if (!ym) return NextResponse.json({ message: "Ugyldig måned." }, { status: 400 });

    const start = new Date(Date.UTC(ym.year, ym.month - 1, 1));
    const end = new Date(Date.UTC(ym.year, ym.month, 1));

    const availability = (prisma as any)["taRefereeAvailability"] as any;

    const rows = (await availability.findMany({
      where: {
        refereeId,
        entryDate: { gte: start, lt: end },
      },
      select: {
        entryDate: true,
        status: true,
        startTime: true,
        endTime: true,
      },
      orderBy: [{ entryDate: "asc" }],
    })) as Array<{ entryDate: Date; status: string; startTime: Date | null; endTime: Date | null }>;

    const referee = await prisma.taReferee.findUnique({
      where: { id: refereeId },
      select: { refereeNo: true },
    });

    const refereeNo = norm(referee?.refereeNo ?? "");

    const matchRows = refereeNo
      ? await prisma.taMatch.findMany({
          where: {
            date: { gte: start, lt: end },
            OR: [{ dommer1Id: refereeNo }, { dommer2Id: refereeNo }, { dommer1Id: refereeId }, { dommer2Id: refereeId }],
          },
          select: {
            externalId: true,
            date: true,
            time: true,
            league: true,
            venue: true,
            homeTeam: true,
            awayTeam: true,
          },
          orderBy: [{ date: "asc" }, { time: "asc" }],
        })
      : [];

    return NextResponse.json({
      segments: rows.map((r: { entryDate: Date; status: string; startTime: Date | null; endTime: Date | null }) => ({
        date: formatDateOnlyUTC(r.entryDate),
        status: r.status,
        startTime: formatTimeAsStored(r.startTime),
        endTime: formatTimeAsStored(r.endTime),
      })),
      matches: matchRows.map((m) => ({
        externalId: norm(m.externalId) || null,
        date: m.date ? formatDateOnlyUTC(m.date) : null,
        time: formatTimeAsStored(m.time ?? null),
        league: norm(m.league) || null,
        venue: norm(m.venue) || null,
        homeTeam: norm(m.homeTeam) || "",
        awayTeam: norm(m.awayTeam) || "",
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_AUTHORIZED" ? 403 : 500;
    return NextResponse.json({ message: "Kunne ikke hente tilgængelighed." }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireApprovedUser();
    if (!user.isReferee) throw new Error("NOT_AUTHORIZED");

    const refereeId = getRefereeIdFromUser(user);
    if (!refereeId) throw new Error("NO_REFEREE_ID");

    await ensureTurneringDomainTables();

    const body = (await req.json().catch(() => null)) as any;
    const date = parseDateOnlyUTC(String(body?.date ?? ""));
    if (!date) return NextResponse.json({ message: "Ugyldig dato." }, { status: 400 });

    const rawSegments = Array.isArray(body?.segments) ? body.segments : [];
    if (rawSegments.length > 40) {
      return NextResponse.json({ message: "For mange tidsrum på samme dag." }, { status: 400 });
    }

    const segments: Array<{
      status: "AVAILABLE" | "UNAVAILABLE";
      startTime: Date | null;
      endTime: Date | null;
    }> = [];

    for (const s of rawSegments) {
      if (!isValidStatus(s?.status)) {
        return NextResponse.json({ message: "Ugyldig status." }, { status: 400 });
      }

      const mode = norm(s?.mode).toUpperCase();
      const isTimeRange = mode === "TIMERUM";

      const startTime = isTimeRange ? parseTimeHHMM(s?.startTime ?? null) : null;
      const endTime = isTimeRange ? parseTimeHHMM(s?.endTime ?? null) : null;

      if (isTimeRange) {
        if (!startTime || !endTime) return NextResponse.json({ message: "Vælg start og slut." }, { status: 400 });
        if (endTime.getTime() <= startTime.getTime()) {
          return NextResponse.json({ message: "Sluttid skal være efter starttid." }, { status: 400 });
        }
      }

      segments.push({
        status: norm(s.status).toUpperCase() as "AVAILABLE" | "UNAVAILABLE",
        startTime,
        endTime,
      });
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const availability = (tx as any)["taRefereeAvailability"] as any;
      await availability.deleteMany({ where: { refereeId, entryDate: date } });
      if (segments.length > 0) {
        await availability.createMany({
          data: segments.map((s) => ({
            refereeId,
            entryDate: date,
            status: s.status,
            startTime: s.startTime,
            endTime: s.endTime,
            createdAt: now,
            updatedAt: now,
          })),
        });
      }
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

    return NextResponse.json({ message: "Kunne ikke gemme tilgængelighed." }, { status });
  }
}
