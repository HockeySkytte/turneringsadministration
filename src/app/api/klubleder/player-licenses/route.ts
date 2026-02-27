import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClubLeader } from "@/lib/auth";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeText(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function resolveActorClubId(actor: any, requestedClubId: string | null): string | null {
  const actorClubIds = actor.roles
    .filter((r: any) => r.role === "CLUB_LEADER" && r.status === "APPROVED" && r.clubId)
    .map((r: any) => String(r.clubId))
    .filter(Boolean);

  const req = normalizeText(requestedClubId);
  if (req && actorClubIds.includes(req)) return req;
  if (actorClubIds.length === 1) return actorClubIds[0]!;
  return null;
}

export async function GET(req: Request) {
  const actor = await requireClubLeader();
  await ensureTurneringDomainTables();

  const url = new URL(req.url);
  const actorClubId = resolveActorClubId(actor, url.searchParams.get("clubId"));
  if (!actorClubId) return NextResponse.json({ ok: true, actorClubId: null, items: [] });

  const items = await prisma.taPlayerLicense.findMany({
    where: { clubId: actorClubId },
    select: {
      id: true,
      licenseNumber: true,
      name: true,
      birthDate: true,
      gender: true,
      clubId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ name: "asc" }, { birthDate: "asc" }],
  });

  return NextResponse.json({ ok: true, actorClubId, items });
}
