# Copilot instructions — Floorball Platform

## Big picture
- Next.js 16 App Router.
- UI routes are organized as route groups:
  - `src/app/(public)` = unauthenticated pages (e.g. login/signup/awaiting).
  - `src/app/(app)` = authenticated shell (sidebar/topnav/providers).
- Server API endpoints live in `src/app/api/**/route.ts` and generally return `NextResponse.json(...)` with Danish user-facing messages.

## Dev workflows (Windows / PowerShell)
- Install + run dev server:
  - `npm.cmd install`
  - `npm.cmd run dev` (runs `prisma migrate deploy`, `prisma generate`, then `next dev`; see `scripts/dev.cjs`).
- Production start:
  - `npm.cmd run build` (runs `prisma generate` via `prebuild`).
  - `npm.cmd run start` (runs `prisma migrate deploy` then `next start`; see `scripts/start.cjs`).
- Seed data:
  - `npx.cmd prisma db seed` (uses `tsx prisma/seed.ts`; creates default teams + bootstrap admin from `.env`: `ADMIN_EMAIL`, `ADMIN_PASSWORD`).
- Windows Prisma note:
  - `npm install` runs `scripts/postinstall-prisma-junction.cjs` to create a Windows junction for `@prisma/client`.

## Database + data access
- Prisma + Postgres:
  - Schema: `prisma/schema.prisma` (Team/Membership/User/Stats/Matches/JsonDocument/Tests/Readiness).
  - Migrations: `prisma/migrations/*`.
- Always import the shared Prisma client from `src/lib/prisma.ts` (`import { prisma } from "@/lib/prisma";`).
  - Do not instantiate `new PrismaClient()` in app code.

## Auth, session, and authorization
- Sessions are cookie-based via `iron-session` in `src/lib/session.ts`.
  - Requires `SESSION_PASSWORD` (min. 32 chars); session fields include `userId` and `selectedTeamId`.
- Current user / team resolution:
  - Use `getCurrentUser()` from `src/lib/auth.ts` in server components/layouts.
  - API route handlers should gate access with `requireUser`, `requireApprovedUser`, `requireAdmin`, `requireLeader`, `requireLeaderOrAdmin`, `requireTeamId`.
- Admin “selected team” is stored in `session.selectedTeamId`.
  - The API route `src/app/api/ui/select-team/route.ts` is the canonical way to change it.

## Project-specific domain conventions
- Approval flow is central:
  - Memberships move through `ApprovalStatus` (`PENDING_ADMIN`, `PENDING_LEADER`, `APPROVED`, `REJECTED`).
  - Roles are `TeamRole` (`LEADER`, `PLAYER`, `SUPPORTER`).
- Readiness entries use “date-only” stored as UTC `DateTime` and are upserted by `(teamId,userId,entryDate)`.
  - See `src/app/api/player/readiness/route.ts` for parsing/clamping conventions.

## Theming
- The app uses team theme colors via HTML data attributes:
  - `src/app/layout.tsx` sets `data-team-primary` / `data-team-secondary`.
  - `src/lib/theme.ts` resolves the team from the current user or `session.selectedTeamId` (with fallbacks).
