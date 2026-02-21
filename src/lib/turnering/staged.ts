export type StagedImport = {
  id: string;
  createdAt: Date;
  filename: string | null;
  kampe: Array<Record<string, unknown>>;
  holdliste: Array<Record<string, unknown>>;
  klubliste: Array<Record<string, unknown>>;
};

export type StagedClub = {
  clubNo: string;
  name: string;
};

export type StagedTeam = {
  season: string;
  clubNo: string;
  clubName: string;
  league: string;
  teamName: string;
  holdId: string;
  gender: string;
};

export type StagedMatch = {
  externalId: string | null;
  date: Date | null;
  time: Date | null;
  dateText: string;
  timeText: string;
  venue: string;
  result: string;
  dommer1: string;
  dommer1Id: string;
  dommer2: string;
  dommer2Id: string;
  gender: string;
  league: string;
  stage: string;
  pool: string;
  homeTeam: string;
  awayTeam: string;
};

function firstNonEmptyByPredicate(row: Record<string, unknown>, predicate: (keyLower: string) => boolean): string {
  for (const [rk, v] of Object.entries(row)) {
    const keyLower = rk.toLowerCase();
    if (!predicate(keyLower)) continue;
    const s = asString(v);
    if (s) return s;
  }
  return "";
}

function normalizeGender(value: string): string {
  const raw = asString(value).trim();
  if (!raw) return "";

  const v = raw
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "");

  // Accept common Danish/English variants.
  if (
    v === "m" ||
    v.includes("maend") ||
    v.includes("mand") ||
    v.includes("herre") ||
    v.includes("men") ||
    v.includes("male") ||
    v.includes("boys")
  )
    return "MEN";

  if (
    v === "k" ||
    v.includes("kvinde") ||
    v.includes("dame") ||
    v.includes("women") ||
    v.includes("female") ||
    v.includes("girls")
  )
    return "WOMEN";

  return "";
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value).trim();
}

function firstNonEmpty(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    for (const [rk, v] of Object.entries(row)) {
      if (rk.toLowerCase().trim() !== k.toLowerCase().trim()) continue;
      const s = asString(v);
      if (s) return s;
    }
  }
  return "";
}

function firstNonEmptyByContains(row: Record<string, unknown>, needle: string): string {
  const n = needle.toLowerCase();
  for (const [rk, v] of Object.entries(row)) {
    if (!rk.toLowerCase().includes(n)) continue;
    const s = asString(v);
    if (s) return s;
  }
  return "";
}

function parseDateFromString(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;

  // Accept ISO-ish first.
  const iso = Date.parse(v);
  if (!Number.isNaN(iso)) {
    const d = new Date(iso);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  // Danish common formats: dd-mm-yyyy or dd/mm/yyyy
  const m = v.match(/^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\s*$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year = 2000 + year;
    if (!day || !month || !year) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }

  return null;
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null;
  // Excel serial date: days since 1899-12-30
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseExcelDateCell(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  if (typeof value === "number") return excelSerialToDate(value);
  if (typeof value === "string") return parseDateFromString(value);
  return null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseTimeFromString(value: string): { date: Date; text: string } | null {
  const v = value.trim();
  if (!v) return null;
  const m = v.match(/^\s*(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*[:.]\s*(\d{2}))?\s*$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  const date = new Date(Date.UTC(1970, 0, 1, hh, mm, 0));
  return { date, text: `${pad2(hh)}:${pad2(mm)}` };
}

function parseExcelTimeCell(value: unknown): { date: Date; text: string } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hh = value.getHours();
    const mm = value.getMinutes();
    const date = new Date(Date.UTC(1970, 0, 1, hh, mm, 0));
    return { date, text: `${pad2(hh)}:${pad2(mm)}` };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel time as fraction of day
    const totalMinutes = Math.round(value * 24 * 60);
    const hh = Math.floor(totalMinutes / 60) % 24;
    const mm = totalMinutes % 60;
    const date = new Date(Date.UTC(1970, 0, 1, hh, mm, 0));
    return { date, text: `${pad2(hh)}:${pad2(mm)}` };
  }
  if (typeof value === "string") return parseTimeFromString(value);
  return null;
}

function formatDateDa(date: Date | null): string {
  if (!date) return "";
  const d = pad2(date.getUTCDate());
  const m = pad2(date.getUTCMonth() + 1);
  const y = String(date.getUTCFullYear());
  return `${d}-${m}-${y}`;
}

function dedupeByCaseInsensitive(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v.trim());
  }
  return out;
}

