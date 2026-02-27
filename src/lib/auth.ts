import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

import { TaRole, TaRoleStatus } from "@prisma/client";
import {
  ensureTaUserContactColumns,
  ensureTaUserNotificationPreferenceColumns,
  ensureTaUserRoleMetadataColumns,
} from "@/lib/turnering/db";

let ensureTaRoleColumnsOncePromise: Promise<void> | null = null;

async function ensureTaRoleColumnsOnce() {
  if (!ensureTaRoleColumnsOncePromise) {
    ensureTaRoleColumnsOncePromise = Promise.all([
      ensureTaUserRoleMetadataColumns(),
      ensureTaUserContactColumns(),
      ensureTaUserNotificationPreferenceColumns(),
    ]).then(() => undefined).catch((err) => {
      // If this fails, continue and let Prisma throw a clearer DB error.
      ensureTaRoleColumnsOncePromise = null;
      throw err;
    });
  }
  await ensureTaRoleColumnsOncePromise;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function getCurrentUser() {
  await ensureTaRoleColumnsOnce();
  const session = await getSession();
  if (!session.userId) return null;

  const user = await prisma.taUser.findUnique({
    where: { id: session.userId },
    include: { roles: true },
  });

  if (!user) return null;

  const approvedRoles = new Set(
    user.roles
      .filter((r) => r.status === TaRoleStatus.APPROVED)
      .map((r) => r.role)
  );

  const pendingRoles = user.roles.filter((r) => r.status === TaRoleStatus.PENDING);

  const isAdmin = approvedRoles.has(TaRole.ADMIN);
  const isTournamentAdmin = approvedRoles.has(TaRole.TOURNAMENT_ADMIN);
  const isRefAdmin = approvedRoles.has(TaRole.REF_ADMIN);
  const isClubLeader = approvedRoles.has(TaRole.CLUB_LEADER);
  const isTeamLeader = approvedRoles.has(TaRole.TEAM_LEADER);
  const isSecretariat = approvedRoles.has(TaRole.SECRETARIAT);
  const isReferee = approvedRoles.has(TaRole.REFEREE);

  const hasApprovedRole = isAdmin || approvedRoles.size > 0;
  const hasPendingApproval = pendingRoles.length > 0 && !hasApprovedRole;

  return {
    ...user,

    roles: user.roles,
    approvedRoles: Array.from(approvedRoles),
    hasApprovedRole,
    hasPendingApproval,

    isAdmin,
    isTournamentAdmin,
    isRefAdmin,
    isClubLeader,
    isTeamLeader,
    isSecretariat,
    isReferee,

    // Backwards compatibility fields used by existing UI/layout.
    isSuperuser: isTournamentAdmin || isRefAdmin || isClubLeader || isTeamLeader || isSecretariat || isReferee,
    isSuperuserApproved: hasApprovedRole,
    superuserStatus: hasApprovedRole ? "APPROVED" : pendingRoles.length ? "PENDING_ADMIN" : "REJECTED",
    globalRole: isAdmin ? "ADMIN" : "USER",

    activeLeague: null,
    activeLeagueId: session.selectedLeagueId ?? null,
    activeTeam: null,
    activeTeamId: session.selectedTeamId ?? null,
    activeGender: session.selectedGender ?? "MEN",
    gender: "MEN",
    ageGroup: "SENIOR",
    competitionRowId: null,
    competitionPoolId: null,
    competitionTeamName: null,

    // Legacy compatibility (to be removed when old leader/membership features are deleted)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    memberships: [] as any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activeMembership: null as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activeRole: null as any,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("NOT_AUTHENTICATED");
  return user;
}

export async function requireApprovedUser() {
  const user = await requireUser();
  if (!user.hasApprovedRole) throw new Error("NOT_APPROVED");
  return user;
}

export async function requireAdmin() {
  const user = await requireApprovedUser();
  if (!user.isAdmin) throw new Error("NOT_AUTHORIZED");
  return user;
}

export async function requireTournamentAdmin() {
  const user = await requireApprovedUser();
  if (!user.isTournamentAdmin) throw new Error("NOT_AUTHORIZED");
  return user;
}

export async function requireRefAdmin() {
  const user = await requireApprovedUser();
  if (!user.isRefAdmin) throw new Error("NOT_AUTHORIZED");
  return user;
}

export async function requireClubLeader() {
  const user = await requireApprovedUser();
  if (!user.isClubLeader) throw new Error("NOT_AUTHORIZED");
  return user;
}

export async function requireTeamId() {
  const user = await requireApprovedUser();
  if (!user.activeTeamId) throw new Error("NO_TEAM");
  return { user, teamId: user.activeTeamId };
}

export async function requireSuperuserOrAdmin() {
  const user = await requireApprovedUser();

  if (user.isAdmin) return user;
  if (user.isTournamentAdmin) return user;
  if (user.isRefAdmin) return user;
  throw new Error("NOT_AUTHORIZED");
}

// Legacy aliases (keep old route handlers compiling while we delete them)
export async function requireLeader() {
  return requireSuperuserOrAdmin();
}

export async function requireLeaderOrAdmin() {
  return requireSuperuserOrAdmin();
}
