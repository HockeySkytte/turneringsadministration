import { prisma } from "@/lib/prisma";

const TURNERING_DOMAIN_SCHEMA_VERSION = 13;

const globalForTurnering = globalThis as unknown as {
  turneringDomainSchemaVersion?: number;
  turneringDomainInitPromise?: Promise<void>;
};

export async function ensureTurneringDomainTables() {
  // These are lightweight tables; we create/upgrade them on-demand to avoid full prisma migration drift.
  // Important: do NOT run this on every request. Cache per-process and bump the version when changing SQL.
  if (globalForTurnering.turneringDomainSchemaVersion === TURNERING_DOMAIN_SCHEMA_VERSION) return;
  if (globalForTurnering.turneringDomainInitPromise) return globalForTurnering.turneringDomainInitPromise;

  globalForTurnering.turneringDomainInitPromise = (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ta_clubs (
        id TEXT PRIMARY KEY,
        "clubNo" TEXT,
        name TEXT NOT NULL UNIQUE,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await prisma.$executeRawUnsafe(`ALTER TABLE ta_clubs ADD COLUMN IF NOT EXISTS "clubNo" TEXT;`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS ta_clubs_clubNo_uq ON ta_clubs ("clubNo") WHERE "clubNo" IS NOT NULL AND "clubNo" <> '';`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ta_teams (
        id TEXT PRIMARY KEY,
        "clubId" TEXT NOT NULL,
        league TEXT NOT NULL,
        gender TEXT,
        name TEXT NOT NULL,
        "holdId" TEXT,
        "seasonStartYear" INTEGER,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ta_teams_unique UNIQUE ("clubId", league, gender, name)
      );
    `);

    await prisma.$executeRawUnsafe(`ALTER TABLE ta_teams ADD COLUMN IF NOT EXISTS gender TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_teams ADD COLUMN IF NOT EXISTS "holdId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_teams ADD COLUMN IF NOT EXISTS "seasonStartYear" INTEGER;`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_teams_holdId_idx ON ta_teams ("holdId");`);

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_teams_club_league_idx ON ta_teams ("clubId", league);`);

    // Upgrade existing installs: make uniqueness gender-aware so MEN/WOMEN teams with same
    // (clubId, league, name) do not collide. This is idempotent and only changes the
    // constraint if the existing definition does not include `gender`.
    await prisma.$executeRawUnsafe(`
      DO $$
      DECLARE def TEXT;
      BEGIN
        SELECT pg_get_constraintdef(c.oid)
        INTO def
        FROM pg_constraint c
        WHERE c.conname = 'ta_teams_unique'
          AND c.conrelid = 'ta_teams'::regclass;

        IF def IS NULL THEN
          ALTER TABLE ta_teams ADD CONSTRAINT ta_teams_unique UNIQUE ("clubId", league, gender, name);
        ELSIF def NOT ILIKE '%gender%' THEN
          ALTER TABLE ta_teams DROP CONSTRAINT ta_teams_unique;
          ALTER TABLE ta_teams ADD CONSTRAINT ta_teams_unique UNIQUE ("clubId", league, gender, name);
        END IF;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ta_matches (
        id TEXT PRIMARY KEY,
        "externalId" TEXT,
        date DATE,
        time TIME(0),
        venue TEXT,
        "venueKey" TEXT,
        result TEXT,
        "dommer1" TEXT,
        "dommer1Id" TEXT,
        "dommer1Status" TEXT,
        "dommer1RespondedAt" TIMESTAMPTZ,
        "dommer2" TEXT,
        "dommer2Id" TEXT,
        "dommer2Status" TEXT,
        "dommer2RespondedAt" TIMESTAMPTZ,
        gender TEXT,
        league TEXT,
        stage TEXT,
        pool TEXT,
        "homeTeam" TEXT NOT NULL,
        "homeHoldId" TEXT,
        "awayTeam" TEXT NOT NULL,
        "awayHoldId" TEXT,
        "sourceImportId" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS stage TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS result TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS "dommer1" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS "dommer1Id" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS "dommer1Status" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS "dommer1RespondedAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS "dommer2" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS "dommer2Id" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS "dommer2Status" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS "dommer2RespondedAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS gender TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS "homeHoldId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS "awayHoldId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS "venueKey" TEXT;`);

    // If table already existed with NOT NULL constraints, relax them.
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ALTER COLUMN date DROP NOT NULL;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ALTER COLUMN time DROP NOT NULL;`);

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_matches_date_time_idx ON ta_matches (date, time);`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_matches_homeHoldId_idx ON ta_matches ("homeHoldId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_matches_awayHoldId_idx ON ta_matches ("awayHoldId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_matches_venueKey_idx ON ta_matches ("venueKey");`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ta_match_comments (
        id TEXT PRIMARY KEY,
        "kampId" INTEGER NOT NULL,
        message TEXT NOT NULL,
        "createdById" TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_comments ADD COLUMN IF NOT EXISTS "kampId" INTEGER;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_comments ADD COLUMN IF NOT EXISTS message TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_comments ADD COLUMN IF NOT EXISTS "createdById" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_comments ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_comments ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ;`);

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_match_comments_kampId_createdAt_idx ON ta_match_comments ("kampId", "createdAt");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_match_comments_createdById_idx ON ta_match_comments ("createdById");`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ta_match_comment_reads (
        "kampId" INTEGER NOT NULL,
        "userId" TEXT NOT NULL,
        "lastReadAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ta_match_comment_reads_pk PRIMARY KEY ("kampId", "userId")
      );
    `);

    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_comment_reads ADD COLUMN IF NOT EXISTS "kampId" INTEGER;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_comment_reads ADD COLUMN IF NOT EXISTS "userId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_comment_reads ADD COLUMN IF NOT EXISTS "lastReadAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_comment_reads ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_comment_reads ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ;`);

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_match_comment_reads_user_kamp_idx ON ta_match_comment_reads ("userId", "kampId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_match_comment_reads_lastReadAt_idx ON ta_match_comment_reads ("lastReadAt");`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ta_match_move_requests (
        id TEXT PRIMARY KEY,
        "kampId" INTEGER NOT NULL,
        status TEXT NOT NULL,
        "proposedDate" DATE,
        "proposedTime" TIME(0),
        note TEXT,
        "createdById" TEXT NOT NULL,
        "awayDecidedById" TEXT,
        "awayDecidedAt" TIMESTAMPTZ,
        "taDecidedById" TEXT,
        "taDecidedAt" TIMESTAMPTZ,
        "rejectionReason" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_move_requests ADD COLUMN IF NOT EXISTS "kampId" INTEGER;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_move_requests ADD COLUMN IF NOT EXISTS status TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_move_requests ADD COLUMN IF NOT EXISTS "proposedDate" DATE;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_move_requests ADD COLUMN IF NOT EXISTS "proposedTime" TIME(0);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_move_requests ADD COLUMN IF NOT EXISTS note TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_move_requests ADD COLUMN IF NOT EXISTS "createdById" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_move_requests ADD COLUMN IF NOT EXISTS "awayDecidedById" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_move_requests ADD COLUMN IF NOT EXISTS "awayDecidedAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_move_requests ADD COLUMN IF NOT EXISTS "taDecidedById" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_move_requests ADD COLUMN IF NOT EXISTS "taDecidedAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_move_requests ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_move_requests ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_match_move_requests ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ;`);

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_match_move_requests_kampId_createdAt_idx ON ta_match_move_requests ("kampId", "createdAt");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_match_move_requests_status_idx ON ta_match_move_requests (status);`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ta_venues (
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        "geocodedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await prisma.$executeRawUnsafe(`ALTER TABLE ta_venues ADD COLUMN IF NOT EXISTS address TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_venues ADD COLUMN IF NOT EXISTS "geocodeQuery" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_venues ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_venues ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_venues ADD COLUMN IF NOT EXISTS "geocodedAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_venues ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_venues ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ;`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ta_venue_clubs (
        "venueKey" TEXT NOT NULL,
        "clubId" TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ta_venue_clubs_pk PRIMARY KEY ("venueKey", "clubId")
      );
    `);

    await prisma.$executeRawUnsafe(`ALTER TABLE ta_venue_clubs ADD COLUMN IF NOT EXISTS "venueKey" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_venue_clubs ADD COLUMN IF NOT EXISTS "clubId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_venue_clubs ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_venue_clubs ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ;`);

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_venue_clubs_venueKey_idx ON ta_venue_clubs ("venueKey");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_venue_clubs_clubId_idx ON ta_venue_clubs ("clubId");`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ta_player_licenses (
        id TEXT PRIMARY KEY,
        "licenseNumber" INTEGER NOT NULL,
        name TEXT NOT NULL,
        "birthDate" DATE NOT NULL,
        gender TEXT NOT NULL,
        "clubId" TEXT NOT NULL,
        "doubleClubId" TEXT,
        "doubleClubExpiresAt" DATE,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ta_player_licenses_licenseNumber_uq UNIQUE ("licenseNumber")
      );
    `);

    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_licenses ADD COLUMN IF NOT EXISTS "licenseNumber" INTEGER;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_licenses ADD COLUMN IF NOT EXISTS name TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_licenses ADD COLUMN IF NOT EXISTS "birthDate" DATE;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_licenses ADD COLUMN IF NOT EXISTS gender TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_licenses ADD COLUMN IF NOT EXISTS "clubId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_licenses ADD COLUMN IF NOT EXISTS "doubleClubId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_licenses ADD COLUMN IF NOT EXISTS "doubleClubExpiresAt" DATE;`);

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_player_licenses_clubId_idx ON ta_player_licenses ("clubId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_player_licenses_doubleClubId_idx ON ta_player_licenses ("doubleClubId");`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ta_player_license_requests (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        "fromClubId" TEXT,
        "targetClubId" TEXT,
        "licenseId" TEXT,
        payload JSONB NOT NULL,
        "createdById" TEXT NOT NULL,
        "otherClubDecidedById" TEXT,
        "otherClubDecidedAt" TIMESTAMPTZ,
        "taDecidedById" TEXT,
        "taDecidedAt" TIMESTAMPTZ,
        "rejectionReason" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_license_requests ADD COLUMN IF NOT EXISTS type TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_license_requests ADD COLUMN IF NOT EXISTS status TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_license_requests ADD COLUMN IF NOT EXISTS "fromClubId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_license_requests ADD COLUMN IF NOT EXISTS "targetClubId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_license_requests ADD COLUMN IF NOT EXISTS "licenseId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_license_requests ADD COLUMN IF NOT EXISTS payload JSONB;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_license_requests ADD COLUMN IF NOT EXISTS "createdById" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_license_requests ADD COLUMN IF NOT EXISTS "otherClubDecidedById" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_license_requests ADD COLUMN IF NOT EXISTS "otherClubDecidedAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_license_requests ADD COLUMN IF NOT EXISTS "taDecidedById" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_license_requests ADD COLUMN IF NOT EXISTS "taDecidedAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_license_requests ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_license_requests ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_player_license_requests ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ;`);

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_player_license_requests_status_idx ON ta_player_license_requests (status);`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_player_license_requests_fromClubId_idx ON ta_player_license_requests ("fromClubId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_player_license_requests_targetClubId_idx ON ta_player_license_requests ("targetClubId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_player_license_requests_createdAt_idx ON ta_player_license_requests ("createdAt");`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ta_referees (
        id TEXT PRIMARY KEY,
        "refereeNo" TEXT NOT NULL,
        name TEXT NOT NULL,
        club TEXT,
        address TEXT,
        email TEXT,
        phone TEXT,
        "partner1" TEXT,
        "partner2" TEXT,
        "partner3" TEXT,
        "eligibleLeagues" JSONB,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ta_referees_refereeNo_uq UNIQUE ("refereeNo")
      );
    `);

    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referees ADD COLUMN IF NOT EXISTS "refereeNo" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referees ADD COLUMN IF NOT EXISTS name TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referees ADD COLUMN IF NOT EXISTS club TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referees ADD COLUMN IF NOT EXISTS address TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referees ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referees ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referees ADD COLUMN IF NOT EXISTS "geocodedAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referees ADD COLUMN IF NOT EXISTS email TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referees ADD COLUMN IF NOT EXISTS phone TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referees ADD COLUMN IF NOT EXISTS "partner1" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referees ADD COLUMN IF NOT EXISTS "partner2" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referees ADD COLUMN IF NOT EXISTS "partner3" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referees ADD COLUMN IF NOT EXISTS "eligibleLeagues" JSONB;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referees ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referees ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ;`);

    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS ta_referees_refereeNo_uq_idx ON ta_referees ("refereeNo");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_referees_name_idx ON ta_referees (name);`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ta_referee_availability (
        id TEXT PRIMARY KEY,
        "refereeId" TEXT NOT NULL,
        "entryDate" DATE NOT NULL,
        status TEXT NOT NULL,
        "startTime" TIME(0),
        "endTime" TIME(0),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Allow multiple segments per day (drop legacy unique constraint if present).
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'ta_referee_availability_unique'
            AND conrelid = 'ta_referee_availability'::regclass
        ) THEN
          ALTER TABLE ta_referee_availability DROP CONSTRAINT ta_referee_availability_unique;
        END IF;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referee_availability ADD COLUMN IF NOT EXISTS "refereeId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referee_availability ADD COLUMN IF NOT EXISTS "entryDate" DATE;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referee_availability ADD COLUMN IF NOT EXISTS status TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referee_availability ADD COLUMN IF NOT EXISTS "startTime" TIME(0);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referee_availability ADD COLUMN IF NOT EXISTS "endTime" TIME(0);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referee_availability ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referee_availability ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ;`);

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_referee_availability_entryDate_idx ON ta_referee_availability ("entryDate");`);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS ta_referee_availability_referee_entry_idx ON ta_referee_availability ("refereeId", "entryDate");`
    );

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ta_referee_availability_rules (
        id TEXT PRIMARY KEY,
        "refereeId" TEXT NOT NULL,
        weekday INTEGER NOT NULL,
        status TEXT NOT NULL,
        "startTime" TIME(0),
        "endTime" TIME(0),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referee_availability_rules ADD COLUMN IF NOT EXISTS "refereeId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referee_availability_rules ADD COLUMN IF NOT EXISTS weekday INTEGER;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referee_availability_rules ADD COLUMN IF NOT EXISTS status TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referee_availability_rules ADD COLUMN IF NOT EXISTS "startTime" TIME(0);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referee_availability_rules ADD COLUMN IF NOT EXISTS "endTime" TIME(0);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referee_availability_rules ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ta_referee_availability_rules ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ;`);

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS ta_referee_availability_rules_referee_weekday_idx ON ta_referee_availability_rules ("refereeId", weekday);`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS ta_referee_availability_rules_referee_idx ON ta_referee_availability_rules ("refereeId");`
    );

    globalForTurnering.turneringDomainSchemaVersion = TURNERING_DOMAIN_SCHEMA_VERSION;
  })().finally(() => {
    globalForTurnering.turneringDomainInitPromise = undefined;
  });

  return globalForTurnering.turneringDomainInitPromise;
}

