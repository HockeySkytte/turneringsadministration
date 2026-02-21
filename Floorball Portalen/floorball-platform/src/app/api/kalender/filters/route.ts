import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

function toLabelSeason(startYear: number) {
	return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

function matchGender(text: string, gender: "MEN" | "WOMEN") {
	const t = text.toLowerCase();
	const womenHints = ["dame", "kvinde", "pige"];
	const menHints = ["herre", "mand", "drenge"];
	const isWomen = womenHints.some((h) => t.includes(h));
	const isMen = menHints.some((h) => t.includes(h));

	if (gender === "WOMEN") return isWomen;
	if (isMen) return true;
	return !isWomen;
}

function normalizeStoredGender(gender: unknown): "MEN" | "WOMEN" | null {
	const v = String(gender ?? "")
		.trim()
		.toUpperCase();
	if (v === "MEN" || v === "WOMEN") return v;
	return null;
}

function matchGenderForMatch(args: { text: string; storedGender: unknown }, gender: "MEN" | "WOMEN") {
	const stored = normalizeStoredGender(args.storedGender);
	if (stored) return stored === gender;
	return matchGender(args.text, gender);
}

function matchAge(text: string, age: string) {
	const t = text.toLowerCase();
	const normalized = age.trim().toUpperCase();
	if (!normalized) return true;

	if (/^U\d{1,2}$/.test(normalized)) {
		return t.includes(normalized.toLowerCase());
	}

	if (normalized === "SENIOR") {
		return !/\bu\s?\d{1,2}\b/i.test(t);
	}

	if (normalized === "OLDIES") {
		return t.includes("oldies") || t.includes("veteran") || t.includes("motion");
	}

	return true;
}

function uniqSorted(values: string[]) {
	return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).sort(
		(a, b) => a.localeCompare(b, "da-DK")
	);
}

export const dynamic = "force-dynamic";


type MatchRow = {
	id: string;
	date: Date | null;
	league: string | null;
	stage: string | null;
	pool: string | null;
	gender?: string | null;
	homeTeam: string;
	awayTeam: string;
};

function toSeasonStartYear(date: Date) {
	const year = date.getFullYear();
	const month = date.getMonth();
	return month >= 7 ? year : year - 1;
}

function makeMatchText(m: Pick<MatchRow, "league" | "pool">) {
	return `${m.league ?? ""} ${m.pool ?? ""}`.trim();
}

