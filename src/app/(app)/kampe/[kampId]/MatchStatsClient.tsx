"use client";

import { useMemo, useState } from "react";
import type { MatchEventRow, MatchPlayerStatsRow, MatchStatsData, MatchStatsSubtab } from "./matchStatsTypes";

type SortDir = "asc" | "desc";

type TableSortKey =
  | "team"
  | "number"
  | "name"
  | "age"
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

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function cmp(a: string, b: string) {
  return a.localeCompare(b, "da-DK", { numeric: true, sensitivity: "base" });
}

function sortRows(
  rows: MatchPlayerStatsRow[],
  key: TableSortKey,
  dir: SortDir,
  teamNameForVenue: (venue: MatchPlayerStatsRow["venue"]) => string
): MatchPlayerStatsRow[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (key) {
      case "team": {
        const ta = teamNameForVenue(a.venue);
        const tb = teamNameForVenue(b.venue);
        return mul * cmp(ta, tb) || cmp(a.number, b.number) || cmp(a.name, b.name);
      }
      case "number":
        return mul * cmp(a.number, b.number) || cmp(a.name, b.name) || cmp(a.venue, b.venue);
      case "name":
        return mul * cmp(a.name, b.name) || cmp(a.venue, b.venue) || cmp(a.number, b.number);
      case "age":
        return (
          mul * (num(a.age ?? 0) - num(b.age ?? 0)) ||
          cmp(a.venue, b.venue) ||
          cmp(a.number, b.number) ||
          cmp(a.name, b.name)
        );
      case "goals":
        return mul * (a.goals - b.goals) || cmp(a.venue, b.venue) || cmp(a.number, b.number) || cmp(a.name, b.name);
      case "assists":
        return (
          mul * (a.assists - b.assists) ||
          cmp(a.venue, b.venue) ||
          cmp(a.number, b.number) ||
          cmp(a.name, b.name)
        );
      case "points":
        return mul * (a.points - b.points) || cmp(a.venue, b.venue) || cmp(a.number, b.number) || cmp(a.name, b.name);
      case "pim":
        return mul * (a.pim - b.pim) || cmp(a.venue, b.venue) || cmp(a.number, b.number) || cmp(a.name, b.name);
      case "ppm":
        return mul * (a.ppm - b.ppm) || cmp(a.venue, b.venue) || cmp(a.number, b.number) || cmp(a.name, b.name);
      case "ppa":
        return mul * (a.ppa - b.ppa) || cmp(a.venue, b.venue) || cmp(a.number, b.number) || cmp(a.name, b.name);
      case "ppp":
        return mul * (a.ppp - b.ppp) || cmp(a.venue, b.venue) || cmp(a.number, b.number) || cmp(a.name, b.name);
      case "bpm":
        return mul * (a.bpm - b.bpm) || cmp(a.venue, b.venue) || cmp(a.number, b.number) || cmp(a.name, b.name);
      case "bpa":
        return mul * (a.bpa - b.bpa) || cmp(a.venue, b.venue) || cmp(a.number, b.number) || cmp(a.name, b.name);
      case "bpp":
        return mul * (a.bpp - b.bpp) || cmp(a.venue, b.venue) || cmp(a.number, b.number) || cmp(a.name, b.name);
      default:
        return 0;
    }
  });
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

