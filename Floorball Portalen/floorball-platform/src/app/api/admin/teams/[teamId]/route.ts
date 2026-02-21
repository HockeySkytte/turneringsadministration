/*
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TeamColor } from "@prisma/client";

function parseLogoUrl(raw: unknown) {
  const v = String(raw ?? "").trim();
  if (!v) return null;

  if (v.startsWith("/")) return v;

  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return v;
  } catch {
    return null;
  }
}

const allowedColors = [
  TeamColor.RED,
  TeamColor.WHITE,
  TeamColor.BLACK,
  TeamColor.BLUE,
  TeamColor.GREEN,
] as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  await requireAdmin();

  const { teamId } = await params;
  const id = String(teamId ?? "").trim();
  if (!id) {
    return NextResponse.json({ message: "teamId mangler." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);

  const name = String(body?.name ?? "").trim();
  const themePrimary = String(body?.themePrimary ?? "").trim();
  const themeSecondary = String(body?.themeSecondary ?? "").trim();
  const logoUrl = parseLogoUrl(body?.logoUrl);

  if (!name) {
    return NextResponse.json({ message: "Holdnavn mangler." }, { status: 400 });
  }

  if (!allowedColors.includes(themePrimary as (typeof allowedColors)[number])) {
    return NextResponse.json({ message: "Ugyldig primær farve." }, { status: 400 });
  }

  if (!allowedColors.includes(themeSecondary as (typeof allowedColors)[number])) {
    return NextResponse.json({ message: "Ugyldig sekundær farve." }, { status: 400 });
  }

  if (themeSecondary !== TeamColor.WHITE && themeSecondary !== TeamColor.BLACK) {
    return NextResponse.json(
      { message: "Sekundær farve skal være hvid eller sort." },
      { status: 400 }
    );
  }

  const existing = await prisma.team.findUnique({
    where: { id },
    select: { id: true, name: true },
  });

  if (!existing) {
    return NextResponse.json({ message: "Hold findes ikke." }, { status: 404 });
  }

  if (existing.name !== name) {
    const conflict = await prisma.team.findUnique({
      where: { name },
      select: { id: true },
    });
    if (conflict) {
      return NextResponse.json({ message: "Holdnavn er allerede i brug." }, { status: 409 });
    }
  }

  const team = await prisma.team.update({
    where: { id },
    data: {
      name,
      logoUrl,
      themePrimary: themePrimary as TeamColor,
      themeSecondary: themeSecondary as TeamColor,
    } as any,
    select: {
      id: true,
      name: true,
      logoUrl: true,
      themePrimary: true,
      themeSecondary: true,
      updatedAt: true,
    } as any,
  });

  return NextResponse.json({ team });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  await requireAdmin();

  const { teamId } = await params;
  const id = String(teamId ?? "").trim();
  if (!id) {
    return NextResponse.json({ message: "teamId mangler." }, { status: 400 });
  }

  const expected = String(process.env.ADMIN_DELETE_CODE ?? "").trim();
  if (!expected) {
    return NextResponse.json(
      {
        message:
          "ADMIN_DELETE_CODE er ikke sat på serveren. Sletning er deaktiveret.",
      },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const adminCode = String(body?.adminCode ?? "").trim();
  const confirmName = String(body?.confirmName ?? "").trim();

  if (!adminCode) {
    return NextResponse.json({ message: "Admin kode mangler." }, { status: 400 });
  }

  if (adminCode !== expected) {
    return NextResponse.json({ message: "Forkert admin kode." }, { status: 403 });
  }

  const team = await prisma.team.findUnique({
    where: { id },
    select: { id: true, name: true },
  });

  if (!team) {
    return NextResponse.json({ message: "Hold findes ikke." }, { status: 404 });
  }

  if (confirmName !== team.name) {
    return NextResponse.json(
      { message: "Bekræftelse matcher ikke holdnavn." },
      { status: 400 }
    );
  }

  await prisma.team.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

*/

import { NextResponse } from "next/server";

export async function PATCH() {
  return NextResponse.json(
    { message: "Legacy endpoint (admin teams) is disabled in Floorball Portalen." },
    { status: 410 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { message: "Legacy endpoint (admin teams) is disabled in Floorball Portalen." },
    { status: 410 }
  );
}
