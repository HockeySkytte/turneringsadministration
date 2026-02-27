"use client";

import { useEffect, useState } from "react";
import ApprovalsListClient from "@/components/ta/ApprovalsListClient";
import TurneringKampflytningerClient from "./TurneringKampflytningerClient";
import TurneringSpillerlicensAnmodningerGodkendClient from "./TurneringSpillerlicensAnmodningerGodkendClient";

type PendingCounts = {
  clubLeaderApprovals: number;
  moveRequests: number;
  playerLicenseRequests: number;
  total: number;
};

export default function TurneringGodkendClient() {
  const [pending, setPending] = useState<PendingCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/turnering/notifications", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as any;
      if (cancelled) return;
      if (!res.ok || data?.ok !== true) {
        setPending(null);
        return;
      }
      setPending((data?.pending ?? null) as PendingCounts | null);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-10">
      {pending && pending.total > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Afventer: {pending.clubLeaderApprovals} klubledere, {pending.moveRequests} kampflytninger, {pending.playerLicenseRequests} licensanmodning(er).
        </div>
      ) : null}

      <TurneringKampflytningerClient />

      <TurneringSpillerlicensAnmodningerGodkendClient />

      <ApprovalsListClient
        title="Godkend klubledere"
        description="Her kan Turneringsadmin godkende eller afvise klubledere."
        roleFilter={["CLUB_LEADER"]}
      />
    </div>
  );
}
