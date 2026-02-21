-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('LEADER', 'PLAYER', 'SUPPORTER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING_ADMIN', 'PENDING_LEADER', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TeamColor" AS ENUM ('RED', 'WHITE', 'BLACK', 'BLUE', 'GREEN');

-- CreateEnum
CREATE TYPE "StatsFileKind" AS ENUM ('EVENTS', 'PLAYERS');

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "themePrimary" "TeamColor" NOT NULL DEFAULT 'RED',
    "themeSecondary" "TeamColor" NOT NULL DEFAULT 'WHITE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "globalRole" "GlobalRole" NOT NULL DEFAULT 'USER',
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL,
    "status" "ApprovalStatus" NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatsFile" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "kind" "StatsFileKind" NOT NULL,
    "originalName" TEXT NOT NULL,
    "gameId" TEXT,
    "gameDate" TIMESTAMP(3),
    "competition" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatsFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatsEvent" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "rowId" INTEGER,
    "timestamp" TIMESTAMP(3),
    "event" TEXT NOT NULL,
    "teamName" TEXT,
    "venue" TEXT,
    "teamHome" TEXT,
    "teamAway" TEXT,
    "period" INTEGER,
    "perspective" TEXT,
    "strength" TEXT,
    "p1No" INTEGER,
    "p1Name" TEXT,
    "p2No" INTEGER,
    "p2Name" TEXT,
    "gNo" INTEGER,
    "goalieName" TEXT,
    "homeLine" TEXT,
    "homePlayers" TEXT,
    "homePlayersNames" TEXT,
    "awayLine" TEXT,
    "awayPlayers" TEXT,
    "awayPlayersNames" TEXT,
    "xM" DOUBLE PRECISION,
    "yM" DOUBLE PRECISION,
    "gameId" TEXT,
    "gameDate" TIMESTAMP(3),
    "competition" TEXT,
    "videoUrl" TEXT,
    "videoTime" INTEGER,
    "aimX" DOUBLE PRECISION,
    "aimY" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatsPlayer" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "number" INTEGER,
    "name" TEXT,
    "line" TEXT,
    "venue" TEXT,
    "teamName" TEXT,
    "teamColor" TEXT,
    "gameId" TEXT,
    "gameDate" TIMESTAMP(3),
    "competition" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatsPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "TeamMembership_teamId_role_status_idx" ON "TeamMembership"("teamId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMembership_userId_teamId_key" ON "TeamMembership"("userId", "teamId");

-- CreateIndex
CREATE INDEX "StatsFile_teamId_kind_createdAt_idx" ON "StatsFile"("teamId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "StatsFile_teamId_gameId_idx" ON "StatsFile"("teamId", "gameId");

-- CreateIndex
CREATE INDEX "StatsEvent_teamId_createdAt_idx" ON "StatsEvent"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "StatsEvent_teamId_gameId_idx" ON "StatsEvent"("teamId", "gameId");

-- CreateIndex
CREATE INDEX "StatsPlayer_teamId_createdAt_idx" ON "StatsPlayer"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "StatsPlayer_teamId_gameId_idx" ON "StatsPlayer"("teamId", "gameId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatsFile" ADD CONSTRAINT "StatsFile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatsFile" ADD CONSTRAINT "StatsFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatsEvent" ADD CONSTRAINT "StatsEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatsEvent" ADD CONSTRAINT "StatsEvent_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StatsFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatsPlayer" ADD CONSTRAINT "StatsPlayer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatsPlayer" ADD CONSTRAINT "StatsPlayer_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StatsFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

