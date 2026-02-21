-- CreateTable
CREATE TABLE "ta_rosters" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ta_rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ta_roster_players" (
    "id" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "number" TEXT,
    "name" TEXT NOT NULL,
    "birthDate" DATE,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ta_roster_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ta_roster_leaders" (
    "id" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ta_roster_leaders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ta_rosters_teamId_key" ON "ta_rosters"("teamId");

-- CreateIndex
CREATE INDEX "ta_rosters_teamId_idx" ON "ta_rosters"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ta_roster_players_rosterId_rowIndex_key" ON "ta_roster_players"("rosterId", "rowIndex");

-- CreateIndex
CREATE INDEX "ta_roster_players_rosterId_idx" ON "ta_roster_players"("rosterId");

-- CreateIndex
CREATE UNIQUE INDEX "ta_roster_leaders_rosterId_rowIndex_key" ON "ta_roster_leaders"("rosterId", "rowIndex");

-- CreateIndex
CREATE INDEX "ta_roster_leaders_rosterId_idx" ON "ta_roster_leaders"("rosterId");

-- AddForeignKey
ALTER TABLE "ta_rosters" ADD CONSTRAINT "ta_rosters_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ta_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ta_rosters" ADD CONSTRAINT "ta_rosters_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "ta_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ta_roster_players" ADD CONSTRAINT "ta_roster_players_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "ta_rosters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ta_roster_leaders" ADD CONSTRAINT "ta_roster_leaders_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "ta_rosters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
