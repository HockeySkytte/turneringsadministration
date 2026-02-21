import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

function normalizeMode(v: unknown): "ALL" | "TEAM" | null {
  const raw = String(v ?? "").trim().toUpperCase();
  if (raw === "ALL" || raw === "TEAM") return raw;
  return null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const mode = normalizeMode(body?.mode);
  if (!mode) {
    return NextResponse.json({ message: "mode skal være ALL eller TEAM." }, { status: 400 });
  }

  const session = await getSession();
  session.selectedCompetitionCalendarMode = mode;
  if (!session.userId) session.guestDefaultsApplied = true;
  await session.save();

  return NextResponse.json({ ok: true });
}
