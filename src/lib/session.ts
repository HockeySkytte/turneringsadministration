import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import type { AgeGroupValue } from "@/lib/ageGroups";

export type SessionData = {
  userId?: string;
  guestDefaultsApplied?: boolean;
  selectedLeagueId?: string;
  selectedTeamId?: string;
  selectedCompetitionSeasonStartYear?: number;
  selectedGender?: "MEN" | "WOMEN";
  selectedAgeGroup?: AgeGroupValue;
  selectedCompetitionRowId?: string;
  selectedCompetitionPoolId?: string;
  selectedCompetitionTeamName?: string;
  selectedCompetitionCalendarMode?: "ALL" | "TEAM";
  selectedStatsAggregationMode?: "TOTAL" | "PER_GAME";
  selectedViewMode?: "LIGHT" | "DARK";
};

const sessionOptions: SessionOptions = {
  cookieName: "turnerings_session",
  password: process.env.SESSION_PASSWORD ?? "",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
};

export async function getSession() {
  if (!process.env.SESSION_PASSWORD || process.env.SESSION_PASSWORD.length < 32) {
    throw new Error(
      "SESSION_PASSWORD mangler eller er for kort (min. 32 tegn)."
    );
  }

  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
