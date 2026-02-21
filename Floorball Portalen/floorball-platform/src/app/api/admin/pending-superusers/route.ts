import { NextResponse } from "next/server";
import { ApprovalStatus, GlobalRole } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await requireAdmin();

  const users = await prisma.user.findMany({
    where: {
      globalRole: GlobalRole.SUPERUSER,
      superuserStatus: ApprovalStatus.PENDING_ADMIN,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      username: true,
      createdAt: true,
      league: { select: { name: true } },
      team: { select: { name: true } },
    },
  });

  return NextResponse.json({ ok: true, users });
}
