import { prisma } from "../src/lib/prisma";

async function main() {
  const row = await prisma.competitionRow.findFirst({
    where: { name: { contains: "Unihoc" } },
    select: { id: true, name: true, raekkeId: true, gender: true, ageGroup: true },
  });

  // eslint-disable-next-line no-console
  console.log("row", row);

  if (row) {
    const pools = await prisma.competitionPool.findMany({
      where: { rowId: row.id },
      select: { id: true, puljeId: true, name: true },
      take: 50,
      orderBy: { name: "asc" },
    });

    // eslint-disable-next-line no-console
    console.log(
      "pools sample",
      pools.map((p) => ({ puljeId: p.puljeId, name: p.name }))
    );
  }
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
