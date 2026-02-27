import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { TaRole, TaRoleStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();

  const items = await prisma.taUserRole.findMany({
    where: { role: { in: [TaRole.TOURNAMENT_ADMIN, TaRole.REF_ADMIN] } },
    orderBy: [{ role: "asc" }, { status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      role: true,
      status: true,
      createdAt: true,
      approvedAt: true,
      user: {
        select: { id: true, email: true, username: true, name: true, createdAt: true },
      },
    },
  });

  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  const actor = await requireAdmin();

  const body = await req.json().catch(() => null);
  const userId = String(body?.userId ?? "").trim() || null;
  const roleRaw = String(body?.role ?? "").trim().toUpperCase();
  const role =
    roleRaw === String(TaRole.TOURNAMENT_ADMIN)
      ? TaRole.TOURNAMENT_ADMIN
      : roleRaw === String(TaRole.REF_ADMIN)
        ? TaRole.REF_ADMIN
        : null;

  if (!userId) {
    return NextResponse.json({ message: "Vælg en bruger." }, { status: 400 });
  }

  if (!role) {
    return NextResponse.json({ message: "Vælg en rolle." }, { status: 400 });
  }

  const user = await prisma.taUser.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ message: "Bruger blev ikke fundet." }, { status: 404 });
  }

  const existing = await prisma.taUserRole.findUnique({
    where: {
      userId_role_scopeKey: {
        userId: user.id,
        role,
        scopeKey: "GLOBAL",
      },
    },
    select: { id: true, status: true },
  });

  if (existing) {
    if (existing.status === TaRoleStatus.APPROVED) {
      return NextResponse.json({ ok: true, alreadyHadRole: true });
    }

    await prisma.taUserRole.update({
      where: { id: existing.id },
      data: {
        status: TaRoleStatus.APPROVED,
        approvedById: actor.id,
        approvedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, reactivated: true });
  }

  await prisma.taUserRole.create({
    data: {
      userId: user.id,
      role,
      status: TaRoleStatus.APPROVED,
      scopeKey: "GLOBAL",
      approvedById: actor.id,
      approvedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
