import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import TurneringKampeImportClient from "@/app/(app)/turnering/TurneringKampeImportClient";
import TurneringGodkendClient from "./TurneringGodkendClient";
import TurneringAuditClient from "./TurneringAuditClient";
import TurneringSpillerlicenserClient from "./TurneringSpillerlicenserClient";
import TurneringSpillestederClient from "./TurneringSpillestederClient";
import TurneringTabsClient from "./TurneringTabsClient";
import ClubLeadersManagementClient from "@/components/ta/ClubLeadersManagementClient";
import {
  normalizeStagedClubs,
  normalizeStagedMatches,
  normalizeStagedTeams,
} from "@/lib/turnering/staged";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

const tabs = [
  { key: "godkend", label: "Godkend" },
  { key: "import", label: "Importér fra Excel" },
  { key: "kampe", label: "Kampe" },
  { key: "klubber", label: "Klubber" },
  { key: "hold", label: "Hold" },
  { key: "klubledere", label: "Klubledere" },
  { key: "spillerlicenser", label: "Spillerlicenser" },
  { key: "spillesteder", label: "Spillesteder" },
  { key: "audit", label: "Audit (mangler)" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export default async function TurneringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isTournamentAdmin) redirect("/");

  const sp = await searchParams;
  const tabRaw = String(sp?.tab ?? "godkend");
  const tab: TabKey = (tabs.some((t) => t.key === tabRaw) ? tabRaw : "godkend") as TabKey;

  const latestImport =
    tab === "godkend" || tab === "spillerlicenser" || tab === "spillesteder" || tab === "klubledere"
      ? null
      : await getLatestImport();
  const staged = latestImport
    ? {
        clubs: normalizeStagedClubs(latestImport.klubliste),
        teams: normalizeStagedTeams(latestImport.holdliste),
        matches: normalizeStagedMatches(latestImport.kampe),
      }
    : null;

  let clubsForLicenses: Array<{ id: string; name: string; clubNo: string | null }> | null = null;
  if (tab === "spillerlicenser") {
    await ensureTurneringDomainTables();
    clubsForLicenses = await prisma.taClub.findMany({
      select: { id: true, name: true, clubNo: true },
      orderBy: [{ name: "asc" }],
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-4">
        <h1 className="text-3xl font-semibold">Turnering</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Turneringsadministration (under opbygning).
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <TurneringTabsClient tabs={tabs as unknown as Array<{ key: string; label: string }>} activeTab={tab} />

        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
          {tab === "godkend" ? (
            <div>
              <TurneringGodkendClient />
            </div>
          ) : null}

          {tab === "import" ? (
            <div>
              <div className="font-semibold text-zinc-900">Importér fra Excel</div>
              <div className="mt-1">
                Upload Excel for at loade <span className="font-medium">Kampprogram</span>,{" "}
                <span className="font-medium">Holdliste</span> og{" "}
                <span className="font-medium">Klubliste</span>.
              </div>
              <div className="mt-4">
                <TurneringKampeImportClient />
              </div>
            </div>
          ) : null}

          {tab === "kampe" ? (
            <div>
              <div className="font-semibold text-zinc-900">Kampe</div>
              {!staged ? (
                <div className="mt-1 text-zinc-600">Ingen import endnu. Gå til “Importér fra Excel”.</div>
              ) : (
                <div className="mt-3">
                  <DataTable
                    columns={[
                      { key: "dateText", label: "Dato" },
                      { key: "timeText", label: "Tid" },
                      { key: "league", label: "Liga" },
                      { key: "stage", label: "Stadie" },
                      { key: "pool", label: "Pulje" },
                      { key: "venue", label: "Sted" },
                      { key: "homeTeam", label: "Hjemmehold" },
                      { key: "awayTeam", label: "Udehold" },
                    ]}
                    rows={staged.matches}
                    emptyText="Ingen kampe fundet i Kampprogram."
                  />
                </div>
              )}
            </div>
          ) : null}

          {tab === "klubber" ? (
            <div>
              <div className="font-semibold text-zinc-900">Klubber</div>
              {!staged ? (
                <div className="mt-1 text-zinc-600">Ingen import endnu. Gå til “Importér fra Excel”.</div>
              ) : (
                <div className="mt-3">
                  <DataTable
                    columns={[{ key: "name", label: "Klub" }]}
                    rows={staged.clubs}
                    emptyText="Ingen klubber fundet i Klubliste."
                  />
                </div>
              )}
            </div>
          ) : null}

          {tab === "hold" ? (
            <div>
              <div className="font-semibold text-zinc-900">Hold</div>
              {!staged ? (
                <div className="mt-1 text-zinc-600">Ingen import endnu. Gå til “Importér fra Excel”.</div>
              ) : (
                <div className="mt-3">
                  <DataTable
                    columns={[
                      { key: "clubName", label: "Klub" },
                      { key: "league", label: "Liga" },
                      { key: "teamName", label: "Hold" },
                    ]}
                    rows={staged.teams}
                    emptyText="Ingen hold fundet i Holdliste."
                  />
                </div>
              )}
            </div>
          ) : null}

          {tab === "spillerlicenser" ? (
            <div>
              <TurneringSpillerlicenserClient clubs={clubsForLicenses ?? []} />
            </div>
          ) : null}

          {tab === "klubledere" ? (
            <div>
              <ClubLeadersManagementClient />
            </div>
          ) : null}

          {tab === "spillesteder" ? (
            <div>
              <TurneringSpillestederClient />
            </div>
          ) : null}

          {tab === "audit" ? (
            <div>
              <TurneringAuditClient />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

async function getLatestImport(): Promise<{
  id: string;
  createdAt: Date;
  filename: string | null;
  kampe: Array<Record<string, unknown>>;
  holdliste: Array<Record<string, unknown>>;
  klubliste: Array<Record<string, unknown>>;
} | null> {
  const exists =
    ((await prisma.$queryRawUnsafe(
      `SELECT 1 AS ok FROM information_schema.tables WHERE table_name = 'ta_turnering_imports' LIMIT 1;`
    )) as Array<{ ok: number }>).length > 0;

  if (!exists) return null;

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT id, created_at, filename, kampe, holdliste, klubliste
     FROM ta_turnering_imports
     ORDER BY created_at DESC
     LIMIT 1;`
  )) as Array<{
    id: string;
    created_at: Date;
    filename: string | null;
    kampe: unknown;
    holdliste: unknown;
    klubliste: unknown;
  }>;

  const latest = rows[0];
  if (!latest) return null;

  return {
    id: latest.id,
    createdAt: latest.created_at,
    filename: latest.filename,
    kampe: Array.isArray(latest.kampe) ? (latest.kampe as Array<Record<string, unknown>>) : [],
    holdliste: Array.isArray(latest.holdliste)
      ? (latest.holdliste as Array<Record<string, unknown>>)
      : [],
    klubliste: Array.isArray(latest.klubliste)
      ? (latest.klubliste as Array<Record<string, unknown>>)
      : [],
  };
}

function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  emptyText,
}: {
  columns: Array<{ key: keyof T; label: string }>;
  rows: T[];
  emptyText: string;
}) {
  if (!rows.length) {
    return <div className="text-sm text-zinc-600">{emptyText}</div>;
  }

  return (
    <div className="overflow-auto rounded-lg border border-zinc-200">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-50">
          <tr>
            {columns.map((c) => (
              <th
                key={String(c.key)}
                className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className="odd:bg-white even:bg-zinc-50/50">
              {columns.map((c) => (
                <td key={String(c.key)} className="border-b border-zinc-100 px-3 py-2 align-top">
                  {String(r[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
