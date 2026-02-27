import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTournamentAdmin } from "@/lib/auth";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

export const dynamic = "force-dynamic";

function parseDateOnly(value: unknown): Date | null {
  const s = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nextJuly1Utc(now: Date): Date {
  const year = now.getUTCFullYear();
  const july1ThisYear = new Date(Date.UTC(year, 6, 1));
  return now.getTime() < july1ThisYear.getTime()
    ? july1ThisYear
    : new Date(Date.UTC(year + 1, 6, 1));
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireTournamentAdmin();
  await ensureTurneringDomainTables();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const birthDate = parseDateOnly(body?.birthDate);
  const gender = String(body?.gender ?? "").trim();
  const clubId = String(body?.clubId ?? "").trim();

  const doubleClubIdRaw = String(body?.doubleClubId ?? "").trim() || null;
  const doubleClubId = doubleClubIdRaw && doubleClubIdRaw !== clubId ? doubleClubIdRaw : null;

  if (!name) return NextResponse.json({ ok: false, message: "Mangler navn." }, { status: 400 });
  if (!birthDate) return NextResponse.json({ ok: false, message: "Mangler fødselsdato." }, { status: 400 });
  if (gender !== "MEN" && gender !== "WOMEN") {
    return NextResponse.json({ ok: false, message: "Ugyldigt køn." }, { status: 400 });
  }
  if (!clubId) return NextResponse.json({ ok: false, message: "Mangler klub." }, { status: 400 });

  const club = await prisma.taClub.findUnique({ where: { id: clubId }, select: { id: true } });
  if (!club) return NextResponse.json({ ok: false, message: "Klub findes ikke." }, { status: 400 });

  if (doubleClubId) {
    const dc = await prisma.taClub.findUnique({ where: { id: doubleClubId }, select: { id: true } });
    if (!dc) return NextResponse.json({ ok: false, message: "Dobbeltlicens-klub findes ikke." }, { status: 400 });
  }

  const item = await prisma.taPlayerLicense.update({
    where: { id },
    data: {
      name,
      birthDate,
      gender: gender as any,
      clubId,
      doubleClubId,
      doubleClubExpiresAt: doubleClubId ? nextJuly1Utc(new Date()) : null,
    },
    select: {
      id: true,
      licenseNumber: true,
      name: true,
      birthDate: true,
      gender: true,
      clubId: true,
      club: { select: { id: true, name: true, clubNo: true } },
      doubleClubId: true,
      doubleClubExpiresAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, item });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireTournamentAdmin();
  await ensureTurneringDomainTables();
  const { id } = await params;

  await prisma.taPlayerLicense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
