const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const counts = await prisma.taTeam.groupBy({
    by: ["league", "gender"],
    _count: { _all: true },
    orderBy: [{ league: "asc" }, { gender: "asc" }],
  });

  console.log("--- ta_teams counts by league+gender ---");
  for (const c of counts) {
    console.log({ league: c.league, gender: c.gender, count: c._count._all });
  }

  const leagues = await prisma.taTeam.findMany({
    select: { league: true },
    distinct: ["league"],
    orderBy: { league: "asc" },
  });

  const interesting = leagues
    .map((l) => l.league)
    .filter((l) => /unihoc|select/i.test(String(l)));

  console.log("--- ta_teams distinct leagues matching /unihoc|select/i ---");
  console.log(interesting);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
