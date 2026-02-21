-- CreateEnum
CREATE TYPE "TestType" AS ENUM ('BEEP');

-- CreateTable
CREATE TABLE "TeamTest" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "type" "TestType" NOT NULL,
    "testDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamTestResult" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resultText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamTestResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamTest_teamId_testDate_idx" ON "TeamTest"("teamId", "testDate");

-- CreateIndex
CREATE INDEX "TeamTest_teamId_createdAt_idx" ON "TeamTest"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamTestResult_testId_createdAt_idx" ON "TeamTestResult"("testId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamTestResult_testId_userId_key" ON "TeamTestResult"("testId", "userId");

-- AddForeignKey
ALTER TABLE "TeamTest" ADD CONSTRAINT "TeamTest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamTestResult" ADD CONSTRAINT "TeamTestResult_testId_fkey" FOREIGN KEY ("testId") REFERENCES "TeamTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamTestResult" ADD CONSTRAINT "TeamTestResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
