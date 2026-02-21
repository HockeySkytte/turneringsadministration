-- CreateEnum
CREATE TYPE "JsonDocumentScope" AS ENUM ('TEAM', 'PUBLIC');

-- CreateEnum
CREATE TYPE "JsonDocumentKind" AS ENUM ('PLAYBOOK', 'EXERCISE');

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "matchDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JsonDocument" (
    "id" TEXT NOT NULL,
    "scope" "JsonDocumentScope" NOT NULL,
    "kind" "JsonDocumentKind" NOT NULL,
    "teamId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JsonDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Match_teamId_matchDate_idx" ON "Match"("teamId", "matchDate");

-- CreateIndex
CREATE INDEX "Match_teamId_createdAt_idx" ON "Match"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "JsonDocument_scope_kind_createdAt_idx" ON "JsonDocument"("scope", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "JsonDocument_teamId_kind_createdAt_idx" ON "JsonDocument"("teamId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JsonDocument" ADD CONSTRAINT "JsonDocument_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
