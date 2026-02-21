import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

function parseStartYear(value: unknown): number | null {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return null;
  if (n < 2000 || n > 2100) return null;
  return n;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const startYear = parseStartYear(body?.startYear);

  if (!startYear) {
    return NextResponse.json({ message: "Ugyldig sæson." }, { status: 400 });
  }

  const session = await getSession();
  session.selectedCompetitionSeasonStartYear = startYear;
  if (!session.userId) session.guestDefaultsApplied = true;
  // Reset dependent selections
  session.selectedAgeGroup = undefined;
  session.selectedCompetitionRowId = undefined;
  session.selectedCompetitionPoolId = undefined;
  session.selectedCompetitionTeamName = undefined;
  await session.save();

  return NextResponse.json({ ok: true });
}
