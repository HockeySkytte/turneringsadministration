-- Manual additive schema update (safe, non-destructive)
-- Needed because TA domain tables are created outside Prisma migrations and the DB has drift.

ALTER TABLE IF EXISTS "MatchProtocolPlayer"
  ADD COLUMN IF NOT EXISTS "reserve" TEXT,
  ADD COLUMN IF NOT EXISTS "leader" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT;

ALTER TABLE IF EXISTS "MatchProtocolEvent"
  ADD COLUMN IF NOT EXISTS "status" TEXT;

ALTER TABLE IF EXISTS "MatchUploadLineup"
  ADD COLUMN IF NOT EXISTS "reserve" TEXT,
  ADD COLUMN IF NOT EXISTS "leader" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT;

ALTER TABLE IF EXISTS "MatchUploadEvent"
  ADD COLUMN IF NOT EXISTS "status" TEXT;

ALTER TABLE IF EXISTS ta_matches
  ADD COLUMN IF NOT EXISTS result TEXT;
