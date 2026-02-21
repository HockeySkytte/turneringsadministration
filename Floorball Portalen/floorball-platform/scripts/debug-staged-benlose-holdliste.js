const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function s(v) {
  return String(v ?? "").trim();
}

function normGender(raw) {
  const v = s(raw)
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "");
  if (!v) return "";
  if (v.includes("dame") || v.includes("kvinde") || v.includes("women") || v === "k") return "WOMEN";
  if (v.includes("herre") || v.includes("maend") || v.includes("men") || v === "m") return "MEN";
  return s(raw);
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

  const matches = [];
  for (const r of holdliste) {
    const season = s(r.Season || r.Sæson || r.Saeson || r.saeson || r.season);
    const league = s(r.Liga || r.Række || r.Raekke || r.Turnering || r.liga);
    const holdId = s(r.HoldID || r["Hold Id"] || r.HoldId || r.HoldNr || r.Holdnr || r.TeamID || r.TeamId);
    const hold = s(r.Hold || r.Holdnavn || r["Hold navn"] || r.Team);
    const gender = normGender(r.Køn || r.Koen || r.Gender || r.køn || r.koen || r.gender);
    const clubId = s(r.KlubID || r.KlubId || r.KlubNr || r.Klubnr || r.Id);
    const club = s(r.Klub || r.Forening || r.Klubnavn || r["Klub navn"]);

    const isBenlose = hold.toLowerCase().includes("ben") || club.toLowerCase().includes("ben");
    const isTargetHoldId = holdId === "10003" || holdId === "20004";
    const isUfl = league === "Unihoc Floorball Liga" || league === "Select Ligaen";

    if (!isBenlose && !isTargetHoldId) continue;
    if (season && season !== "2025-2026") continue;
    if (!isUfl && isTargetHoldId) {
      // still include target hold IDs even if league isn't UFL, for visibility
    } else if (!isUfl) {
      continue;
    }

    matches.push({ season, league, gender, holdId, hold, clubId, club });
  }

  matches.sort((a, b) => `${a.league}|${a.gender}|${a.holdId}|${a.hold}`.localeCompare(`${b.league}|${b.gender}|${b.holdId}|${b.hold}`));

  console.log("--- staged holdliste (latest import) Benløse in 2025-2026 for UFL/Select + holdId 10003/20004 ---");
  console.log(matches);

  const byHold = new Map();
  for (const m of matches) {
    const k = `${m.league}|${m.gender}|${m.holdId}`;
    const set = byHold.get(k) || new Set();
    set.add(m.hold);
    byHold.set(k, set);
  }

  console.log("--- distinct Hold values by league|gender|holdId ---");
  console.log(
    Array.from(byHold.entries()).map(([k, set]) => ({ key: k, holds: Array.from(set.values()) }))
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
