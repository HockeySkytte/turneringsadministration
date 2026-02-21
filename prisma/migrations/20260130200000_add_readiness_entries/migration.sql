-- Add TeamReadinessEntry

CREATE TABLE "TeamReadinessEntry" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "fatigue" INTEGER NOT NULL,
    "sleepQuality" INTEGER NOT NULL,
    "sleepDuration" INTEGER NOT NULL,
    "soreness" INTEGER NOT NULL,
    "mood" INTEGER NOT NULL,
    "stress" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamReadinessEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamReadinessEntry_teamId_userId_entryDate_key" ON "TeamReadinessEntry"("teamId", "userId", "entryDate");
CREATE INDEX "TeamReadinessEntry_teamId_entryDate_idx" ON "TeamReadinessEntry"("teamId", "entryDate");
CREATE INDEX "TeamReadinessEntry_userId_entryDate_idx" ON "TeamReadinessEntry"("userId", "entryDate");

ALTER TABLE "TeamReadinessEntry" ADD CONSTRAINT "TeamReadinessEntry_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamReadinessEntry" ADD CONSTRAINT "TeamReadinessEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
