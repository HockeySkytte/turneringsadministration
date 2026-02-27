import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTournamentAdmin } from "@/lib/auth";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { geocodeWithNominatim, reverseGeocodeWithNominatim } from "@/lib/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    await requireTournamentAdmin();
    await ensureTurneringDomainTables();

    const { key } = await params;

    const body = (await req.json().catch(() => ({}))) as { query?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";

    const venue = await prisma.taVenue.findUnique({
      where: { key },
      select: { key: true, name: true, address: true, geocodeQuery: true },
    });

    if (!venue) {
      return NextResponse.json(
        { ok: false, message: "Spillestedet blev ikke fundet." },
        { status: 404 }
      );
    }

    const effectiveQuery = query || venue.address || venue.geocodeQuery || venue.name;

    const hit = await geocodeWithNominatim(effectiveQuery);
    if (!hit) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Kunne ikke finde lokation. Prøv at tilpasse søgeadressen og prøv igen.",
        },
        { status: 400 }
      );
    }

    const resolvedAddress = await reverseGeocodeWithNominatim(hit.lat, hit.lng);
    const shouldOverwriteAddress =
      !venue.address || venue.address.trim() === "" || venue.address.trim() === venue.name.trim();

    const updated = await prisma.taVenue.update({
      where: { key },
      data: {
        geocodeQuery: query ? query : venue.geocodeQuery,
        lat: hit.lat,
        lng: hit.lng,
        geocodedAt: new Date(),
        address: shouldOverwriteAddress ? resolvedAddress ?? venue.address : venue.address,
      },
      select: { key: true, name: true, address: true, geocodeQuery: true, lat: true, lng: true },
    });

    return NextResponse.json({
      ok: true,
      venue: updated,
      displayName: hit.displayName,
      resolvedAddress: resolvedAddress ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "NOT_AUTHENTICATED") {
      return NextResponse.json({ ok: false, message: "Du er ikke logget ind." }, { status: 401 });
    }
    if (message === "NOT_APPROVED") {
      return NextResponse.json({ ok: false, message: "Din bruger er ikke godkendt endnu." }, { status: 403 });
    }
    if (message === "NOT_AUTHORIZED") {
      return NextResponse.json({ ok: false, message: "Du har ikke adgang." }, { status: 403 });
    }

    console.error("/api/turnering/venues/[key]/geocode POST failed", err);
    return NextResponse.json(
      { ok: false, message: "Kunne ikke geocode spillested." },
      { status: 500 }
    );
  }
}
