import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRefAdmin } from "@/lib/auth";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { geocodeWithNominatim } from "@/lib/geocode";

export const dynamic = "force-dynamic";

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

function optional(value: unknown): string | null {
  const v = norm(value);
  return v ? v : null;
}

type EligibleLeague = {
  league: string;
  gender: string | null;
  seasonStartYear?: number;
};

function parseEligibleLeagues(value: unknown): EligibleLeague[] {
  if (!Array.isArray(value)) return [];
  const out: EligibleLeague[] = [];
  for (const item of value) {
    const league = norm((item as any)?.league);
    const genderRaw = optional((item as any)?.gender);
    const seasonStartYearRaw = (item as any)?.seasonStartYear;
    const seasonStartYear =
      typeof seasonStartYearRaw === "number" && Number.isFinite(seasonStartYearRaw)
        ? seasonStartYearRaw
        : typeof seasonStartYearRaw === "string" && seasonStartYearRaw.trim()
          ? Number.parseInt(seasonStartYearRaw, 10)
          : undefined;

    if (!league) continue;
    out.push({
      league,
      gender: genderRaw,
      ...(seasonStartYear && Number.isFinite(seasonStartYear) ? { seasonStartYear } : null),
    });
  }
  return out;
}

async function getCurrentSeasonStartYearFromTaTeams(): Promise<number | null> {
  const agg = await prisma.taTeam.aggregate({ _max: { seasonStartYear: true } });
  const y = agg._max.seasonStartYear;
  return typeof y === "number" && Number.isFinite(y) ? y : null;
}

export async function GET() {
  await requireRefAdmin();
  await ensureTurneringDomainTables();

  const currentSeasonStartYear = await getCurrentSeasonStartYearFromTaTeams();

  const leagueOptions = currentSeasonStartYear
    ? await prisma.taTeam.findMany({
        where: { seasonStartYear: currentSeasonStartYear },
        select: { league: true, gender: true },
        distinct: ["league", "gender"],
        orderBy: [{ league: "asc" }],
      })
    : [];

  const eligibleLeagueOptions = leagueOptions.map((o) => ({
    league: o.league,
    gender: o.gender ? String(o.gender) : null,
  }));

  const referees = await prisma.taReferee.findMany({
    orderBy: [{ name: "asc" }, { refereeNo: "asc" }],
    select: {
      id: true,
      refereeNo: true,
      name: true,
      club: true,
      address: true,
      email: true,
      phone: true,
      partner1: true,
      partner2: true,
      partner3: true,
      eligibleLeagues: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    referees,
    options: {
      currentSeasonStartYear,
      eligibleLeagueOptions,
    },
  });
}

export async function POST(req: Request) {
  await requireRefAdmin();
  await ensureTurneringDomainTables();

  const body = await req.json().catch(() => null);

  const refereeNo = norm(body?.refereeNo);
  const name = norm(body?.name);

  if (!refereeNo) {
    return NextResponse.json({ message: "Dommernummer mangler." }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ message: "Navn mangler." }, { status: 400 });
  }

  const eligibleLeagues = parseEligibleLeagues(body?.eligibleLeagues);
  const address = optional(body?.address);

  const geo = address ? await geocodeWithNominatim(`${address}, Danmark`) : null;
  if (address && !geo) {
    return NextResponse.json(
      { message: "Kunne ikke finde adressen. Prøv at skrive den mere præcist." },
      { status: 400 }
    );
  }

  try {
    const created = await prisma.taReferee.create({
      data: {
        refereeNo,
        name,
        club: optional(body?.club),
        address,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        geocodedAt: geo ? new Date() : null,
        email: optional(body?.email),
        phone: optional(body?.phone),
        partner1: optional(body?.partner1),
        partner2: optional(body?.partner2),
        partner3: optional(body?.partner3),
        eligibleLeagues: eligibleLeagues.length ? eligibleLeagues : undefined,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ message: "Dommernummer findes allerede." }, { status: 409 });
    }
    throw err;
  }
}
