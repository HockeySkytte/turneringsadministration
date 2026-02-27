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

type Decision = "APPROVE" | "REJECT";

export async function POST(req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const actor = await requireClubLeader();
  await ensureTurneringDomainTables();

  const { requestId } = await ctx.params;
  const id = normalizeText(requestId);
  if (!id) return NextResponse.json({ ok: false, message: "Mangler id." }, { status: 400 });

  const body = (await req.json().catch(() => null)) as any;
  const requestedClubId = normalizeText(body?.clubId) || null;
  const actorClubId = resolveActorClubId(actor, requestedClubId);
  if (!actorClubId) return NextResponse.json({ ok: false, message: "Vælg en klub." }, { status: 400 });

  const decisionRaw = normalizeText(body?.decision).toUpperCase();
  const decision: Decision | null = decisionRaw === "APPROVE" || decisionRaw === "REJECT" ? (decisionRaw as Decision) : null;
  if (!decision) return NextResponse.json({ ok: false, message: "Ugyldig beslutning." }, { status: 400 });

  const reason = normalizeText(body?.reason) || null;

  const existing = await prisma.taPlayerLicenseRequest.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ ok: false, message: "Anmodning ikke fundet." }, { status: 404 });

  if (existing.status !== "PENDING_OTHER_CLUB") {
    return NextResponse.json({ ok: false, message: "Anmodningen kan ikke behandles." }, { status: 400 });
  }

  if (!existing.targetClubId || String(existing.targetClubId) !== actorClubId) {
    return NextResponse.json({ ok: false, message: "Du kan ikke behandle denne anmodning." }, { status: 403 });
  }

  const updated = await prisma.taPlayerLicenseRequest.update({
    where: { id },
    data:
      decision === "APPROVE"
        ? {
            status: "PENDING_TA",
            otherClubDecidedById: actor.id,
            otherClubDecidedAt: new Date(),
            rejectionReason: null,
          }
        : {
            status: "REJECTED",
            otherClubDecidedById: actor.id,
            otherClubDecidedAt: new Date(),
            rejectionReason: reason,
          },
  });

  return NextResponse.json({ ok: true, item: updated });
}
