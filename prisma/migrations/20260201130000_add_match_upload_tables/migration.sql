-- CreateTable
CREATE TABLE "MatchUploadLineup" (
    "id" TEXT NOT NULL,
    "kampId" INTEGER NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "date" TIMESTAMP(3),
    "liga" TEXT NOT NULL,
    "pulje" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "cG" TEXT,
    "number" TEXT,
    "name" TEXT,
    "birthday" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchUploadLineup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchUploadEvent" (
    "id" TEXT NOT NULL,
    "kampId" INTEGER NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "date" TIMESTAMP(3),
    "liga" TEXT NOT NULL,
    "pulje" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "period" TEXT,
    "time" TEXT,
    "player1" TEXT,
    "player2" TEXT,
    "score" TEXT,
    "event" TEXT,
    "pim" TEXT,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchUploadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchUploadLineup_kampId_idx" ON "MatchUploadLineup"("kampId");

-- CreateIndex
CREATE INDEX "MatchUploadEvent_kampId_idx" ON "MatchUploadEvent"("kampId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchUploadLineup_kampId_venue_rowIndex_key" ON "MatchUploadLineup"("kampId", "venue", "rowIndex");

-- CreateIndex
CREATE UNIQUE INDEX "MatchUploadEvent_kampId_rowIndex_key" ON "MatchUploadEvent"("kampId", "rowIndex");
