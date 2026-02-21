import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const teams = await prisma.team.findMany({
    select: { id: true, name: true, logoUrl: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ teams });
}
