"use client";

import ApprovalsListClient from "@/components/ta/ApprovalsListClient";
import KlublederRoleAssignmentsManagementClient from "@/components/ta/KlublederRoleAssignmentsManagementClient";
import { useSearchParams } from "next/navigation";

export default function KlublederGodkendClient() {
  const sp = useSearchParams();
  const clubId = (sp.get("clubId") ?? "").trim() || null;

  return (
    <div className="space-y-10">
      <ApprovalsListClient
        title="Godkend holdledere og sekretariat"
        description="Her kan Klubleder godkende eller afvise holdledere og sekretariat for din klub."
        roleFilter={["TEAM_LEADER", "SECRETARIAT"]}
        pendingQuery={{ clubId }}
      />

      <KlublederRoleAssignmentsManagementClient clubId={clubId} />
    </div>
  );
}
