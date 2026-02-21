import { NextResponse } from "next/server";
import { ApprovalStatus, TeamRole } from "@prisma/client";
import { requireLeaderOrAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function normalizeName(input: unknown): string | null {
  const s = String(input ?? "").trim();
  return s ? s : null;
}

function normalizeImageUrl(input: unknown): string | null {
  const s = String(input ?? "").trim();
  return s ? s : null;
}

function normalizePosition(input: unknown): string | null {
  const s = String(input ?? "").trim();
  return s ? s : null;
}

function normalizePhoneNumber(input: unknown): string | null {
  const s = String(input ?? "").trim();
  return s ? s : null;
}

function normalizeBirthDate(input: unknown): Date | null {
  const s = String(input ?? "").trim();
  if (!s) return null;
  // Expect YYYY-MM-DD from <input type="date" />
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

export async function GET() {
  const user = await requireLeaderOrAdmin();
  const teamId = user.activeTeamId;
  if (!teamId) {
    return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });
  }

  const memberships = await prisma.teamMembership.findMany({
    where: { teamId, status: { not: ApprovalStatus.REJECTED } },
    include: { user: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    teamId,
    members: memberships.map((m) => ({
      membershipId: m.id,
      role: m.role,
      status: m.status,
      createdAt: m.createdAt,
      user: {
        id: m.user.id,
        email: m.user.email,
        username: m.user.username,
        name: ((m.user as unknown as { name?: string | null }).name ?? null),
        imageUrl: ((m.user as unknown as { imageUrl?: string | null }).imageUrl ?? null),
        position: ((m.user as unknown as { position?: string | null }).position ?? null),
        birthDate: ((m.user as unknown as { birthDate?: Date | null }).birthDate ?? null),
        phoneNumber: ((m.user as unknown as { phoneNumber?: string | null }).phoneNumber ?? null),
      },
    })),
  });
}

export async function PATCH(req: Request) {
  const leader = await requireLeaderOrAdmin();
  const teamId = leader.activeTeamId;
  if (!teamId) {
    return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const userId = String(body?.userId ?? "").trim();
  const name = normalizeName(body?.name);
  const imageUrl = normalizeImageUrl(body?.imageUrl);
  const position = normalizePosition(body?.position);
  const phoneNumber = normalizePhoneNumber(body?.phoneNumber);
  const birthDate = normalizeBirthDate(body?.birthDate);

  if (String(body?.birthDate ?? "").trim() && !birthDate) {
    return NextResponse.json({ message: "Fødselsdato er ugyldig. Brug format YYYY-MM-DD." }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json({ message: "userId mangler." }, { status: 400 });
  }

  const membership = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: { id: true },
  });

  if (!membership) {
    return NextResponse.json({ message: "Ugyldig bruger for dette hold." }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { name, imageUrl, position, birthDate, phoneNumber } as any,
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: updated.id,
      email: updated.email,
      username: updated.username,
      name: ((updated as unknown as { name?: string | null }).name ?? null),
      imageUrl: ((updated as unknown as { imageUrl?: string | null }).imageUrl ?? null),
      position: ((updated as unknown as { position?: string | null }).position ?? null),
      birthDate: ((updated as unknown as { birthDate?: Date | null }).birthDate ?? null),
      phoneNumber: ((updated as unknown as { phoneNumber?: string | null }).phoneNumber ?? null),
    },
  });
}

export async function DELETE(req: Request) {
  const leader = await requireLeaderOrAdmin();
  const teamId = leader.activeTeamId;
  if (!teamId) {
    return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const membershipId = String(body?.membershipId ?? "").trim();

  if (!membershipId) {
    return NextResponse.json({ message: "membershipId mangler." }, { status: 400 });
  }

  const membership = await prisma.teamMembership.findUnique({
    where: { id: membershipId },
  });

  if (!membership || membership.teamId !== teamId) {
    return NextResponse.json({ message: "Ugyldigt medlemsskab." }, { status: 404 });
  }

  const allowedRoles = [TeamRole.PLAYER, TeamRole.SUPPORTER] as const;
  if (!allowedRoles.includes(membership.role as (typeof allowedRoles)[number])) {
    return NextResponse.json({ message: "Kun spillere og supportere kan slettes." }, { status: 400 });
  }

  // If you want to disallow deleting pending members, uncomment this:
  // if (membership.status !== ApprovalStatus.APPROVED) {
  //   return NextResponse.json({ message: "Kan kun slette godkendte medlemmer." }, { status: 409 });
  // }

  await prisma.teamMembership.delete({ where: { id: membershipId } });

  return NextResponse.json({ ok: true });
}
