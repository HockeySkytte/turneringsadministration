import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";

function parseKampId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function norm(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function canDeleteAs(user: any): boolean {
  if (!user) return false;
  if (user.isSuperuser && !user.isSuperuserApproved && !user.isAdmin) return false;
  return Boolean(user.isAdmin || user.isTournamentAdmin || user.isSuperuser);
}

export async function POST(req: Request, { params }: { params: Promise<{ kampId: string }> }) {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  if (!canDeleteAs(user)) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  const { kampId: raw } = await params;
  const kampId = parseKampId(raw);
  if (!kampId) {
    return NextResponse.json({ ok: false, error: "INVALID_KAMP" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as any;
  const confirm = norm(body?.confirm);
  if (confirm !== String(kampId)) {
    return NextResponse.json({ ok: false, error: "CONFIRM_MISMATCH" }, { status: 400 });
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const r1 = await tx.matchUploadEvent.deleteMany({ where: { kampId } });
    const r2 = await tx.matchUploadLineup.deleteMany({ where: { kampId } });
    const r3 = await tx.matchProtocolEvent.deleteMany({ where: { kampId } });
    const r4 = await tx.matchProtocolPlayer.deleteMany({ where: { kampId } });

    const r5 = await (tx as any).matchLineupApproval?.deleteMany({ where: { kampId } });
    const r6 = await (tx as any).matchStart?.deleteMany({ where: { kampId } });

    return {
      matchUploadEvent: r1.count,
      matchUploadLineup: r2.count,
      matchProtocolEvent: r3.count,
      matchProtocolPlayer: r4.count,
      matchLineupApproval: Number(r5?.count ?? 0),
      matchStart: Number(r6?.count ?? 0),
    };
  });

  return NextResponse.json({ ok: true, deleted });
}
