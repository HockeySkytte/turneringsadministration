-- Manual DB patch: add scopeKey for ta_user_roles and adjust uniqueness.
-- Allows multiple TEAM_LEADER/CLUB_LEADER/SECRETARIAT roles for different teams/clubs.
-- Safe-ish to run once; it checks for column/index existence.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'ta_user_roles' AND column_name = 'scopeKey'
  ) THEN
    ALTER TABLE "ta_user_roles" ADD COLUMN "scopeKey" TEXT NOT NULL DEFAULT 'GLOBAL';
  END IF;
END $$;

-- Backfill scopeKey based on role + metadata
UPDATE "ta_user_roles"
SET "scopeKey" =
  CASE
    WHEN "role" IN ('CLUB_LEADER','SECRETARIAT') AND "clubId" IS NOT NULL THEN 'club:' || "clubId"
    WHEN "role" IN ('TEAM_LEADER') AND "teamId" IS NOT NULL THEN 'team:' || "teamId"
    ELSE 'GLOBAL'
  END
WHERE "scopeKey" IS NULL OR "scopeKey" = '' OR "scopeKey" = 'GLOBAL';

-- Drop old unique constraint if present
ALTER TABLE "ta_user_roles" DROP CONSTRAINT IF EXISTS "ta_user_roles_userId_role_key";

-- Create new unique index on (userId, role, scopeKey)
CREATE UNIQUE INDEX IF NOT EXISTS "ta_user_roles_userId_role_scopeKey_key" ON "ta_user_roles"("userId", "role", "scopeKey");
