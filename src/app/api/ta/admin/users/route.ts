import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();

  const users = await prisma.taUser.findMany({
    select: { id: true, email: true, username: true, name: true, createdAt: true },
    orderBy: [{ email: "asc" }],
  });

  return NextResponse.json({ ok: true, users });
}
