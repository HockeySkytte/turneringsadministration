import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTournamentAdmin } from "@/lib/auth";
import {
  normalizeStagedClubs,
  normalizeStagedMatches,
  normalizeStagedTeams,
  validateStagedMatches,
} from "@/lib/turnering/staged";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import crypto from "crypto";

function stableId(prefix: string, key: string): string {
  const hex = crypto.createHash("sha256").update(key).digest("hex");
  return `${prefix}_${hex.slice(0, 32)}`;
}

function canonicalKey(value: unknown): string {
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

function looseTeamKey(value: unknown): string {
  const key = canonicalKey(value);
  if (!key) return "";

  // Conservative stopwords: removes common organisation suffixes that often vary
  // between Kampprogram and Holdliste (e.g. "Benløse FC" vs "Benløse IF").
  // Only used in resolution when the resulting mapping is unique.
  const stop = new Set(["fc", "if", "ff", "ft", "fk", "floorball", "club", "klub"]);
  const tokens = key.split(" ").filter(Boolean);
  const kept = tokens.filter((t) => !stop.has(t));
  return kept.join(" ").trim();
}

function normalizeGenderLike(value: unknown): "MEN" | "WOMEN" | null {
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

function genderHint(text: string): "MEN" | "WOMEN" | null {
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

function equivalentLeagues(league: string): string[] {
  const l = String(league ?? "").trim();
  if (l === "Unihoc Floorball Liga") return ["Unihoc Floorball Liga", "Select Ligaen"];
  if (l === "Select Ligaen") return ["Select Ligaen", "Unihoc Floorball Liga"];
  return [l];
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function tableExists(): Promise<boolean> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT 1 AS ok FROM information_schema.tables WHERE table_name = 'ta_turnering_imports' LIMIT 1;`
  )) as Array<{ ok: number }>;
  return rows.length > 0;
}

export async function POST() {
  try {
    await requireTournamentAdmin();

    await ensureTurneringDomainTables();

    const exists = await tableExists();
    if (!exists) {
      return NextResponse.json({ ok: false, message: "Ingen import fundet endnu." }, { status: 400 });
    }

    const rows = (await prisma.$queryRawUnsafe(
      `SELECT id, created_at, filename, kampe, holdliste, klubliste
       FROM ta_turnering_imports
       ORDER BY created_at DESC
       LIMIT 1;`
    )) as Array<{
      id: string;
      created_at: Date;
      filename: string | null;
      kampe: unknown;
      holdliste: unknown;
      klubliste: unknown;
    }>;

    const latest = rows[0];
    if (!latest) {
      return NextResponse.json({ ok: false, message: "Ingen import fundet endnu." }, { status: 400 });
    }

    const kampe = Array.isArray(latest.kampe)
      ? (latest.kampe as Array<Record<string, unknown>>)
      : [];
    const holdliste = Array.isArray(latest.holdliste)
      ? (latest.holdliste as Array<Record<string, unknown>>)
      : [];
    const klubliste = Array.isArray(latest.klubliste)
      ? (latest.klubliste as Array<Record<string, unknown>>)
      : [];

    const clubs = normalizeStagedClubs(klubliste);
    const teams = normalizeStagedTeams(holdliste);
    const matches = normalizeStagedMatches(kampe);

    const teamGenderCandidatesByLeagueAndName = new Map<string, Set<"MEN" | "WOMEN">>();
    for (const t of teams) {
      const g = normalizeGenderLike((t as { gender?: unknown }).gender);
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

    function inferMatchGender(m: { gender: string; league: string; pool: string; homeTeam: string; awayTeam: string }): "MEN" | "WOMEN" | null {
      const direct = normalizeGenderLike(m.gender);
      if (direct) return direct;

      const league = String(m.league ?? "").trim();
      const leagueKeys = league ? equivalentLeagues(league) : [""];
      const homeKey = canonicalKey(m.homeTeam);
      const awayKey = canonicalKey(m.awayTeam);

      const candidates: Array<"MEN" | "WOMEN"> = [];
      for (const l of leagueKeys) {
        const lk = l.toLocaleLowerCase("da-DK");
        if (homeKey) {
          const hgSet = teamGenderCandidatesByLeagueAndName.get(`${lk}|${homeKey}`);
          if (hgSet && hgSet.size === 1) {
            const only = hgSet.values().next().value as ("MEN" | "WOMEN" | undefined);
            if (only) candidates.push(only);
          }
        }
        if (awayKey) {
          const agSet = teamGenderCandidatesByLeagueAndName.get(`${lk}|${awayKey}`);
          if (agSet && agSet.size === 1) {
            const only = agSet.values().next().value as ("MEN" | "WOMEN" | undefined);
            if (only) candidates.push(only);
          }
        }
      }

      if (candidates.length) {
        const unique = Array.from(new Set(candidates));
        if (unique.length === 1) return unique[0] ?? null;
      }

      return genderHint(`${m.league ?? ""} ${m.pool ?? ""}`.trim());
    }

    // Ensure we have clubs for all teams too (Klubliste can be incomplete).
    const clubKeyToRecord = new Map<string, { id: string; clubNo: string; name: string }>();

    function addClub(clubNo: string, name: string) {
      const no = clubNo.trim();
      const nm = name.trim();
      const key = no ? `no:${no.toLowerCase()}` : `name:${nm.toLowerCase()}`;
      if (clubKeyToRecord.has(key)) return;
      const id = stableId("club", no ? `no:${no.toLowerCase()}` : `name:${nm.toLowerCase()}`);
      clubKeyToRecord.set(key, { id, clubNo: no, name: nm || no });
    }

    for (const c of clubs) addClub(c.clubNo, c.name);
    for (const t of teams) addClub(t.clubNo, t.clubName);

    const clubRecords = Array.from(clubKeyToRecord.values());
    const clubIdByNo = new Map<string, string>();
    const clubIdByName = new Map<string, string>();
    for (const c of clubRecords) {
      if (c.clubNo) clubIdByNo.set(c.clubNo.toLowerCase(), c.id);
      if (c.name) clubIdByName.set(c.name.toLowerCase(), c.id);
    }

    const matchValidation = validateStagedMatches(matches);
    if (matchValidation.ok !== true) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Kan ikke uploade til databasen pga. fejl i Kampprogram:\n" +
            matchValidation.message,
        },
        { status: 400 }
      );
    }

    // Deduplicate to avoid crashing on duplicate rows in Excel.
    // IMPORTANT: When HoldID is present, the stable identity is (HoldID + Liga).
    // Holdliste can legitimately contain multiple rows per team across e.g. stage/pool/season.
    const uniqueTeamById = new Map<
      string,
      {
        id: string;
        clubId: string;
        league: string;
        name: string;
        holdId: string | null;
        gender: "MEN" | "WOMEN" | null;
        seasonStartYear: number | null;
      }
    >();

    function normStr(v: string) {
      return String(v ?? "").trim();
    }

    function parseSeasonStartYear(value: unknown): number | null {
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
      const gender = normalizeGenderLike((t as { gender?: unknown }).gender);
      const seasonStartYear = parseSeasonStartYear((t as { season?: unknown }).season);

      const holdKey = normStr(String(t.holdId ?? ""));
      const idKey = holdKey
        ? `hold:${holdKey.toLowerCase()}|league:${league.toLowerCase()}`
        : `club:${normStr(t.clubNo || t.clubName).toLowerCase()}|league:${league.toLowerCase()}|name:${name.toLowerCase()}`;

      const id = stableId("team", idKey);
      const next = {
        id,
        clubId,
        league,
        name,
        holdId: holdKey ? holdKey : null,
        gender,
        seasonStartYear,
      };

      const prev = uniqueTeamById.get(id);
      if (!prev) {
        uniqueTeamById.set(id, next);
        continue;
      }

      // Merge duplicates deterministically:
      // - Prefer keeping holdId if one variant has it
      // - Prefer the name from the latest season when available
      // - Prefer a "better" (longer) non-empty name
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

    // HoldID mapping MUST be unambiguous.
    // We prefer (league + gender + teamName), and only fall back to (league + teamName)
    // if it maps to exactly one HoldID.
    const holdIdCandidatesByLeagueGenderAndName = new Map<string, Set<string>>();
    const holdIdCandidatesByLeagueAndName = new Map<string, Set<string>>();
    const holdIdCandidatesByLeagueGenderAndLooseName = new Map<string, Set<string>>();
    const holdIdCandidatesByLeagueAndLooseName = new Map<string, Set<string>>();

    function addCandidate(map: Map<string, Set<string>>, key: string, holdId: string) {
      const prev = map.get(key);
      if (prev) {
        prev.add(holdId);
      } else {
        map.set(key, new Set([holdId]));
      }
    }

    for (const t of uniqueTeamById.values()) {
      const league = normStr(t.league);
      const nameKey = canonicalKey(t.name);
      const looseKey = looseTeamKey(t.name);
      const holdId = normStr(t.holdId ?? "");
      if (!league || !nameKey || !holdId) continue;

      for (const l of equivalentLeagues(league)) {
        const lk = l.toLocaleLowerCase("da-DK");
        addCandidate(holdIdCandidatesByLeagueAndName, `${lk}|${nameKey}`, holdId);

        if (looseKey) {
          addCandidate(holdIdCandidatesByLeagueAndLooseName, `${lk}|${looseKey}`, holdId);
        }

        if (t.gender) {
          addCandidate(holdIdCandidatesByLeagueGenderAndName, `${lk}|${t.gender}|${nameKey}`, holdId);

          if (looseKey) {
            addCandidate(holdIdCandidatesByLeagueGenderAndLooseName, `${lk}|${t.gender}|${looseKey}`, holdId);
          }
        }
      }
    }

    const holdIdByLeagueGenderAndName = new Map<string, string>();
    for (const [k, set] of holdIdCandidatesByLeagueGenderAndName) {
      if (set.size === 1) holdIdByLeagueGenderAndName.set(k, Array.from(set)[0] ?? "");
    }

    const holdIdByLeagueAndNameUnique = new Map<string, string>();
    for (const [k, set] of holdIdCandidatesByLeagueAndName) {
      if (set.size === 1) holdIdByLeagueAndNameUnique.set(k, Array.from(set)[0] ?? "");
    }

    const holdIdByLeagueGenderAndLooseName = new Map<string, string>();
    for (const [k, set] of holdIdCandidatesByLeagueGenderAndLooseName) {
      if (set.size === 1) holdIdByLeagueGenderAndLooseName.set(k, Array.from(set)[0] ?? "");
    }

    const holdIdByLeagueAndLooseNameUnique = new Map<string, string>();
    for (const [k, set] of holdIdCandidatesByLeagueAndLooseName) {
      if (set.size === 1) holdIdByLeagueAndLooseNameUnique.set(k, Array.from(set)[0] ?? "");
    }

    function resolveHoldIdForSide(args: {
      league: string;
      gender: "MEN" | "WOMEN" | null;
      teamName: string;
    }): string | null {
      const league = String(args.league ?? "").trim();
      const key = canonicalKey(args.teamName);
      if (!league || !key) return null;

      const looseKey = looseTeamKey(args.teamName);

      for (const l of equivalentLeagues(league)) {
        const lk = l.toLocaleLowerCase("da-DK");
        if (args.gender) {
          const exact = holdIdByLeagueGenderAndName.get(`${lk}|${args.gender}|${key}`);
          if (exact) return exact;
        }

        const unique = holdIdByLeagueAndNameUnique.get(`${lk}|${key}`);
        if (unique) return unique;

        // Fallback: ignore common suffix tokens (FC/IF/etc) but only when still unique.
        if (looseKey) {
          if (args.gender) {
            const looseExact = holdIdByLeagueGenderAndLooseName.get(`${lk}|${args.gender}|${looseKey}`);
            if (looseExact) return looseExact;
          }

          const looseUnique = holdIdByLeagueAndLooseNameUnique.get(`${lk}|${looseKey}`);
          if (looseUnique) return looseUnique;
        }
      }

      return null;
    }

    const uniqueMatchById = new Map<
      string,
      {
        id: string;
        externalId: string | null;
        date: Date | null;
        time: Date | null;
        venue: string | null;
        result: string | null;
        dommer1: string | null;
        dommer1Id: string | null;
        dommer2: string | null;
        dommer2Id: string | null;
        gender: string | null;
        league: string | null;
        stage: string | null;
        pool: string | null;
        homeTeam: string;
        homeHoldId: string | null;
        awayTeam: string;
        awayHoldId: string | null;
        sourceImportId: string;
      }
    >();

    for (const m of matches) {
      const matchGender = inferMatchGender(m) || null;
      const id = stableId(
        "match",
        (m.externalId ? `id:${m.externalId.toLowerCase()}` : "") +
          `|d:${m.date ? m.date.toISOString().slice(0, 10) : ""}|t:${m.timeText}|h:${m.homeTeam.toLowerCase()}|a:${
            m.awayTeam.toLowerCase()
          }|l:${m.league.toLowerCase()}`
      );

      uniqueMatchById.set(id, {
        id,
        externalId: m.externalId,
        date: m.date,
        time: m.time,
        venue: m.venue || null,
        result: m.result || null,
        dommer1: m.dommer1 ? m.dommer1 : null,
        dommer1Id: m.dommer1Id ? m.dommer1Id : null,
        dommer2: m.dommer2 ? m.dommer2 : null,
        dommer2Id: m.dommer2Id ? m.dommer2Id : null,
        gender: matchGender,
        league: m.league || null,
        stage: m.stage || null,
        pool: m.pool || null,
        homeTeam: m.homeTeam,
        homeHoldId: resolveHoldIdForSide({
          league: String(m.league ?? ""),
          gender: matchGender,
          teamName: String(m.homeTeam ?? ""),
        }),
        awayTeam: m.awayTeam,
        awayHoldId: resolveHoldIdForSide({
          league: String(m.league ?? ""),
          gender: matchGender,
          teamName: String(m.awayTeam ?? ""),
        }),
        sourceImportId: latest.id,
      });
    }

    const teamData = Array.from(uniqueTeamById.values());
    const matchData = Array.from(uniqueMatchById.values());

    const holdIdResolution = (() => {
      let homeResolved = 0;
      let awayResolved = 0;
      let bothResolved = 0;
      let anyResolved = 0;
      for (const m of matchData) {
        const home = String(m.homeHoldId ?? "").trim();
        const away = String(m.awayHoldId ?? "").trim();
        const h = Boolean(home);
        const a = Boolean(away);
        if (h) homeResolved += 1;
        if (a) awayResolved += 1;
        if (h && a) bothResolved += 1;
        if (h || a) anyResolved += 1;
      }
      return {
        matchesTotal: matchData.length,
        homeResolved,
        awayResolved,
        bothResolved,
        anyResolved,
      };
    })();

    await prisma.$transaction(async (tx) => {
      await tx.taMatch.deleteMany();
      await tx.taTeam.deleteMany();
      await tx.taClub.deleteMany();

      if (clubRecords.length) {
        await tx.taClub.createMany({ data: clubRecords, skipDuplicates: true });
      }

      if (teamData.length) {
        await tx.taTeam.createMany({ data: teamData, skipDuplicates: true });
      }

      if (matchData.length) {
        await tx.taMatch.createMany({ data: matchData, skipDuplicates: true });
      }
    });

    return NextResponse.json({
      ok: true,
      published: {
        importId: latest.id,
        filename: latest.filename,
        holdIdResolution,
        counts: {
          klubber: clubRecords.length,
          hold: teams.length,
          kampe: matches.length,
        },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "NOT_AUTHENTICATED") {
      return NextResponse.json({ ok: false, message: "Du er ikke logget ind." }, { status: 401 });
    }
    if (message === "NOT_APPROVED") {
      return NextResponse.json({ ok: false, message: "Din bruger er ikke godkendt endnu." }, { status: 403 });
    }
    if (message === "NOT_AUTHORIZED") {
      return NextResponse.json({ ok: false, message: "Du har ikke adgang til at overskrive databasen." }, { status: 403 });
    }

    console.error("/api/turnering/publish-latest failed", err);
    return NextResponse.json(
      {
        ok: false,
        message: "Kunne ikke overskrive databasen. Se server-log for detaljer.",
        debug: message,
      },
      { status: 500 }
    );
  }
}
