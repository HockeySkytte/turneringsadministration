import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export async function POST() {
  await requireAdmin();

  return NextResponse.json(
    { ok: false, message: "Sportssys sync er fjernet i denne app." },
    { status: 410 }
  );
}
