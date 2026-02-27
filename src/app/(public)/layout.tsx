import TopNav from "@/components/TopNav";
import { getCurrentUser } from "@/lib/auth";
import { getSession } from "@/lib/session";
import GuestDefaultsBootstrap from "@/components/GuestDefaultsBootstrap";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const session = await getSession();
  const viewMode = session.selectedViewMode ?? "LIGHT";
  const displayUsername = user ? (user.isAdmin ? "admin" : user.username) : null;

  return (
    <div className="min-h-dvh">
      <GuestDefaultsBootstrap enabled={!Boolean(user)} />
      <TopNav
        viewMode={viewMode}
        user={
          user
            ? {
                username: displayUsername ?? user.username,
                canManageApprovals: Boolean(
                  user.isAdmin
                ),
                canAccessTurnering: Boolean(user.isTournamentAdmin),
                canAccessKlubleder: Boolean(user.isClubLeader),
                canAccessHoldleder: Boolean(user.isTeamLeader),
                canAccessDommerpaasaetter: Boolean(user.isRefAdmin),
                canAccessDommer: Boolean(user.isReferee),
              }
            : null
        }
      />
      {children}
    </div>
  );
}
