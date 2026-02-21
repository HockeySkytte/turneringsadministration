import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { AgeGroup } from "@prisma/client";

function parseAgeGroup(value: unknown): AgeGroup | null {
  const v = String(value ?? "").trim().toUpperCase();
  return (Object.values(AgeGroup) as string[]).includes(v) ? (v as AgeGroup) : null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const ageGroup = parseAgeGroup(body?.ageGroup);

  if (!ageGroup) {
    return NextResponse.json({ message: "Ugyldig aldersgruppe." }, { status: 400 });
  }

  const session = await getSession();
  session.selectedAgeGroup = ageGroup;
  if (!session.userId) session.guestDefaultsApplied = true;
  // Reset dependent selections
  session.selectedCompetitionRowId = undefined;
  session.selectedCompetitionPoolId = undefined;
  session.selectedCompetitionTeamName = undefined;
  await session.save();

  return NextResponse.json({ ok: true });
}