export async function ensureTaUserRoleMetadataColumns() {
  // The auth tables already exist; add columns only if missing.
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_user_roles ADD COLUMN IF NOT EXISTS "clubId" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_user_roles ADD COLUMN IF NOT EXISTS "teamId" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_user_roles ADD COLUMN IF NOT EXISTS "holdId" TEXT;`);

  await prisma.$executeRawUnsafe(`ALTER TABLE ta_user_roles ADD COLUMN IF NOT EXISTS "clubLeaderTitle" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_user_roles ADD COLUMN IF NOT EXISTS "refereeId" TEXT;`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_user_roles_refereeId_idx ON ta_user_roles ("refereeId");`);

  // Role scoping key (allows multiple roles of same type per user).
  await prisma.$executeRawUnsafe(
    `ALTER TABLE ta_user_roles ADD COLUMN IF NOT EXISTS "scopeKey" TEXT NOT NULL DEFAULT 'GLOBAL';`
  );

  // Backfill scopeKey for existing rows (idempotent).
  await prisma.$executeRawUnsafe(`
    UPDATE ta_user_roles
    SET "scopeKey" = CONCAT('club:', "clubId")
    WHERE ("scopeKey" IS NULL OR "scopeKey" = 'GLOBAL')
      AND role IN ('CLUB_LEADER', 'SECRETARIAT')
      AND "clubId" IS NOT NULL
      AND "clubId" <> '';
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE ta_user_roles
    SET "scopeKey" = CONCAT('team:', "teamId")
    WHERE ("scopeKey" IS NULL OR "scopeKey" = 'GLOBAL')
      AND role IN ('TEAM_LEADER')
      AND "teamId" IS NOT NULL
      AND "teamId" <> '';
  `);

  // Backfill holdId for TEAM_LEADER roles from ta_teams when possible (idempotent).
  await prisma.$executeRawUnsafe(`
    UPDATE ta_user_roles ur
    SET "holdId" = t."holdId"
    FROM ta_teams t
    WHERE ur.role = 'TEAM_LEADER'
      AND ur."teamId" IS NOT NULL
      AND ur."teamId" <> ''
      AND ur."teamId" = t.id
      AND (ur."holdId" IS NULL OR ur."holdId" = '')
      AND t."holdId" IS NOT NULL
      AND t."holdId" <> '';
  `);

  // Drop legacy uniqueness if it exists (best-effort).
  await prisma.$executeRawUnsafe(
    `ALTER TABLE ta_user_roles DROP CONSTRAINT IF EXISTS "ta_user_roles_userId_role_key";`
  );
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS ta_user_roles_userId_role_key;`);

  // Ensure new uniqueness.
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS ta_user_roles_user_role_scope_uq ON ta_user_roles ("userId", role, "scopeKey");`
  );
}

