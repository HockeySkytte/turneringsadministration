import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import DommerpaasaetterClient from "./DommerpaasaetterClient";
import ApprovalsListClient from "@/components/ta/ApprovalsListClient";
import DommerpaasaetterKamppaasetningClient from "./DommerpaasaetterKamppaasetningClient";

const tabs = [
  { key: "godkend", label: "Godkend" },
  { key: "dommere", label: "Dommere" },
  { key: "kamppaasetning", label: "Kamppåsætning" },
  { key: "udbetaling", label: "Udbetaling" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export default async function DommerpaasaetterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isRefAdmin) redirect("/");

  const sp = await searchParams;
  const tabRaw = String(sp?.tab ?? "godkend");
  const tab: TabKey = (tabs.some((t) => t.key === tabRaw) ? tabRaw : "godkend") as TabKey;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-4">
        <h1 className="text-3xl font-semibold">Dommerpåsætter</h1>
        <p className="mt-1 text-sm text-zinc-600">Administrér dommere (kun for dommeradmins).</p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const active = t.key === tab;
            return (
              <a
                key={t.key}
                href={`/dommerpaasaetter?tab=${t.key}`}
                className={
                  "rounded-lg px-3 py-2 text-sm font-semibold " +
                  (active
                    ? "bg-[color:var(--brand)] text-[var(--brand-foreground)]"
                    : "bg-zinc-200 text-zinc-800 hover:bg-zinc-300")
                }
              >
                {t.label}
              </a>
            );
          })}
        </div>

        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
          {tab === "godkend" ? (
            <ApprovalsListClient
              title="Godkend dommere"
              description="Her kan Dommeradmin godkende eller afvise brugere, der har anmodet om Dommer-rollen."
              roleFilter={["REFEREE"]}
            />
          ) : null}

          {tab === "dommere" ? <DommerpaasaetterClient /> : null}

          {tab === "kamppaasetning" ? <DommerpaasaetterKamppaasetningClient /> : null}

          {tab === "udbetaling" ? (
            <div>
              <div className="font-semibold text-zinc-900">Udbetaling</div>
              <div className="mt-1 text-zinc-600">Kommer snart.</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
