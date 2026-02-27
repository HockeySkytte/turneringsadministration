import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApprovedUser } from "@/lib/auth";
import { ensureTaUserContactColumns } from "@/lib/turnering/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isPrismaUniqueError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as any).code === "P2002");
}

function isValidEmail(email: string): boolean {
  const v = email.trim();
  if (v.length < 3) return false;
  if (!v.includes("@")) return false;
  return true;
}

export async function GET() {
  try {
    const user = await requireApprovedUser();

    await ensureTaUserContactColumns();

    const me = await prisma.taUser.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, username: true, phoneNumber: true },
    });

    if (!me) {
      return NextResponse.json({ message: "Bruger ikke fundet." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      user: {
        email: me.email,
        username: me.username,
        phoneNumber: me.phoneNumber ?? null,
      },
    });
  } catch (err) {
    console.error("[api/auth/account] GET failed", err);
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_APPROVED" ? 403 : 500;
    return NextResponse.json({ message: "Kunne ikke hente brugeroplysninger." }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApprovedUser();

    await ensureTaUserContactColumns();

    const body = await req.json().catch(() => null);

    const emailRaw = norm(body?.email).toLowerCase();
    const usernameRaw = norm(body?.username);
    const phoneNumberRaw = norm(body?.phoneNumber);

    const email = emailRaw || null;
    const username = usernameRaw || null;
    const phoneNumber = phoneNumberRaw || null;

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ message: "Ugyldig email." }, { status: 400 });
    }

    if (!username || username.length < 2) {
      return NextResponse.json({ message: "Brugernavn er for kort." }, { status: 400 });
    }

    try {
      await prisma.taUser.update({
        where: { id: user.id },
        data: {
          email,
          username,
          phoneNumber,
        },
        select: { id: true },
      });
    } catch (err) {
      if (isPrismaUniqueError(err)) {
        return NextResponse.json({ message: "Email eller brugernavn er allerede i brug." }, { status: 409 });
      }
      throw err;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/auth/account] POST failed", err);
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_APPROVED" ? 403 : 500;
    return NextResponse.json({ message: "Kunne ikke gemme oplysninger." }, { status });
  }
}
