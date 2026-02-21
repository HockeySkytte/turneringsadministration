"use client";

import ApprovalsListClient from "@/components/ta/ApprovalsListClient";
import ClubLeadersManagementClient from "@/components/ta/ClubLeadersManagementClient";

export default function TurneringGodkendClient() {
  return (
    <div className="space-y-10">
      <ApprovalsListClient
        title="Godkend klubledere"
        description="Her kan Turneringsadmin godkende eller afvise klubledere."
        roleFilter={["CLUB_LEADER"]}
      />

      <ClubLeadersManagementClient />
    </div>
  );
}
