"use client";

import * as React from "react";

type PlayerAgg = {
  games: number;
  goals: number;
  assists: number;
  points: number;
  pim: number;
  ppm: number;
  ppa: number;
  ppp: number;
  bpm: number;
  bpa: number;
  bpp: number;
};

type SeasonRow = {
  team: string;
  league: string;
  stage: string;
  agg: PlayerAgg;
};

export type SeasonBlock = {
  seasonStartYear: number;
  seasonLabel: string;
  subtotal: PlayerAgg;
  rows: SeasonRow[];
};

function statCell(v: number) {
  return <span className="tabular-nums">{Math.round(v * 10) / 10}</span>;
}

function emptyToDash(v: string) {
  const s = String(v ?? "").trim();
  return s || "-";
}

export default function PlayerStatsClient({
  seasons,
  overall,
  initiallyOpenSeasonStartYear,
}: {
  seasons: SeasonBlock[];
  overall: PlayerAgg;
  initiallyOpenSeasonStartYear?: number;
}) {
  const [open, setOpen] = React.useState<Record<number, boolean>>(() => {
    if (typeof initiallyOpenSeasonStartYear === "number") {
      return { [initiallyOpenSeasonStartYear]: true };
    }
    return {};
  });

  const toggle = (seasonStartYear: number) => {
    setOpen((prev) => ({ ...prev, [seasonStartYear]: !prev[seasonStartYear] }));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full table-fixed border-collapse">
          <thead className="bg-zinc-50">
            <tr>
              <th className="w-[120px] px-2 py-2 text-left text-xs font-semibold text-zinc-700">Sæson</th>
              <th className="w-[220px] px-2 py-2 text-left text-xs font-semibold text-zinc-700">Hold</th>
              <th className="w-[220px] px-2 py-2 text-left text-xs font-semibold text-zinc-700">Liga</th>
              <th className="w-[170px] px-2 py-2 text-left text-xs font-semibold text-zinc-700">Stadie</th>
              <th className="w-[60px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">K</th>
              <th className="w-[60px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">M</th>
              <th className="w-[60px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">A</th>
              <th className="w-[60px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">P</th>
              <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">Udv</th>
              <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">PPM</th>
              <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">PPA</th>
              <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">PPP</th>
              <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">BPM</th>
              <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">BPA</th>
              <th className="w-[70px] px-2 py-2 text-center text-xs font-semibold text-zinc-700">BPP</th>
            </tr>
          </thead>

          <tbody>
            {seasons.map((s, seasonIdx) => {
              const isOpen = Boolean(open[s.seasonStartYear]);
              return (
                <React.Fragment key={s.seasonStartYear}>
                  <tr className={(seasonIdx % 2 === 0 ? "bg-white" : "bg-zinc-50/50") + " font-semibold"}>
                    <td className="px-2 py-2 text-left text-sm text-zinc-900">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2"
                        onClick={() => toggle(s.seasonStartYear)}
                        aria-expanded={isOpen}
                      >
                        <span className="w-4 text-zinc-500" aria-hidden>
                          {isOpen ? "▾" : "▸"}
                        </span>
                        <span>{s.seasonLabel}</span>
                      </button>
                    </td>
                    <td className="px-2 py-2 text-left text-sm text-zinc-900">-</td>
                    <td className="px-2 py-2 text-left text-sm text-zinc-900">-</td>
                    <td className="px-2 py-2 text-left text-sm text-zinc-900">-</td>
                    <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(s.subtotal.games)}</td>
                    <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(s.subtotal.goals)}</td>
                    <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(s.subtotal.assists)}</td>
                    <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(s.subtotal.points)}</td>
                    <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(s.subtotal.pim)}</td>
                    <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(s.subtotal.ppm)}</td>
                    <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(s.subtotal.ppa)}</td>
                    <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(s.subtotal.ppp)}</td>
                    <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(s.subtotal.bpm)}</td>
                    <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(s.subtotal.bpa)}</td>
                    <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(s.subtotal.bpp)}</td>
                  </tr>

                  {isOpen &&
                    s.rows.map((r, rowIdx) => (
                      <tr
                        key={`${s.seasonStartYear}:${r.team}:${r.league}:${r.stage}:${rowIdx}`}
                        className={rowIdx % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}
                      >
                        <td className="px-2 py-2 text-left text-sm text-zinc-700">
                          <span className="inline-block w-4" aria-hidden />
                        </td>
                        <td className="px-2 py-2 text-left text-sm text-zinc-900">
                          <div className="truncate" title={r.team}>
                            {emptyToDash(r.team)}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-left text-sm text-zinc-900">
                          <div className="truncate" title={r.league}>
                            {emptyToDash(r.league)}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-left text-sm text-zinc-900">
                          <div className="truncate" title={r.stage}>
                            {emptyToDash(r.stage)}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(r.agg.games)}</td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(r.agg.goals)}</td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(r.agg.assists)}</td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(r.agg.points)}</td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(r.agg.pim)}</td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(r.agg.ppm)}</td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(r.agg.ppa)}</td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(r.agg.ppp)}</td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(r.agg.bpm)}</td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(r.agg.bpa)}</td>
                        <td className="px-2 py-2 text-center text-sm text-zinc-900">{statCell(r.agg.bpp)}</td>
                      </tr>
                    ))}
                </React.Fragment>
              );
            })}
          </tbody>

          <tfoot>
            <tr className="bg-zinc-50 border-t border-zinc-200">
              <td className="px-2 py-2 text-left text-sm font-semibold text-zinc-900">TOTAL</td>
              <td className="px-2 py-2" />
              <td className="px-2 py-2" />
              <td className="px-2 py-2" />
              <td className="px-2 py-2 text-center text-sm font-semibold text-zinc-900">{statCell(overall.games)}</td>
              <td className="px-2 py-2 text-center text-sm font-semibold text-zinc-900">{statCell(overall.goals)}</td>
              <td className="px-2 py-2 text-center text-sm font-semibold text-zinc-900">{statCell(overall.assists)}</td>
              <td className="px-2 py-2 text-center text-sm font-semibold text-zinc-900">{statCell(overall.points)}</td>
              <td className="px-2 py-2 text-center text-sm font-semibold text-zinc-900">{statCell(overall.pim)}</td>
              <td className="px-2 py-2 text-center text-sm font-semibold text-zinc-900">{statCell(overall.ppm)}</td>
              <td className="px-2 py-2 text-center text-sm font-semibold text-zinc-900">{statCell(overall.ppa)}</td>
              <td className="px-2 py-2 text-center text-sm font-semibold text-zinc-900">{statCell(overall.ppp)}</td>
              <td className="px-2 py-2 text-center text-sm font-semibold text-zinc-900">{statCell(overall.bpm)}</td>
              <td className="px-2 py-2 text-center text-sm font-semibold text-zinc-900">{statCell(overall.bpa)}</td>
              <td className="px-2 py-2 text-center text-sm font-semibold text-zinc-900">{statCell(overall.bpp)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
