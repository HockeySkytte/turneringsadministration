import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const teamName = String(body?.teamName ?? "").trim();

  if (!teamName) {
    return NextResponse.json({ message: "teamName mangler." }, { status: 400 });
  }

  const session = await getSession();
  session.selectedCompetitionTeamName = teamName;
  if (!session.userId) session.guestDefaultsApplied = true;
  await session.save();

  return NextResponse.json({ ok: true });
}
