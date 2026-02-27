import { NextResponse } from "next/server";
import { requireTournamentAdmin } from "@/lib/auth";
import { geocodeWithNominatim, reverseGeocodeWithNominatim } from "@/lib/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireTournamentAdmin();

    const body = (await req.json().catch(() => ({}))) as { query?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";

    if (!query) {
      return NextResponse.json({ ok: false, message: "Søgeadresse skal udfyldes." }, { status: 400 });
    }

    const hit = await geocodeWithNominatim(query);
    if (!hit) {
      return NextResponse.json(
        { ok: false, message: "Kunne ikke finde lokation. Prøv at tilpasse adressen." },
        { status: 400 }
      );
    }

    const address = await reverseGeocodeWithNominatim(hit.lat, hit.lng);

    return NextResponse.json({
      ok: true,
      result: {
        lat: hit.lat,
        lng: hit.lng,
        address: address ?? null,
        displayName: hit.displayName,
      },
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

    console.error("/api/turnering/venues/geocode POST failed", err);
    return NextResponse.json({ ok: false, message: "Kunne ikke geocode." }, { status: 500 });
  }
}
