import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "DEPRECATED",
      message: "Use /api/kalender/filters. Statistik slicers must match Kalender.",
    },
    { status: 410 }
  );
}
