import { prisma } from "@/lib/prisma";

export async function ensureTurneringDomainTables() {
  // These are lightweight tables; we create them on-demand to avoid full prisma migration drift.
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
      result TEXT,
      "dommer1" TEXT,
      "dommer1Id" TEXT,
      "dommer2" TEXT,
      "dommer2Id" TEXT,
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
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS "dommer2" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS "dommer2Id" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS gender TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS "homeHoldId" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ADD COLUMN IF NOT EXISTS "awayHoldId" TEXT;`);

  // If table already existed with NOT NULL constraints, relax them.
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ALTER COLUMN date DROP NOT NULL;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_matches ALTER COLUMN time DROP NOT NULL;`);

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_matches_date_time_idx ON ta_matches (date, time);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_matches_homeHoldId_idx ON ta_matches ("homeHoldId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_matches_awayHoldId_idx ON ta_matches ("awayHoldId");`);
}

export async function ensureTaUserRoleMetadataColumns() {
  // The auth tables already exist; add columns only if missing.
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_user_roles ADD COLUMN IF NOT EXISTS "clubId" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_user_roles ADD COLUMN IF NOT EXISTS "teamId" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ta_user_roles ADD COLUMN IF NOT EXISTS "holdId" TEXT;`);

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
      name TEXT NOT NULL,
      "birthDate" DATE,
      "imageUrl" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT ta_roster_players_roster_row_uq UNIQUE ("rosterId", "rowIndex")
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_roster_players_rosterId_idx ON ta_roster_players ("rosterId");`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ta_roster_leaders (
      id TEXT PRIMARY KEY,
      "rosterId" TEXT NOT NULL,
      CONSTRAINT ta_roster_leaders_rosterId_fkey FOREIGN KEY ("rosterId") REFERENCES ta_rosters(id) ON DELETE CASCADE,
      "rowIndex" INTEGER NOT NULL,
      name TEXT NOT NULL,
      "imageUrl" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT ta_roster_leaders_roster_row_uq UNIQUE ("rosterId", "rowIndex")
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ta_roster_leaders_rosterId_idx ON ta_roster_leaders ("rosterId");`);
}
