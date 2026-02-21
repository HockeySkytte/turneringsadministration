import { NextResponse } from "next/server";
import { ApprovalStatus, TeamRole } from "@prisma/client";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parseDateOnly(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
}

function todayUtcDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
}

function clamp1to10(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < 1 || i > 10) return null;
  return i;
}

function isLeaderOrAdmin(user: { isAdmin: boolean; activeRole: TeamRole | null }) {
  return user.isAdmin || user.activeRole === TeamRole.LEADER;
}

export async function GET(req: Request) {
  const user = await requireApprovedUser();
  const teamId = user.activeTeamId;
  if (!teamId) return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });

  const url = new URL(req.url);
  const mode = String(url.searchParams.get("mode") ?? "").toLowerCase() === "all" ? "all" : "single";
  const requestedPlayerId = String(url.searchParams.get("playerId") ?? "").trim();
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days") ?? 60) || 60));

  const leader = isLeaderOrAdmin(user);

  let allowedPlayerIds: string[] = [];
  if (leader) {
    const memberships = await prisma.teamMembership.findMany({
      where: { teamId, role: TeamRole.PLAYER, status: ApprovalStatus.APPROVED },
      select: { userId: true },
    });
    allowedPlayerIds = memberships.map((m) => m.userId);
  } else {
    allowedPlayerIds = [user.id];
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const selectedPlayerId =
    mode === "all" && leader
      ? null
      : requestedPlayerId && allowedPlayerIds.includes(requestedPlayerId)
        ? requestedPlayerId
        : leader
          ? allowedPlayerIds[0] ?? null
          : user.id;

  const rows = await prisma.teamReadinessEntry.findMany({
    where: {
      teamId,
      entryDate: { gte: since },
      ...(selectedPlayerId ? { userId: selectedPlayerId } : { userId: { in: allowedPlayerIds } }),
    },
    orderBy: [{ entryDate: "asc" }],
    select: {
      id: true,
      userId: true,
      entryDate: true,
      fatigue: true,
      sleepQuality: true,
      sleepDuration: true,
      soreness: true,
      mood: true,
      stress: true,
    },
  });

  return NextResponse.json({
    ok: true,
    mode: mode === "all" && leader ? "all" : "single",
    selectedPlayerId,
    entries: rows,
  });
}

export async function POST(req: Request) {
  const user = await requireApprovedUser();
  const teamId = user.activeTeamId;
  if (!teamId) return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });

  const body = await req.json().catch(() => null);
  const requestedPlayerId = String(body?.playerId ?? "").trim();
  const leader = isLeaderOrAdmin(user);

  const targetUserId = leader && requestedPlayerId ? requestedPlayerId : user.id;

  // Validate target user is an approved player on the team (unless it's self and not leader).
  if (leader) {
    const m = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: targetUserId, teamId } },
      select: { role: true, status: true },
    });
    if (!m || m.role !== TeamRole.PLAYER || m.status !== ApprovalStatus.APPROVED) {
      return NextResponse.json({ message: "Ugyldig spiller." }, { status: 400 });
    }
  }

  const fatigue = clamp1to10(body?.fatigue);
  const sleepQuality = clamp1to10(body?.sleepQuality);
  const sleepDuration = clamp1to10(body?.sleepDuration);
  const soreness = clamp1to10(body?.soreness);
  const mood = clamp1to10(body?.mood);
  const stress = clamp1to10(body?.stress);

  if ([fatigue, sleepQuality, sleepDuration, soreness, mood, stress].some((v) => v === null)) {
    return NextResponse.json({ message: "Alle felter skal være et tal mellem 1 og 10." }, { status: 400 });
  }

  const metrics = {
    fatigue: fatigue!,
    sleepQuality: sleepQuality!,
    sleepDuration: sleepDuration!,
    soreness: soreness!,
    mood: mood!,
    stress: stress!,
  };

  const entryDate = todayUtcDateOnly();

  const created = await prisma.teamReadinessEntry.upsert({
    where: { teamId_userId_entryDate: { teamId, userId: targetUserId, entryDate } },
    create: {
      teamId,
      userId: targetUserId,
      entryDate,
      ...metrics,
    },
    update: {
      ...metrics,
    },
    select: {
      id: true,
      userId: true,
      entryDate: true,
      fatigue: true,
      sleepQuality: true,
      sleepDuration: true,
      soreness: true,
      mood: true,
      stress: true,
    },
  });

  return NextResponse.json({ ok: true, entry: created });
}
