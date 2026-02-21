import { redirect } from "next/navigation";
import { requireApprovedUser } from "@/lib/auth";
import HoldlederRosterClient from "./HoldlederRosterClient";

export const dynamic = "force-dynamic";

export default async function HoldlederPage() {
  const user = await requireApprovedUser();

  const canAccess = Boolean(user.isTeamLeader);
  if (!canAccess) {
    redirect("/statistik");
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">Holdleder</h1>
      <p className="mt-2 text-sm text-zinc-600">Opret og vedligehold trupper (spillere og ledere) for dine hold.</p>

      <HoldlederRosterClient />
    </div>
  );
}
