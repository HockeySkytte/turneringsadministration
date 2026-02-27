import { redirect } from "next/navigation";
import { requireApprovedUser } from "@/lib/auth";
import HoldlederRosterClient from "./HoldlederRosterClient";
import HoldlederKampeClient from "./HoldlederKampeClient";
import HoldlederTabsClient from "./HoldlederTabsClient";

export const dynamic = "force-dynamic";

const tabs = [
  { key: "trup", label: "Trup" },
  { key: "kampe", label: "Kampe" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export default async function HoldlederPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireApprovedUser();

  const canAccess = Boolean(user.isTeamLeader);
  if (!canAccess) {
    redirect("/statistik");
  }

  const sp = await searchParams;
  const tabRaw = String(sp?.tab ?? "trup");
  const tab: TabKey = (tabs.some((t) => t.key === tabRaw) ? tabRaw : "trup") as TabKey;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">Holdleder</h1>
      <p className="mt-2 text-sm text-zinc-600">Opret og vedligehold trupper (spillere og ledere) for dine hold.</p>

      <HoldlederTabsClient tabs={tabs as unknown as Array<{ key: string; label: string }>} activeTab={tab} />

      {tab === "trup" ? <HoldlederRosterClient /> : null}
      {tab === "kampe" ? <HoldlederKampeClient /> : null}
    </div>
  );
}
