"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { StatistikOverviewData, StatistikPlayerRow, StatistikTabKey, StatistikTeamRow } from "./statistikTypes";

type SortDir = "asc" | "desc";

type PlayerSortKey =
  | "name"
  | "team"
  | "age"
  | "games"
  | "goals"
  | "assists"
  | "points"
  | "pim"
  | "ppm"
  | "ppa"
  | "ppp"
  | "bpm"
  | "bpa"
  | "bpp";

type TeamSortKey =
  | "team"
  | "games"
  | "goalsFor"
  | "goalsAgainst"
  | "goalsDiff"
  | "ppGoalsFor"
  | "ppGoalsAgainst"
  | "ppAttempts"
  | "bpGoalsFor"
  | "bpGoalsAgainst"
  | "bpAttempts"
  | "ppPct"
  | "bpPct";

function cmp(a: string, b: string) {
  return a.localeCompare(b, "da-DK", { numeric: true, sensitivity: "base" });
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function safeDiv(n: number, d: number) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return n / d;
}

function normKey(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("da-DK");
}

function playerHrefFromName(name: string): string {
  const key = normKey(name);
  return `/statistik/spiller/${encodeURIComponent(key)}?name=${encodeURIComponent(name)}`;
}

function holdHrefFromHoldId(holdId: string): string {
  return `/hold/${encodeURIComponent(holdId)}`;
}

function formatNumber(mode: StatistikOverviewData["mode"], value: number, games: number): string {
  if (mode === "TOTAL") return String(Math.round(value));
  const den = games > 0 ? games : 0;
  const v = den > 0 ? value / den : 0;
  return String(Math.round(v * 10) / 10);
}

function formatPct01To100(value01: number): string {
  const v = Number.isFinite(value01) ? value01 : 0;
  return String(Math.round(v * 1000) / 10);
}

function HeaderButton({
  label,
  active,
  dir,
  onClick,
  align,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "center";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "whitespace-nowrap px-2 py-2 text-xs font-semibold " +
        (align === "center" ? "text-center" : "text-left") +
        " " +
        (active ? "text-[color:var(--brand)]" : "text-zinc-700")
      }
      title={active ? `Sortering: ${dir}` : "Sortér"}
    >
      {label}
      {active ? (dir === "asc" ? " ▲" : " ▼") : ""}
    </button>
  );
}