export function normalizeStagedClubs(klubliste: Array<Record<string, unknown>>): StagedClub[] {
  const out: Array<{ clubNo: string; name: string }> = [];
  const seen = new Set<string>();

  for (const row of klubliste) {
    const clubNo =
      firstNonEmpty(row, ["KlubID", "Klub Id", "KlubNr", "Klubnr", "Id"]) ||
      firstNonEmptyByContains(row, "klubid") ||
      firstNonEmptyByContains(row, "klubnr");

    const name =
      firstNonEmpty(row, ["Forening", "Klubnavn", "Klub", "Navn", "Klub navn"]) ||
      firstNonEmptyByContains(row, "forening") ||
      firstNonEmptyByContains(row, "klubnavn") ||
      firstNonEmptyByContains(row, "navn");

    const normalizedNo = clubNo.trim();
    const normalizedName = name.trim();
    if (!normalizedNo && !normalizedName) continue;

    const key = normalizedNo
      ? `no:${normalizedNo.toLowerCase()}`
      : `name:${normalizedName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ clubNo: normalizedNo, name: normalizedName || normalizedNo });
  }

  // Stable sort: clubNo then name.
  out.sort((a, b) => (a.clubNo || a.name).localeCompare(b.clubNo || b.name, "da"));
  return out;
}

export function normalizeStagedTeams(holdliste: Array<Record<string, unknown>>): StagedTeam[] {
  const out: StagedTeam[] = [];
  const seen = new Set<string>();

  for (const row of holdliste) {
    const season =
      firstNonEmpty(row, ["Season", "Sæson", "Saeson"]) ||
      firstNonEmptyByContains(row, "sæson") ||
      firstNonEmptyByContains(row, "saeson") ||
      firstNonEmptyByContains(row, "season");

    const holdId =
      firstNonEmpty(row, ["HoldID", "Hold Id", "HoldId", "HoldNr", "Holdnr", "TeamID", "Team Id", "TeamId"]) ||
      firstNonEmptyByContains(row, "holdid") ||
      firstNonEmptyByContains(row, "teamid");

    const clubNo =
      firstNonEmpty(row, ["KlubID", "Klub Id", "KlubNr", "Klubnr", "Id"]) ||
      firstNonEmptyByContains(row, "klubid") ||
      firstNonEmptyByContains(row, "klubnr");
    const clubName =
      firstNonEmpty(row, ["Forening", "Klub", "Klubnavn", "Klub navn"]) ||
      firstNonEmptyByContains(row, "forening") ||
      firstNonEmptyByContains(row, "klubnavn") ||
      firstNonEmptyByContains(row, "klub");
    const league = firstNonEmpty(row, ["Liga", "Række", "Raekke", "Turnering"]) || firstNonEmptyByContains(row, "liga");
    const teamName =
      firstNonEmpty(row, ["Hold", "Holdnavn", "Hold navn", "Team"]) || firstNonEmptyByContains(row, "hold");

    const genderRaw =
      firstNonEmpty(row, ["Køn", "Koen", "Gender"]) ||
      firstNonEmptyByContains(row, "køn") ||
      firstNonEmptyByContains(row, "koen") ||
      firstNonEmptyByContains(row, "gender");

    const gender = normalizeGender(genderRaw);

    if (!clubNo && !clubName && !league && !teamName) continue;
    if ((!clubNo && !clubName) || !league || !teamName) continue;

    // Keep season in the dedupe key so we don't collapse name variants across seasons.
    const key = `${(clubNo || clubName).toLowerCase()}|${league.toLowerCase()}|${teamName.toLowerCase()}|${gender || ""}|${season.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      season: season.trim(),
      clubNo: clubNo.trim(),
      clubName: clubName.trim() || clubNo.trim(),
      league: league.trim(),
      teamName: teamName.trim(),
      holdId: holdId.trim(),
      gender,
    });
  }

  return out;
}

