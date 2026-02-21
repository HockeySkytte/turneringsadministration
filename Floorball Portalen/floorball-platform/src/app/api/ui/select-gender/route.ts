import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

function parseGender(value: unknown): "MEN" | "WOMEN" | null {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "MEN") return "MEN";
  if (v === "WOMEN") return "WOMEN";
  return null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const gender = parseGender(body?.gender);

  if (!gender) {
    return NextResponse.json({ message: "Ugyldigt køn." }, { status: 400 });
  }

  const session = await getSession();
  session.selectedGender = gender;
  if (!session.userId) session.guestDefaultsApplied = true;
  // Reset dependent selections
  session.selectedAgeGroup = undefined;
  session.selectedCompetitionRowId = undefined;
  session.selectedCompetitionPoolId = undefined;
  session.selectedCompetitionTeamName = undefined;
  await session.save();

  return NextResponse.json({ ok: true });
}
