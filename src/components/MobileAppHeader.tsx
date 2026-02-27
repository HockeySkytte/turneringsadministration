"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { SeasonOption } from "@/components/SeasonSlicer";
import type { CompetitionRowOption } from "@/components/CompetitionRowSlicer";
import type { CompetitionPoolOption } from "@/components/CompetitionPoolSlicer";
import type { CompetitionTeamOption } from "@/components/CompetitionTeamSlicer";
import type { CalendarMode } from "@/components/CalendarModeSlicer";
import StatsAggregationModeSlicer, { type StatsAggregationMode } from "@/components/StatsAggregationModeSlicer";
import type { AgeGroupValue } from "@/lib/ageGroups";
import KalenderFiltersClient from "@/components/ta/KalenderFiltersClient";

export type MobileAppHeaderUser = {
  username: string;
};

export type ViewMode = "LIGHT" | "DARK";

export default function MobileAppHeader({
  user,
  canManageApprovals,
  canAccessTurnering,
  canAccessKlubleder,
  canAccessHoldleder,
  canAccessDommerpaasaetter,
  canAccessDommer,
  viewMode,
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
  logoUrl,
}: {
  user: MobileAppHeaderUser | null;
  canManageApprovals: boolean;
  canAccessTurnering: boolean;
  canAccessKlubleder: boolean;
  canAccessHoldleder: boolean;
  canAccessDommerpaasaetter: boolean;
  canAccessDommer: boolean;
  viewMode: ViewMode;
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
  logoUrl: string | null;
}) {
  const pathname = usePathname();
  const hideSlicers =
    pathname === "/tilfoej-rolle" ||
    pathname.startsWith("/tilfoej-rolle/") ||
    pathname === "/indstillinger" ||
    pathname.startsWith("/indstillinger/") ||
    pathname === "/klubleder" ||
    pathname.startsWith("/klubleder/") ||
    pathname === "/holdleder" ||
    pathname.startsWith("/holdleder/") ||
    pathname === "/dommerpaasaetter" ||
    pathname.startsWith("/dommerpaasaetter/") ||
    pathname === "/dommer" ||
    pathname.startsWith("/dommer/");
  const isMatchDetailPage =
    pathname === "/kamp" ||
    pathname.startsWith("/kamp/") ||
    pathname === "/kampe" ||
    pathname.startsWith("/kampe/") ||
    pathname.startsWith("/kalender/kamp/");
  const isStatistik = pathname === "/statistik";
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
  const searchParams = useSearchParams();

  const filtersSuffix = (() => {
    const keys = ["season", "clubId", "gender", "age", "league", "stage", "pool", "teamId", "matches"];
    const out = new URLSearchParams();
    for (const k of keys) {
      const v = searchParams.get(k);
      if (v) out.set(k, v);
    }
    const qs = out.toString();
    return qs ? `?${qs}` : "";
  })();
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const allowFilters = !isMatchDetailPage && !hideSlicers && useTaFilters;

  useEffect(() => {
    if (!allowFilters) setFiltersOpen(false);
  }, [allowFilters]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function setViewMode(mode: ViewMode) {
    await fetch("/api/ui/select-view-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    window.location.reload();
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  function toggleMenu() {
    setMenuOpen((v) => {
      const next = !v;
      if (next) setFiltersOpen(false);
      return next;
    });
  }

  function toggleFilters() {
    setFiltersOpen((v) => {
      const next = !v;
      if (next) setMenuOpen(false);
      return next;
    });
  }

  return (
    <div className="md:hidden">
      <div className="bg-[image:var(--sidebar-gradient)] bg-cover bg-no-repeat text-[var(--brand-foreground)]">
        {/* Top bar */}
        <div className="flex items-start justify-between px-5 pt-5">
          <div>
            <div className="flex items-center gap-3 tracking-tight">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-16 w-16 rounded-full object-cover shadow-sm ring-1 ring-white/60"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
              <div className="flex flex-col text-xl font-black uppercase tracking-[0.16em] leading-none">
                <span>Floorball</span>
                <span>Danmark</span>
              </div>
            </div>
            <div className="mt-1 text-sm opacity-80">{user?.username ?? "Gæst"}</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMenu}
              aria-expanded={menuOpen}
              className="grid h-12 w-12 place-items-center rounded-xl border border-white/20 bg-white/10"
              title="Menu"
            >
              <span className="text-xl leading-none">≡</span>
            </button>
            {allowFilters ? (
              <button
                type="button"
                onClick={toggleFilters}
                aria-expanded={filtersOpen}
                className="grid h-12 w-12 place-items-center rounded-xl border border-white/20 bg-white/10"
                title="Filtre"
              >
                <span className="text-xl leading-none">⎚</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Menu (mobile) */}
        {menuOpen ? (
          <div className="mt-5 px-4 pb-4">
            <div className="overflow-hidden rounded-xl border border-white/15 bg-white/5">
              <nav className="divide-y divide-white/10">
                <Link
                  className="block px-4 py-4 text-lg font-semibold"
                  href={`/kalender${filtersSuffix}`}
                  onClick={closeMenu}
                >
                  Kalender
                </Link>

                <Link
                  className="block px-4 py-4 text-lg font-semibold"
                  href={`/stilling${filtersSuffix}`}
                  onClick={closeMenu}
                >
                  Stilling
                </Link>

                <Link
                  className="block px-4 py-4 text-lg font-semibold"
                  href={`/statistik${filtersSuffix}`}
                  onClick={closeMenu}
                >
                  Statistik
                </Link>

                <a
                  className="block px-4 py-4 text-lg font-semibold"
                  href="https://sports-tagging.netlify.app/floorball/"
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={closeMenu}
                >
                  Shot Plotter
                </a>
                {canManageApprovals ? (
                  <Link
                    className="block px-4 py-4 text-lg font-semibold"
                    href="/admin"
                    onClick={closeMenu}
                  >
                    Admin
                  </Link>
                ) : null}

                {canAccessTurnering ? (
                  <Link
                    className="block px-4 py-4 text-lg font-semibold"
                    href="/turnering"
                    onClick={closeMenu}
                  >
                    Turnering
                  </Link>
                ) : null}

                {canAccessKlubleder ? (
                  <Link
                    className="block px-4 py-4 text-lg font-semibold"
                    href={`/klubleder${filtersSuffix}`}
                    onClick={closeMenu}
                  >
                    Klubleder
                  </Link>
                ) : null}

                {canAccessHoldleder ? (
                  <Link
                    className="block px-4 py-4 text-lg font-semibold"
                    href={`/holdleder${filtersSuffix}`}
                    onClick={closeMenu}
                  >
                    Holdleder
                  </Link>
                ) : null}

                {canAccessDommerpaasaetter ? (
                  <Link
                    className="block px-4 py-4 text-lg font-semibold"
                    href="/dommerpaasaetter"
                    onClick={closeMenu}
                  >
                    Dommerpåsætter
                  </Link>
                ) : null}

                {canAccessDommer ? (
                  <Link
                    className="block px-4 py-4 text-lg font-semibold"
                    href="/dommer"
                    onClick={closeMenu}
                  >
                    Dommer
                  </Link>
                ) : null}

                <div className="px-4 py-4">
                  <div className="text-sm font-semibold opacity-90">Visning</div>
                  <div className="mt-2 flex overflow-hidden rounded-md border border-white/20 bg-white/10">
                    <button
                      type="button"
                      onClick={() => void setViewMode("LIGHT")}
                      className={
                        "flex-1 px-3 py-2 text-sm font-semibold " +
                        (viewMode === "LIGHT" ? "bg-white/20" : "hover:bg-white/10")
                      }
                    >
                      Lys
                    </button>
                    <button
                      type="button"
                      onClick={() => void setViewMode("DARK")}
                      className={
                        "flex-1 px-3 py-2 text-sm font-semibold " +
                        (viewMode === "DARK" ? "bg-white/20" : "hover:bg-white/10")
                      }
                    >
                      Mørk
                    </button>
                  </div>
                </div>

                {user ? (
                  <>
                    <Link
                      className="block px-4 py-4 text-lg font-semibold"
                      href="/indstillinger"
                      onClick={closeMenu}
                    >
                      Indstillinger
                    </Link>

                    <button
                      type="button"
                      onClick={logout}
                      className="block w-full px-4 py-4 text-left text-lg font-semibold"
                    >
                      Log ud
                    </button>
                  </>
                ) : (
                  <Link
                    className="block px-4 py-4 text-lg font-semibold"
                    href="/login"
                    onClick={closeMenu}
                  >
                    Log ind
                  </Link>
                )}
              </nav>
            </div>
          </div>
        ) : null}

        {/* Filters (mobile) */}
        {filtersOpen && allowFilters ? (
          <div className="mt-5 px-5 pb-5">
            <KalenderFiltersClient />
            {isStatistik ? (
              <div className="mt-4">
                <StatsAggregationModeSlicer mode={statsAggregationMode} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
