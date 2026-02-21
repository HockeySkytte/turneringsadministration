-- Creates isolated auth tables for Turneringsadministration.
-- Safe to run multiple times.

DO $$
BEGIN
  CREATE TYPE "TaRole" AS ENUM (
    'ADMIN',
    'TOURNAMENT_ADMIN',
    'REF_ADMIN',
    'CLUB_LEADER',
    'TEAM_LEADER',
    'SECRETARIAT',
    'REFEREE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "TaRoleStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "ta_users" (
  "id"           TEXT PRIMARY KEY,
  "email"        TEXT NOT NULL,
  "username"     TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name"         TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE "ta_users" ADD CONSTRAINT "ta_users_email_key" UNIQUE ("email");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "ta_users" ADD CONSTRAINT "ta_users_username_key" UNIQUE ("username");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "ta_user_roles" (
  "id"           TEXT PRIMARY KEY,
  "userId"       TEXT NOT NULL,
  "role"         "TaRole" NOT NULL,
  "status"       "TaRoleStatus" NOT NULL DEFAULT 'PENDING',
  "approvedById" TEXT,
  "approvedAt"   TIMESTAMPTZ,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ta_user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ta_users"("id") ON DELETE CASCADE,
  CONSTRAINT "ta_user_roles_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "ta_users"("id") ON DELETE SET NULL
);

DO $$
BEGIN
  ALTER TABLE "ta_user_roles" ADD CONSTRAINT "ta_user_roles_userId_role_key" UNIQUE ("userId", "role");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS "ta_user_roles_role_status_createdAt_idx" ON "ta_user_roles"("role", "status", "createdAt");
