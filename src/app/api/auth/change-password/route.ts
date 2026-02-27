import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApprovedUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const user = await requireApprovedUser();
    const body = await req.json().catch(() => null);

    const currentPassword = norm(body?.currentPassword);
    const newPassword = String(body?.newPassword ?? "");

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ message: "Udfyld venligst alle felter." }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ message: "Kodeord skal være mindst 6 tegn." }, { status: 400 });
    }

    const candidate = await prisma.taUser.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true },
    });

    if (!candidate) {
      return NextResponse.json({ message: "Bruger ikke fundet." }, { status: 404 });
    }

    const ok = await verifyPassword(currentPassword, candidate.passwordHash);
    if (!ok) {
      return NextResponse.json({ message: "Nuværende kodeord er forkert." }, { status: 401 });
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.taUser.update({
      where: { id: user.id },
      data: { passwordHash },
      select: { id: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/auth/change-password] POST failed", err);
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_APPROVED" ? 403 : 500;
    return NextResponse.json({ message: "Kunne ikke opdatere kodeord." }, { status });
  }
}
