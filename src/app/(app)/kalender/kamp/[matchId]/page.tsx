import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { getAppContext } from "@/lib/appContext";

export const dynamic = "force-dynamic";

function formatDate(d: Date | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("da-DK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatTime(t: Date | null) {
  if (!t) return "";
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  return `${hh}.${mm}`;
}

export default async function KalenderKampPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  await getAppContext();
  await ensureTurneringDomainTables();

  const { matchId } = await params;

  type TaMatchView = {
    id: string;
    externalId: string | number | null;
    date: Date | null;
    time: Date | null;
    league: string | null;
    pool: string | null;
    venue: string | null;
    homeTeam: string;
    awayTeam: string;
  };

  // Some editor typecheckers can temporarily lose the generated TaMatch delegate typing.
  // Runtime delegate exists; keep this page working with an explicit return shape.
  const match = (await (prisma as any).taMatch.findUnique({
    where: { id: String(matchId) },
    select: {
      id: true,
      externalId: true,
      date: true,
      time: true,
      league: true,
      pool: true,
      venue: true,
      homeTeam: true,
      awayTeam: true,
    },
  })) as TaMatchView | null;

  if (!match) notFound();

  const kampId = Number.parseInt(String(match.externalId ?? "").trim(), 10);
  if (Number.isFinite(kampId) && kampId > 0) {
    redirect(`/kamp/${kampId}`);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <a className="text-sm underline" href="/kalender">
          ← Tilbage til kalender
        </a>
      </div>

      <h1 className="text-2xl font-semibold">Kamp</h1>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm text-zinc-600">{match.id}</div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Dato" value={formatDate(match.date) || "-"} />
          <Field label="Tid" value={formatTime(match.time) || "-"} />
          <Field label="Liga" value={match.league ?? "-"} />
          <Field label="Pulje" value={match.pool ?? "-"} />
          <Field label="Sted" value={match.venue ?? "-"} />
        </div>

        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <div className="text-xs font-semibold text-zinc-600">Hold</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900">
            {match.homeTeam} <span className="text-zinc-500">vs</span> {match.awayTeam}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-zinc-600">{label}</div>
      <div className="mt-0.5 text-sm text-zinc-900">{value}</div>
    </div>
  );
}
