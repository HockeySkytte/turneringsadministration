import { NextResponse } from "next/server";
import { requireLeaderOrAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type UploadKind = "EVENTS" | "PLAYERS";

export async function GET(req: Request) {
  const actor = await requireLeaderOrAdmin();
  const teamId = actor.activeTeamId;
  if (!teamId) {
    return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });
  }

  const url = new URL(req.url);
  const kindRaw = String(url.searchParams.get("kind") ?? "")
    .trim()
    .toUpperCase();
  const kind = (kindRaw === "EVENTS" || kindRaw === "PLAYERS"
    ? (kindRaw as UploadKind)
    : null) as UploadKind | null;

  if (!kind) {
    return NextResponse.json({ message: "kind mangler." }, { status: 400 });
  }

  const prismaAny = prisma as any;
  const files = await prismaAny.statsFile.findMany({
    where: { teamId, kind },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      originalName: true,
      createdAt: true,
      gameId: true,
      gameDate: true,
      competition: true,
    },
  });

  return NextResponse.json({ files });
}
