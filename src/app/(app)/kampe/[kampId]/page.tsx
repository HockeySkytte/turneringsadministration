import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";
import MatchReportViewer from "./MatchReportViewer";
import MatchSecretariatTab from "./MatchSecretariatTab";
import MatchStatsServer from "./MatchStatsServer";
import MatchHoldlisteTab from "./MatchHoldlisteTab";
import MatchDeleteTabClient from "./MatchDeleteTabClient";
import MatchEditTabClient from "./MatchEditTabClient";
import MatchKommentarerTabClient from "./MatchKommentarerTabClient";

type Tab = "report" | "stats" | "secretariat" | "holdliste" | "comments" | "edit" | "delete";

type MatchStatus = "open" | "live" | "closed";

const MATCH_FILE_EXTENSIONS = ["jpg", "jpeg", "png", "pdf"] as const;

function holdHref(args: { holdId: string; league: string | null; pool: string | null; stage: string | null }) {
  const qs = new URLSearchParams();
  if (args.league) qs.set("league", args.league);
  if (args.pool) qs.set("pool", args.pool);
  if (args.stage) qs.set("stage", args.stage);
  qs.set("tab", "kampe");
  const q = qs.toString();
  return `/hold/${encodeURIComponent(args.holdId)}${q ? `?${q}` : ""}`;
}

async function matchFileExists(url: string): Promise<boolean> {
  // Try HEAD first, then fall back to a small ranged GET.
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "follow", cache: "no-store" });
    if (head.ok) return true;
    if (head.status !== 405) return false;
  } catch {
    // ignore
  }

  try {
    const get = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: { Range: "bytes=0-0" },
    });
    return get.ok;
  } catch {
    return false;
  }
}

async function hasMatchReport(kampId: number): Promise<boolean> {
  for (const ext of MATCH_FILE_EXTENSIONS) {
    const url = `https://floora.floorball.dk/Public/MatchFile/${kampId}.${ext}`;
    // eslint-disable-next-line no-await-in-loop
    const ok = await matchFileExists(url);
    if (ok) return true;
  }
  return false;
}

function normalizeStatus(s: unknown): MatchStatus | null {
  const v = String(s ?? "").trim().toLowerCase();
  if (v === "open" || v === "live" || v === "closed") return v;
  return null;
}

function deriveStatus(statuses: Array<string | null | undefined>): MatchStatus {
  const normed = statuses.map(normalizeStatus).filter(Boolean) as MatchStatus[];
  if (normed.includes("closed")) return "closed";
  if (normed.includes("live")) return "live";
  return "open";
}

function parseKampId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseTab(searchParams?: Record<string, string | string[] | undefined>): Tab {
  const raw = searchParams?.tab;
  const v = Array.isArray(raw) ? raw[0] : raw;
  const tab = String(v ?? "").toLowerCase();
  if (tab === "stats") return "stats";
  if (tab === "secretariat") return "secretariat";
  if (tab === "holdliste") return "holdliste";
  if (tab === "comments") return "comments";
  if (tab === "edit") return "edit";
  if (tab === "delete") return "delete";
  return "report";
}

