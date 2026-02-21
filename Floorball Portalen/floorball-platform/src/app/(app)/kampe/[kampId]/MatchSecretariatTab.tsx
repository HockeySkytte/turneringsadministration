import { prisma } from "@/lib/prisma";
import MatchSecretariatClient from "./MatchSecretariatClient";

function norm(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isLeaderRow(r: any) {
  return norm(r?.leader).toUpperCase() === "L";
}

type LineupRow = {
  rowIndex: number;
  role: string;
  number: string;
  name: string;
  born: string;
  reserve: string;
  leader: string;
};

function toRow(r: any): LineupRow {
  return {
    rowIndex: Number(r?.rowIndex ?? 0),
    role: norm(r?.cG),
    number: norm(r?.number),
    name: norm(r?.name),
    born: norm(r?.birthday),
    reserve: norm(r?.reserve),
    leader: norm(r?.leader),
  };
}

function b64FromBytes(bytes: any): string | null {
  if (!bytes) return null;
  try {
    return Buffer.from(bytes).toString("base64");
  } catch {
    return null;
  }
}

export default async function MatchSecretariatTab({
  kampId,
  homeTeamName,
  awayTeamName,
}: {
  kampId: number;
  homeTeamName: string | null;
  awayTeamName: string | null;
}) {
  const [lineups, approvals, started] = await Promise.all([
    prisma.matchUploadLineup.findMany({
      where: { kampId },
      orderBy: [{ venue: "asc" }, { rowIndex: "asc" }],
    }),
    (prisma as any).matchLineupApproval?.findMany({ where: { kampId } }) ?? Promise.resolve([]),
    (prisma as any).matchStart?.findUnique({ where: { kampId } }) ?? Promise.resolve(null),
  ]);

  const byVenue: Record<string, LineupRow[]> = { Hjemme: [], Ude: [] };
  for (const r of lineups as any[]) {
    const v = norm((r as any).venue);
    if (v !== "Hjemme" && v !== "Ude") continue;
    byVenue[v].push(toRow(r));
  }

  const apprByVenue: Record<string, any | null> = { Hjemme: null, Ude: null };
  for (const a of approvals as any[]) {
    const v = norm(a?.venue);
    if (v === "Hjemme" || v === "Ude") apprByVenue[v] = a;
  }

  const homeAll = byVenue.Hjemme;
  const awayAll = byVenue.Ude;

  const homePlayers = homeAll.filter((r) => !isLeaderRow(r));
  const homeLeaders = homeAll.filter((r) => isLeaderRow(r));
  const awayPlayers = awayAll.filter((r) => !isLeaderRow(r));
  const awayLeaders = awayAll.filter((r) => isLeaderRow(r));

  const homeApproved = Boolean(apprByVenue.Hjemme);
  const awayApproved = Boolean(apprByVenue.Ude);

  const homeSignatureB64 = b64FromBytes(apprByVenue.Hjemme?.signaturePng);
  const awaySignatureB64 = b64FromBytes(apprByVenue.Ude?.signaturePng);

  return (
    <MatchSecretariatClient
      kampId={kampId}
      home={{
        teamName: homeTeamName ?? "Hjemmehold",
        players: homePlayers,
        leaders: homeLeaders,
        approved: homeApproved,
        approvalLeaderName: norm(apprByVenue.Hjemme?.leaderName) || null,
        approvalSignatureDataUrl: homeSignatureB64 ? `data:image/png;base64,${homeSignatureB64}` : null,
      }}
      away={{
        teamName: awayTeamName ?? "Udehold",
        players: awayPlayers,
        leaders: awayLeaders,
        approved: awayApproved,
        approvalLeaderName: norm(apprByVenue.Ude?.leaderName) || null,
        approvalSignatureDataUrl: awaySignatureB64 ? `data:image/png;base64,${awaySignatureB64}` : null,
      }}
      startedAt={started?.startedAt ?? null}
    />
  );
}
