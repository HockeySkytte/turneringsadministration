-- Add competition models for scraped Sportssys data

CREATE TYPE "AgeGroup" AS ENUM ('SENIOR');

CREATE TABLE "CompetitionSeason" (
  "id" TEXT NOT NULL,
  "startYear" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompetitionSeason_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompetitionSeason_startYear_key" ON "CompetitionSeason"("startYear");

CREATE TABLE "CompetitionRow" (
  "id" TEXT NOT NULL,
  "raekkeId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "gender" "Gender" NOT NULL,
  "ageGroup" "AgeGroup" NOT NULL,
  "seasonId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompetitionRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompetitionRow_raekkeId_key" ON "CompetitionRow"("raekkeId");
CREATE INDEX "CompetitionRow_gender_ageGroup_seasonId_idx" ON "CompetitionRow"("gender", "ageGroup", "seasonId");

ALTER TABLE "CompetitionRow" ADD CONSTRAINT "CompetitionRow_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "CompetitionSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CompetitionPool" (
  "id" TEXT NOT NULL,
  "puljeId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "rowId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompetitionPool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompetitionPool_puljeId_key" ON "CompetitionPool"("puljeId");
CREATE INDEX "CompetitionPool_rowId_idx" ON "CompetitionPool"("rowId");

ALTER TABLE "CompetitionPool" ADD CONSTRAINT "CompetitionPool_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "CompetitionRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CompetitionPoolTeam" (
  "id" TEXT NOT NULL,
  "poolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rank" INTEGER,
  "played" INTEGER,
  "wins" INTEGER,
  "draws" INTEGER,
  "losses" INTEGER,
  "goalsFor" INTEGER,
  "goalsAgainst" INTEGER,
  "points" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompetitionPoolTeam_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompetitionPoolTeam_poolId_name_key" ON "CompetitionPoolTeam"("poolId", "name");
CREATE INDEX "CompetitionPoolTeam_poolId_rank_idx" ON "CompetitionPoolTeam"("poolId", "rank");

ALTER TABLE "CompetitionPoolTeam" ADD CONSTRAINT "CompetitionPoolTeam_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "CompetitionPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CompetitionMatch" (
  "id" TEXT NOT NULL,
  "kampId" INTEGER NOT NULL,
  "matchNo" INTEGER,
  "poolId" TEXT NOT NULL,
  "startAt" TIMESTAMP(3),
  "venue" TEXT,
  "homeTeam" TEXT NOT NULL,
  "awayTeam" TEXT NOT NULL,
  "homeScore" INTEGER,
  "awayScore" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompetitionMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompetitionMatch_kampId_key" ON "CompetitionMatch"("kampId");
CREATE INDEX "CompetitionMatch_poolId_startAt_idx" ON "CompetitionMatch"("poolId", "startAt");

ALTER TABLE "CompetitionMatch" ADD CONSTRAINT "CompetitionMatch_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "CompetitionPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "ageGroup" "AgeGroup" NOT NULL DEFAULT 'SENIOR';
ALTER TABLE "User" ADD COLUMN "competitionRowId" TEXT;
ALTER TABLE "User" ADD COLUMN "competitionPoolId" TEXT;
ALTER TABLE "User" ADD COLUMN "competitionTeamName" TEXT;

ALTER TABLE "User" ADD CONSTRAINT "User_competitionRowId_fkey" FOREIGN KEY ("competitionRowId") REFERENCES "CompetitionRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_competitionPoolId_fkey" FOREIGN KEY ("competitionPoolId") REFERENCES "CompetitionPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;
