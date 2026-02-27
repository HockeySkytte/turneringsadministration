import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

async function main() {
  await ensureTurneringDomainTables();

  const sample = await prisma.taMatch.findMany({
    take: 3,
    orderBy: [{ date: "asc" }, { time: "asc" }],
    select: {
      id: true,
      date: true,
      time: true,
      result: true,
      league: true,
      gender: true,
      dommer1Id: true,
      dommer1: true,
      dommer1Status: true,
      dommer1RespondedAt: true,
      dommer2Id: true,
      dommer2: true,
      dommer2Status: true,
      dommer2RespondedAt: true,
    },
  });

  const unfinishedCount = await prisma.taMatch.count({
    where: { OR: [{ result: null }, { result: "" }] },
  });

  const refereeCount = await prisma.taReferee.count();

  console.log("taMatch unfinished count:", unfinishedCount);
  console.log("taReferee count:", refereeCount);
  console.log("sample matches:", sample);
}

main()
  .catch((err) => {
    console.error("debug-kamppaasetning failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