export function normalizeStagedMatches(kampe: Array<Record<string, unknown>>): StagedMatch[] {
  const out: StagedMatch[] = [];

  for (const row of kampe) {
    const dateCell =
      (Object.entries(row).find(([k]) => k.toLowerCase().trim() === "dato")?.[1] ??
        Object.entries(row).find(([k]) => k.toLowerCase().includes("dato"))?.[1] ??
        Object.entries(row).find(([k]) => k.toLowerCase().includes("date"))?.[1] ??
        null);

    const timeCell =
      (Object.entries(row).find(([k]) => k.toLowerCase().trim() === "tid")?.[1] ??
        Object.entries(row).find(([k]) => k.toLowerCase().includes("tid"))?.[1] ??
        Object.entries(row).find(([k]) => k.toLowerCase().includes("time"))?.[1] ??
        null);

    const date = parseExcelDateCell(dateCell);
    const timeParsed = parseExcelTimeCell(timeCell);

    const externalId =
      firstNonEmpty(row, ["KampID", "Kamp Id", "KampNr", "Kampnr", "Nr", "MatchID"]) ||
      firstNonEmptyByContains(row, "kampid") ||
      firstNonEmptyByContains(row, "kamp") ||
      null;

    const league = firstNonEmpty(row, ["Liga", "Række", "Raekke"]) || firstNonEmptyByContains(row, "liga");
    const stage = firstNonEmpty(row, ["Stadie", "Stage"]) || firstNonEmptyByContains(row, "stadie");
    const pool = firstNonEmpty(row, ["Pulje"]) || firstNonEmptyByContains(row, "pulje");
    const venue = firstNonEmpty(row, ["Sted", "Hal", "Spillested", "Bane"]) || firstNonEmptyByContains(row, "sted");
    const result = firstNonEmpty(row, ["Resultat", "Result", "Score"]) || firstNonEmptyByContains(row, "result");
    const genderRaw = firstNonEmpty(row, ["Køn", "Koen", "Gender"]) || firstNonEmptyByContains(row, "køn") || firstNonEmptyByContains(row, "koen") || firstNonEmptyByContains(row, "gender");
    const homeTeam = firstNonEmpty(row, ["Hjemmehold", "Hjemme", "Home"]) || firstNonEmptyByContains(row, "hjem");
    const awayTeam = firstNonEmpty(row, ["Udehold", "Ude", "Away"]) || firstNonEmptyByContains(row, "ude");

    const dommer1 =
      firstNonEmpty(row, ["Dommer1", "Dommer 1", "Dommer 1 Navn", "Dommer 1 navn"]) ||
      firstNonEmptyByPredicate(
        row,
        (k) => k.includes("dommer1") && !k.includes("id"),
      );
    const dommer1Id =
      firstNonEmpty(row, ["Dommer1_ID", "Dommer1ID", "Dommer1 Id", "Dommer 1 ID", "Dommer 1_ID"]) ||
      firstNonEmptyByPredicate(
        row,
        (k) => (k.includes("dommer1") && k.includes("id")) || k.includes("dommer1_id"),
      );
    const dommer2 =
      firstNonEmpty(row, ["Dommer2", "Dommer 2", "Dommer 2 Navn", "Dommer 2 navn"]) ||
      firstNonEmptyByPredicate(
        row,
        (k) => k.includes("dommer2") && !k.includes("id"),
      );
    const dommer2Id =
      firstNonEmpty(row, ["Dommer2_ID", "Dommer2ID", "Dommer2 Id", "Dommer 2 ID", "Dommer 2_ID"]) ||
      firstNonEmptyByPredicate(
        row,
        (k) => (k.includes("dommer2") && k.includes("id")) || k.includes("dommer2_id"),
      );

    const hasAny = Boolean(externalId || league || pool || venue || homeTeam || awayTeam || date || timeParsed);
    if (!hasAny) continue;

    out.push({
      externalId: externalId ? String(externalId).trim() : null,
      date,
      time: timeParsed?.date ?? null,
      dateText: formatDateDa(date),
      timeText: timeParsed?.text ?? "",
      venue: venue.trim(),
      result: result.trim(),
      dommer1: dommer1.trim(),
      dommer1Id: dommer1Id.trim(),
      dommer2: dommer2.trim(),
      dommer2Id: dommer2Id.trim(),
      gender: normalizeGender(genderRaw),
      league: league.trim(),
      stage: stage.trim(),
      pool: pool.trim(),
      homeTeam: homeTeam.trim(),
      awayTeam: awayTeam.trim(),
    });
  }

  return out;
}

export function validateStagedMatches(matches: StagedMatch[]): { ok: true } | { ok: false; message: string } {
  const problems: string[] = [];

  for (const m of matches) {
    if (m.timeText && !/^\d{2}:\d{2}$/.test(m.timeText)) {
      problems.push(`Tid skal være hh:mm for kamp: ${m.homeTeam || "?"} - ${m.awayTeam || "?"} (fandt '${m.timeText}')`);
    }
  }

  if (problems.length) {
    return { ok: false, message: problems.slice(0, 10).join("\n") };
  }

  return { ok: true };
}
