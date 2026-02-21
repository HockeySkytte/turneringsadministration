-- CreateTable
CREATE TABLE "MatchRefereeApproval" (
    "id" TEXT NOT NULL,
    "kampId" INTEGER NOT NULL,
    "refIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "refereeNo" TEXT NOT NULL,
    "signaturePng" BYTEA NOT NULL,
    "noRef2" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchRefereeApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchRefereeApproval_kampId_idx" ON "MatchRefereeApproval"("kampId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchRefereeApproval_kampId_refIndex_key" ON "MatchRefereeApproval"("kampId", "refIndex");
