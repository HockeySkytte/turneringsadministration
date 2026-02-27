import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClubLeader } from "@/lib/auth";

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

  const url = new URL(req.url);
  const actorClubId = resolveActorClubId(actor, url.searchParams.get("clubId"));
  if (!actorClubId) return NextResponse.json({ ok: true, actorClubId: null, items: [] });

  const q = normalizeText(url.searchParams.get("q"));
  if (!q) return NextResponse.json({ ok: true, actorClubId, items: [] });

  const asNumber = Number.parseInt(q.replace(/[^0-9]/g, ""), 10);
  const isNumber = Number.isFinite(asNumber) && asNumber > 0;

  const items = await prisma.taPlayerLicense.findMany({
    where: {
      clubId: { not: actorClubId },
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        ...(isNumber ? [{ licenseNumber: asNumber }] : []),
      ],
    },
    orderBy: [{ name: "asc" }],
    take: 50,
    select: {
      id: true,
      licenseNumber: true,
      name: true,
      clubId: true,
      club: { select: { id: true, name: true, clubNo: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    actorClubId,
    items: items.map((l) => {
      const no = String(l.club?.clubNo ?? "").trim();
      const clubLabel = l.club ? (no ? `${l.club.name} (${no})` : l.club.name) : l.clubId;
      return {
        id: l.id,
        licenseNumber: l.licenseNumber,
        name: l.name,
        clubId: l.clubId,
        clubLabel,
      };
    }),
  });
}
