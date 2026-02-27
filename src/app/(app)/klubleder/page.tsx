import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import KlublederGodkendClient from "./KlublederGodkendClient";
import KlublederClubPickerClient from "./KlublederClubPickerClient";
import KlublederSpillerlicenserClient from "./KlublederSpillerlicenserClient";

export default async function KlublederPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isClubLeader) redirect("/");

  const sp = await searchParams;
  const tabRaw = String(sp?.tab ?? "godkend");
  const tab = tabRaw === "spillerlicenser" ? "spillerlicenser" : "godkend";

  const clubIds = Array.from(
    new Set(
      (user.roles ?? [])
        .filter((r: any) => r.status === "APPROVED" && r.role === "CLUB_LEADER" && r.clubId)
        .map((r: any) => String(r.clubId)),
    ),
  );

  const clubs = clubIds.length
    ? await prisma.taClub.findMany({
        where: { id: { in: clubIds } },
        select: { id: true, name: true, clubNo: true },
        orderBy: [{ name: "asc" }],
      })
    : [];

  const requestedClubId = String(sp?.clubId ?? "").trim() || null;
  const defaultClubId = requestedClubId && clubIds.includes(requestedClubId)
    ? requestedClubId
    : clubs.length === 1
      ? clubs[0]!.id
      : null;

  const clubQuery = defaultClubId ? `&clubId=${encodeURIComponent(defaultClubId)}` : "";

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-4">
        <h1 className="text-3xl font-semibold">Klubleder</h1>
        <p className="mt-1 text-sm text-zinc-600">Klubleder-værktøjer (under opbygning).</p>
      </div>

      <KlublederClubPickerClient clubs={clubs} defaultClubId={defaultClubId} />

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <a
            href={`/klubleder?tab=godkend${clubQuery}`}
            className={
              "rounded-lg px-3 py-2 text-sm font-semibold " +
              (tab === "godkend"
                ? "bg-[color:var(--brand)] text-[var(--brand-foreground)]"
                : "bg-zinc-200 text-zinc-800 hover:bg-zinc-300")
            }
          >
            Godkend
          </a>

          <a
            href={`/klubleder?tab=spillerlicenser${clubQuery}`}
            className={
              "rounded-lg px-3 py-2 text-sm font-semibold " +
              (tab === "spillerlicenser"
                ? "bg-[color:var(--brand)] text-[var(--brand-foreground)]"
                : "bg-zinc-200 text-zinc-800 hover:bg-zinc-300")
            }
          >
            Spillerlicenser
          </a>
        </div>

        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
          {tab === "godkend" ? <KlublederGodkendClient /> : null}
          {tab === "spillerlicenser" ? <KlublederSpillerlicenserClient clubId={defaultClubId} /> : null}
        </div>
      </div>
    </div>
  );
}
