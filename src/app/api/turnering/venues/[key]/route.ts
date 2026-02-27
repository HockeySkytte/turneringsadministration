import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTournamentAdmin } from "@/lib/auth";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { reverseGeocodeWithNominatim } from "@/lib/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseNullableFloat(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    await requireTournamentAdmin();
    await ensureTurneringDomainTables();

    const { key } = await params;

    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      address?: unknown;
      lat?: unknown;
      lng?: unknown;
      geocodeQuery?: unknown;
      clubIds?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : null;
    const address = typeof body.address === "string" ? body.address.trim() || null : null;

    const lat = parseNullableFloat(body.lat);
    const lng = parseNullableFloat(body.lng);
    const geocodeQuery =
      typeof body.geocodeQuery === "string" ? body.geocodeQuery.trim() || null : null;

    const clubIds = Array.isArray(body.clubIds)
      ? Array.from(new Set(body.clubIds.map((x) => String(x ?? "").trim()).filter(Boolean)))
      : null;

    if (lat !== null && (lat < -90 || lat > 90)) {
      return NextResponse.json(
        { ok: false, message: "Latitude skal være mellem -90 og 90." },
        { status: 400 }
      );
    }
    if (lng !== null && (lng < -180 || lng > 180)) {
      return NextResponse.json(
        { ok: false, message: "Longitude skal være mellem -180 og 180." },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.taVenue.findUnique({
        where: { key },
        select: { key: true, name: true, address: true, lat: true, lng: true },
      });

      if (!existing) {
        return null;
      }

      const nextName = name ?? existing.name;

      // If caller cleared address and we have lat/lng, try to resolve address via reverse geocode.
      let nextAddress = address;
      const willHaveLat = lat !== null ? lat : existing.lat;
      const willHaveLng = lng !== null ? lng : existing.lng;
      if (nextAddress === null && willHaveLat !== null && willHaveLng !== null) {
        const resolved = await reverseGeocodeWithNominatim(willHaveLat, willHaveLng);
        if (resolved) nextAddress = resolved;
      }

      const venue = await tx.taVenue.update({
        where: { key },
        data: {
          name: nextName,
          address: nextAddress,
          lat,
          lng,
          geocodeQuery,
        },
        select: { key: true, name: true, address: true, lat: true, lng: true },
      });

      if (clubIds) {
        await tx.taVenueClub.deleteMany({ where: { venueKey: key } });
        if (clubIds.length) {
          await tx.taVenueClub.createMany({
            data: clubIds.map((clubId) => ({ venueKey: key, clubId })),
            skipDuplicates: true,
          });
        }
      }

      const clubs = await tx.taVenueClub.findMany({
        where: { venueKey: key },
        select: { club: { select: { id: true, name: true, clubNo: true } } },
      });

      return { ...venue, clubs: clubs.map((c) => c.club) };
    });

    if (!updated) {
      return NextResponse.json(
        { ok: false, message: "Spillestedet blev ikke fundet." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, venue: updated });
  } catch (err: unknown) {
    const prismaCode =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code)
        : null;
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (prismaCode === "P2025") {
      return NextResponse.json(
        { ok: false, message: "Spillestedet blev ikke fundet." },
        { status: 404 }
      );
    }

    if (message === "NOT_AUTHENTICATED") {
      return NextResponse.json({ ok: false, message: "Du er ikke logget ind." }, { status: 401 });
    }
    if (message === "NOT_APPROVED") {
      return NextResponse.json({ ok: false, message: "Din bruger er ikke godkendt endnu." }, { status: 403 });
    }
    if (message === "NOT_AUTHORIZED") {
      return NextResponse.json({ ok: false, message: "Du har ikke adgang." }, { status: 403 });
    }

    console.error("/api/turnering/venues/[key] PATCH failed", err);
    return NextResponse.json({ ok: false, message: "Kunne ikke gemme spillested." }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    await requireTournamentAdmin();
    await ensureTurneringDomainTables();

    const { key } = await params;

    const inUse = await prisma.taMatch.count({ where: { venueKey: key } });
    if (inUse > 0) {
      return NextResponse.json(
        { ok: false, message: "Spillestedet bruges i kampprogrammet og kan ikke slettes." },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.taVenueClub.deleteMany({ where: { venueKey: key } });
      await tx.taVenue.delete({ where: { key } });
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const prismaCode =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code)
        : null;
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (prismaCode === "P2025") {
      return NextResponse.json(
        { ok: false, message: "Spillestedet blev ikke fundet." },
        { status: 404 }
      );
    }

    if (message === "NOT_AUTHENTICATED") {
      return NextResponse.json({ ok: false, message: "Du er ikke logget ind." }, { status: 401 });
    }
    if (message === "NOT_APPROVED") {
      return NextResponse.json({ ok: false, message: "Din bruger er ikke godkendt endnu." }, { status: 403 });
    }
    if (message === "NOT_AUTHORIZED") {
      return NextResponse.json({ ok: false, message: "Du har ikke adgang." }, { status: 403 });
    }

    console.error("/api/turnering/venues/[key] DELETE failed", err);
    return NextResponse.json({ ok: false, message: "Kunne ikke slette spillested." }, { status: 500 });
  }
}
