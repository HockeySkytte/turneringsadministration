"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export type KalenderRow = {
  id: string;
  dateText: string;
  timeText: string;
  league: string;
  pool: string;
  stage: string;
  homeTeam: string;
  awayTeam: string;
  homeHoldId: string | null;
  awayHoldId: string | null;
  resultText: string;
  isClubMatch: boolean;
  isTeamMatch: boolean;
};

export default function KalenderTableClient({ rows }: { rows: KalenderRow[] }) {
  const router = useRouter();

  function holdHref(args: { holdId: string; league: string; pool: string; stage: string }) {
    const qs = new URLSearchParams();
    if (args.league) qs.set("league", args.league);
    if (args.pool) qs.set("pool", args.pool);
    if (args.stage) qs.set("stage", args.stage);
    const q = qs.toString();
    return `/hold/${encodeURIComponent(args.holdId)}${q ? `?${q}` : ""}`;
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="ta-kal-container mt-4 overflow-auto rounded-xl border border-zinc-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="ta-kal-thead bg-zinc-50">
          <tr>
            <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Dato</th>
            <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Tid</th>
            <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Liga</th>
            <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Pulje</th>
            <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Stadie</th>
            <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Hjemmehold</th>
            <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Udehold</th>
            <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Resultat</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const rowStyleClass = r.isTeamMatch
              ? "ta-kal-team"
              : r.isClubMatch
                ? "ta-kal-club"
                : "ta-kal-base";

            return (
              <tr
                key={r.id}
                tabIndex={0}
                className={
                  "ta-kal-row cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 " +
                  rowStyleClass
                }
                onClick={() => router.push(`/kamp/${encodeURIComponent(r.id)}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/kamp/${encodeURIComponent(r.id)}`);
                  }
                }}
              >
                <td className="ta-kal-cell border-b border-zinc-100 px-3 py-2 align-top">{r.dateText}</td>
                <td className="ta-kal-cell border-b border-zinc-100 px-3 py-2 align-top">{r.timeText}</td>
                <td className="ta-kal-cell border-b border-zinc-100 px-3 py-2 align-top">{r.league}</td>
                <td className="ta-kal-cell border-b border-zinc-100 px-3 py-2 align-top">{r.pool}</td>
                <td className="ta-kal-cell border-b border-zinc-100 px-3 py-2 align-top">{r.stage}</td>
                <td className="ta-kal-cell border-b border-zinc-100 px-3 py-2 align-top">
                  {r.homeHoldId ? (
                    <Link
                      href={holdHref({ holdId: r.homeHoldId, league: r.league, pool: r.pool, stage: r.stage })}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {r.homeTeam}
                    </Link>
                  ) : (
                    r.homeTeam
                  )}
                </td>
                <td className="ta-kal-cell border-b border-zinc-100 px-3 py-2 align-top">
                  {r.awayHoldId ? (
                    <Link
                      href={holdHref({ holdId: r.awayHoldId, league: r.league, pool: r.pool, stage: r.stage })}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {r.awayTeam}
                    </Link>
                  ) : (
                    r.awayTeam
                  )}
                </td>
                <td className="ta-kal-cell border-b border-zinc-100 px-3 py-2 align-top">{r.resultText}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
