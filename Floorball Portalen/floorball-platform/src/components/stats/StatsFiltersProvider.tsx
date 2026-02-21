"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type StatsFilters = {
  perspektiv: string;
  kamp: string;
  styrke: string;
  event: string;
  scope: "" | "individual" | "onIce";
  spiller: string;
  maalmand: string;
  paaBanen: string[];
};

type StatsFiltersContextValue = {
  filters: StatsFilters;
  setPerspektiv: (v: string) => void;
  setKamp: (v: string) => void;
  setStyrke: (v: string) => void;
  setEvent: (v: string) => void;
  setScope: (v: "" | "individual" | "onIce") => void;
  setSpiller: (v: string) => void;
  setMaalmand: (v: string) => void;
  setPaaBanen: (v: string[]) => void;
};

const StatsFiltersContext = createContext<StatsFiltersContextValue | null>(null);

export function useStatsFilters() {
  const ctx = useContext(StatsFiltersContext);
  if (!ctx) throw new Error("useStatsFilters must be used within StatsFiltersProvider");
  return ctx;
}

export default function StatsFiltersProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [filters, setFilters] = useState<StatsFilters>({
    perspektiv: "",
    kamp: "",
    styrke: "",
    event: "",
    scope: "",
    spiller: "",
    maalmand: "",
    paaBanen: [],
  });

  const value = useMemo<StatsFiltersContextValue>(
    () => ({
      filters,
      setPerspektiv: (v) =>
        setFilters((s) => ({
          ...s,
          perspektiv: v,
        })),
      setKamp: (v) =>
        setFilters((s) => ({
          ...s,
          kamp: v,
        })),
      setStyrke: (v) =>
        setFilters((s) => ({
          ...s,
          styrke: v,
        })),
      setEvent: (v) =>
        setFilters((s) => ({
          ...s,
          event: v,
        })),
      setScope: (v) =>
        setFilters((s) => ({
          ...s,
          scope: v,
        })),
      setSpiller: (v) =>
        setFilters((s) => ({
          ...s,
          spiller: v,
        })),
      setMaalmand: (v) =>
        setFilters((s) => ({
          ...s,
          maalmand: v,
        })),
      setPaaBanen: (v) =>
        setFilters((s) => ({
          ...s,
          paaBanen: v,
        })),
    }),
    [filters]
  );

  return (
    <StatsFiltersContext.Provider value={value}>
      {children}
    </StatsFiltersContext.Provider>
  );
}
