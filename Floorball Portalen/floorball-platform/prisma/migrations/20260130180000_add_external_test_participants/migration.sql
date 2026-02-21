-- Allow TeamTest participants without a User (e.g. pasted from Excel)

-- Drop NOT NULL so rows can exist without userId
ALTER TABLE "TeamTestResult" ALTER COLUMN "userId" DROP NOT NULL;

-- Store non-member participants by name
ALTER TABLE "TeamTestResult" ADD COLUMN "externalName" TEXT;

-- Ensure exactly one participant identifier is present (userId XOR externalName)
ALTER TABLE "TeamTestResult"
ADD CONSTRAINT "TeamTestResult_participant_xor"
CHECK (
  ("userId" IS NOT NULL AND "externalName" IS NULL)
  OR
  ("userId" IS NULL AND "externalName" IS NOT NULL)
);

-- Unique per test for external participants (multiple NULLs allowed)
CREATE UNIQUE INDEX "TeamTestResult_testId_externalName_key" ON "TeamTestResult"("testId", "externalName");
