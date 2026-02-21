const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const imports = await prisma.$queryRawUnsafe(
    `SELECT id, created_at, filename
     FROM ta_turnering_imports
     ORDER BY created_at DESC
     LIMIT 3;`
  );

  console.log("--- latest 3 imports ---");
  console.log(imports);

  const publishedImports = await prisma.$queryRawUnsafe(
     `SELECT "sourceImportId", COUNT(*)::int AS matches
      FROM ta_matches
      GROUP BY "sourceImportId"
     ORDER BY matches DESC;`
  );

  console.log("--- published matches by sourceImportId ---");
  console.log(publishedImports);

  const teams = await prisma.$queryRawUnsafe(
     `SELECT league, gender, "holdId", name, "clubId"
     FROM ta_teams
      WHERE ("holdId" = '10003' OR "holdId" = '20004')
        OR (league IN ('Unihoc Floorball Liga','Select Ligaen','Pokalturnering') AND name ILIKE '%Benløse%')
      ORDER BY league, gender, "holdId";`
  );

  console.log("--- ta_teams (Benløse / holdId 10003/20004) ---");
  console.log(teams);

  const matches = await prisma.$queryRawUnsafe(
    `SELECT league, gender, date, "homeTeam" AS "homeTeam", "homeHoldId" AS "homeHoldId",
            "awayTeam" AS "awayTeam", "awayHoldId" AS "awayHoldId", "sourceImportId" AS "sourceImportId"
     FROM ta_matches
     WHERE (league IN ('Unihoc Floorball Liga','Select Ligaen') AND ("homeTeam" ILIKE '%Benløse%' OR "awayTeam" ILIKE '%Benløse%'))
       AND (date >= '2025-07-01' AND date < '2026-07-01')
     ORDER BY date NULLS LAST
     LIMIT 50;`
  );

  console.log("--- sample UFL/Select matches with Benløse (2025-07-01..2026-07-01) ---");
  console.log(matches);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
