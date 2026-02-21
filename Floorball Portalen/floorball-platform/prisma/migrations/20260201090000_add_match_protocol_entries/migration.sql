-- CreateEnum
CREATE TYPE "MatchProtocolSide" AS ENUM ('HOME', 'AWAY');

-- CreateTable
CREATE TABLE "MatchProtocolPlayer" (
    "id" TEXT NOT NULL,
    "kampId" INTEGER NOT NULL,
    "side" "MatchProtocolSide" NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "role" TEXT,
    "number" TEXT,
    "name" TEXT,
    "born" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchProtocolPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchProtocolEvent" (
    "id" TEXT NOT NULL,
    "kampId" INTEGER NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "period" TEXT,
    "time" TEXT,
    "side" TEXT,
    "number" TEXT,
    "goal" TEXT,
    "assist" TEXT,
    "penalty" TEXT,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchProtocolEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchProtocolPlayer_kampId_side_idx" ON "MatchProtocolPlayer"("kampId", "side");

-- CreateIndex
CREATE INDEX "MatchProtocolEvent_kampId_idx" ON "MatchProtocolEvent"("kampId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchProtocolPlayer_kampId_side_rowIndex_key" ON "MatchProtocolPlayer"("kampId", "side", "rowIndex");

-- CreateIndex
CREATE UNIQUE INDEX "MatchProtocolEvent_kampId_rowIndex_key" ON "MatchProtocolEvent"("kampId", "rowIndex");
