const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const league = "Unihoc Floorball Liga";

  const sample = await prisma.taMatch.findMany({
    where: { league },
    select: {
      id: true,
      date: true,
      time: true,
      gender: true,
      homeTeam: true,
      homeHoldId: true,
      awayTeam: true,
      awayHoldId: true,
    },
    orderBy: [{ date: "asc" }, { time: "asc" }],
    take: 40,
  });

  console.log("--- UFL matches sample ---");
  for (const m of sample) {
    console.log({
      date: m.date ? m.date.toISOString().slice(0, 10) : null,
      gender: m.gender,
      home: m.homeTeam,
      homeHoldId: m.homeHoldId,
      away: m.awayTeam,
      awayHoldId: m.awayHoldId,
    });
  }

  const counts = await prisma.taMatch.groupBy({
    by: ["gender"],
    where: { league },
    _count: { _all: true },
  });

  console.log("--- UFL gender counts ---");
  console.log(counts);

  const teams = await prisma.taTeam.findMany({
    where: { league },
    select: { id: true, name: true, holdId: true, gender: true },
    orderBy: [{ gender: "asc" }, { name: "asc" }],
  });

  console.log("--- UFL teams ---");
  console.log(
    teams.map((t) => ({ gender: t.gender, name: t.name, holdId: t.holdId })).slice(0, 80)
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
