import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { AgeGroup, Gender } from "@prisma/client";

function parseGender(value: unknown): Gender | null {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "MEN") return Gender.MEN;
  if (v === "WOMEN") return Gender.WOMEN;
  return null;
}

function parseAgeGroup(value: unknown): AgeGroup | null {
  const v = String(value ?? "").trim().toUpperCase();
  return (Object.values(AgeGroup) as string[]).includes(v) ? (v as AgeGroup) : null;
}

export async function POST(req: Request) {
  const user = await requireApprovedUser();
  const body = await req.json().catch(() => null);

  const leagueIdRaw = String(body?.leagueId ?? "").trim();
  const teamIdRaw = String(body?.teamId ?? "").trim();
  const leagueId = leagueIdRaw.length > 0 ? leagueIdRaw : null;
  const teamId = teamIdRaw.length > 0 ? teamIdRaw : null;

  const gender = parseGender(body?.gender);
  const ageGroup = parseAgeGroup(body?.ageGroup);

  const competitionRowIdRaw = String(body?.competitionRowId ?? "").trim();
  const competitionPoolIdRaw = String(body?.competitionPoolId ?? "").trim();
  const competitionTeamNameRaw = String(body?.competitionTeamName ?? "").trim();

  const competitionRowId = competitionRowIdRaw.length > 0 ? competitionRowIdRaw : null;
  const competitionPoolId = competitionPoolIdRaw.length > 0 ? competitionPoolIdRaw : null;
  const competitionTeamName =
    competitionTeamNameRaw.length > 0 ? competitionTeamNameRaw : null;

  // Back-compat: allow updating internal League/Team if provided.
  let validatedLeagueId: string | null = null;
  let validatedTeamId: string | null = null;
  if (leagueId) {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true },
    });
    if (!league) {
      return NextResponse.json({ message: "Ugyldig liga." }, { status: 400 });
    }
    validatedLeagueId = league.id;

    if (teamId) {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true, leagueId: true },
      });

      if (!team) {
        return NextResponse.json({ message: "Ugyldigt hold." }, { status: 400 });
      }

      if (team.leagueId !== validatedLeagueId) {
        return NextResponse.json(
          { message: "Holdet tilhører ikke den valgte liga." },
          { status: 400 }
        );
      }

      validatedTeamId = team.id;
    }
  }

  // Validate competition selections (row/pool/team) if provided.
  let validatedCompetitionRowId: string | null = null;
  let validatedCompetitionPoolId: string | null = null;
  let validatedCompetitionTeamName: string | null = null;

  if (competitionRowId) {
    const row = await prisma.competitionRow.findUnique({
      where: { id: competitionRowId },
      select: { id: true },
    });
    if (!row) {
      return NextResponse.json({ message: "Ugyldig liga." }, { status: 400 });
    }
    validatedCompetitionRowId = row.id;
  }

  if (competitionPoolId) {
    const pool = await prisma.competitionPool.findUnique({
      where: { id: competitionPoolId },
      select: { id: true, rowId: true },
    });
    if (!pool) {
      return NextResponse.json({ message: "Ugyldig pulje." }, { status: 400 });
    }
    if (validatedCompetitionRowId && pool.rowId !== validatedCompetitionRowId) {
      return NextResponse.json(
        { message: "Puljen tilhører ikke den valgte liga." },
        { status: 400 }
      );
    }
    validatedCompetitionPoolId = pool.id;
    validatedCompetitionRowId = validatedCompetitionRowId ?? pool.rowId;
  }

  if (competitionTeamName) {
    if (!validatedCompetitionPoolId) {
      return NextResponse.json(
        { message: "Vælg pulje før hold." },
        { status: 400 }
      );
    }

    const team = await prisma.competitionPoolTeam.findUnique({
      where: {
        poolId_name: { poolId: validatedCompetitionPoolId, name: competitionTeamName },
      },
      select: { name: true },
    });

    if (!team) {
      return NextResponse.json({ message: "Ugyldigt hold." }, { status: 400 });
    }
    validatedCompetitionTeamName = team.name;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(validatedLeagueId ? { leagueId: validatedLeagueId } : {}),
      ...(validatedTeamId !== null ? { teamId: validatedTeamId } : {}),
      ...(gender ? { gender } : {}),
      ...(ageGroup ? { ageGroup } : {}),
      competitionRowId: validatedCompetitionRowId,
      competitionPoolId: validatedCompetitionPoolId,
      competitionTeamName: validatedCompetitionTeamName,
    },
  });

  const session = await getSession();
  if (validatedLeagueId) session.selectedLeagueId = validatedLeagueId;
  if (validatedTeamId !== null) session.selectedTeamId = validatedTeamId ?? undefined;
  if (gender) session.selectedGender = gender;
  if (ageGroup) session.selectedAgeGroup = ageGroup;
  session.selectedCompetitionRowId = validatedCompetitionRowId ?? undefined;
  session.selectedCompetitionPoolId = validatedCompetitionPoolId ?? undefined;
  session.selectedCompetitionTeamName = validatedCompetitionTeamName ?? undefined;
  await session.save();

  return NextResponse.json({ ok: true });
}
