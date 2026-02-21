import { NextResponse } from "next/server";
import { ApprovalStatus, GlobalRole } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const admin = await requireAdmin();

  const body = await req.json().catch(() => null);
  const userId = String(body?.userId ?? "").trim();
  const approve = Boolean(body?.approve);

  if (!userId) {
    return NextResponse.json({ message: "userId mangler." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, globalRole: true, superuserStatus: true },
  });

  if (!user || user.globalRole !== GlobalRole.SUPERUSER) {
    return NextResponse.json({ message: "Ugyldig superbruger." }, { status: 404 });
  }

  if (user.superuserStatus !== ApprovalStatus.PENDING_ADMIN) {
    return NextResponse.json(
      { message: "Superbruger afventer ikke godkendelse." },
      { status: 409 }
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      superuserStatus: approve ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
      approvedById: admin.id,
      approvedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
