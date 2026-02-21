import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSession();
  const body = await req.json().catch(() => ({}));

  const raw = String(body?.mode ?? "").toUpperCase().trim();
  if (raw !== "LIGHT" && raw !== "DARK") {
    return NextResponse.json({ message: "Ugyldig mode." }, { status: 400 });
  }

  session.selectedViewMode = raw as "LIGHT" | "DARK";
  await session.save();

  return NextResponse.json({ ok: true });
}
