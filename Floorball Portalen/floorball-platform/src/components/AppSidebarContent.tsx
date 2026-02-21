"use client";

import { usePathname } from "next/navigation";

import SeasonSlicer, { type SeasonOption } from "@/components/SeasonSlicer";
import GenderSlicer from "@/components/GenderSlicer";
import AgeGroupSlicer from "@/components/AgeGroupSlicer";
import type { AgeGroupValue } from "@/lib/ageGroups";
import CompetitionRowSlicer, {
  type CompetitionRowOption,
} from "@/components/CompetitionRowSlicer";
import CompetitionPoolSlicer, {
  type CompetitionPoolOption,
} from "@/components/CompetitionPoolSlicer";
import CompetitionTeamSlicer, {
  type CompetitionTeamOption,
} from "@/components/CompetitionTeamSlicer";
import CalendarModeSlicer, { type CalendarMode } from "@/components/CalendarModeSlicer";
import StatsAggregationModeSlicer, { type StatsAggregationMode } from "@/components/StatsAggregationModeSlicer";
import KalenderFiltersClient from "@/components/ta/KalenderFiltersClient";

export default function AppSidebarContent({
  seasons,
  selectedSeasonStartYear,
  selectedGender,
  ageGroups,
  selectedAgeGroup,
  rows,
  selectedRowId,
  pools,
  selectedPoolId,
  poolTeams,
  selectedTeamName,
  calendarMode,
  statsAggregationMode,
}: {
  seasons: SeasonOption[];
  selectedSeasonStartYear: number | null;
  selectedGender: "MEN" | "WOMEN" | null;
  ageGroups: Array<{ value: AgeGroupValue; label: string }>;
  selectedAgeGroup: AgeGroupValue | null;
  rows: CompetitionRowOption[];
  selectedRowId: string | null;
  pools: CompetitionPoolOption[];
  selectedPoolId: string | null;
  poolTeams: CompetitionTeamOption[];
  selectedTeamName: string | null;
  calendarMode: CalendarMode;
  statsAggregationMode: StatsAggregationMode;
}) {
  const pathname = usePathname();
  const isMatchDetailPage =
    pathname === "/kamp" ||
    pathname.startsWith("/kamp/") ||
    pathname === "/kampe" ||
    pathname.startsWith("/kampe/") ||
    pathname.startsWith("/kalender/kamp/");
  const isKalender = pathname === "/kalender";
  const isStatistik = pathname === "/statistik";
  const isStilling = pathname === "/stilling";
  const useTaFilters =
    pathname === "/kalender" ||
    pathname.startsWith("/kalender/") ||
    pathname === "/statistik" ||
    pathname.startsWith("/statistik/") ||
    pathname === "/stilling" ||
    pathname.startsWith("/stilling/") ||
    pathname === "/hold" ||
    pathname.startsWith("/hold/") ||
    pathname === "/turnering" ||
    pathname.startsWith("/turnering/") ||
    pathname === "/klubleder" ||
    pathname.startsWith("/klubleder/") ||
    pathname === "/holdleder" ||
    pathname.startsWith("/holdleder/");

  return (
    <>
      <div className="mt-0">
        <div className="mb-3 flex items-center gap-3">
          <img
            src="/brand/floorball-danmark.png"
            alt="Floorball Danmark"
            className="h-[75px] w-[75px] rounded-full object-cover shadow-sm ring-1 ring-white/60"
          />

          <div className="leading-tight">
            <div className="text-[var(--brand-foreground)]">
              <div className="text-xl font-black uppercase tracking-[0.16em] leading-none">
                <span className="block">Floorball</span>
                <span className="block">Danmark</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {isMatchDetailPage ? null : useTaFilters ? (
            <>
              <KalenderFiltersClient />
              {isStatistik ? <StatsAggregationModeSlicer mode={statsAggregationMode} /> : null}
            </>
          ) : (
            <>
              <SeasonSlicer seasons={seasons} selectedStartYear={selectedSeasonStartYear} />
              <GenderSlicer selectedGender={selectedGender} />
              <AgeGroupSlicer ageGroups={ageGroups} selectedAgeGroup={selectedAgeGroup} />
              <CompetitionRowSlicer rows={rows} selectedRowId={selectedRowId} />
              <CompetitionPoolSlicer pools={pools} selectedPoolId={selectedPoolId} />
              <CompetitionTeamSlicer teams={poolTeams} selectedTeamName={selectedTeamName} />
              <CalendarModeSlicer mode={calendarMode} hasTeam={Boolean(selectedTeamName)} />
              <StatsAggregationModeSlicer mode={statsAggregationMode} />
            </>
          )}
        </div>

      </div>
    </>
  );
}