export async function GET(req: Request) {
	await ensureTurneringDomainTables();
	const url = new URL(req.url);

	const season = String(url.searchParams.get("season") ?? "").trim() || null;
	const holdIdParam = String(url.searchParams.get("holdId") ?? "").trim() || null;
	const clubIdParam = String(url.searchParams.get("clubId") ?? "").trim() || null;
	const gender = String(url.searchParams.get("gender") ?? "").trim().toUpperCase();
	const age = String(url.searchParams.get("age") ?? "").trim() || null;
	const leagueParam = String(url.searchParams.get("league") ?? "").trim() || null;
	const stageParam = String(url.searchParams.get("stage") ?? "").trim() || null;
	const poolParam = String(url.searchParams.get("pool") ?? "").trim() || null;
	const teamIdParam = String(url.searchParams.get("teamId") ?? "").trim() || null;
	const matchesMode = String(url.searchParams.get("matches") ?? "ALL").trim().toUpperCase();

	const seasonStartYear = season ? Number.parseInt(season, 10) : null;
	const seasonStart =
		seasonStartYear && Number.isFinite(seasonStartYear)
			? new Date(seasonStartYear, 7, 1)
			: null;
	const seasonEnd =
		seasonStartYear && Number.isFinite(seasonStartYear)
			? new Date(seasonStartYear + 1, 6, 31, 23, 59, 59, 999)
			: null;

	const [clubsAll, teamsAll, matchesAllRaw] = await Promise.all([
		prisma.taClub.findMany({
			orderBy: { name: "asc" },
			select: { id: true, name: true, clubNo: true },
		}),
		prisma.taTeam.findMany({
			orderBy: [{ league: "asc" }, { name: "asc" }],
			select: { id: true, name: true, league: true, clubId: true, holdId: true, gender: true },
		}),
		prisma.taMatch.findMany({
			select: {
				id: true,
				date: true,
				league: true,
				stage: true,
				pool: true,
				gender: true,
				homeTeam: true,
				awayTeam: true,
			},
		}),
	]);

	const teamsForHold = holdIdParam
		? teamsAll.filter((t) => String(t.holdId ?? "").trim() === holdIdParam)
		: null;
	const holdTeamNames = teamsForHold ? new Set(teamsForHold.map((t) => String(t.name ?? "").trim()).filter(Boolean)) : null;
	const matchesAll = (holdTeamNames
		? (matchesAllRaw as MatchRow[]).filter((m) => holdTeamNames.has(m.homeTeam) || holdTeamNames.has(m.awayTeam))
		: (matchesAllRaw as MatchRow[]));

	const holdClubIds = teamsForHold
		? new Set(teamsForHold.map((t) => String(t.clubId ?? "").trim()).filter(Boolean))
		: null;
	const clubsAllEffective = holdClubIds ? clubsAll.filter((c) => holdClubIds.has(c.id)) : clubsAll;
	const teamsAllEffective = teamsForHold ?? teamsAll;

	const teamNameToClubIds = new Map<string, Set<string>>();
	for (const t of teamsAllEffective) {
		const name = String(t.name ?? "").trim();
		if (!name) continue;
		const s = teamNameToClubIds.get(name) ?? new Set<string>();
		s.add(t.clubId);
		teamNameToClubIds.set(name, s);
	}

	const selectedTeam = teamIdParam
		? await prisma.taTeam.findUnique({ where: { id: teamIdParam }, select: { id: true, name: true } })
		: null;

	const clubLeagueSet = clubIdParam
		? new Set(
			teamsAllEffective
				.filter((t) => t.clubId === clubIdParam)
				.map((t) => String(t.league ?? "").trim())
				.filter(Boolean)
		)
		: null;

	function isClubMatch(m: MatchRow, clubId: string) {
		const homeClubs = teamNameToClubIds.get(m.homeTeam);
		const awayClubs = teamNameToClubIds.get(m.awayTeam);
		return Boolean(homeClubs?.has(clubId) || awayClubs?.has(clubId));
	}

	function isTeamMatch(m: MatchRow, teamName: string) {
		return m.homeTeam === teamName || m.awayTeam === teamName;
	}

	function passesFilters(m: MatchRow, exclude?: string) {
		const text = makeMatchText(m);

		if (exclude !== "season" && seasonStart && seasonEnd) {
			// If a season is selected, matches without a date must not leak into the results.
			if (!m.date) return false;
			if (m.date < seasonStart || m.date > seasonEnd) return false;
		}

		if (exclude !== "gender" && (gender === "MEN" || gender === "WOMEN")) {
			if (!matchGenderForMatch({ text, storedGender: m.gender }, gender as "MEN" | "WOMEN")) return false;
		}

		if (exclude !== "age" && age) {
			if (!matchAge(text, age)) return false;
		}

		if (exclude !== "stage" && stageParam) {
			const stageRaw = String(m.stage ?? "").trim();
			if (!stageRaw) return false;
			if (stageRaw !== stageParam) return false;
		}

		if (exclude !== "league" && leagueParam) {
			if ((m.league ?? "") !== leagueParam) return false;
		}

		if (exclude !== "pool" && poolParam) {
			if ((m.pool ?? "") !== poolParam) return false;
		}

		// Faceting semantics for club/team:
		// If a club is selected, we facet the other slicers by that club regardless of match mode.
		// (Match-mode still controls what the kalender page shows; this endpoint is about options.)
		const clubIdEffective = clubIdParam;
		const teamEffective = matchesMode === "TEAM" ? selectedTeam : null;

		// If a club is selected, only consider matches in leagues where the club has at least one team.
		// This makes Stage/Pool/etc. options reflect the club's leagues even when no league is selected yet.
		if (exclude !== "league" && clubIdEffective && clubLeagueSet) {
			const matchLeague = String(m.league ?? "").trim();
			if (!matchLeague || !clubLeagueSet.has(matchLeague)) return false;
		}

		if (exclude !== "club" && clubIdEffective) {
			if (!isClubMatch(m, clubIdEffective)) return false;
		}

		if (exclude !== "team" && teamEffective) {
			if (!isTeamMatch(m, teamEffective.name)) return false;
		}

		return true;
	}

	function facetMatches(exclude?: string) {
		return (matchesAll as MatchRow[]).filter((m) => passesFilters(m, exclude));
	}

	// Seasons derived from match dates. Floorball seasons typically start Aug 1.
	const seasonStartYears = Array.from(
		new Set(
			facetMatches("season")
				.map((m) => m.date)
				.filter((d): d is Date => Boolean(d) && d instanceof Date && !Number.isNaN(d.getTime()))
				.map((d) => toSeasonStartYear(d))
		)
	).sort((a, b) => b - a);

	const seasons = seasonStartYears.map((startYear) => ({
		startYear,
		label: toLabelSeason(startYear),
	}));

	const leagues = uniqSorted(
		facetMatches("league")
			.map((m) => String(m.league ?? "").trim())
			.filter(Boolean)
	);
	const leaguesFiltered = clubLeagueSet
		? leagues.filter((l) => clubLeagueSet.has(String(l).trim()))
		: leagues;

	const genderSet = new Set<string>();
	for (const m of facetMatches("gender")) {
		const text = makeMatchText(m);
		const stored = normalizeStoredGender(m.gender);
		if (stored) {
			genderSet.add(stored);
			continue;
		}
		// For older rows without stored gender, fall back to inference.
		if (matchGender(text, "WOMEN")) genderSet.add("WOMEN");
		else if (matchGender(text, "MEN")) genderSet.add("MEN");
	}
	const genders = ["MEN", "WOMEN"].filter((g) => genderSet.has(g));

	const pools = uniqSorted(
		facetMatches("pool")
			.map((m) => String(m.pool ?? "").trim())
			.filter(Boolean)
	);

	const stagesPresent = new Set<string>();
	for (const m of facetMatches("stage")) {
		const stageRaw = String(m.stage ?? "").trim();
		if (stageRaw) stagesPresent.add(stageRaw);
	}
	const stages = uniqSorted(Array.from(stagesPresent));

	const agesPresent = new Set<string>();
	for (const m of facetMatches("age")) {
		const text = makeMatchText(m);
		const u = text.match(/\bU\s?(\d{1,2})\b/i);
		if (u?.[1]) agesPresent.add(`U${u[1]}`);
		if (!/\bu\s?\d{1,2}\b/i.test(text)) agesPresent.add("SENIOR");
		if (/oldies|veteran|motion/i.test(text)) agesPresent.add("OLDIES");
	}
	const ages = uniqSorted(Array.from(agesPresent));

	// Clubs: any club appearing in matches (via team-name -> club mapping)
	const clubIdsPresent = new Set<string>();
	for (const m of facetMatches("club")) {
		for (const cid of teamNameToClubIds.get(m.homeTeam) ?? []) clubIdsPresent.add(cid);
		for (const cid of teamNameToClubIds.get(m.awayTeam) ?? []) clubIdsPresent.add(cid);
	}
	const clubs = clubsAllEffective.filter((c) => clubIdsPresent.has(c.id));

	// Teams: any team appearing in matches (by name + league where available), then map to TaTeam rows.
	const teamKeysPresent = new Set<string>();
	for (const m of facetMatches("team")) {
		const leagueKey = String(m.league ?? "").trim();
		teamKeysPresent.add(`${m.homeTeam}||${leagueKey}`);
		teamKeysPresent.add(`${m.awayTeam}||${leagueKey}`);
		// If match league is missing, allow any league for this team name.
		if (!leagueKey) {
			teamKeysPresent.add(`${m.homeTeam}||*`);
			teamKeysPresent.add(`${m.awayTeam}||*`);
		}
	}
	const teamsRaw = teamsAllEffective.filter((t) => {
		const exact = `${t.name}||${String(t.league ?? "").trim()}`;
		const anyLeague = `${t.name}||*`;
		if (!(teamKeysPresent.has(exact) || teamKeysPresent.has(anyLeague))) return false;
		if (clubIdParam && t.clubId !== clubIdParam) return false;
		if (gender === "MEN" || gender === "WOMEN") {
			const text = `${String(t.league ?? "").trim()} ${String(t.name ?? "").trim()}`.trim();
			if (!matchGenderForMatch({ text, storedGender: t.gender }, gender as "MEN" | "WOMEN")) return false;
		}
		return true;
	});

	// Dedupe teams by stable holdId (fallback to team id).
	const teamsSeen = new Set<string>();
	const teams: typeof teamsRaw = [];
	for (const t of teamsRaw) {
		const key = String(t.holdId ?? t.id).trim();
		if (!key) continue;
		if (teamsSeen.has(key)) continue;
		teamsSeen.add(key);
		teams.push(t);
	}

	return NextResponse.json({
		ok: true,
		seasons,
		clubs,
		genders,
		leagues: leaguesFiltered,
		stages,
		pools,
		teams,
		ages,
	});
}
