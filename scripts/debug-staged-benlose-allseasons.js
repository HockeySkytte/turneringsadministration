const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function s(v) {
  return String(v ?? "").trim();
}

async function main() {
  const latest = await prisma.$queryRawUnsafe(
    `SELECT id, created_at, filename, holdliste FROM ta_turnering_imports ORDER BY created_at DESC LIMIT 1;`
  );

  const row = Array.isArray(latest) ? latest[0] : null;
  if (!row) {
    console.log("No import rows found");
    return;
  }

  const holdliste = Array.isArray(row.holdliste) ? row.holdliste : [];

  const out = [];
  for (const r of holdliste) {
    const season = s(r.Season || r.Sæson || r.Saeson || r.saeson || r.season);
    const league = s(r.Liga || r.Række || r.Raekke || r.Turnering || r.liga);
    const holdId = s(r.HoldID || r["Hold Id"] || r.HoldId || r.HoldNr || r.Holdnr || r.TeamID || r.TeamId);
    const hold = s(r.Hold || r.Holdnavn || r["Hold navn"] || r.Team);
    const gender = s(r.Køn || r.Koen || r.Gender || r.køn || r.koen || r.gender);
    const club = s(r.Klub || r.Forening || r.Klubnavn || r["Klub navn"]);

    if (!["Unihoc Floorball Liga", "Select Ligaen", "Pokalturnering"].includes(league)) continue;
    if (!(holdId === "10003" || holdId === "20004" || hold.toLowerCase().includes("benl"))) continue;

    out.push({ season, league, gender, holdId, hold, club });
  }

  out.sort((a, b) => `${a.holdId}|${a.league}|${a.season}|${a.gender}|${a.hold}`.localeCompare(`${b.holdId}|${b.league}|${b.season}|${b.gender}|${b.hold}`));

  console.log("--- staged holdliste rows for Benløse / HoldID 10003/20004 (all seasons) ---");
  console.log(out);

  const distinct = new Map();
  for (const r of out) {
    const k = `${r.league}|${r.holdId}`;
    const set = distinct.get(k) || new Set();
    set.add(r.hold);
    distinct.set(k, set);
  }

  console.log("--- distinct hold names by league|holdId ---");
  console.log(Array.from(distinct.entries()).map(([k, set]) => ({ key: k, holds: Array.from(set.values()) })));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
