import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      roles: user.roles.map((r) => ({ id: r.id, role: r.role, status: r.status, createdAt: r.createdAt })),
      hasApprovedRole: user.hasApprovedRole,
      hasPendingApproval: user.hasPendingApproval,
      canManageApprovals: Boolean(user.isAdmin),
      canAccessTurnering: Boolean(user.isTournamentAdmin),
      canAccessKlubleder: Boolean(user.isClubLeader),
      canAccessHoldleder: Boolean(user.isTeamLeader),
    },
  });
}
