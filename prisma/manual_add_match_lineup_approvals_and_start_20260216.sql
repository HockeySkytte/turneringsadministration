-- Manual DB patch: add lineup approval/signature + match start tables.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS "MatchLineupApproval" (
  "id" TEXT NOT NULL,
  "kampId" INTEGER NOT NULL,
  "venue" TEXT NOT NULL,
  "leaderName" TEXT NOT NULL,
  "signaturePng" BYTEA NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MatchLineupApproval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatchLineupApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "ta_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "MatchLineupApproval_kampId_venue_key" ON "MatchLineupApproval"("kampId", "venue");
CREATE INDEX IF NOT EXISTS "MatchLineupApproval_kampId_idx" ON "MatchLineupApproval"("kampId");

CREATE TABLE IF NOT EXISTS "MatchStart" (
  "id" TEXT NOT NULL,
  "kampId" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MatchStart_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatchStart_kampId_key" UNIQUE ("kampId"),
  CONSTRAINT "MatchStart_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "ta_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MatchStart_kampId_idx" ON "MatchStart"("kampId");
