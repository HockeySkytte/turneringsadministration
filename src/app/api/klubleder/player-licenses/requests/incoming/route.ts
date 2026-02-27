import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClubLeader } from "@/lib/auth";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prismaAny = prisma as any;

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

  const items = (await prismaAny.taPlayerLicenseRequest.findMany({
    where: { targetClubId: actorClubId, status: "PENDING_OTHER_CLUB" },
    orderBy: [{ createdAt: "asc" }],
    take: 100,
  })) as Array<{
    id: string;
    type: string;
    status: string;
    fromClubId: string | null;
    targetClubId: string | null;
    licenseId: string | null;
    payload: any;
    createdAt: Date;
    rejectionReason: string | null;
  }>;

  const clubIds = Array.from(
    new Set(items.flatMap((i) => [i.fromClubId, i.targetClubId]).filter((x): x is string => Boolean(x && String(x).trim()))),
  );
  const clubs = clubIds.length
    ? await prisma.taClub.findMany({ where: { id: { in: clubIds } }, select: { id: true, name: true, clubNo: true } })
    : [];
  const clubLabelById = new Map(
    clubs.map((c) => {
      const no = String(c.clubNo ?? "").trim();
      return [c.id, no ? `${c.name} (${no})` : c.name] as const;
    }),
  );

  const licenseIds = Array.from(new Set(items.map((i) => i.licenseId).filter((x): x is string => Boolean(x))));
  const licenses = licenseIds.length
    ? await prisma.taPlayerLicense.findMany({ where: { id: { in: licenseIds } }, select: { id: true, licenseNumber: true, name: true } })
    : [];
  const licenseById = new Map(licenses.map((l) => [l.id, l] as const));

  const enriched = items.map((i) => {
    const lic = i.licenseId ? licenseById.get(i.licenseId) ?? null : null;
    const payload = (i.payload ?? {}) as any;
    return {
      ...i,
      fromClubLabel: i.fromClubId ? clubLabelById.get(i.fromClubId) ?? i.fromClubId : null,
      targetClubLabel: i.targetClubId ? clubLabelById.get(i.targetClubId) ?? i.targetClubId : null,
      licenseNumber: lic?.licenseNumber ?? null,
      licenseName: lic?.name ?? (normalizeText(payload?.name) || null),
    };
  });

  return NextResponse.json({ ok: true, actorClubId, items: enriched });
}
