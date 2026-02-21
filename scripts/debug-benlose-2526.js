const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function isoDate(d) {
  return d ? d.toISOString().slice(0, 10) : null;
}

async function main() {
  const seasonStart = new Date("2025-07-01T00:00:00.000Z");
  const seasonEndExclusive = new Date("2026-07-01T00:00:00.000Z");

  const needle = "Benløse";
  const leagues = ["Unihoc Floorball Liga", "Select Ligaen"]; // treat as equivalent

  const matches = await prisma.taMatch.findMany({
    where: {
      date: { gte: seasonStart, lt: seasonEndExclusive },
      league: { in: leagues },
      OR: [
        { homeTeam: { contains: needle, mode: "insensitive" } },
        { awayTeam: { contains: needle, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      externalId: true,
      date: true,
      gender: true,
      league: true,
      stage: true,
      pool: true,
      homeTeam: true,
      homeHoldId: true,
      awayTeam: true,
      awayHoldId: true,
    },
    orderBy: [{ date: "asc" }],
    take: 300,
  });

  console.log(`--- Matches in 2025/2026 containing '${needle}' (count=${matches.length}) ---`);
  for (const m of matches) {
    console.log({
      date: isoDate(m.date),
      gender: m.gender,
      league: m.league,
      stage: m.stage,
      pool: m.pool,
      home: m.homeTeam,
      homeHoldId: m.homeHoldId,
      away: m.awayTeam,
      awayHoldId: m.awayHoldId,
      externalId: m.externalId,
      id: m.id,
    });
  }

  const unresolved = matches.filter((m) => !String(m.homeHoldId || "").trim() || !String(m.awayHoldId || "").trim());
  console.log("--- Unresolved holdId (either side missing) ---");
  console.log(unresolved.map((m) => ({ date: isoDate(m.date), league: m.league, gender: m.gender, home: m.homeTeam, homeHoldId: m.homeHoldId, away: m.awayTeam, awayHoldId: m.awayHoldId })));

  const byLeagueGender = new Map();
  for (const m of matches) {
    const k = `${m.league || ""}|${m.gender || ""}`;
    byLeagueGender.set(k, (byLeagueGender.get(k) || 0) + 1);
  }
  console.log("--- Counts by league|gender for these matches ---");
  console.log(Array.from(byLeagueGender.entries()).sort((a, b) => a[0].localeCompare(b[0])));

  const teams = await prisma.taTeam.findMany({
    where: { name: { contains: needle, mode: "insensitive" } },
    select: { id: true, league: true, name: true, holdId: true, gender: true },
    orderBy: [{ league: "asc" }, { gender: "asc" }, { name: "asc" }],
  });

  console.log(`--- Teams containing '${needle}' ---`);
  console.log(teams.map((t) => ({ league: t.league, gender: t.gender, name: t.name, holdId: t.holdId })));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