export async function ensureTaUserContactColumns() {
  // The auth tables already exist; add columns only if missing.
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_users ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;`);
}

export async function ensureTaUserNotificationPreferenceColumns() {
  // Persist notification preferences on TA users.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE ta_users ADD COLUMN IF NOT EXISTS "notificationPreferences" JSONB;`
  );
}

export async function ensureTaRosterTables() {
  // Rosters must be stable across Turnering publish (ta_teams rows may be overwritten).
  // Therefore: keep teamId as plain text (no FK), and key roster identity by HoldID.

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ta_rosters (
      id TEXT PRIMARY KEY,
      "holdId" TEXT,
      "teamId" TEXT NOT NULL,
      league TEXT NOT NULL,
      "teamName" TEXT NOT NULL,
      "createdById" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await prisma.$executeRawUnsafe(`ALTER TABLE ta_rosters ADD COLUMN IF NOT EXISTS "holdId" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_rosters ADD COLUMN IF NOT EXISTS "teamId" TEXT;`);

  // Drop legacy FK/unique that could cascade-delete rosters when ta_teams are republished.
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE c TEXT;
    BEGIN
      FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'ta_rosters'::regclass
          AND contype = 'f'
      LOOP
        EXECUTE format('ALTER TABLE ta_rosters DROP CONSTRAINT IF EXISTS %I', c);
      END LOOP;
    END $$;
  `);

  // Best-effort cleanup for default Prisma constraint names.
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_rosters DROP CONSTRAINT IF EXISTS ta_rosters_teamId_fkey;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_rosters DROP CONSTRAINT IF EXISTS ta_rosters_teamId_key;`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS ta_rosters_teamId_key;`);

  // Backfill HoldID from current teams (idempotent).
  await prisma.$executeRawUnsafe(`
    UPDATE ta_rosters r
    SET "holdId" = t."holdId"
    FROM ta_teams t
    WHERE r."teamId" = t.id
      AND (r."holdId" IS NULL OR r."holdId" = '')
      AND t."holdId" IS NOT NULL
      AND t."holdId" <> '';
  `);

  // Empty string should behave like NULL for uniqueness.
  await prisma.$executeRawUnsafe(`UPDATE ta_rosters SET "holdId" = NULL WHERE "holdId" = '';`);

  // If multiple rosters exist for the same HoldID (e.g. created per league earlier),
  // keep the newest and delete the rest so we can enforce uniqueness.
  await prisma.$executeRawUnsafe(`
    DELETE FROM ta_rosters a
    USING ta_rosters b
    WHERE a."holdId" IS NOT NULL
      AND b."holdId" = a."holdId"
      AND (
        a."updatedAt" < b."updatedAt" OR
        (a."updatedAt" = b."updatedAt" AND a.id < b.id)
      );
  `);

  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS ta_rosters_holdId_key ON ta_rosters ("holdId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_rosters_teamId_idx ON ta_rosters ("teamId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_rosters_holdId_idx ON ta_rosters ("holdId");`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ta_roster_players (
      id TEXT PRIMARY KEY,
      "rosterId" TEXT NOT NULL,
      CONSTRAINT ta_roster_players_rosterId_fkey FOREIGN KEY ("rosterId") REFERENCES ta_rosters(id) ON DELETE CASCADE,
      "rowIndex" INTEGER NOT NULL,
      number TEXT,
      role TEXT,
      "licenseId" TEXT,
      name TEXT NOT NULL,
      "birthDate" DATE,
      "imageUrl" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT ta_roster_players_roster_row_uq UNIQUE ("rosterId", "rowIndex")
    );
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_roster_players ADD COLUMN IF NOT EXISTS role TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_roster_players ADD COLUMN IF NOT EXISTS "licenseId" TEXT;`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_roster_players_rosterId_idx ON ta_roster_players ("rosterId");`);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS ta_roster_players_roster_license_uq ON ta_roster_players ("rosterId", "licenseId") WHERE "licenseId" IS NOT NULL AND "licenseId" <> '';`,
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ta_roster_leaders (
      id TEXT PRIMARY KEY,
      "rosterId" TEXT NOT NULL,
      CONSTRAINT ta_roster_leaders_rosterId_fkey FOREIGN KEY ("rosterId") REFERENCES ta_rosters(id) ON DELETE CASCADE,
      "rowIndex" INTEGER NOT NULL,
      role TEXT,
      name TEXT NOT NULL,
      "imageUrl" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT ta_roster_leaders_roster_row_uq UNIQUE ("rosterId", "rowIndex")
    );
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_roster_leaders ADD COLUMN IF NOT EXISTS role TEXT;`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_roster_leaders_rosterId_idx ON ta_roster_leaders ("rosterId");`);
}
