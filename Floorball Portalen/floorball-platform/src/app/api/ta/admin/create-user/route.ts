import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { TaRole } from "@prisma/client";

function parseRole(value: unknown): TaRole | null {
  const v = String(value ?? "").trim().toUpperCase();
  return (Object.values(TaRole) as string[]).includes(v) ? (v as TaRole) : null;
}

export async function POST(req: Request) {
  const actor = await requireAdmin();

  const body = await req.json().catch(() => null);
  const role = parseRole(body?.role);

  const email = String(body?.email ?? "")
    .trim()
    .toLowerCase();
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  const name = String(body?.name ?? "").trim() || null;

  if (!role || !email || !username || !password) {
    return NextResponse.json(
      { message: "Udfyld venligst alle felter." },
      { status: 400 }
    );
  }

  if (role !== TaRole.TOURNAMENT_ADMIN && role !== TaRole.REF_ADMIN) {
    return NextResponse.json(
      { message: "Du kan kun oprette Turneringsadmin eller Dommeradmin her." },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { message: "Kodeord skal være mindst 6 tegn." },
      { status: 400 }
    );
  }

  const existing = await prisma.taUser.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json(
      { message: "Email eller brugernavn er allerede i brug." },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.taUser.create({
    data: {
      email,
      username,
      passwordHash,
      name,
      roles: {
        create: {
          role,
          status: "APPROVED",
          approvedById: actor.id,
          approvedAt: new Date(),
        },
      },
    },
    select: { id: true, email: true, username: true, name: true },
  });

  return NextResponse.json({ ok: true, user });
}