export default function StatistikOverviewClient({
  data,
  hideTeams,
  title,
  hideHeader,
  hideInternalTabs,
  forceTab,
  hidePlayerViewModeToggle,
}: {
  data: StatistikOverviewData;
  hideTeams?: boolean;
  title?: string;
  hideHeader?: boolean;
  hideInternalTabs?: boolean;
  forceTab?: StatistikTabKey;
  hidePlayerViewModeToggle?: boolean;
}) {
  const [tab, setTab] = useState<StatistikTabKey>("players");
  const [playerTableMode, setPlayerTableMode] = useState<"standard" | "detailed">("standard");

  const [playerSortKey, setPlayerSortKey] = useState<PlayerSortKey>("points");
  const [playerSortDir, setPlayerSortDir] = useState<SortDir>("desc");

  const [teamSortKey, setTeamSortKey] = useState<TeamSortKey>("goalsDiff");
  const [teamSortDir, setTeamSortDir] = useState<SortDir>("desc");

  const mode = data.mode;
  const selectedTeamKey = normKey(data.selectedTeamName);

  const sortedPlayers = useMemo(() => {
    const dirMul = playerSortDir === "asc" ? 1 : -1;

    const valueFor = (r: StatistikPlayerRow, key: PlayerSortKey) => {
      switch (key) {
        case "name":
          return r.name;
        case "team":
          return r.team;
        case "age":
          return r.age ?? 999;
        case "games":
          return r.games;
        case "goals":
          return mode === "PER_GAME" ? safeDiv(r.goals, r.games) : r.goals;
        case "assists":
          return mode === "PER_GAME" ? safeDiv(r.assists, r.games) : r.assists;
        case "points":
          return mode === "PER_GAME" ? safeDiv(r.points, r.games) : r.points;
        case "pim":
          return mode === "PER_GAME" ? safeDiv(r.pim, r.games) : r.pim;
        case "ppm":
          return mode === "PER_GAME" ? safeDiv(r.ppm, r.games) : r.ppm;
        case "ppa":
          return mode === "PER_GAME" ? safeDiv(r.ppa, r.games) : r.ppa;
        case "ppp":
          return mode === "PER_GAME" ? safeDiv(r.ppp, r.games) : r.ppp;
        case "bpm":
          return mode === "PER_GAME" ? safeDiv(r.bpm, r.games) : r.bpm;
        case "bpa":
          return mode === "PER_GAME" ? safeDiv(r.bpa, r.games) : r.bpa;
        case "bpp":
          return mode === "PER_GAME" ? safeDiv(r.bpp, r.games) : r.bpp;
        default:
          return 0;
      }
    };

    const out = [...data.players];
    out.sort((a, b) => {
      const va = valueFor(a, playerSortKey);
      const vb = valueFor(b, playerSortKey);

      if (typeof va === "number" && typeof vb === "number") {
        return dirMul * (va - vb) || cmp(a.name, b.name);
      }

      return dirMul * cmp(String(va), String(vb)) || cmp(a.name, b.name);
    });

    return out;
  }, [data.players, mode, playerSortDir, playerSortKey]);

  const sortedTeams = useMemo(() => {
    const dirMul = teamSortDir === "asc" ? 1 : -1;

    const ppPct = (t: StatistikTeamRow) => safeDiv(t.ppGoalsFor, t.ppAttempts);
    const bpPct = (t: StatistikTeamRow) => 1 - safeDiv(t.bpGoalsAgainst, t.bpAttempts);

    const valueFor = (t: StatistikTeamRow, key: TeamSortKey) => {
      switch (key) {
        case "team":
          return t.team;
        case "games":
          return t.games;
        case "goalsFor":
          return mode === "PER_GAME" ? safeDiv(t.goalsFor, t.games) : t.goalsFor;
        case "goalsAgainst":
          return mode === "PER_GAME" ? safeDiv(t.goalsAgainst, t.games) : t.goalsAgainst;
        case "goalsDiff":
          return mode === "PER_GAME" ? safeDiv(t.goalsDiff, t.games) : t.goalsDiff;
        case "ppGoalsFor":
          return mode === "PER_GAME" ? safeDiv(t.ppGoalsFor, t.games) : t.ppGoalsFor;
        case "ppGoalsAgainst":
          return mode === "PER_GAME" ? safeDiv(t.ppGoalsAgainst, t.games) : t.ppGoalsAgainst;
        case "ppAttempts":
          return mode === "PER_GAME" ? safeDiv(t.ppAttempts, t.games) : t.ppAttempts;
        case "bpGoalsFor":
          return mode === "PER_GAME" ? safeDiv(t.bpGoalsFor, t.games) : t.bpGoalsFor;
        case "bpGoalsAgainst":
          return mode === "PER_GAME" ? safeDiv(t.bpGoalsAgainst, t.games) : t.bpGoalsAgainst;
        case "bpAttempts":
          return mode === "PER_GAME" ? safeDiv(t.bpAttempts, t.games) : t.bpAttempts;
        case "ppPct":
          return ppPct(t);
        case "bpPct":
          return bpPct(t);
        default:
          return 0;
      }
    };

    const out = [...data.teams];
    out.sort((a, b) => {
      const va = valueFor(a, teamSortKey);
      const vb = valueFor(b, teamSortKey);

      if (typeof va === "number" && typeof vb === "number") {
        return dirMul * (va - vb) || cmp(a.team, b.team);
      }

      return dirMul * cmp(String(va), String(vb)) || cmp(a.team, b.team);
    });

    return out;
  }, [data.teams, mode, teamSortDir, teamSortKey]);

  function togglePlayerSort(key: PlayerSortKey) {
    if (playerSortKey === key) {
      setPlayerSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setPlayerSortKey(key);
    setPlayerSortDir("desc");
  }

  function toggleTeamSort(key: TeamSortKey) {
    if (teamSortKey === key) {
      setTeamSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setTeamSortKey(key);
    setTeamSortDir("desc");
  }

  const tabButton = (key: StatistikTabKey, label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={
        "rounded-md px-3 py-2 text-sm font-semibold " +
        (tab === key ? "text-[var(--brand-foreground)]" : "border border-zinc-300 bg-white text-zinc-900")
      }
      style={tab === key ? { background: "var(--brand)" } : undefined}
    >
      {label}
    </button>
  );

  const effectiveTab: StatistikTabKey = forceTab ?? (hideTeams ? "players" : tab);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      {!hideHeader || (!hideInternalTabs && !hideTeams) ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          {!hideHeader ? (
            <div>
              <h1 className="text-2xl font-semibold">{title ?? "Statistik"}</h1>
              <div className="mt-1 text-sm text-zinc-600">{data.scopeLabel}</div>
            </div>
          ) : (
            <div />
          )}

          {!hideTeams && !hideInternalTabs && !forceTab ? (
            <div className="flex flex-wrap gap-2">
              {tabButton("players", "Spillerstatistik")}
              {tabButton("teams", "Holdstatistik")}
            </div>
          ) : null}
        </div>
      ) : null}

      {effectiveTab === "players" ? (
        <div className="space-y-3">
          {!hidePlayerViewModeToggle ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlayerTableMode("standard")}
                  className={
                    playerTableMode === "standard"
                      ? "rounded-md bg-[color:var(--topbar-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--topbar-foreground)]"
                      : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900"
                  }
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => setPlayerTableMode("detailed")}
                  className={
                    playerTableMode === "detailed"
                      ? "rounded-md bg-[color:var(--topbar-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--topbar-foreground)]"
                      : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900"
                  }
                >
                  Detaljeret
                </button>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full table-fixed border-collapse">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="w-[240px] overflow-hidden px-2 py-2 text-left text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="Navn"
                        active={playerSortKey === "name"}
                        dir={playerSortDir}
                        onClick={() => togglePlayerSort("name")}
                        align="left"
                      />
                    </th>
                    <th className="w-[220px] overflow-hidden px-2 py-2 text-left text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="Hold"
                        active={playerSortKey === "team"}
                        dir={playerSortDir}
                        onClick={() => togglePlayerSort("team")}
                        align="left"
                      />
                    </th>
                    <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="Alder"
                        active={playerSortKey === "age"}
                        dir={playerSortDir}
                        onClick={() => togglePlayerSort("age")}
                        align="center"
                      />
                    </th>
                    <th className="w-[76px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="Kampe"
                        active={playerSortKey === "games"}
                        dir={playerSortDir}
                        onClick={() => togglePlayerSort("games")}
                        align="center"
                      />
                    </th>
                    <th className="w-[62px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="M"
                        active={playerSortKey === "goals"}
                        dir={playerSortDir}
                        onClick={() => togglePlayerSort("goals")}
                        align="center"
                      />
                    </th>
                    <th className="w-[62px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="A"
                        active={playerSortKey === "assists"}
                        dir={playerSortDir}
                        onClick={() => togglePlayerSort("assists")}
                        align="center"
                      />
                    </th>
                    <th className="w-[62px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="P"
                        active={playerSortKey === "points"}
                        dir={playerSortDir}
                        onClick={() => togglePlayerSort("points")}
                        align="center"
                      />
                    </th>
                    <th className="w-[72px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="Udv"
                        active={playerSortKey === "pim"}
                        dir={playerSortDir}
                        onClick={() => togglePlayerSort("pim")}
                        align="center"
                      />
                    </th>

                    {playerTableMode === "detailed" ? (
                      <>
                        <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                          <HeaderButton
                            label="PPM"
                            active={playerSortKey === "ppm"}
                            dir={playerSortDir}
                            onClick={() => togglePlayerSort("ppm")}
                            align="center"
                          />
                        </th>
                        <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                          <HeaderButton
                            label="PPA"
                            active={playerSortKey === "ppa"}
                            dir={playerSortDir}
                            onClick={() => togglePlayerSort("ppa")}
                            align="center"
                          />
                        </th>
                        <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                          <HeaderButton
                            label="PPP"
                            active={playerSortKey === "ppp"}
                            dir={playerSortDir}
                            onClick={() => togglePlayerSort("ppp")}
                            align="center"
                          />
                        </th>
                        <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                          <HeaderButton
                            label="BPM"
                            active={playerSortKey === "bpm"}
                            dir={playerSortDir}
                            onClick={() => togglePlayerSort("bpm")}
                            align="center"
                          />
                        </th>
                        <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                          <HeaderButton
                            label="BPA"
                            active={playerSortKey === "bpa"}
                            dir={playerSortDir}
                            onClick={() => togglePlayerSort("bpa")}
                            align="center"
                          />
                        </th>
                        <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                          <HeaderButton
                            label="BPP"
                            active={playerSortKey === "bpp"}
                            dir={playerSortDir}
                            onClick={() => togglePlayerSort("bpp")}
                            align="center"
                          />
                        </th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((r, idx) => (
                    <tr
                      key={`${r.name}-${idx}`}
                      className={
                        r.highlight === "team"
                          ? "ta-kal-team"
                          : r.highlight === "club"
                            ? "ta-kal-club"
                            : normKey(r.team) === selectedTeamKey && selectedTeamKey
                              ? "bg-[color:var(--row-highlight)]"
                              : idx % 2 === 0
                                ? "bg-white"
                                : "bg-zinc-50/50"
                      }
                    >
                      <td className="px-2 py-2 text-left text-sm text-zinc-900">
                        <div className="truncate" title={r.name}>
                          <Link className="underline" href={playerHrefFromName(r.name)}>
                            {r.name}
                          </Link>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-left text-sm text-zinc-900">
                        <div className="truncate" title={r.team}>
                          {r.holdId ? (
                            <Link className="underline" href={holdHrefFromHoldId(r.holdId)}>
                              {r.team}
                            </Link>
                          ) : (
                            r.team
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">{r.age ?? ""}</td>
                      <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">{r.games}</td>
                      <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                        {formatNumber(mode, r.goals, r.games)}
                      </td>
                      <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                        {formatNumber(mode, r.assists, r.games)}
                      </td>
                      <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                        {formatNumber(mode, r.points, r.games)}
                      </td>
                      <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                        {formatNumber(mode, r.pim, r.games)}
                      </td>

                      {playerTableMode === "detailed" ? (
                        <>
                          <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                            {formatNumber(mode, r.ppm, r.games)}
                          </td>
                          <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                            {formatNumber(mode, r.ppa, r.games)}
                          </td>
                          <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                            {formatNumber(mode, r.ppp, r.games)}
                          </td>
                          <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                            {formatNumber(mode, r.bpm, r.games)}
                          </td>
                          <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                            {formatNumber(mode, r.bpa, r.games)}
                          </td>
                          <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                            {formatNumber(mode, r.bpp, r.games)}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  ))}

                  {sortedPlayers.length === 0 ? (
                    <tr>
                      <td colSpan={playerTableMode === "detailed" ? 14 : 8} className="px-3 py-6 text-center text-sm text-zinc-600">
                        Ingen data.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full table-fixed border-collapse">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="w-[260px] overflow-hidden px-2 py-2 text-left text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="Hold"
                        active={teamSortKey === "team"}
                        dir={teamSortDir}
                        onClick={() => toggleTeamSort("team")}
                        align="left"
                      />
                    </th>
                    <th className="w-[76px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="Kampe"
                        active={teamSortKey === "games"}
                        dir={teamSortDir}
                        onClick={() => toggleTeamSort("games")}
                        align="center"
                      />
                    </th>
                    <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="M+"
                        active={teamSortKey === "goalsFor"}
                        dir={teamSortDir}
                        onClick={() => toggleTeamSort("goalsFor")}
                        align="center"
                      />
                    </th>
                    <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="M-"
                        active={teamSortKey === "goalsAgainst"}
                        dir={teamSortDir}
                        onClick={() => toggleTeamSort("goalsAgainst")}
                        align="center"
                      />
                    </th>
                    <th className="w-[80px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="M+/-"
                        active={teamSortKey === "goalsDiff"}
                        dir={teamSortDir}
                        onClick={() => toggleTeamSort("goalsDiff")}
                        align="center"
                      />
                    </th>

                    <th className="w-[74px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="PPM+"
                        active={teamSortKey === "ppGoalsFor"}
                        dir={teamSortDir}
                        onClick={() => toggleTeamSort("ppGoalsFor")}
                        align="center"
                      />
                    </th>
                    <th className="w-[74px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="PPM-"
                        active={teamSortKey === "ppGoalsAgainst"}
                        dir={teamSortDir}
                        onClick={() => toggleTeamSort("ppGoalsAgainst")}
                        align="center"
                      />
                    </th>
                    <th className="w-[86px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="PP forsøg"
                        active={teamSortKey === "ppAttempts"}
                        dir={teamSortDir}
                        onClick={() => toggleTeamSort("ppAttempts")}
                        align="center"
                      />
                    </th>
                    <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="PP%"
                        active={teamSortKey === "ppPct"}
                        dir={teamSortDir}
                        onClick={() => toggleTeamSort("ppPct")}
                        align="center"
                      />
                    </th>

                    <th className="w-[74px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="BPM+"
                        active={teamSortKey === "bpGoalsFor"}
                        dir={teamSortDir}
                        onClick={() => toggleTeamSort("bpGoalsFor")}
                        align="center"
                      />
                    </th>
                    <th className="w-[74px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="BPM-"
                        active={teamSortKey === "bpGoalsAgainst"}
                        dir={teamSortDir}
                        onClick={() => toggleTeamSort("bpGoalsAgainst")}
                        align="center"
                      />
                    </th>
                    <th className="w-[86px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="BP forsøg"
                        active={teamSortKey === "bpAttempts"}
                        dir={teamSortDir}
                        onClick={() => toggleTeamSort("bpAttempts")}
                        align="center"
                      />
                    </th>
                    <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">
                      <HeaderButton
                        label="BP%"
                        active={teamSortKey === "bpPct"}
                        dir={teamSortDir}
                        onClick={() => toggleTeamSort("bpPct")}
                        align="center"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTeams.map((t, idx) => {
                    const ppPct = safeDiv(t.ppGoalsFor, t.ppAttempts);
                    const bpPct = 1 - safeDiv(t.bpGoalsAgainst, t.bpAttempts);
                    const isSelected = selectedTeamKey && normKey(t.team) === selectedTeamKey;

                    return (
                      <tr
                        key={t.team}
                        className={
                          t.highlight === "team"
                            ? "ta-kal-team"
                            : t.highlight === "club"
                              ? "ta-kal-club"
                              : isSelected
                                ? "bg-[color:var(--row-highlight)]"
                                : idx % 2 === 0
                                  ? "bg-white"
                                  : "bg-zinc-50/50"
                        }
                      >
                        <td className="px-2 py-2 text-left text-sm text-zinc-900">
                          <div className="truncate" title={t.team}>
                            {t.holdId ? (
                              <Link className="underline" href={holdHrefFromHoldId(t.holdId)}>
                                {t.team}
                              </Link>
                            ) : (
                              t.team
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">{t.games}</td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                          {formatNumber(mode, t.goalsFor, t.games)}
                        </td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                          {formatNumber(mode, t.goalsAgainst, t.games)}
                        </td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                          {formatNumber(mode, t.goalsDiff, t.games)}
                        </td>

                        <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                          {formatNumber(mode, t.ppGoalsFor, t.games)}
                        </td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                          {formatNumber(mode, t.ppGoalsAgainst, t.games)}
                        </td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                          {formatNumber(mode, t.ppAttempts, t.games)}
                        </td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                          {formatPct01To100(ppPct)}
                        </td>

                        <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                          {formatNumber(mode, t.bpGoalsFor, t.games)}
                        </td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                          {formatNumber(mode, t.bpGoalsAgainst, t.games)}
                        </td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                          {formatNumber(mode, t.bpAttempts, t.games)}
                        </td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900 tabular-nums">
                          {formatPct01To100(bpPct)}
                        </td>
                      </tr>
                    );
                  })}

                  {sortedTeams.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-3 py-6 text-center text-sm text-zinc-600">
                        Ingen data.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
