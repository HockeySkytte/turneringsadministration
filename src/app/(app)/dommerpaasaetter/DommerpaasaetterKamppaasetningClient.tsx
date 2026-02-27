"use client";

import { useEffect, useMemo, useState } from "react";

type RefereeOption = {
  refereeNo: string;
  name: string;
  partner1: string | null;
  partner2: string | null;
  partner3: string | null;
  eligibleLeagues: any;
  lat: number | null;
  lng: number | null;
};

type MatchRow = {
  id: string;
  date: string | null;
  time: string | null;
  league: string | null;
  gender: string | null;
  stage: string | null;
  pool: string | null;
  venue: string | null;
  venueKey: string | null;
  venueLat: number | null;
  venueLng: number | null;
  homeTeam: string;
  awayTeam: string;

  dommer1Id: string | null;
  dommer1: string | null;
  dommer1Status: string | null;

  dommer2Id: string | null;
  dommer2: string | null;
  dommer2Status: string | null;
};

type AvailabilitySegment = {
  refereeNo: string;
  entryDate: string; // YYYY-MM-DD
  status: string;
  startTime: string | null;
  endTime: string | null;
};

type AvailabilityRule = {
  refereeNo: string;
  weekday: number; // 0=Mandag ... 6=Søndag
  status: string;
  startTime: string | null;
  endTime: string | null;
};

type LoadResponse = {
  matches: MatchRow[];
  referees: RefereeOption[];
  leagues: string[];
  genders: Array<string | null>;
  availabilitySegments: AvailabilitySegment[];
  availabilityRules: AvailabilityRule[];
};

function fmtDate(dateIso: string | null) {
  if (!dateIso) return "";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return dateIso;
  return d.toLocaleDateString("da-DK");
}

function fmtTime(timeIso: string | null) {
  if (!timeIso) return "";
  const d = new Date(timeIso);
  if (Number.isNaN(d.getTime())) return timeIso;
  return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

function statusBadge(status: string | null) {
  const s = (status ?? "").toUpperCase();
  if (!s) return null;

  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold";
  if (s === "PENDING") return <span className={`${base} bg-zinc-200 text-zinc-800`}>Afventer</span>;
  if (s === "ACCEPTED") return <span className={`${base} bg-green-100 text-green-800`}>Godkendt</span>;
  if (s === "DECLINED") return <span className={`${base} bg-red-100 text-red-800`}>Afvist</span>;
  if (s === "WITHDRAWN") return <span className={`${base} bg-orange-100 text-orange-800`}>Afmeldt</span>;
  return <span className={`${base} bg-zinc-100 text-zinc-700`}>{s}</span>;
}

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

function parseEligibleLeagues(raw: any): Array<{ league: string; gender: string | null }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ league: string; gender: string | null }> = [];
  for (const item of raw) {
    const league = norm(item?.league);
    if (!league) continue;
    const gender = norm(item?.gender) || null;
    out.push({ league, gender });
  }
  return out;
}

