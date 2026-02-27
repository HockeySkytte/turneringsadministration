import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTournamentAdmin } from "@/lib/auth";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canonicalKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("da-DK")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function venueKeyFromName(value: unknown): string {
  return canonicalKey(value);
}

function parseNullableFloat(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(",", ".");
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function GET() {
  try {
    await requireTournamentAdmin();
    await ensureTurneringDomainTables();

    const clubs = await prisma.taClub.findMany({
      select: { id: true, name: true, clubNo: true },
      orderBy: [{ name: "asc" }],
    });

    const venues = await prisma.taVenue.findMany({
      select: {
        key: true,
        name: true,
        address: true,
        lat: true,
        lng: true,
        clubs: { select: { club: { select: { id: true, name: true, clubNo: true } } } },
      },
      orderBy: [{ name: "asc" }],
    });

    return NextResponse.json({
      ok: true,
      clubs,
      venues: venues.map((v) => ({
        key: v.key,
        name: v.name,
        address: v.address,
        lat: v.lat,
        lng: v.lng,
        clubs: v.clubs.map((c) => c.club),
      })),
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

    console.error("/api/turnering/venues GET failed", err);
    return NextResponse.json({ ok: false, message: "Kunne ikke hente spillesteder." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireTournamentAdmin();
    await ensureTurneringDomainTables();

    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      address?: unknown;
      lat?: unknown;
      lng?: unknown;
      clubIds?: unknown;
    };

    const name = String(body.name ?? "").trim();
    const address = String(body.address ?? "").trim() || null;
    const lat = parseNullableFloat(body.lat);
    const lng = parseNullableFloat(body.lng);

    const clubIds = Array.isArray(body.clubIds)
      ? Array.from(new Set(body.clubIds.map((x) => String(x ?? "").trim()).filter(Boolean)))
      : [];

    if (!name) {
      return NextResponse.json({ ok: false, message: "Spillested skal udfyldes." }, { status: 400 });
    }

    const key = venueKeyFromName(name);
    if (!key) {
      return NextResponse.json({ ok: false, message: "Ugyldigt spillested." }, { status: 400 });
    }

    if (lat !== null && (lat < -90 || lat > 90)) {
      return NextResponse.json({ ok: false, message: "Latitude skal være mellem -90 og 90." }, { status: 400 });
    }
    if (lng !== null && (lng < -180 || lng > 180)) {
      return NextResponse.json({ ok: false, message: "Longitude skal være mellem -180 og 180." }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const venue = await tx.taVenue.create({
        data: {
          key,
          name,
          address,
          lat,
          lng,
          geocodeQuery: address ?? name,
        },
        select: { key: true, name: true, address: true, lat: true, lng: true },
      });

      if (clubIds.length) {
        await tx.taVenueClub.createMany({
          data: clubIds.map((clubId) => ({ venueKey: venue.key, clubId })),
          skipDuplicates: true,
        });
      }

      const clubs = await tx.taVenueClub.findMany({
        where: { venueKey: venue.key },
        select: { club: { select: { id: true, name: true, clubNo: true } } },
      });

      return { ...venue, clubs: clubs.map((c) => c.club) };
    });

    return NextResponse.json({ ok: true, venue: created });
  } catch (err: unknown) {
    const prismaCode =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code)
        : null;
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

    if (prismaCode === "P2002") {
      return NextResponse.json(
        { ok: false, message: "Spillested findes allerede." },
        { status: 409 }
      );
    }

    console.error("/api/turnering/venues POST failed", err);
    return NextResponse.json({ ok: false, message: "Kunne ikke oprette spillested." }, { status: 500 });
  }
}
