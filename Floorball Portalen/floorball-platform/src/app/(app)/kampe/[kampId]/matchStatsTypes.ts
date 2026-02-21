export type TeamVenue = "Hjemme" | "Ude";

export type MatchStatsSubtab = "lineups" | "events" | "table";

export type MatchEventRow = {
  rowIndex: number;
  venue: TeamVenue | null;
  period: string;
  time: string;
  timeAbs: string; // ((period-1)*20:00 + time)
  timeAbsSeconds: number;
  event: string;
  player1: string;
  player2: string;
  score: string;
  pim: string;
  code: string;
  strength: "PP" | "BP" | "";
};

export type MatchPlayerStatsRow = {
  venue: TeamVenue;
  number: string;
  role: string;
  name: string;
  age: number | null;

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

export type MatchStatsData = {
  kampId: number;
  matchDateISO: string | null;
  homeTeam: string;
  awayTeam: string;

  homeLineup: MatchPlayerStatsRow[];
  awayLineup: MatchPlayerStatsRow[];

  events: MatchEventRow[];

  table: MatchPlayerStatsRow[];
  source: "upload" | "protocol" | "none";
};
