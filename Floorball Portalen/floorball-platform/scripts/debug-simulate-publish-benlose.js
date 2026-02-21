const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function stableId(prefix, key) {
  const crypto = require("crypto");
  const hex = crypto.createHash("sha256").update(key).digest("hex");
  return `${prefix}_${hex.slice(0, 32)}`;
}

function canonicalKey(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("da-DK")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
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

function normalizeGenderLike(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const v = raw
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "");

  if (v === "men" || v === "m" || v.includes("maend") || v.includes("mand") || v.includes("herre") || v.includes("male")) return "MEN";
  if (v === "women" || v === "w" || v === "k" || v.includes("kvinde") || v.includes("dame") || v.includes("female")) return "WOMEN";
  return null;
}

function genderHint(text) {
  const t = String(text ?? "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "");

  const womenHints = ["dame", "kvinde", "pige", "women", "female", "girls"];
  const menHints = ["herre", "mand", "maend", "mænd", "men", "male", "boys", "drenge"];
  const isWomen = womenHints.some((h) => t.includes(h));
  const isMen = menHints.some((h) => t.includes(h));
  if (isWomen && !isMen) return "WOMEN";
  if (isMen && !isWomen) return "MEN";
  return null;
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
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, created_at, filename, kampe, holdliste, klubliste
     FROM ta_turnering_imports
     ORDER BY created_at DESC
     LIMIT 1;`
  );
  const latest = rows[0];
  if (!latest) throw new Error("No import");

  const holdliste = Array.isArray(latest.holdliste) ? latest.holdliste : [];
  const kampe = Array.isArray(latest.kampe) ? latest.kampe : [];
  const klubliste = Array.isArray(latest.klubliste) ? latest.klubliste : [];

  // Minimal club map similar to publish route
  function firstNonEmpty(row, keys) {
    for (const key of keys) {
      const foundKey = Object.keys(row).find((k) => k.trim().toLowerCase() === key.trim().toLowerCase());
      if (!foundKey) continue;
      const v = row[foundKey];
      const s = String(v ?? "").trim();
      if (s) return s;
    }
    return "";
  }

  const clubKeyToRecord = new Map();
  function addClub(clubNo, name) {
    const no = String(clubNo ?? "").trim();
    const nm = String(name ?? "").trim();
    const key = no ? `no:${no.toLowerCase()}` : `name:${nm.toLowerCase()}`;
    if (clubKeyToRecord.has(key)) return;
    const id = stableId("club", no ? `no:${no.toLowerCase()}` : `name:${nm.toLowerCase()}`);
    clubKeyToRecord.set(key, { id, clubNo: no, name: nm || no });
  }

  for (const r of klubliste) {
    const clubNo = firstNonEmpty(r, ["KlubID", "KlubId", "KlubNr", "Klubnr"]);
    const name = firstNonEmpty(r, ["Klub", "Forening", "Klubnavn", "Klub navn"]);
    if (clubNo || name) addClub(clubNo, name);
  }

  // Normalize staged teams (subset)
  const teams = [];
  for (const r of holdliste) {
    const season = String(r.Season || r.Sæson || r.Saeson || r.season || r.saeson || "").trim();
    const clubNo = firstNonEmpty(r, ["KlubID", "KlubId", "KlubNr", "Klubnr"]);
    const clubName = firstNonEmpty(r, ["Klub", "Forening", "Klubnavn", "Klub navn"]);
    const league = firstNonEmpty(r, ["Liga", "Række", "Raekke", "Turnering"]);
    const teamName = firstNonEmpty(r, ["Hold", "Holdnavn", "Hold navn", "Team"]);
    const holdId = firstNonEmpty(r, ["HoldID", "HoldId", "TeamID", "TeamId", "Hold Nr", "HoldNr"]);
    const gender = firstNonEmpty(r, ["Køn", "Koen", "Gender"]);

    if (!league || !teamName) continue;
    teams.push({ season, clubNo, clubName, league, teamName, holdId: holdId || null, gender });
    addClub(clubNo, clubName);
  }

  const clubRecords = Array.from(clubKeyToRecord.values());
  const clubIdByNo = new Map();
  const clubIdByName = new Map();
  for (const c of clubRecords) {
    if (c.clubNo) clubIdByNo.set(c.clubNo.toLowerCase(), c.id);
    if (c.name) clubIdByName.set(c.name.toLowerCase(), c.id);
  }

  // Dedup teams like publish route
  const uniqueTeamById = new Map();
  function normStr(v) {
    return String(v ?? "").trim();
  }

  function parseSeasonStartYear(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const m = raw.match(/(\d{4})/);
    if (!m) return null;
    const y = Number(m[1]);
    if (!Number.isFinite(y) || y < 1900 || y > 3000) return null;
    return y;
  }

  for (const t of teams) {
    const clubId =
      (t.clubNo ? clubIdByNo.get(t.clubNo.toLowerCase()) : undefined) ??
      (t.clubName ? clubIdByName.get(t.clubName.toLowerCase()) : undefined);
    if (!clubId) continue;

    const league = normStr(t.league);
    const name = normStr(t.teamName);
    const gender = normalizeGenderLike(t.gender);
    const seasonStartYear = parseSeasonStartYear(t.season);

    const holdKey = normStr(String(t.holdId ?? ""));
    const idKey = holdKey
      ? `hold:${holdKey.toLowerCase()}|league:${league.toLowerCase()}`
      : `club:${normStr(t.clubNo || t.clubName).toLowerCase()}|league:${league.toLowerCase()}|name:${name.toLowerCase()}`;

    const id = stableId("team", idKey);
    const next = { id, clubId, league, name, holdId: holdKey ? holdKey : null, gender, seasonStartYear };

    const prev = uniqueTeamById.get(id);
    if (!prev) {
      uniqueTeamById.set(id, next);
      continue;
    }

    const prevHasHold = Boolean(prev.holdId);
    const nextHasHold = Boolean(next.holdId);
    const pickHoldId = prevHasHold ? prev.holdId : nextHasHold ? next.holdId : null;

    const prevName = normStr(prev.name);
    const nextName = normStr(next.name);

    const prevSeason = prev.seasonStartYear;
    const nextSeason = next.seasonStartYear;
    const hasNewerSeason =
      typeof nextSeason === "number" && (typeof prevSeason !== "number" || nextSeason > prevSeason);

    const pickName = hasNewerSeason
      ? nextName || prevName
      : nextName.length > prevName.length
        ? nextName
        : prevName;

    uniqueTeamById.set(id, {
      ...prev,
      name: pickName,
      holdId: pickHoldId,
      gender: hasNewerSeason ? next.gender ?? prev.gender : prev.gender ?? next.gender,
      seasonStartYear:
        typeof prevSeason === "number" && typeof nextSeason === "number"
          ? Math.max(prevSeason, nextSeason)
          : typeof prevSeason === "number"
            ? prevSeason
            : typeof nextSeason === "number"
              ? nextSeason
              : null,
    });
  }

  // Build candidates
  const holdIdCandidatesByLeagueGenderAndName = new Map();
  const holdIdCandidatesByLeagueAndName = new Map();
  const holdIdCandidatesByLeagueGenderAndLooseName = new Map();
  const holdIdCandidatesByLeagueAndLooseName = new Map();

  for (const t of uniqueTeamById.values()) {
    const league = normStr(t.league);
    const nameKey = canonicalKey(t.name);
    const looseKey = looseTeamKey(t.name);
    const holdId = normStr(t.holdId ?? "");
    if (!league || !nameKey || !holdId) continue;

    for (const l of equivalentLeagues(league)) {
      const lk = l.toLocaleLowerCase("da-DK");
      addCandidate(holdIdCandidatesByLeagueAndName, `${lk}|${nameKey}`, holdId);
      if (looseKey) addCandidate(holdIdCandidatesByLeagueAndLooseName, `${lk}|${looseKey}`, holdId);
      if (t.gender) {
        addCandidate(holdIdCandidatesByLeagueGenderAndName, `${lk}|${t.gender}|${nameKey}`, holdId);
        if (looseKey) addCandidate(holdIdCandidatesByLeagueGenderAndLooseName, `${lk}|${t.gender}|${looseKey}`, holdId);
      }
    }
  }

  const holdIdByLeagueGenderAndName = new Map();
  for (const [k, set] of holdIdCandidatesByLeagueGenderAndName) {
    if (set.size === 1) holdIdByLeagueGenderAndName.set(k, Array.from(set)[0] ?? "");
  }
  const holdIdByLeagueAndNameUnique = new Map();
  for (const [k, set] of holdIdCandidatesByLeagueAndName) {
    if (set.size === 1) holdIdByLeagueAndNameUnique.set(k, Array.from(set)[0] ?? "");
  }
  const holdIdByLeagueGenderAndLooseName = new Map();
  for (const [k, set] of holdIdCandidatesByLeagueGenderAndLooseName) {
    if (set.size === 1) holdIdByLeagueGenderAndLooseName.set(k, Array.from(set)[0] ?? "");
  }
  const holdIdByLeagueAndLooseNameUnique = new Map();
  for (const [k, set] of holdIdCandidatesByLeagueAndLooseName) {
    if (set.size === 1) holdIdByLeagueAndLooseNameUnique.set(k, Array.from(set)[0] ?? "");
  }

  function resolveHoldIdForSide({ league, gender, teamName }) {
    const l = String(league ?? "").trim();
    const key = canonicalKey(teamName);
    if (!l || !key) return null;

    const looseKey = looseTeamKey(teamName);

    for (const eq of equivalentLeagues(l)) {
      const lk = eq.toLocaleLowerCase("da-DK");
      if (gender) {
        const exact = holdIdByLeagueGenderAndName.get(`${lk}|${gender}|${key}`);
        if (exact) return exact;
      }

      const unique = holdIdByLeagueAndNameUnique.get(`${lk}|${key}`);
      if (unique) return unique;

      if (looseKey) {
        if (gender) {
          const looseExact = holdIdByLeagueGenderAndLooseName.get(`${lk}|${gender}|${looseKey}`);
          if (looseExact) return looseExact;
        }

        const looseUnique = holdIdByLeagueAndLooseNameUnique.get(`${lk}|${looseKey}`);
        if (looseUnique) return looseUnique;
      }
    }

    return null;
  }

  // Infer match gender using same approach (subset: direct + hint from pool/league)
  const teamGenderCandidatesByLeagueAndName = new Map();
  for (const t of teams) {
    const g = normalizeGenderLike(t.gender);
    if (!g) continue;
    const league = String(t.league ?? "").trim();
    const nameKey = canonicalKey(t.teamName);
    if (!league || !nameKey) continue;
    for (const l of equivalentLeagues(league)) {
      const lk = l.toLocaleLowerCase("da-DK");
      const k = `${lk}|${nameKey}`;
      const set = teamGenderCandidatesByLeagueAndName.get(k);
      if (set) set.add(g);
      else teamGenderCandidatesByLeagueAndName.set(k, new Set([g]));
    }
  }

  function inferMatchGender(m) {
    const direct = normalizeGenderLike(m.gender);
    if (direct) return direct;

    const league = String(m.league ?? "").trim();
    const leagueKeys = league ? equivalentLeagues(league) : [""];
    const homeKey = canonicalKey(m.homeTeam);
    const awayKey = canonicalKey(m.awayTeam);

    const candidates = [];
    for (const l of leagueKeys) {
      const lk = l.toLocaleLowerCase("da-DK");
      if (homeKey) {
        const set = teamGenderCandidatesByLeagueAndName.get(`${lk}|${homeKey}`);
        if (set && set.size === 1) candidates.push([...set][0]);
      }
      if (awayKey) {
        const set = teamGenderCandidatesByLeagueAndName.get(`${lk}|${awayKey}`);
        if (set && set.size === 1) candidates.push([...set][0]);
      }
    }

    if (candidates.length) {
      const uniq = Array.from(new Set(candidates));
      if (uniq.length === 1) return uniq[0];
    }

    return genderHint(`${m.league ?? ""} ${m.pool ?? ""}`.trim());
  }

  // Find matches in UFL/Select for Benløse FC in 2025-2026
  const target = [];
  for (const r of kampe) {
    const season = String(r.Season || r.Sæson || r.Saeson || r.season || "").trim();
    if (season && season !== "2025-2026") continue;

    const league = String(r.Liga || r.Række || r.Raekke || r.liga || "").trim();
    if (!["Unihoc Floorball Liga", "Select Ligaen"].includes(league)) continue;

    const homeTeam = String(r.Hjemmehold || r.Home || r["Hjemme hold"] || r.homeTeam || "").trim();
    const awayTeam = String(r.Udehold || r.Away || r["Ude hold"] || r.awayTeam || "").trim();
    if (!homeTeam && !awayTeam) continue;

    if (!(homeTeam.includes("Ben") || awayTeam.includes("Ben"))) continue;

    const gender = inferMatchGender({
      gender: r.Køn || r.Koen || r.Gender || r.gender || "",
      league,
      pool: String(r.Pulje || r.Pool || r.pool || ""),
      homeTeam,
      awayTeam,
    });

    target.push({
      league,
      gender,
      homeTeam,
      awayTeam,
      homeHoldId: resolveHoldIdForSide({ league, gender, teamName: homeTeam }),
      awayHoldId: resolveHoldIdForSide({ league, gender, teamName: awayTeam }),
    });
  }

  console.log("--- simulated resolution for Benløse matches (latest import, season 2025-2026) ---");
  console.log(target.slice(0, 20));

  const uflBenlose = Array.from(uniqueTeamById.values()).filter(
    (t) => t.league === "Unihoc Floorball Liga" && (t.holdId === "10003" || t.holdId === "20004")
  );
  console.log("--- simulated uniqueTeamById (UFL Benløse teams) ---");
  console.log(uflBenlose);

  const unresolved = target.filter((m) => (m.homeTeam.includes("Ben") && !m.homeHoldId) || (m.awayTeam.includes("Ben") && !m.awayHoldId));
  console.log("--- unresolved count ---");
  console.log({ total: target.length, unresolved: unresolved.length });
  if (unresolved.length) console.log(unresolved.slice(0, 20));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
