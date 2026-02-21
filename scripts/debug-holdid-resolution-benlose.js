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

function looseTeamKey(value) {
  const key = canonicalKey(value);
  if (!key) return "";
  const stop = new Set(["fc", "if", "ff", "ft", "fk", "floorball", "club", "klub"]);
  const tokens = key.split(" ").filter(Boolean);
  return tokens.filter((t) => !stop.has(t)).join(" ").trim();
}

function equivalentLeagues(league) {
  const l = String(league ?? "").trim();
  if (l === "Unihoc Floorball Liga") return ["Unihoc Floorball Liga", "Select Ligaen"];
  if (l === "Select Ligaen") return ["Select Ligaen", "Unihoc Floorball Liga"];
  return [l];
}

function addCandidate(map, key, holdId) {
  const prev = map.get(key);
  if (prev) prev.add(holdId);
  else map.set(key, new Set([holdId]));
}

async function main() {
  const teams = await prisma.taTeam.findMany({
    select: { league: true, gender: true, name: true, holdId: true },
  });

  const holdIdCandidatesByLeagueGenderAndLooseName = new Map();
  const holdIdCandidatesByLeagueGenderAndName = new Map();

  for (const t of teams) {
    const league = String(t.league ?? "").trim();
    const gender = t.gender ? String(t.gender).trim() : "";
    const holdId = t.holdId ? String(t.holdId).trim() : "";
    if (!league || !gender || !holdId) continue;

    const exactKey = canonicalKey(t.name);
    const looseKey = looseTeamKey(t.name);

    for (const l of equivalentLeagues(league)) {
      const lk = l.toLocaleLowerCase("da-DK");
      if (exactKey) addCandidate(holdIdCandidatesByLeagueGenderAndName, `${lk}|${gender}|${exactKey}`, holdId);
      if (looseKey) addCandidate(holdIdCandidatesByLeagueGenderAndLooseName, `${lk}|${gender}|${looseKey}`, holdId);
    }
  }

  function show(map, key) {
    const set = map.get(key);
    return set ? Array.from(set.values()).sort() : [];
  }

  const lk = "Unihoc Floorball Liga".toLocaleLowerCase("da-DK");
  const menLoose = `${lk}|MEN|${looseTeamKey("Benløse FC")}`;
  const womenLoose = `${lk}|WOMEN|${looseTeamKey("Benløse FC")}`;
  const menExact = `${lk}|MEN|${canonicalKey("Benløse FC")}`;
  const womenExact = `${lk}|WOMEN|${canonicalKey("Benløse FC")}`;

  console.log("--- key diagnostics (from ta_teams) ---");
  console.log({ menExact, menLoose, womenExact, womenLoose });

  console.log("--- candidates exact ---");
  console.log({
    men: show(holdIdCandidatesByLeagueGenderAndName, menExact),
    women: show(holdIdCandidatesByLeagueGenderAndName, womenExact),
  });

  console.log("--- candidates loose ---");
  console.log({
    men: show(holdIdCandidatesByLeagueGenderAndLooseName, menLoose),
    women: show(holdIdCandidatesByLeagueGenderAndLooseName, womenLoose),
  });

  // Also show which team rows contribute to looseKey 'benlose' for UFL.
  const targetLoose = looseTeamKey("Benløse FC");
  const relevant = teams
    .filter((t) => {
      if (!t.league || !t.gender || !t.holdId) return false;
      return (
        equivalentLeagues(t.league).includes("Unihoc Floorball Liga") &&
        (looseTeamKey(t.name) === targetLoose || canonicalKey(t.name) === canonicalKey("Benløse FC"))
      );
    })
    .map((t) => ({ league: t.league, gender: t.gender, holdId: t.holdId, name: t.name }))
    .sort((a, b) => `${a.league}|${a.gender}|${a.holdId}`.localeCompare(`${b.league}|${b.gender}|${b.holdId}`));

  console.log("--- contributing ta_teams rows (UFL equivalents) ---");
  console.log(relevant);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