function formatDate(value: Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("da-DK", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

export default async function KampPage({
  params,
  searchParams,
}: {
  params: Promise<{ kampId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await getAppContext();
  if (user?.isSuperuser && !user.isSuperuserApproved && !user.isAdmin) {
    redirect("/afventer");
  }

  const { kampId: kampIdParam } = await params;
  const kampId = parseKampId(kampIdParam);
  if (!kampId) {
    redirect("/turnering");
  }

  const resolvedSearchParams = (await searchParams) ?? undefined;
  const tab = parseTab(resolvedSearchParams);

  const canOverride = Boolean(user?.isAdmin || user?.isTournamentAdmin || user?.isSuperuser);
  const showDeleteTab = Boolean(user?.isTournamentAdmin || user?.isAdmin || user?.isSuperuser);
  const showEditTab = Boolean(user?.isTournamentAdmin);
  const taMatch = await prisma.taMatch.findFirst({
    where: { externalId: String(kampId) },
    select: {
      date: true,
      time: true,
      league: true,
      pool: true,
      stage: true,
      homeTeam: true,
      homeHoldId: true,
      awayTeam: true,
      awayHoldId: true,
      dommer1: true,
      dommer1Id: true,
      dommer2: true,
      dommer2Id: true,
    },
  });

  if (!taMatch) {
    // DB-only policy: if it isn't in Kalender/Turnering (ta_matches), it must not be shown here.
    redirect("/kalender");
  }

  const lastGoal = await prisma.matchProtocolEvent.findFirst({
    where: { kampId, goal: { not: null } },
    orderBy: { rowIndex: "desc" },
    select: { goal: true },
  });

  const showReportTab = await hasMatchReport(kampId);
  const effectiveTab: Tab = !showReportTab && tab === "report" ? "stats" : tab;

  const [protoPlayersStatus, protoEventsStatus, uploadPlayersStatus, uploadEventsStatus] =
    await Promise.all([
      prisma.matchProtocolPlayer.findMany({
        where: { kampId, status: { not: null } },
        distinct: ["status"],
        select: { status: true },
      }),
      prisma.matchProtocolEvent.findMany({
        where: { kampId, status: { not: null } },
        distinct: ["status"],
        select: { status: true },
      }),
      prisma.matchUploadLineup.findMany({
        where: { kampId, status: { not: null } },
        distinct: ["status"],
        select: { status: true },
      }),
      prisma.matchUploadEvent.findMany({
        where: { kampId, status: { not: null } },
        distinct: ["status"],
        select: { status: true },
      }),
    ]);

  const status: MatchStatus = deriveStatus([
    ...protoPlayersStatus.map((r) => r.status),
    ...protoEventsStatus.map((r) => r.status),
    ...uploadPlayersStatus.map((r) => r.status),
    ...uploadEventsStatus.map((r) => r.status),
  ]);

  const homeHoldId = String(taMatch.homeHoldId ?? "").trim() || null;
  const awayHoldId = String(taMatch.awayHoldId ?? "").trim() || null;

  const [homeTeamRecord, awayTeamRecord] = await Promise.all([
    homeHoldId
      ? prisma.taTeam.findFirst({
          where: { holdId: homeHoldId },
          orderBy: { updatedAt: "desc" },
          select: { id: true, clubId: true },
        })
      : Promise.resolve(null),
    awayHoldId
      ? prisma.taTeam.findFirst({
          where: { holdId: awayHoldId },
          orderBy: { updatedAt: "desc" },
          select: { id: true, clubId: true },
        })
      : Promise.resolve(null),
  ]);

  const homeClubId = homeTeamRecord?.clubId ?? null;
  const homeTeamId = homeTeamRecord?.id ?? null;
  const awayClubId = awayTeamRecord?.clubId ?? null;
  const awayTeamId = awayTeamRecord?.id ?? null;

  const isHomeSecretariat =
    !!homeClubId &&
    !!user?.roles?.some(
      (r) =>
        r.status === "APPROVED" &&
        r.role === "SECRETARIAT" &&
        r.clubId != null &&
        r.clubId === homeClubId,
    );

  const isTeamLeaderForMatch =
    !!user?.roles?.some(
      (r) =>
        r.status === "APPROVED" &&
        r.role === "TEAM_LEADER" &&
        ((r.teamId != null && (r.teamId === homeTeamId || r.teamId === awayTeamId)) ||
          (r.holdId != null && (r.holdId === homeHoldId || r.holdId === awayHoldId))),
    );

  const isClubLeaderForMatch =
    !!user?.roles?.some(
      (r) =>
        r.status === "APPROVED" &&
        r.role === "CLUB_LEADER" &&
        r.clubId != null &&
        (r.clubId === homeClubId || r.clubId === awayClubId),
    );

  const pickTeams: Array<{ teamId: string; label: string }> = [];
  if (
    homeTeamId &&
    user?.roles?.some(
      (r) =>
        r.status === "APPROVED" &&
        r.role === "TEAM_LEADER" &&
        ((r.teamId != null && r.teamId === homeTeamId) || (r.holdId != null && r.holdId === homeHoldId)),
    )
  ) {
    pickTeams.push({
      teamId: homeTeamId,
      label: taMatch.homeTeam ? `${taMatch.homeTeam} (Hjemme)` : "Hjemme",
    });
  }
  if (
    awayTeamId &&
    user?.roles?.some(
      (r) =>
        r.status === "APPROVED" &&
        r.role === "TEAM_LEADER" &&
        ((r.teamId != null && r.teamId === awayTeamId) || (r.holdId != null && r.holdId === awayHoldId)),
    )
  ) {
    pickTeams.push({
      teamId: awayTeamId,
      label: taMatch.awayTeam ? `${taMatch.awayTeam} (Ude)` : "Ude",
    });
  }

  // Visibility rule: only home-club secretariat (not admins) and match not closed.
  const showSecretariatTab = isHomeSecretariat && status !== "closed";
  // Editing rule: home-club secretariat can only edit when open; admins can override.
  const canEdit = canOverride || (isHomeSecretariat && status === "open");

  const scoreText = (() => {
    const v = String(lastGoal?.goal ?? "").trim();
    return /^\d+\s*-\s*\d+$/.test(v) ? v.replace(/\s+/g, "") : "-";
  })();

  const matchTitle = (
    <>
      {homeHoldId ? (
        <Link href={holdHref({ holdId: homeHoldId, league: taMatch.league, pool: taMatch.pool, stage: taMatch.stage })} className="hover:underline">
          {taMatch.homeTeam}
        </Link>
      ) : (
        taMatch.homeTeam
      )}
      <span> – </span>
      {awayHoldId ? (
        <Link href={holdHref({ holdId: awayHoldId, league: taMatch.league, pool: taMatch.pool, stage: taMatch.stage })} className="hover:underline">
          {taMatch.awayTeam}
        </Link>
      ) : (
        taMatch.awayTeam
      )}
    </>
  );
  const rowName = taMatch.league ?? "";
  const poolName = taMatch.pool ?? "";
  const stageName = (taMatch.stage ?? "").trim();
  const dommer1Name = String(taMatch.dommer1 ?? "").trim();
  const dommer1Id = String(taMatch.dommer1Id ?? "").trim();
  const dommer2Name = String(taMatch.dommer2 ?? "").trim();
  const dommer2Id = String(taMatch.dommer2Id ?? "").trim();

  const actorRefereeId =
    user?.isReferee
      ? String(user.roles?.find((r) => r.status === "APPROVED" && r.role === "REFEREE" && r.refereeId)?.refereeId ?? "").trim() ||
        null
      : null;

  const actorRefereeNo = actorRefereeId
    ? ((await prisma.taReferee.findUnique({ where: { id: actorRefereeId }, select: { refereeNo: true } }))?.refereeNo ?? null)
    : null;

  const isAssignedReferee = Boolean(
    (actorRefereeNo && (dommer1Id === actorRefereeNo || dommer2Id === actorRefereeNo)) ||
      (actorRefereeId && (dommer1Id === actorRefereeId || dommer2Id === actorRefereeId))
  );
  const isAdminLike = Boolean(user?.isAdmin || user?.isTournamentAdmin || user?.isRefAdmin);
  const showCommentsTab = Boolean(isTeamLeaderForMatch || isClubLeaderForMatch || isAssignedReferee || isAdminLike);

  const formatDommer = (name: string, no: string) => {
    if (name && no) return `${name} (${no})`;
    return name || no;
  };

  const dommer1Text = formatDommer(dommer1Name, dommer1Id);
  const dommer2Text = formatDommer(dommer2Name, dommer2Id);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-col gap-1">
        {taMatch.homeTeam && taMatch.awayTeam ? (
          <h1 className="text-3xl font-semibold text-zinc-900">{matchTitle}</h1>
        ) : (
          <h1 className="text-3xl font-semibold text-zinc-900">Kamp {kampId}</h1>
        )}
        <div className="mt-1 text-sm text-zinc-600">
          KampId: {kampId}
          {taMatch.date ? ` · Dato: ${formatDate(taMatch.date)}` : ""}
          {rowName ? ` · Liga: ${rowName}` : ""}
          {stageName ? ` · Stadie: ${stageName}` : ""}
          {poolName ? ` · Pulje: ${poolName}` : ""}
          {dommer1Text ? ` · Dommer 1: ${dommer1Text}` : ""}
          {dommer2Text ? ` · Dommer 2: ${dommer2Text}` : ""}
          {scoreText !== "-" ? ` · Resultat: ${scoreText}` : ""}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2">
        {showReportTab ? (
          <Link
            href={{ pathname: `/kamp/${kampId}`, query: { tab: "report" } }}
            className={
              effectiveTab === "report"
                ? "rounded-md bg-[color:var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-foreground)]"
                : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
            }
          >
            Kamprapport
          </Link>
        ) : null}
        <Link
          href={{ pathname: `/kamp/${kampId}`, query: { tab: "stats" } }}
          className={
            effectiveTab === "stats"
              ? "rounded-md bg-[color:var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-foreground)]"
              : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
          }
        >
          Statistik
        </Link>

        {isTeamLeaderForMatch ? (
          <Link
            href={{ pathname: `/kamp/${kampId}`, query: { tab: "holdliste" } }}
            className={
              effectiveTab === "holdliste"
                ? "rounded-md bg-[color:var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-foreground)]"
                : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
            }
          >
            Holdliste
          </Link>
        ) : null}

        {showCommentsTab ? (
          <Link
            href={{ pathname: `/kamp/${kampId}`, query: { tab: "comments" } }}
            className={
              effectiveTab === "comments"
                ? "rounded-md bg-[color:var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-foreground)]"
                : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
            }
          >
            Kommentarer
          </Link>
        ) : null}

        {showSecretariatTab ? (
          <Link
            href={{ pathname: `/kamp/${kampId}`, query: { tab: "secretariat" } }}
            className={
              effectiveTab === "secretariat"
                ? "rounded-md bg-[color:var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-foreground)]"
                : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
            }
          >
            Sekretariat
          </Link>
        ) : null}

        {showEditTab && status === "closed" ? (
          <Link
            href={{ pathname: `/kamp/${kampId}`, query: { tab: "edit" } }}
            className={
              effectiveTab === "edit"
                ? "rounded-md bg-[color:var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-foreground)]"
                : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
            }
          >
            Ret Kamp
          </Link>
        ) : null}

        {showDeleteTab ? (
          <Link
            href={{ pathname: `/kamp/${kampId}`, query: { tab: "delete" } }}
            className={
              effectiveTab === "delete"
                ? "rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white"
                : "rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700"
            }
          >
            Slet Kamp
          </Link>
        ) : null}
      </div>

      {effectiveTab === "secretariat" ? (
        showSecretariatTab ? (
          <MatchSecretariatTab
            kampId={kampId}
            homeTeamName={taMatch.homeTeam ?? null}
            awayTeamName={taMatch.awayTeam ?? null}
          />
        ) : (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
            Du har ikke adgang til sekretariat for denne kamp.
          </div>
        )
      ) : null}

      <div className="mt-6">
        {effectiveTab === "report" ? (
          <MatchReportViewer kampId={kampId} />
        ) : effectiveTab === "stats" ? (
          <MatchStatsServer
            kampId={kampId}
            matchDate={taMatch.date ?? null}
            homeTeam={taMatch.homeTeam ?? ""}
            awayTeam={taMatch.awayTeam ?? ""}
          />
        ) : effectiveTab === "secretariat" ? null : effectiveTab === "holdliste" ? (
          isTeamLeaderForMatch ? (
            <MatchHoldlisteTab
              kampId={kampId}
              homeTeamName={taMatch.homeTeam ?? null}
              awayTeamName={taMatch.awayTeam ?? null}
              pickTeams={pickTeams}
            />
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
              Du har ikke adgang til holdlisten for denne kamp.
            </div>
          )
        ) : effectiveTab === "comments" ? (
          showCommentsTab ? (
            <MatchKommentarerTabClient kampId={kampId} />
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
              Du har ikke adgang til kommentarer for denne kamp.
            </div>
          )
        ) : effectiveTab === "edit" ? (
          showEditTab ? (
            status === "closed" ? (
              <MatchEditTabClient kampId={kampId} />
            ) : (
              <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                Ret Kamp er kun tilgængelig, når kampen er afsluttet.
              </div>
            )
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
              Du har ikke adgang til at rette kampdata.
            </div>
          )
        ) : effectiveTab === "delete" ? (
          showDeleteTab ? (
            <MatchDeleteTabClient kampId={kampId} />
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
              Du har ikke adgang til at slette kampdata.
            </div>
          )
        ) : (
          <MatchStatsServer
            kampId={kampId}
            matchDate={taMatch.date ?? null}
            homeTeam={taMatch.homeTeam ?? ""}
            awayTeam={taMatch.awayTeam ?? ""}
          />
        )}
      </div>
    </div>
  );
}
