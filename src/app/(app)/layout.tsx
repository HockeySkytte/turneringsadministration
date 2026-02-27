import TopNav from "@/components/TopNav";
import MobileAppHeader from "@/components/MobileAppHeader";
import AppSidebarContent from "@/components/AppSidebarContent";
import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/appContext";
import GuestDefaultsBootstrap from "@/components/GuestDefaultsBootstrap";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, ctx, calendarMode, statsAggregationMode, viewMode } = await getAppContext();

  if (user?.hasPendingApproval) {
    redirect("/afventer");
  }

  const canManageApprovals = Boolean(user?.isAdmin);

  const canAccessTurnering = Boolean(user?.isTournamentAdmin);
  const canAccessKlubleder = Boolean(user?.isClubLeader);
  const canAccessHoldleder = Boolean(user?.isTeamLeader);
  const canAccessDommerpaasaetter = Boolean(user?.isRefAdmin);
  const canAccessDommer = Boolean(user?.isReferee);
  const displayUsername = user ? (user.isAdmin ? "admin" : user.username) : null;

  const {
    seasons,
    selectedSeasonStartYear,
    selectedGender,
    ageGroups,
    selectedAgeGroup,
    rows,
    selectedRowId,
    pools,
    selectedPoolId,
    poolTeams,
    selectedTeamName,
  } = ctx;

  const selectedTeamLogoUrl = "/brand/floorball-danmark.png";

  return (
    <div className="grid min-h-dvh w-full grid-cols-1 md:grid-cols-[280px_1fr]">
      {/* Desktop: left slicer pane */}
      <aside className="hidden min-h-dvh flex-col bg-[image:var(--sidebar-gradient)] bg-cover bg-no-repeat p-4 text-[var(--brand-foreground)] md:flex">
        <AppSidebarContent
          seasons={seasons}
          selectedSeasonStartYear={selectedSeasonStartYear}
          selectedGender={selectedGender}
          ageGroups={ageGroups}
          selectedAgeGroup={selectedAgeGroup}
          rows={rows}
          selectedRowId={selectedRowId}
          pools={pools}
          selectedPoolId={selectedPoolId}
          poolTeams={poolTeams}
          selectedTeamName={selectedTeamName}
          calendarMode={calendarMode}
          statsAggregationMode={statsAggregationMode}
        />
      </aside>

      {/* Right side: topbar starts AFTER sidebar */}
      <div className="flex min-h-dvh min-w-0 flex-col">
        <GuestDefaultsBootstrap enabled={!Boolean(user)} />
        <div className="hidden md:block">
          <TopNav
            viewMode={viewMode}
            user={
              user
                ? {
                    username: displayUsername ?? user.username,
                    canManageApprovals,
                    canAccessTurnering,
                    canAccessKlubleder,
                    canAccessHoldleder,
                    canAccessDommerpaasaetter,
                    canAccessDommer,
                  }
                : null
            }
          />
        </div>

        <MobileAppHeader
          user={user ? { username: displayUsername ?? user.username } : null}
          canManageApprovals={canManageApprovals}
          canAccessTurnering={canAccessTurnering}
          canAccessKlubleder={canAccessKlubleder}
          canAccessHoldleder={canAccessHoldleder}
          canAccessDommerpaasaetter={canAccessDommerpaasaetter}
          canAccessDommer={canAccessDommer}
          viewMode={viewMode}
          seasons={seasons}
          selectedSeasonStartYear={selectedSeasonStartYear}
          selectedGender={selectedGender}
          ageGroups={ageGroups}
          selectedAgeGroup={selectedAgeGroup}
          rows={rows}
          selectedRowId={selectedRowId}
          pools={pools}
          selectedPoolId={selectedPoolId}
          poolTeams={poolTeams}
          selectedTeamName={selectedTeamName}
          calendarMode={calendarMode}
          statsAggregationMode={statsAggregationMode}
          logoUrl={selectedTeamLogoUrl}
        />

        <main className="flex-1 min-w-0 p-4 text-[var(--surface-foreground)] md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
