import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

function normalizeMode(v: unknown): "TOTAL" | "PER_GAME" | null {
  const raw = String(v ?? "").trim().toUpperCase();
  if (raw === "TOTAL" || raw === "PER_GAME") return raw;
  return null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const mode = normalizeMode(body?.mode);
  if (!mode) {
    return NextResponse.json(
      { message: "mode skal være TOTAL eller PER_GAME." },
      { status: 400 }
    );
  }

  const session = await getSession();
  session.selectedStatsAggregationMode = mode;
  if (!session.userId) session.guestDefaultsApplied = true;
  await session.save();

  return NextResponse.json({ ok: true });
}
