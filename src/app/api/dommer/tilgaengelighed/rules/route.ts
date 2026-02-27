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

function getRefereeIdFromUser(user: Awaited<ReturnType<typeof requireApprovedUser>>) {
  const role = user.roles.find(
    (r) => r.role === TaRole.REFEREE && r.status === TaRoleStatus.APPROVED && r.refereeId
  );
  return role?.refereeId ?? null;
}

function isValidStatus(value: unknown): value is "AVAILABLE" | "UNAVAILABLE" {
  const v = norm(value).toUpperCase();
  return v === "AVAILABLE" || v === "UNAVAILABLE";
}

function parseWeekday(value: unknown): number | null {
  const w = Number.parseInt(norm(value), 10);
  if (!Number.isFinite(w)) return null;
  if (w < 0 || w > 6) return null;
  return w;
}

export async function GET() {
  try {
    const user = await requireApprovedUser();
    if (!user.isReferee) throw new Error("NOT_AUTHORIZED");

    const refereeId = getRefereeIdFromUser(user);
    if (!refereeId) return NextResponse.json({ rules: [] });

    await ensureTurneringDomainTables();

    const rules = (prisma as any)["taRefereeAvailabilityRule"] as any;

    const rows = (await rules.findMany({
      where: { refereeId },
      select: { id: true, weekday: true, status: true, startTime: true, endTime: true },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    })) as Array<{ id: string; weekday: number; status: string; startTime: Date | null; endTime: Date | null }>;

    return NextResponse.json({
      rules: rows.map((r) => ({
        id: r.id,
        weekday: r.weekday,
        status: r.status,
        startTime: formatTimeAsStored(r.startTime),
        endTime: formatTimeAsStored(r.endTime),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_AUTHORIZED" ? 403 : 500;
    return NextResponse.json({ message: "Kunne ikke hente faste regler." }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApprovedUser();
    if (!user.isReferee) throw new Error("NOT_AUTHORIZED");

    const refereeId = getRefereeIdFromUser(user);
    if (!refereeId) throw new Error("NO_REFEREE_ID");

    await ensureTurneringDomainTables();

    const body = (await req.json().catch(() => null)) as any;

    const weekday = parseWeekday(body?.weekday);
    if (weekday === null) return NextResponse.json({ message: "Ugyldig ugedag." }, { status: 400 });

    if (!isValidStatus(body?.status)) return NextResponse.json({ message: "Ugyldig status." }, { status: 400 });

    const mode = norm(body?.mode).toUpperCase();
    const isTimeRange = mode === "TIMERUM";

    const startTime = isTimeRange ? parseTimeHHMM(body?.startTime ?? null) : null;
    const endTime = isTimeRange ? parseTimeHHMM(body?.endTime ?? null) : null;

    if (isTimeRange) {
      if (!startTime || !endTime) return NextResponse.json({ message: "Vælg start og slut." }, { status: 400 });
      if (endTime.getTime() <= startTime.getTime()) {
        return NextResponse.json({ message: "Sluttid skal være efter starttid." }, { status: 400 });
      }
    }

    const now = new Date();

    const rules = (prisma as any)["taRefereeAvailabilityRule"] as any;
    const row = await rules.create({
      data: {
        refereeId,
        weekday,
        status: norm(body.status).toUpperCase(),
        startTime,
        endTime,
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: row.id });
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

    return NextResponse.json({ message: "Kunne ikke gemme fast regel." }, { status });
  }
}
