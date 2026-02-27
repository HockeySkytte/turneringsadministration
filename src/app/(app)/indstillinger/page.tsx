import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAppContext } from "@/lib/appContext";
import IndstillingerClient from "./IndstillingerClient";

const tabs = [
  { key: "roller", label: "Roller" },
  { key: "notifikationer", label: "Notifikationer" },
  { key: "oplysninger", label: "Oplysninger" },
  { key: "layout", label: "Layout" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export default async function IndstillingerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.isSuperuser && !user.isSuperuserApproved && !user.isAdmin) {
    redirect("/afventer");
  }

  const { viewMode } = await getAppContext();

  const sp = await searchParams;
  const tabRaw = String(sp?.tab ?? "roller");
  const tab: TabKey = (tabs.some((t) => t.key === tabRaw) ? tabRaw : "roller") as TabKey;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4">
        <h1 className="text-3xl font-semibold">Indstillinger</h1>
        <p className="mt-1 text-sm text-zinc-600">Administrér roller, profil og layout.</p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <IndstillingerClient
          tabs={tabs as unknown as Array<{ key: string; label: string }>}
          activeTab={tab}
          viewMode={viewMode}
          account={{
            email: user.email,
            username: user.username,
            phoneNumber: (user as any).phoneNumber ?? null,
          }}
        />
      </div>
    </div>
  );
}
