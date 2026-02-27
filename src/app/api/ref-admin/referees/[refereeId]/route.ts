import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRefAdmin } from "@/lib/auth";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { geocodeWithNominatim } from "@/lib/geocode";

export const dynamic = "force-dynamic";

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

function optional(value: unknown): string | null {
  const v = norm(value);
  return v ? v : null;
}

type EligibleLeague = {
  league: string;
  gender: string | null;
  seasonStartYear?: number;
};

function parseEligibleLeagues(value: unknown): EligibleLeague[] {
  if (!Array.isArray(value)) return [];
  const out: EligibleLeague[] = [];
  for (const item of value) {
    const league = norm((item as any)?.league);
    const genderRaw = optional((item as any)?.gender);
    const seasonStartYearRaw = (item as any)?.seasonStartYear;
    const seasonStartYear =
      typeof seasonStartYearRaw === "number" && Number.isFinite(seasonStartYearRaw)
        ? seasonStartYearRaw
        : typeof seasonStartYearRaw === "string" && seasonStartYearRaw.trim()
          ? Number.parseInt(seasonStartYearRaw, 10)
          : undefined;

    if (!league) continue;
    out.push({
      league,
      gender: genderRaw,
      ...(seasonStartYear && Number.isFinite(seasonStartYear) ? { seasonStartYear } : null),
    });
  }
  return out;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ refereeId: string }> }
) {
  await requireRefAdmin();
  await ensureTurneringDomainTables();

  const { refereeId } = await params;
  const body = await req.json().catch(() => null);

  const existing = await prisma.taReferee.findUnique({
    where: { id: refereeId },
    select: { id: true, address: true },
  });

  if (!existing) {
    return NextResponse.json({ message: "Dommer findes ikke." }, { status: 404 });
  }

  const refereeNo = optional(body?.refereeNo);
  const name = optional(body?.name);

  if (refereeNo !== null && !refereeNo) {
    return NextResponse.json({ message: "Dommernummer mangler." }, { status: 400 });
  }

  if (name !== null && !name) {
    return NextResponse.json({ message: "Navn mangler." }, { status: 400 });
  }

  const eligibleLeagues = body?.eligibleLeagues === undefined ? undefined : parseEligibleLeagues(body?.eligibleLeagues);

  const nextAddress = body?.address !== undefined ? optional(body?.address) : undefined;
  const addressChanged = nextAddress !== undefined && norm(existing.address) !== norm(nextAddress);

  const geo = addressChanged
    ? nextAddress
      ? await geocodeWithNominatim(`${nextAddress}, Danmark`)
      : null
    : null;

  if (addressChanged && nextAddress && !geo) {
    return NextResponse.json(
      { message: "Kunne ikke finde adressen. Prøv at skrive den mere præcist." },
      { status: 400 }
    );
  }

  const addressUpdateData =
    body?.address === undefined
      ? null
      : addressChanged
        ? {
            address: nextAddress,
            lat: nextAddress ? geo?.lat ?? null : null,
            lng: nextAddress ? geo?.lng ?? null : null,
            geocodedAt: nextAddress ? (geo ? new Date() : null) : null,
          }
        : { address: nextAddress };

  try {
    await prisma.taReferee.update({
      where: { id: refereeId },
      data: {
        ...(refereeNo !== null ? { refereeNo } : null),
        ...(name !== null ? { name } : null),
        ...(body?.club !== undefined ? { club: optional(body?.club) } : null),
        ...addressUpdateData,
        ...(body?.email !== undefined ? { email: optional(body?.email) } : null),
        ...(body?.phone !== undefined ? { phone: optional(body?.phone) } : null),
        ...(body?.partner1 !== undefined ? { partner1: optional(body?.partner1) } : null),
        ...(body?.partner2 !== undefined ? { partner2: optional(body?.partner2) } : null),
        ...(body?.partner3 !== undefined ? { partner3: optional(body?.partner3) } : null),
        ...(eligibleLeagues !== undefined ? { eligibleLeagues } : null),
      },
      select: { id: true },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ message: "Dommernummer findes allerede." }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ refereeId: string }> }
) {
  await requireRefAdmin();
  await ensureTurneringDomainTables();

  const { refereeId } = await params;

  const existing = await prisma.taReferee.findUnique({
    where: { id: refereeId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ message: "Dommer findes ikke." }, { status: 404 });
  }

  await prisma.taReferee.delete({ where: { id: refereeId } });

  return NextResponse.json({ ok: true });
}
