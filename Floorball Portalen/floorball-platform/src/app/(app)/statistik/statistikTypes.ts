import type { StatsAggregationMode } from "@/components/StatsAggregationModeSlicer";

export type StatistikTabKey = "players" | "teams";

export type StatistikHighlight = "club" | "team" | null;

export type StatistikPlayerRow = {
  name: string;
  team: string;
  holdId: string | null;
  age: number | null;
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

  highlight: StatistikHighlight;
};

export type StatistikTeamRow = {
  team: string;
  holdId: string | null;
  games: number;

  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;

  ppGoalsFor: number; // PPM+
  ppGoalsAgainst: number; // PPM-
  ppAttempts: number;

  bpGoalsFor: number; // BPM+
  bpGoalsAgainst: number; // BPM-
  bpAttempts: number;

  highlight: StatistikHighlight;
};

export type StatistikOverviewData = {
  scopeLabel: string;
  mode: StatsAggregationMode;
  selectedTeamName: string | null;
  players: StatistikPlayerRow[];
  teams: StatistikTeamRow[];
};
