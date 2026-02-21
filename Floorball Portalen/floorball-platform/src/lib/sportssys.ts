import * as cheerio from "cheerio";
import { Gender, AgeGroup } from "@prisma/client";
import { getSportssysDivision } from "@/lib/ageGroups";

const BASE = "https://floorballresultater.sportssys.dk/tms/Turneringer-og-resultater";

type CookieJar = {
  cookieHeader: string;
};

function getSetCookie(headers: Headers): string[] {
  const anyHeaders = headers as unknown as { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie();
  }

  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}

function mergeCookies(existing: string, setCookies: string[]): string {
  const jar = new Map<string, string>();

  for (const part of existing.split(";")) {
    const trimmed = part.trim();
    if (!trimmed || !trimmed.includes("=")) continue;
    const [name, ...rest] = trimmed.split("=");
    jar.set(name, rest.join("="));
  }

  for (const cookie of setCookies) {
    const first = cookie.split(";")[0] ?? "";
    const trimmed = first.trim();
    if (!trimmed || !trimmed.includes("=")) continue;
    const [name, ...rest] = trimmed.split("=");
    jar.set(name, rest.join("="));
  }

  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function fetchHtml(
  url: string,
  init: RequestInit & { jar?: CookieJar } = {}
): Promise<{ html: string; jar: CookieJar }>
{
  const jar = init.jar ?? { cookieHeader: "" };
  const headers = new Headers(init.headers);
  headers.set(
    "user-agent",
    "FloorballPortalen/1.0 (+https://github.com/HockeySkytte/Floorball_Portalen)"
  );
  headers.set("accept", "text/html,application/xhtml+xml");
  if (jar.cookieHeader) headers.set("cookie", jar.cookieHeader);

  const res = await fetch(url, { ...init, headers, redirect: "follow", cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Sportssys fetch failed: ${res.status} ${res.statusText} (${url})`);
  }

  const setCookies = getSetCookie(res.headers);
  jar.cookieHeader = mergeCookies(jar.cookieHeader, setCookies);

  const html = await res.text();
  return { html, jar };
}

function parseIntStrict(v: string): number | null {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function parseIntLoose(v: string): number | null {
  const m = String(v ?? "").match(/(\d+)/);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

function parseGenderToSportssys(gender: Gender): "1" | "2" {
  // sportssys: 1 = Mand, 2 = Kvinde
  return gender === Gender.WOMEN ? "2" : "1";
}

function parseAgeGroupToSportssys(ageGroup: AgeGroup): string {
  const division = getSportssysDivision(ageGroup);
  if (!division) throw new Error(`Unsupported AgeGroup: ${String(ageGroup)}`);
  return division;
}

export function getCurrentSeasonLabel(now = new Date()): { startYear: number; label: string } {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const startYear = m >= 7 ? y : y - 1;
  return { startYear, label: `${startYear}/${startYear + 1}` };
}

export async function getSeasonOptions(): Promise<
  Array<{ value: string; startYear: number | null; label: string }>
> {
  const url = `${BASE}/Soegning.aspx`;
  const { html } = await fetchHtml(url);
  const $ = cheerio.load(html);

  const sel = $("select[name='ctl00$ContentPlaceHolder1$Soegning$ddlSeason']");
  if (sel.length === 0) return [];

  const options: Array<{ value: string; startYear: number | null; label: string }> = [];
  sel.find("option").each((_i, el) => {
    const value = $(el).attr("value") ?? "";
    if (!value) return;

    const text = $(el).text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (value === "0") {
      const current = getCurrentSeasonLabel();
      options.push({ value, startYear: current.startYear, label: `${current.startYear}-${current.startYear + 1}` });
      return;
    }

    const startYear = parseIntStrict(value) ?? parseIntStrict(text);
    if (!startYear) {
      options.push({ value, startYear: null, label: text });
      return;
    }

    options.push({ value, startYear, label: `${startYear}-${startYear + 1}` });
  });

  // Deduplicate by value
  const map = new Map<string, { value: string; startYear: number | null; label: string }>();
  for (const o of options) if (!map.has(o.value)) map.set(o.value, o);
  return Array.from(map.values());
}

export async function searchRows(params: {
  gender: Gender;
  ageGroup: AgeGroup;
  seasonValue: string;
}): Promise<Array<{ raekkeId: number; name: string }>> {
  const url = `${BASE}/Soegning.aspx`;
  const jar: CookieJar = { cookieHeader: "" };

  const first = await fetchHtml(url, { jar });
  const $ = cheerio.load(first.html);

  const viewState = $("input[name='__VIEWSTATE']").attr("value") ?? "";
  const viewStateGen = $("input[name='__VIEWSTATEGENERATOR']").attr("value") ?? "";
  const eventValidation = $("input[name='__EVENTVALIDATION']").attr("value") ?? "";

  if (!viewState || !eventValidation) {
    throw new Error("Could not find VIEWSTATE/EVENTVALIDATION on Soegning.aspx");
  }

  const form = new URLSearchParams();
  form.set("__EVENTTARGET", "");
  form.set("__EVENTARGUMENT", "");
  form.set("__LASTFOCUS", "");
  form.set("__VIEWSTATE", viewState);
  form.set("__VIEWSTATEGENERATOR", viewStateGen);
  form.set("__EVENTVALIDATION", eventValidation);
  form.set("ctl00$ContentPlaceHolder1$Soegning$Search", "rbRows");
  form.set("ctl00$ContentPlaceHolder1$Soegning$txtSelectedCenterSearchModule", "1");
  form.set("ctl00$ContentPlaceHolder1$Soegning$ddlGender", parseGenderToSportssys(params.gender));
  form.set(
    "ctl00$ContentPlaceHolder1$Soegning$ddlDivision",
    parseAgeGroupToSportssys(params.ageGroup)
  );
  form.set("ctl00$ContentPlaceHolder1$Soegning$ddlSeason", params.seasonValue);
  form.set("ctl00$ContentPlaceHolder1$Soegning$btnSearchRows", "Søg");

  const res = await fetchHtml(url, {
    jar,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const $$ = cheerio.load(res.html);

  const rows: Array<{ raekkeId: number; name: string }> = [];

  $$('a[href*="Pulje-Oversigt.aspx?RaekkeId="]').each((_i, el) => {
    const href = $$(el).attr("href") ?? "";
    const text = $$(el).text().trim();

    const m = href.match(/RaekkeId=(\d+)/);
    const raekkeId = m ? parseIntStrict(m[1]!) : null;
    if (!raekkeId) return;

    rows.push({ raekkeId, name: text || `Række ${raekkeId}` });
  });

  // Deduplicate by raekkeId
  const map = new Map<number, { raekkeId: number; name: string }>();
  for (const r of rows) {
    if (!map.has(r.raekkeId)) map.set(r.raekkeId, r);
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "da"));
}

export async function getPools(raekkeId: number): Promise<Array<{ puljeId: number; name: string }>> {
  const url = `${BASE}/Pulje-Oversigt.aspx?RaekkeId=${raekkeId}`;
  const { html } = await fetchHtml(url);
  const $ = cheerio.load(html);

  const pools: Array<{ puljeId: number; name: string }> = [];

  function normalizePoolName(title: string): string {
    const cleaned = title.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return cleaned;

    const commaIdx = cleaned.lastIndexOf(",");
    if (commaIdx !== -1) {
      const right = cleaned.slice(commaIdx + 1).trim();
      if (right) return right;
    }

    return cleaned;
  }

  $("h2, h3").each((_i, el) => {
    const title = $(el).text().trim();
    if (!title || !/pulje/i.test(title)) return;

    const section = $(el).nextUntil("h2, h3");
    const href = section
      .find('a[href*="Pulje-Stilling.aspx?PuljeId="]')
      .first()
      .attr("href");
    if (!href) return;

    const m = href.match(/PuljeId=(\d+)/i);
    const puljeId = m ? parseIntStrict(m[1]!) : null;
    if (!puljeId) return;

    pools.push({ puljeId, name: normalizePoolName(title) });
  });

  // Alternative layout: a table listing pool names directly (e.g. "ØST", "VEST").
  // Those rows often contain a single link per pool pointing to e.g. Pulje-Stilling / Pulje-Komplet-Kampprogram.
  $("table a[href*='PuljeId=']").each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!href) return;
    if (!text) return;
    if (/^(stilling|komplet\s+kampprogram|kampprogram|resultat(er)?)$/i.test(text)) return;

    const m = href.match(/PuljeId=(\d+)/i);
    const puljeId = m ? parseIntStrict(m[1]!) : null;
    if (!puljeId) return;

    pools.push({ puljeId, name: text });
  });

  const map = new Map<number, { puljeId: number; name: string }>();
  for (const p of pools) if (!map.has(p.puljeId)) map.set(p.puljeId, p);

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "da"));
}

function parseDateTime(text: string): Date | null {
  // Example: "18-09-25 kl. 21:00" or "18-09-25 kl. 21:00"
  const cleaned = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const m = cleaned.match(/(\d{2})-(\d{2})-(\d{2}).*?(\d{1,2}):(\d{2})/);
  if (!m) return null;

  const day = Number.parseInt(m[1]!, 10);
  const month = Number.parseInt(m[2]!, 10);
  const yy = Number.parseInt(m[3]!, 10);
  const hour = Number.parseInt(m[4]!, 10);
  const minute = Number.parseInt(m[5]!, 10);

  if ([day, month, yy, hour, minute].some((n) => !Number.isFinite(n))) return null;

  const year = 2000 + yy;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
}

function parseScore(text: string): { home: number; away: number; note: "SV" | null } | null {
  // Examples: "8 - 4", "8 - 4", "4 - 2 SV", "4 - 2 (SV)", "4-2 SV.".
  const cleaned = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const m = cleaned.match(/^(\d+)\s*-\s*(\d+)(?:\s*(?:\(?\s*(SV)\s*\)?\.?))?$/i);
  if (!m) return null;
  const home = Number.parseInt(m[1]!, 10);
  const away = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  const note = m[3] ? "SV" : null;
  return { home, away, note };
}

export async function getStandings(puljeId: number): Promise<
  Array<{
    rank: number;
    team: string;
    played: number | null;
    wins: number | null;
    draws: number | null;
    losses: number | null;
    goalsFor: number | null;
    goalsAgainst: number | null;
    points: number | null;
  }>
> {
  const url = `${BASE}/Pulje-Stilling.aspx?PuljeId=${puljeId}`;
  const { html } = await fetchHtml(url);
  const $ = cheerio.load(html);

  // Heuristic: find first table that contains the team names + points.
  const tables = $("table").toArray();
  for (const table of tables) {
    const rows = $(table).find("tr").toArray();
    const parsed: Array<{
      rank: number;
      team: string;
      played: number | null;
      wins: number | null;
      draws: number | null;
      losses: number | null;
      goalsFor: number | null;
      goalsAgainst: number | null;
      points: number | null;
    }> = [];

    for (const tr of rows) {
      const cells = $(tr)
        .find("td")
        .toArray()
        .map((td) => $(td).text().replace(/\u00a0/g, " ").trim())
        .filter((t) => t.length > 0);

      // Expected: [rank, team, played, wins, draws, losses, goalsFor, '-', goalsAgainst, points]
      if (cells.length < 8) continue;
      const rank = parseIntLoose(cells[0] ?? "");
      const team = cells[1] ?? "";
      if (!rank || !team) continue;

      // Some standings tables include a separate "NB" column between team and played.
      const hasNbCol = (cells[2] ?? "").trim().toUpperCase() === "NB";
      const off = hasNbCol ? 1 : 0;

      const played = parseIntLoose(cells[2 + off] ?? "");
      const wins = parseIntLoose(cells[3 + off] ?? "");
      const draws = parseIntLoose(cells[4 + off] ?? "");
      const losses = parseIntLoose(cells[5 + off] ?? "");

      let goalsFor: number | null = null;
      let goalsAgainst: number | null = null;

      // Sometimes goals are in a single cell like "127 - 64".
      const scoreCell = cells.find((c) => /\d+\s*-\s*\d+/.test(c)) ?? null;
      if (scoreCell) {
        const s = parseScore(scoreCell);
        goalsFor = s?.home ?? null;
        goalsAgainst = s?.away ?? null;
      } else {
        // Common layout: "67", "-", "41".
        const dashIdx = cells.findIndex((c) => c === "-");
        if (dashIdx > 0 && dashIdx + 1 < cells.length) {
          const gf = parseIntLoose(cells[dashIdx - 1] ?? "");
          const ga = parseIntLoose(cells[dashIdx + 1] ?? "");
          if (gf != null && ga != null) {
            goalsFor = gf;
            goalsAgainst = ga;
          }
        }

        // Fallback to expected indexes if still missing.
        if (goalsFor == null) goalsFor = parseIntLoose(cells[6 + off] ?? "");
        if (goalsAgainst == null && cells.length >= 9 + off) goalsAgainst = parseIntLoose(cells[8 + off] ?? "");
      }

      const points = parseIntLoose(cells[cells.length - 1] ?? "");

      parsed.push({
        rank,
        team,
        played: played ?? null,
        wins: wins ?? null,
        draws: draws ?? null,
        losses: losses ?? null,
        goalsFor: goalsFor ?? null,
        goalsAgainst: goalsAgainst ?? null,
        points: points ?? null,
      });
    }

    if (parsed.length >= 4) {
      return parsed.sort((a, b) => a.rank - b.rank);
    }
  }

  return [];
}

export async function getMatches(puljeId: number): Promise<
  Array<{
    kampId: number;
    matchNo: number | null;
    startAt: Date | null;
    homeTeam: string;
    awayTeam: string;
    venue: string | null;
    homeScore: number | null;
    awayScore: number | null;
    resultNote: "SV" | null;
  }>
> {
  const url = `${BASE}/Pulje-Komplet-Kampprogram.aspx?PuljeId=${puljeId}`;
  const { html } = await fetchHtml(url);
  const $ = cheerio.load(html);

  const matches: Array<{
    kampId: number;
    matchNo: number | null;
    startAt: Date | null;
    homeTeam: string;
    awayTeam: string;
    venue: string | null;
    homeScore: number | null;
    awayScore: number | null;
    resultNote: "SV" | null;
  }> = [];

  $("table tr").each((_i, tr) => {
    const tds = $(tr).find("td").toArray();
    if (tds.length < 6) return;

    const firstTd = tds[0]!;
    const link = $(firstTd).find('a[href*="Kamp-Information.aspx?KampId="]').first();
    const href = link.attr("href") ?? "";
    const kampMatch = href.match(/KampId=(\d+)/);
    const kampId = kampMatch ? parseIntStrict(kampMatch[1]!) : null;
    if (!kampId) return;

    const matchNo = parseIntStrict(link.text().trim() || $(firstTd).text().trim() || "") ?? null;

    const dateText = $(tds[1]!).text();
    const startAt = parseDateTime(dateText);

    const homeTeam = $(tds[2]!).text().trim();
    const awayTeam = $(tds[3]!).text().trim();
    const venue = $(tds[4]!).text().replace(/\u00a0/g, " ").trim() || null;

    const scoreText = $(tds[5]!).text();
    const score = parseScore(scoreText);

    // Some layouts may place "SV" outside the main score cell.
    const rowText = tds
      .map((td) => $(td).text())
      .join(" ")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const noteFromRow = /\bSV\b/i.test(rowText) ? "SV" : null;

    matches.push({
      kampId,
      matchNo,
      startAt,
      homeTeam,
      awayTeam,
      venue,
      homeScore: score?.home ?? null,
      awayScore: score?.away ?? null,
      resultNote: score?.note ?? noteFromRow,
    });
  });

  const map = new Map<number, (typeof matches)[number]>();
  for (const m of matches) map.set(m.kampId, m);

  return Array.from(map.values()).sort((a, b) => {
    const ta = a.startAt?.getTime() ?? 0;
    const tb = b.startAt?.getTime() ?? 0;
    return ta - tb;
  });
}