function StatCell({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap px-2 py-2 text-sm text-zinc-900">{children}</td>;
}

function StatCellLeft({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap px-2 py-2 text-left text-sm text-zinc-900">{children}</td>;
}

function StatCellCenter({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap px-2 py-2 text-center text-sm text-zinc-900">{children}</td>;
}

function PlayersTable({
  title,
  rows,
}: {
  title: string;
  rows: MatchPlayerStatsRow[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900">{title}</div>
      <div>
        <table className="w-full table-fixed border-collapse">
          <thead className="bg-zinc-50">
            <tr>
              <th className="w-[44px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">Nr</th>
              <th className="w-[44px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">C/G</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-zinc-700">Navn</th>
              <th className="w-[52px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">Alder</th>
              <th className="w-[44px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">M</th>
              <th className="w-[44px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">A</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, idx) => (
              <tr key={`${p.venue}-${p.number}-${idx}`} className={idx % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}>
                <StatCellCenter>{p.number}</StatCellCenter>
                <StatCellCenter>{p.role}</StatCellCenter>
                <td className="px-2 py-2 text-left text-sm text-zinc-900">
                  <div className="truncate">{p.name}</div>
                </td>
                <StatCellCenter>{p.age ?? ""}</StatCellCenter>
                <StatCellCenter>{p.goals}</StatCellCenter>
                <StatCellCenter>{p.assists}</StatCellCenter>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function eventLabel(value: string): string {
  const v = String(value ?? "").trim();
  if (v === "Goal") return "Mål";
  if (v === "Penalty") return "Udvisning";
  return v;
}

function EventsTable({
  events,
  homeTeam,
  awayTeam,
}: {
  events: MatchEventRow[];
  homeTeam: string;
  awayTeam: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900">Events</div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse">
          <thead className="bg-zinc-50">
            <tr>
              <th className="w-[72px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">Tid</th>
              <th className="w-[90px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">Event</th>
              <th className="w-[200px] px-2 py-2 text-left text-xs font-semibold text-zinc-700">Hold</th>
              <th className="w-[170px] px-2 py-2 text-left text-xs font-semibold text-zinc-700">Spiller 1</th>
              <th className="w-[170px] px-2 py-2 text-left text-xs font-semibold text-zinc-700">Spiller 2</th>
              <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">Score</th>
              <th className="w-[72px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">Udv</th>
              <th className="w-[62px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">Kode</th>
              <th className="w-[62px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">PP/BP</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, idx) => (
              <tr key={e.rowIndex} className={idx % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}>
                <StatCellCenter>{e.timeAbs}</StatCellCenter>
                <StatCellCenter>{eventLabel(e.event)}</StatCellCenter>
                <td className="px-2 py-2 text-left text-sm text-zinc-900">
                  <div className="truncate">{e.venue === "Hjemme" ? homeTeam : e.venue === "Ude" ? awayTeam : ""}</div>
                </td>
                <td className="px-2 py-2 text-left text-sm text-zinc-900">
                  <div className="truncate">{e.player1}</div>
                </td>
                <td className="px-2 py-2 text-left text-sm text-zinc-900">
                  <div className="truncate">{e.player2}</div>
                </td>
                <StatCellCenter>{e.score}</StatCellCenter>
                <StatCellCenter>{e.pim}</StatCellCenter>
                <StatCellCenter>{e.code}</StatCellCenter>
                <StatCellCenter>{e.strength}</StatCellCenter>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MatchStatsClient({ data }: { data: MatchStatsData }) {
  const [subtab, setSubtab] = useState<MatchStatsSubtab>("lineups");
  const [tableMode, setTableMode] = useState<"standard" | "detailed">("standard");
  const [sortKey, setSortKey] = useState<TableSortKey>("points");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const teamNameForVenue = (venue: MatchPlayerStatsRow["venue"]) => (venue === "Hjemme" ? data.homeTeam : data.awayTeam);

  const sortedTable = useMemo(
    () => sortRows(data.table, sortKey, sortDir, teamNameForVenue),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.table, sortKey, sortDir, data.homeTeam, data.awayTeam]
  );

  function toggleSort(key: TableSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const subtabButton = (key: MatchStatsSubtab, label: string) => (
    <button
      type="button"
      onClick={() => setSubtab(key)}
      className={
        subtab === key
          ? "rounded-md bg-[color:var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-foreground)]"
          : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
      }
    >
      {label}
    </button>
  );

  if (data.source === "none") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">Ingen statistik for kampen.</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {subtabButton("lineups", "Holdopstillinger")}
        {subtabButton("events", "Events")}
        {subtabButton("table", "Tabel")}
        <div className="ml-auto text-xs text-zinc-500">Kilde: {data.source === "upload" ? "Upload" : "Kladde"}</div>
      </div>

      {subtab === "lineups" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PlayersTable title={data.homeTeam || "Hjemme"} rows={data.homeLineup} />
          <PlayersTable title={data.awayTeam || "Ude"} rows={data.awayLineup} />
        </div>
      ) : null}

      {subtab === "events" ? (
        <EventsTable events={data.events} homeTeam={data.homeTeam} awayTeam={data.awayTeam} />
      ) : null}

      {subtab === "table" ? (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-3 py-2">
            <div className="text-sm font-semibold text-zinc-900">Tabel</div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTableMode("standard")}
                className={
                  tableMode === "standard"
                    ? "rounded-md bg-[color:var(--topbar-bg)] px-3 py-1.5 text-sm font-semibold text-[color:var(--topbar-foreground)]"
                    : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
                }
              >
                Standard
              </button>
              <button
                type="button"
                onClick={() => setTableMode("detailed")}
                className={
                  tableMode === "detailed"
                    ? "rounded-md bg-[color:var(--topbar-bg)] px-3 py-1.5 text-sm font-semibold text-[color:var(--topbar-foreground)]"
                    : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
                }
              >
                Detaljeret
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className={tableMode === "detailed" ? "min-w-[1200px] w-full border-collapse" : "min-w-[820px] w-full border-collapse"}>
              <thead className="bg-zinc-50">
                <tr>
                  <th>
                    <HeaderButton label="Nr" align="center" active={sortKey === "number"} dir={sortDir} onClick={() => toggleSort("number")} />
                  </th>
                  <th className="text-left">
                    <HeaderButton label="Navn" align="left" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
                  </th>
                  <th className="text-left">
                    <HeaderButton label="Hold" align="left" active={sortKey === "team"} dir={sortDir} onClick={() => toggleSort("team")} />
                  </th>
                  <th className="text-center">
                    <HeaderButton label="Alder" align="center" active={sortKey === "age"} dir={sortDir} onClick={() => toggleSort("age")} />
                  </th>
                  <th className="text-center">
                    <HeaderButton label="M" align="center" active={sortKey === "goals"} dir={sortDir} onClick={() => toggleSort("goals")} />
                  </th>
                  <th className="text-center">
                    <HeaderButton label="A" align="center" active={sortKey === "assists"} dir={sortDir} onClick={() => toggleSort("assists")} />
                  </th>
                  <th className="text-center">
                    <HeaderButton label="P" align="center" active={sortKey === "points"} dir={sortDir} onClick={() => toggleSort("points")} />
                  </th>
                  <th className="text-center">
                    <HeaderButton label="Udv" align="center" active={sortKey === "pim"} dir={sortDir} onClick={() => toggleSort("pim")} />
                  </th>
                  {tableMode === "detailed" ? (
                    <>
                      <th className="text-center">
                        <HeaderButton label="PPM" align="center" active={sortKey === "ppm"} dir={sortDir} onClick={() => toggleSort("ppm")} />
                      </th>
                      <th className="text-center">
                        <HeaderButton label="PPA" align="center" active={sortKey === "ppa"} dir={sortDir} onClick={() => toggleSort("ppa")} />
                      </th>
                      <th className="text-center">
                        <HeaderButton label="PPP" align="center" active={sortKey === "ppp"} dir={sortDir} onClick={() => toggleSort("ppp")} />
                      </th>
                      <th className="text-center">
                        <HeaderButton label="BPM" align="center" active={sortKey === "bpm"} dir={sortDir} onClick={() => toggleSort("bpm")} />
                      </th>
                      <th className="text-center">
                        <HeaderButton label="BPA" align="center" active={sortKey === "bpa"} dir={sortDir} onClick={() => toggleSort("bpa")} />
                      </th>
                      <th className="text-center">
                        <HeaderButton label="BPP" align="center" active={sortKey === "bpp"} dir={sortDir} onClick={() => toggleSort("bpp")} />
                      </th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {sortedTable.map((p, idx) => (
                  <tr key={`${p.venue}-${p.number}-${idx}`} className={idx % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}>
                    <StatCellCenter>{p.number}</StatCellCenter>
                    <StatCellLeft>{p.name}</StatCellLeft>
                    <StatCellLeft>{teamNameForVenue(p.venue)}</StatCellLeft>
                    <StatCellCenter>{p.age ?? ""}</StatCellCenter>
                    <StatCellCenter>{p.goals}</StatCellCenter>
                    <StatCellCenter>{p.assists}</StatCellCenter>
                    <StatCellCenter>{p.points}</StatCellCenter>
                    <StatCellCenter>{p.pim || ""}</StatCellCenter>
                    {tableMode === "detailed" ? (
                      <>
                        <StatCellCenter>{p.ppm}</StatCellCenter>
                        <StatCellCenter>{p.ppa}</StatCellCenter>
                        <StatCellCenter>{p.ppp}</StatCellCenter>
                        <StatCellCenter>{p.bpm}</StatCellCenter>
                        <StatCellCenter>{p.bpa}</StatCellCenter>
                        <StatCellCenter>{p.bpp}</StatCellCenter>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
