-- Add SUPERUSER role
DO $$
BEGIN
  ALTER TYPE "GlobalRole" ADD VALUE 'SUPERUSER';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Leagues
CREATE TABLE IF NOT EXISTS "League" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "League_name_key" ON "League"("name");

INSERT INTO "League" ("id", "name", "createdAt", "updatedAt")
VALUES ('league_default', 'Standard Liga', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- Teams belong to a league
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "leagueId" TEXT NOT NULL DEFAULT 'league_default';

DO $$
BEGIN
  ALTER TABLE "Team" ADD CONSTRAINT "Team_leagueId_fkey"
    FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP INDEX IF EXISTS "Team_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Team_leagueId_name_key" ON "Team"("leagueId", "name");
CREATE INDEX IF NOT EXISTS "Team_leagueId_idx" ON "Team"("leagueId");

-- Users store league/team
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "superuserStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "leagueId" TEXT NOT NULL DEFAULT 'league_default';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "teamId" TEXT;

DO $$
BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_leagueId_fkey"
    FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "User_leagueId_idx" ON "User"("leagueId");
CREATE INDEX IF NOT EXISTS "User_teamId_idx" ON "User"("teamId");