function toTimeMinutes(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function weekdayFromDateKey(dateKey: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  const js = d.getUTCDay(); // 0=Sun..6=Sat
  return (js + 6) % 7; // 0=Mon..6=Sun
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function DommerpaasaetterKamppaasetningClient() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [referees, setReferees] = useState<RefereeOption[]>([]);
  const [leagues, setLeagues] = useState<string[]>([]);
  const [genders, setGenders] = useState<Array<string | null>>([]);
  const [availabilitySegments, setAvailabilitySegments] = useState<AvailabilitySegment[]>([]);
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRule[]>([]);

  const [league, setLeague] = useState<string>("ALL");
  const [gender, setGender] = useState<string>("ALL");
  const [onlyIssues, setOnlyIssues] = useState<boolean>(false);

  const [filterAvailability, setFilterAvailability] = useState<boolean>(false);
  const [filterLeagueMatch, setFilterLeagueMatch] = useState<boolean>(false);
  const [maxDistanceKm, setMaxDistanceKm] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refereeOptions = useMemo(() => {
    return [
      {
        refereeNo: "",
        name: "—",
        partner1: null,
        partner2: null,
        partner3: null,
        eligibleLeagues: null,
        lat: null,
        lng: null,
      },
      ...referees,
    ];
  }, [referees]);

  const refereeByNo = useMemo(() => new Map(referees.map((r) => [r.refereeNo, r] as const)), [referees]);

  const segmentsByRefAndDate = useMemo(() => {
    const byRef = new Map<string, Map<string, AvailabilitySegment[]>>();
    for (const s of availabilitySegments) {
      const byDate = byRef.get(s.refereeNo) ?? new Map<string, AvailabilitySegment[]>();
      const list = byDate.get(s.entryDate) ?? [];
      list.push(s);
      byDate.set(s.entryDate, list);
      byRef.set(s.refereeNo, byDate);
    }
    return byRef;
  }, [availabilitySegments]);

  const rulesByRefAndWeekday = useMemo(() => {
    const byRef = new Map<string, Map<number, AvailabilityRule[]>>();
    for (const r of availabilityRules) {
      const byW = byRef.get(r.refereeNo) ?? new Map<number, AvailabilityRule[]>();
      const list = byW.get(r.weekday) ?? [];
      list.push(r);
      byW.set(r.weekday, list);
      byRef.set(r.refereeNo, byW);
    }
    return byRef;
  }, [availabilityRules]);

  const maxDistanceKmNumber = useMemo(() => {
    const n = Number.parseFloat(maxDistanceKm);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [maxDistanceKm]);

  function isIssueMatch(m: MatchRow): boolean {
    const s1 = (m.dommer1Status ?? "").toUpperCase();
    const s2 = (m.dommer2Status ?? "").toUpperCase();
    return s1 === "DECLINED" || s1 === "WITHDRAWN" || s2 === "DECLINED" || s2 === "WITHDRAWN";
  }

  function isAvailableForMatch(refereeNo: string, m: MatchRow): boolean {
    if (!m.date || !m.time) return true;

    const dateKey = m.date.slice(0, 10);
    const timeMin = toTimeMinutes(m.time);
    if (timeMin === null) return true;

    const explicit = segmentsByRefAndDate.get(refereeNo)?.get(dateKey) ?? [];
    const effective: Array<{ status: string; startTime: string | null; endTime: string | null }> = [];

    if (explicit.length) {
      effective.push(...explicit);
    } else {
      const wd = weekdayFromDateKey(dateKey);
      if (wd !== null) {
        const rules = rulesByRefAndWeekday.get(refereeNo)?.get(wd) ?? [];
        effective.push(...rules);
      }
    }

    // New semantics: a referee is available unless explicitly marked UNAVAILABLE.
    if (!effective.length) return true;

    const blocks = (seg: { startTime: string | null; endTime: string | null }, t: number) => {
      const s = toTimeMinutes(seg.startTime);
      const e = toTimeMinutes(seg.endTime);
      if (s === null || e === null) return true; // whole day
      return t >= s && t < e;
    };

    const hasWholeDayUnavailable = effective.some((s) => (s.status ?? "").toUpperCase() === "UNAVAILABLE" && !s.startTime && !s.endTime);
    if (hasWholeDayUnavailable) return false;

    const hasUnavailableAtTime = effective.some(
      (s) => (s.status ?? "").toUpperCase() === "UNAVAILABLE" && blocks(s, timeMin)
    );
    if (hasUnavailableAtTime) return false;

    return true;
  }

  function leagueMatches(ref: RefereeOption, m: MatchRow): boolean {
    const matchLeague = norm(m.league);
    if (!matchLeague) return true;

    const eligible = parseEligibleLeagues(ref.eligibleLeagues);
    if (!eligible.length) return false;

    const matchGender = norm(m.gender) || null;
    return eligible.some((e) => {
      if (norm(e.league) !== matchLeague) return false;
      if (!e.gender) return true;
      if (!matchGender) return true;
      return norm(e.gender) === matchGender;
    });
  }

  function distanceMatches(ref: RefereeOption, m: MatchRow): boolean {
    if (!maxDistanceKmNumber) return true;
    if (ref.lat == null || ref.lng == null) return false;
    if (m.venueLat == null || m.venueLng == null) return false;
    const km = haversineKm(ref.lat, ref.lng, m.venueLat, m.venueLng);
    return km <= maxDistanceKmNumber;
  }

  function passesDropdownFilters(ref: RefereeOption, m: MatchRow): boolean {
    if (filterLeagueMatch && !leagueMatches(ref, m)) return false;
    if (filterAvailability && !isAvailableForMatch(ref.refereeNo, m)) return false;
    if (!distanceMatches(ref, m)) return false;
    return true;
  }

  function partnerNosFor(refereeNo: string | null): string[] {
    if (!refereeNo) return [];
    const base = refereeByNo.get(refereeNo);
    if (!base) return [];
    return [norm(base.partner1), norm(base.partner2), norm(base.partner3)].filter(Boolean);
  }

  function buildOptionsForSlot(m: MatchRow, slot: 1 | 2): RefereeOption[] {
    const currentNo = slot === 1 ? m.dommer1Id : m.dommer2Id;
    const otherNo = slot === 1 ? m.dommer2Id : m.dommer1Id;
    const baseNoForPartners = otherNo;

    const partnerNos = partnerNosFor(baseNoForPartners);

    const currentRef = currentNo ? refereeByNo.get(currentNo) ?? null : null;

    const filtered = referees.filter((r) => {
      if (otherNo && r.refereeNo === otherNo) return false;
      return passesDropdownFilters(r, m);
    });

    const partnerRefs: RefereeOption[] = [];
    for (const pNo of partnerNos) {
      if (otherNo && pNo === otherNo) continue;
      const r = refereeByNo.get(pNo);
      if (!r) continue;
      if (!passesDropdownFilters(r, m)) continue;
      if (!partnerRefs.some((x) => x.refereeNo === r.refereeNo)) partnerRefs.push(r);
    }

    const used = new Set<string>();

    const out: RefereeOption[] = [];
    out.push(refereeOptions[0]);

    if (currentRef && currentRef.refereeNo) {
      out.push(currentRef);
      used.add(currentRef.refereeNo);
    }

    for (const r of partnerRefs) {
      if (used.has(r.refereeNo)) continue;
      out.push(r);
      used.add(r.refereeNo);
    }

    for (const r of filtered) {
      if (used.has(r.refereeNo)) continue;
      out.push(r);
      used.add(r.refereeNo);
    }

    return out;
  }

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (league !== "ALL") params.set("league", league);
      if (gender !== "ALL") params.set("gender", gender);

      const res = await fetch(`/api/dommerpaasaetter/kamppaasetning?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      const data = (await res.json()) as LoadResponse & { message?: string };
      if (!res.ok) throw new Error(data.message || "Kunne ikke hente kampe.");

      setMatches(data.matches);
      setReferees(data.referees);
      setLeagues(data.leagues);
      setGenders(data.genders);
      setAvailabilitySegments((data as any).availabilitySegments ?? []);
      setAvailabilityRules((data as any).availabilityRules ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, gender]);

  async function saveMatch(matchId: string, next: { dommer1Id: string | null; dommer2Id: string | null }) {
    setSavingMatchId(matchId);
    setError(null);

    try {
      const res = await fetch(`/api/dommerpaasaetter/kamppaasetning/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(next),
      });

      const data = (await res.json()) as { match?: MatchRow; message?: string };
      if (!res.ok) throw new Error(data.message || "Kunne ikke gemme ændring.");
      if (!data.match) throw new Error("Mangler match i svar.");

      setMatches((prev) => prev.map((m) => (m.id === matchId ? data.match! : m)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setSavingMatchId(null);
    }
  }

  return (
    <div>
      <div className="font-semibold text-zinc-900">Kamppåsætning</div>
      <div className="mt-1 text-zinc-600">
        Viser kun kampe med kampdato efter i dag. Vælg Dommer1/Dommer2 for at påsætte dommere.
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-zinc-700">Liga</label>
          <select
            value={league}
            onChange={(e) => setLeague(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
          >
            <option value="ALL">Alle</option>
            {leagues.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-700">Køn</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
          >
            <option value="ALL">Alle</option>
            {genders.map((g) => {
              const key = g ?? "(tom)";
              const val = g ?? "__NULL__";
              return (
                <option key={key} value={val}>
                  {g ?? "(tom)"}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-700">Kampe</label>
          <select
            value={onlyIssues ? "ISSUES" : "ALL"}
            onChange={(e) => setOnlyIssues(e.target.value === "ISSUES")}
            className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
          >
            <option value="ALL">Alle</option>
            <option value="ISSUES">Afmeldte/Afviste</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-zinc-700">Dropdown filtre</label>
          <label className="flex items-center gap-2 text-sm text-zinc-900">
            <input
              type="checkbox"
              checked={filterAvailability}
              onChange={(e) => setFilterAvailability(e.target.checked)}
            />
            Tilgængelighed
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-900">
            <input
              type="checkbox"
              checked={filterLeagueMatch}
              onChange={(e) => setFilterLeagueMatch(e.target.checked)}
            />
            Liga match
          </label>
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-700">Max afstand (km)</label>
          <input
            value={maxDistanceKm}
            onChange={(e) => setMaxDistanceKm(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-[140px] rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
          />
        </div>

        {loading ? <div className="text-sm text-zinc-600">Henter…</div> : null}
        {savingMatchId ? <div className="text-sm text-zinc-600">Gemmer…</div> : null}
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-700">
            <tr>
              <th className="px-3 py-2">Dato</th>
              <th className="px-3 py-2">Tid</th>
              <th className="px-3 py-2">Liga</th>
              <th className="px-3 py-2">Køn</th>
              <th className="px-3 py-2">Sted</th>
              <th className="px-3 py-2">Kamp</th>
              <th className="px-3 py-2">Dommer1</th>
              <th className="px-3 py-2">Dommer2</th>
            </tr>
          </thead>
          <tbody>
            {matches.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-zinc-600" colSpan={8}>
                  Ingen kampe fundet.
                </td>
              </tr>
            ) : null}

            {(onlyIssues ? matches.filter(isIssueMatch) : matches).map((m) => {
              const isSaving = savingMatchId === m.id;
              const issue = isIssueMatch(m);

              return (
                <tr key={m.id} className={"border-t border-zinc-200 " + (issue ? "bg-red-50" : "") }>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDate(m.date)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtTime(m.time)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{m.league ?? ""}</td>
                  <td className="whitespace-nowrap px-3 py-2">{m.gender ?? ""}</td>
                  <td className="min-w-[180px] px-3 py-2">{m.venue ?? ""}</td>
                  <td className="min-w-[240px] px-3 py-2">
                    <div className="font-semibold text-zinc-900">
                      {m.homeTeam} – {m.awayTeam}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-600">
                      {(m.stage ?? "").trim() ? `${m.stage} ` : ""}
                      {(m.pool ?? "").trim() ? `(${m.pool})` : ""}
                    </div>
                  </td>

                  <td className="min-w-[220px] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <select
                        disabled={isSaving}
                        value={m.dommer1Id ?? ""}
                        onChange={(e) =>
                          void saveMatch(m.id, {
                            dommer1Id: e.target.value ? e.target.value : null,
                            dommer2Id: m.dommer2Id,
                          })
                        }
                        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                      >
                        {buildOptionsForSlot(m, 1).map((r) => (
                          <option key={r.refereeNo || "__none1"} value={r.refereeNo}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      {statusBadge(m.dommer1Status)}
                    </div>
                  </td>

                  <td className="min-w-[220px] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <select
                        disabled={isSaving}
                        value={m.dommer2Id ?? ""}
                        onChange={(e) =>
                          void saveMatch(m.id, {
                            dommer1Id: m.dommer1Id,
                            dommer2Id: e.target.value ? e.target.value : null,
                          })
                        }
                        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                      >
                        {buildOptionsForSlot(m, 2).map((r) => (
                          <option key={r.refereeNo || "__none2"} value={r.refereeNo}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      {statusBadge(m.dommer2Status)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
