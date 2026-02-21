import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await requireAdmin();
  const { id } = await ctx.params;

  const existing = await prisma.teamMembership.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ message: "Medlem ikke fundet." }, { status: 404 });
  }

  await prisma.teamMembership.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
