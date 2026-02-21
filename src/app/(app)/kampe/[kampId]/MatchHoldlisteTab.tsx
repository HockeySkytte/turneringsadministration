import { prisma } from "@/lib/prisma";
import MatchHoldlistePickerClient from "./MatchHoldlistePickerClient";

type Row = {
  role: string;
  number: string;
  name: string;
  born: string;
  leader: boolean;
  reserve: boolean;
};

function normalizeText(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function toRowFromUpload(r: any): Row {
  return {
    role: normalizeText(r?.cG),
    number: normalizeText(r?.number),
    name: normalizeText(r?.name),
    born: normalizeText(r?.birthday),
    leader: Boolean(normalizeText(r?.leader)),
    reserve: Boolean(normalizeText(r?.reserve)),
  };
}

function toRowFromProtocol(r: any): Row {
  return {
    role: normalizeText(r?.role),
    number: normalizeText(r?.number),
    name: normalizeText(r?.name),
    born: normalizeText(r?.born),
    leader: Boolean(normalizeText(r?.leader)),
    reserve: Boolean(normalizeText(r?.reserve)),
  };
}

function isMeaningfulRow(r: Row) {
  return Boolean(r.name || r.number || r.role || r.born);
}

function TeamTable({ title, rows }: { title: string; rows: Row[] }) {
  const meaningful = rows.filter(isMeaningfulRow);

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-700">{title}</h2>
      {meaningful.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
          Ingen spillere fundet.
        </div>
      ) : (
        <div className="overflow-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Rolle</th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">#</th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Navn</th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Født</th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Info</th>
              </tr>
            </thead>
            <tbody>
              {meaningful.map((r, idx) => {
                const base = idx % 2 === 0 ? "bg-white" : "bg-zinc-50/50";
                const info = [r.leader ? "L" : null, r.reserve ? "R" : null].filter(Boolean).join(" ");

                return (
                  <tr key={`${r.number}-${r.name}-${idx}`} className={base}>
                    <td className="border-b border-zinc-100 px-3 py-2 align-top text-zinc-700">{r.role || "-"}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 align-top text-zinc-700">{r.number || "-"}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 align-top font-medium text-zinc-900">{r.name || "-"}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 align-top text-zinc-700">{r.born || "-"}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 align-top text-zinc-700">{info || ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function MatchHoldlisteTab({
  kampId,
  homeTeamName,
  awayTeamName,
  pickTeams,
}: {
  kampId: number;
  homeTeamName: string | null;
  awayTeamName: string | null;
  pickTeams: Array<{ teamId: string; label: string }>;
}) {
  const [upload, protocol] = await Promise.all([
    prisma.matchUploadLineup.findMany({
      where: { kampId },
      orderBy: [{ venue: "asc" }, { rowIndex: "asc" }],
    }),
    prisma.matchProtocolPlayer.findMany({
      where: { kampId },
      orderBy: [{ side: "asc" }, { rowIndex: "asc" }],
    }),
  ]);

  const useUpload = upload.some((r) => normalizeText(r?.name) || normalizeText(r?.number));

  const homeRows: Row[] = [];
  const awayRows: Row[] = [];

  if (useUpload) {
    for (const r of upload) {
      const venue = normalizeText((r as any).venue).toUpperCase();
      const row = toRowFromUpload(r);
      if (venue.startsWith("H")) homeRows.push(row);
      else if (venue.startsWith("U")) awayRows.push(row);
    }
  } else {
    for (const r of protocol) {
      const side = normalizeText((r as any).side).toUpperCase();
      const row = toRowFromProtocol(r);
      if (side.startsWith("H")) homeRows.push(row);
      else if (side.startsWith("U")) awayRows.push(row);
    }
  }

  const anyRows = homeRows.some(isMeaningfulRow) || awayRows.some(isMeaningfulRow);

  return (
    <div className="space-y-4">
      {pickTeams.length ? <MatchHoldlistePickerClient kampId={kampId} teams={pickTeams} /> : null}
      {!anyRows ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
          Ingen holdliste fundet for kampen.
        </div>
      ) : (
        <>
          <TeamTable title={homeTeamName ? `Hjemmehold: ${homeTeamName}` : "Hjemmehold"} rows={homeRows} />
          <TeamTable title={awayTeamName ? `Udehold: ${awayTeamName}` : "Udehold"} rows={awayRows} />
          <div className="text-xs text-zinc-500">
            Kilde: {useUpload ? "Upload" : "Protokol"}
          </div>
        </>
      )}
    </div>
  );
}
