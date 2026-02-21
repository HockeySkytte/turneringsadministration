const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function canonicalKey(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("da-DK")
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function showStringDetails(label, str) {
  const s = String(str ?? "");
  const cps = Array.from(s).map((ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}('${ch}')`);
  return {
    label,
    raw: s,
    nfc: s.normalize("NFC"),
    nfd: s.normalize("NFD"),
    canonicalKey: canonicalKey(s),
    codepoints: cps,
  };
}

async function main() {
  const teamRows = await prisma.taTeam.findMany({
    where: { league: "Unihoc Floorball Liga", holdId: { in: ["10003", "20004"] } },
    select: { gender: true, name: true, holdId: true },
  });

  const matchRows = await prisma.taMatch.findMany({
    where: {
      league: "Unihoc Floorball Liga",
      date: { gte: new Date("2025-07-01"), lt: new Date("2026-07-01") },
      OR: [{ homeTeam: { contains: "Ben" } }, { awayTeam: { contains: "Ben" } }],
    },
    select: { gender: true, homeTeam: true, awayTeam: true, homeHoldId: true, awayHoldId: true, date: true },
    take: 5,
    orderBy: { date: "asc" },
  });

  console.log("--- ta_teams Benløse (UFL) unicode details ---");
  for (const t of teamRows) {
    console.log({ holdId: t.holdId, gender: t.gender });
    console.log(showStringDetails("team.name", t.name));
  }

  console.log("--- ta_matches sample Benløse (UFL) unicode details ---");
  for (const m of matchRows) {
    console.log({ date: m.date, gender: m.gender, homeHoldId: m.homeHoldId, awayHoldId: m.awayHoldId });
    console.log(showStringDetails("match.homeTeam", m.homeTeam));
    console.log(showStringDetails("match.awayTeam", m.awayTeam));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
