-- DropIndex
DROP INDEX "Team_leagueId_idx";

-- DropIndex
DROP INDEX "User_leagueId_idx";

-- DropIndex
DROP INDEX "User_teamId_idx";

-- AlterTable
ALTER TABLE "Team" ALTER COLUMN "leagueId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "leagueId" DROP DEFAULT;
