"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const STORAGE_KEY = "ta_filters_v1";

const FILTER_KEYS = [
  "season",
  "clubId",
  "gender",
  "age",
  "league",
  "stage",
  "pool",
  "teamId",
  "matches",
] as const;

function pickFilterParams(searchParams: URLSearchParams) {
  const out = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = searchParams.get(k);
    if (v) out.set(k, v);
  }
  return out;
}

function hasAnyFilterParams(searchParams: URLSearchParams) {
  return FILTER_KEYS.some((k) => Boolean(searchParams.get(k)));
}

type FiltersResponse = {
  ok: true;
  seasons: Array<{ startYear: number; label: string }>;
  clubs: Array<{ id: string; name: string; clubNo: string | null }>;
  genders: string[];
  leagues: string[];
  stages: string[];
  pools: string[];
  teams: Array<{ id: string; name: string; league: string; clubId: string; holdId?: string | null; gender?: string | null }>;
  ages: string[];
};

function formatClubLabel(club: { name: string; clubNo: string | null }) {
  // UX: Forening slicer should only show club name (not KlubID/clubNo).
  return club.name;
}

function Select({
  label,
  value,
  options,
  onChange,
  placeholder = "Alle",
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold">{label}</div>
      <select
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:opacity-70"
        style={{ colorScheme: "light" }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function KalenderFiltersClient() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isKalender = pathname === "/kalender";
  const isStatistik = pathname === "/statistik";
  const isStilling = pathname === "/stilling";
  const isHold = pathname === "/hold" || pathname.startsWith("/hold/");
  const isPlayerPage =
    pathname === "/spiller" ||
    pathname.startsWith("/spiller/") ||
    pathname.startsWith("/statistik/spiller/");
  const isMatchDetailPage =
    pathname === "/kamp" ||
    pathname.startsWith("/kamp/") ||
    pathname === "/kampe" ||
    pathname.startsWith("/kampe/") ||
    pathname.startsWith("/kalender/kamp/");
  const show =
    pathname === "/kalender" ||
    pathname.startsWith("/kalender/") ||
    pathname === "/statistik" ||
    pathname.startsWith("/statistik/") ||
    pathname === "/stilling" ||
    pathname.startsWith("/stilling/") ||
    pathname === "/hold" ||
    pathname.startsWith("/hold/") ||
    pathname === "/klubleder" ||
    pathname.startsWith("/klubleder/") ||
    pathname === "/holdleder" ||
    pathname.startsWith("/holdleder/");

  // Spillersider må ikke have slicers.
  const effectiveShow = show && !isPlayerPage && !isMatchDetailPage;

  const [data, setData] = useState<FiltersResponse | null>(null);

  const season = searchParams.get("season") ?? "";
  const clubId = searchParams.get("clubId") ?? "";
  const gender = searchParams.get("gender") ?? "";
  const age = searchParams.get("age") ?? "";
  const league = searchParams.get("league") ?? "";
  const stage = searchParams.get("stage") ?? "";
  const pool = searchParams.get("pool") ?? "";
  const teamId = searchParams.get("teamId") ?? "";
  const matchesMode = (searchParams.get("matches") ?? "ALL").toUpperCase();

  // Hydrate filters from localStorage when landing on TA pages without filters.
  useEffect(() => {
    if (!effectiveShow) return;
    try {
      const current = new URLSearchParams(searchParams.toString());
      if (hasAnyFilterParams(current)) return;

      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = new URLSearchParams(raw);
      if (!hasAnyFilterParams(saved)) return;

      router.replace(`${pathname}?${saved.toString()}`);
      router.refresh();
    } catch {
      // ignore
    }
    // Intentionally only runs when landing changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveShow, pathname]);

  // Persist current filter state for cross-page syncing.
  useEffect(() => {
    if (!effectiveShow) return;
    try {
      const picked = pickFilterParams(new URLSearchParams(searchParams.toString()));
      window.localStorage.setItem(STORAGE_KEY, picked.toString());
    } catch {
      // ignore
    }
  }, [effectiveShow, searchParams]);

  useEffect(() => {
    if (!effectiveShow) return;
    let cancelled = false;
    async function load() {
      const qs = new URLSearchParams(searchParams.toString());

      // Holdsider skal have samme slicers, men facetteret indenfor holdets kamp-univers.
      if (isHold) {
        const parts = pathname.split("/").filter(Boolean);
        const holdId = parts[1] ?? "";
        if (holdId) qs.set("holdId", holdId);
      }

      const url = qs.toString() ? `/api/kalender/filters?${qs.toString()}` : "/api/kalender/filters";
      const res = await fetch(url, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as FiltersResponse | null;
      if (cancelled) return;
      if (res.ok && json?.ok) setData(json);
      else setData(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [effectiveShow, isHold, pathname, searchParams]);

  // Auto-clear selections that are no longer valid for the current faceted options.
  useEffect(() => {
    if (!effectiveShow) return;
    if (!data) return;

    const allowedClubIds = new Set((data.clubs ?? []).map((c) => c.id));
    const allowedGenders = new Set((data.genders ?? []).map((v) => v));
    const allowedLeagues = new Set((data.leagues ?? []).map((v) => v));
    const allowedStages = new Set((data.stages ?? []).map((v) => v));
    const allowedPools = new Set((data.pools ?? []).map((v) => v));
    const allowedTeamIds = new Set((data.teams ?? []).map((t) => t.id));
    const allowedAges = new Set((data.ages ?? []).map((v) => v));

    const next = new URLSearchParams(searchParams.toString());
    let changed = false;

    if (clubId && !allowedClubIds.has(clubId)) {
      next.delete("clubId");
      changed = true;
    }
    if (gender && !allowedGenders.has(gender)) {
      next.delete("gender");
      changed = true;
    }
    if (league && !allowedLeagues.has(league)) {
      next.delete("league");
      changed = true;
    }
    if (stage && !allowedStages.has(stage)) {
      next.delete("stage");
      changed = true;
    }
    if (pool && !allowedPools.has(pool)) {
      next.delete("pool");
      changed = true;
    }
    if (teamId && !allowedTeamIds.has(teamId)) {
      next.delete("teamId");
      changed = true;
    }
    if (age && !allowedAges.has(age)) {
      next.delete("age");
      changed = true;
    }

    if (matchesMode === "TEAM" && !next.get("teamId")) {
      next.set("matches", "ALL");
      changed = true;
    }

    if (matchesMode === "CLUB" && !next.get("clubId")) {
      next.set("matches", "ALL");
      changed = true;
    }

    if (changed) {
      router.replace(`${pathname}?${next.toString()}`);
      router.refresh();
    }
  }, [data, age, clubId, effectiveShow, league, matchesMode, pathname, pool, router, searchParams, stage, teamId]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value) next.delete(key);
    else next.set(key, value);

    // On Statistik, team selection should immediately constrain faceted options.
    // The filters API only facets by team when `matches=TEAM`.
    if (isStatistik && key === "teamId") {
      if (value) {
        next.set("matches", "TEAM");
      } else {
        // If a club is still selected, keep it as CLUB mode; otherwise reset to ALL.
        if (next.get("clubId")) next.set("matches", "CLUB");
        else next.set("matches", "ALL");
      }
    }

    router.replace(`${pathname}?${next.toString()}`);
    router.refresh();
  }

  function reset() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    router.replace(pathname);
    router.refresh();
  }

  const seasonOptions = useMemo(
    () => (data?.seasons ?? []).map((s) => ({ value: String(s.startYear), label: s.label })),
    [data]
  );

  const clubOptions = useMemo(
    () =>
      (data?.clubs ?? []).map((c) => ({
        value: c.id,
        label: formatClubLabel(c),
      })),
    [data]
  );

  const leagueOptions = useMemo(
    () => (data?.leagues ?? []).map((l) => ({ value: l, label: l })),
    [data]
  );

  const stageOptions = useMemo(
    () => (data?.stages ?? []).map((s) => ({ value: s, label: s })),
    [data]
  );

  const poolOptions = useMemo(
    () => (data?.pools ?? []).map((p) => ({ value: p, label: p })),
    [data]
  );

  const genderOptions = useMemo(() => {
    const values = data?.genders?.length ? data.genders : ["MEN", "WOMEN"];
    return values.map((g) => ({
      value: g,
      label: g === "WOMEN" ? "Damer" : "Mænd",
    }));
  }, [data]);

  const ageOptions = useMemo(
    () =>
      (data?.ages ?? []).map((a) => ({
        value: a,
        label: a === "SENIOR" ? "Senior" : a === "OLDIES" ? "Oldies" : a,
      })),
    [data]
  );

  const teamOptions = useMemo(() => {
    const teams = data?.teams ?? [];
    return teams.map((t) => ({ value: t.id, label: `${t.name} · ${t.league}` }));
  }, [data]);

  const hasTeam = Boolean(teamId);
  const hasClub = Boolean(clubId);

  if (!effectiveShow) return null;

  return (
    <div className="space-y-4">
      <Select label="Sæson" value={season} options={seasonOptions} onChange={(v) => setParam("season", v)} />
      <Select label="Forening" value={clubId} options={clubOptions} onChange={(v) => setParam("clubId", v)} />
      <Select label="Køn" value={gender} options={genderOptions} onChange={(v) => setParam("gender", v)} />
      <Select label="Alder" value={age} options={ageOptions} onChange={(v) => setParam("age", v)} />
      <Select label="Liga" value={league} options={leagueOptions} onChange={(v) => setParam("league", v)} />
      <Select label="Stadie" value={stage} options={stageOptions} onChange={(v) => setParam("stage", v)} />
      <Select label="Pulje" value={pool} options={poolOptions} onChange={(v) => setParam("pool", v)} />
      <Select label="Hold" value={teamId} options={teamOptions} onChange={(v) => setParam("teamId", v)} />

      {/* Match-mode buttons are useful on Kalender but not needed for Statistik. */}
      {isKalender ? (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold">Kampe</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setParam("matches", "ALL")}
              className={
                matchesMode === "ALL"
                  ? "rounded-md bg-[color:var(--topbar-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--topbar-foreground)]"
                  : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900"
              }
            >
              Alle
            </button>
            <button
              type="button"
              disabled={!hasClub}
              onClick={() => setParam("matches", "CLUB")}
              className={
                matchesMode === "CLUB"
                  ? "rounded-md bg-[color:var(--topbar-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--topbar-foreground)] disabled:opacity-70"
                  : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 disabled:opacity-70"
              }
            >
              Foreningen
            </button>
            <button
              type="button"
              disabled={!hasTeam}
              onClick={() => setParam("matches", "TEAM")}
              className={
                matchesMode === "TEAM"
                  ? "rounded-md bg-[color:var(--topbar-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--topbar-foreground)] disabled:opacity-70"
                  : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 disabled:opacity-70"
              }
            >
              Holdet
            </button>
          </div>
          {!hasClub ? (
            <div className="text-xs text-zinc-200/80">Vælg en forening for at filtrere på foreningen.</div>
          ) : null}
          {!hasTeam ? (
            <div className="text-xs text-zinc-200/80">Vælg et hold for at filtrere på holdet.</div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={reset}
        className="w-full rounded-md border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
      >
        Nulstil filtre
      </button>
    </div>
  );
}
