import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClubLeader } from "@/lib/auth";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prismaAny = prisma as any;

type RequestType = "CREATE" | "UPDATE" | "MOVE" | "DOUBLE_LICENSE";

type RequestStatus = "PENDING_OTHER_CLUB" | "PENDING_TA" | "APPROVED" | "REJECTED";

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

function parseIsoDateOnly(value: unknown): Date | null {
  const v = normalizeText(value);
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

function asRequestType(value: unknown): RequestType | null {
  const v = normalizeText(value).toUpperCase();
  if (v === "CREATE" || v === "UPDATE" || v === "MOVE" || v === "DOUBLE_LICENSE") return v;
  return null;
}

export async function GET(req: Request) {
  const actor = await requireClubLeader();
  await ensureTurneringDomainTables();

  const url = new URL(req.url);
  const actorClubId = resolveActorClubId(actor, url.searchParams.get("clubId"));
  if (!actorClubId) return NextResponse.json({ ok: true, actorClubId: null, items: [] });

  const items = (await prismaAny.taPlayerLicenseRequest.findMany({
    where: { fromClubId: actorClubId },
    orderBy: [{ createdAt: "desc" }],
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

export async function POST(req: Request) {
  const actor = await requireClubLeader();
  await ensureTurneringDomainTables();

  const body = (await req.json().catch(() => null)) as any;
  const requestedClubId = normalizeText(body?.clubId) || null;
  const actorClubId = resolveActorClubId(actor, requestedClubId);
  if (!actorClubId) {
    return NextResponse.json({ ok: false, message: "Vælg en klub." }, { status: 400 });
  }

  const type = asRequestType(body?.type);
  if (!type) return NextResponse.json({ ok: false, message: "Ugyldig anmodningstype." }, { status: 400 });

  const licenseId = normalizeText(body?.licenseId) || null;
  let targetClubId = normalizeText(body?.targetClubId) || null;

  let status: RequestStatus = "PENDING_TA";
  if (type === "MOVE" || type === "DOUBLE_LICENSE") status = "PENDING_OTHER_CLUB";

  if ((type === "UPDATE" || type === "MOVE" || type === "DOUBLE_LICENSE") && !licenseId) {
    return NextResponse.json({ ok: false, message: "Vælg en spiller/licens." }, { status: 400 });
  }

  const payload: Record<string, unknown> = {};

  if (type === "CREATE") {
    const name = normalizeText(body?.name);
    const birthDate = parseIsoDateOnly(body?.birthDate);
    const gender = normalizeText(body?.gender);

    if (!name) return NextResponse.json({ ok: false, message: "Udfyld navn." }, { status: 400 });
    if (!birthDate) return NextResponse.json({ ok: false, message: "Udfyld fødselsdato." }, { status: 400 });
    if (gender !== "MEN" && gender !== "WOMEN") {
      return NextResponse.json({ ok: false, message: "Ugyldigt køn." }, { status: 400 });
    }

    payload.name = name;
    payload.birthDate = birthDate.toISOString().slice(0, 10);
    payload.gender = gender;
  }

  if (type === "UPDATE") {
    if (!licenseId) {
      return NextResponse.json({ ok: false, message: "Vælg en spiller/licens." }, { status: 400 });
    }

    const requestedName = normalizeText(body?.name);
    const requestedBirthDate = parseIsoDateOnly(body?.birthDate);
    const requestedGender = normalizeText(body?.gender);

    if (!requestedName) return NextResponse.json({ ok: false, message: "Udfyld navn." }, { status: 400 });
    if (!requestedBirthDate) return NextResponse.json({ ok: false, message: "Udfyld fødselsdato." }, { status: 400 });
    if (requestedGender !== "MEN" && requestedGender !== "WOMEN") {
      return NextResponse.json({ ok: false, message: "Ugyldigt køn." }, { status: 400 });
    }

    const existing = await prisma.taPlayerLicense.findUnique({
      where: { id: licenseId },
      select: { id: true, clubId: true, name: true, birthDate: true, gender: true },
    });
    if (!existing || String(existing.clubId) !== actorClubId) {
      return NextResponse.json({ ok: false, message: "Spilleren findes ikke i den valgte klub." }, { status: 400 });
    }

    payload.before = {
      name: existing.name,
      birthDate: new Date(existing.birthDate).toISOString().slice(0, 10),
      gender: existing.gender,
    };
    payload.after = {
      name: requestedName,
      birthDate: requestedBirthDate.toISOString().slice(0, 10),
      gender: requestedGender,
    };
  }

  if (type === "MOVE" || type === "DOUBLE_LICENSE") {
    if (!licenseId) {
      return NextResponse.json({ ok: false, message: "Vælg en spiller/licens." }, { status: 400 });
    }

    const existing = await prisma.taPlayerLicense.findUnique({ where: { id: licenseId }, select: { id: true, clubId: true } });
    if (!existing) {
      return NextResponse.json({ ok: false, message: "Spillerlicens ikke fundet." }, { status: 400 });
    }
    if (String(existing.clubId) === actorClubId) {
      return NextResponse.json({ ok: false, message: "Vælg en spiller fra en anden klub." }, { status: 400 });
    }

    // Approval must be done by the player's current club leader.
    targetClubId = String(existing.clubId);

    if (type === "MOVE") {
      payload.toClubId = actorClubId;
    } else {
      payload.doubleClubId = actorClubId;
    }
  }

  // Keep targetClubId only as the approval club for MOVE/DOUBLE.

  const created = await prismaAny.taPlayerLicenseRequest.create({
    data: {
      type,
      status,
      fromClubId: actorClubId,
      targetClubId: targetClubId,
      licenseId: licenseId,
      payload,
      createdById: actor.id,
    },
  });

  return NextResponse.json({ ok: true, item: created });
}
