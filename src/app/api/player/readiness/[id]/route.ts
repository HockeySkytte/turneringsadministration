import { NextResponse } from "next/server";
import { ApprovalStatus, TeamRole } from "@prisma/client";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireApprovedUser();
  const teamId = user.activeTeamId;
  if (!teamId) return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });

  const { id } = await params;
  const entryId = String(id ?? "").trim();
  if (!entryId) return NextResponse.json({ message: "id mangler." }, { status: 400 });

  const existing = await prisma.teamReadinessEntry.findUnique({
    where: { id: entryId },
    select: { id: true, teamId: true, userId: true },
  });

  if (!existing || existing.teamId !== teamId) {
    return NextResponse.json({ message: "Ugyldig readiness." }, { status: 404 });
  }

  const leader = isLeaderOrAdmin(user);
  if (!leader && existing.userId !== user.id) {
    return NextResponse.json({ message: "Ikke tilladt." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const patch: Record<string, number> = {};

  for (const key of ["fatigue", "sleepQuality", "sleepDuration", "soreness", "mood", "stress"] as const) {
    if (body?.[key] === undefined) continue;
    const v = clamp1to10(body?.[key]);
    if (v === null) {
      return NextResponse.json({ message: "Alle felter skal være et tal mellem 1 og 10." }, { status: 400 });
    }
    patch[key] = v;
  }

  const updated = await prisma.teamReadinessEntry.update({
    where: { id: entryId },
    data: patch,
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

  return NextResponse.json({ ok: true, entry: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireApprovedUser();
  const teamId = user.activeTeamId;
  if (!teamId) return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });

  const { id } = await params;
  const entryId = String(id ?? "").trim();
  if (!entryId) return NextResponse.json({ message: "id mangler." }, { status: 400 });

  const existing = await prisma.teamReadinessEntry.findUnique({
    where: { id: entryId },
    select: { id: true, teamId: true, userId: true },
  });

  if (!existing || existing.teamId !== teamId) {
    return NextResponse.json({ message: "Ugyldig readiness." }, { status: 404 });
  }

  const leader = isLeaderOrAdmin(user);
  if (!leader && existing.userId !== user.id) {
    return NextResponse.json({ message: "Ikke tilladt." }, { status: 403 });
  }

  await prisma.teamReadinessEntry.delete({ where: { id: entryId } });
  return NextResponse.json({ ok: true });
}
