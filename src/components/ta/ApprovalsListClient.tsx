"use client";

import { useEffect, useMemo, useState } from "react";

type TaRole =
  | "ADMIN"
  | "TOURNAMENT_ADMIN"
  | "REF_ADMIN"
  | "CLUB_LEADER"
  | "TEAM_LEADER"
  | "SECRETARIAT"
  | "REFEREE";

type PendingRoleItem = {
  id: string;
  role: TaRole;
  status: "PENDING";
  createdAt: string;
  user: {
    id: string;
    email: string;
    username: string;
    name: string | null;
    createdAt: string;
  };
  club: { id: string; name: string; clubNo: string | null } | null;
  clubLeaderTitle?: string | null;
  team: {
    id: string;
    name: string;
    league: string;
    club: { id: string; name: string; clubNo: string | null };
  } | null;

  referee?: { id: string; name: string; refereeNo: string; club: string | null } | null;
};

const roleLabels: Record<TaRole, string> = {
  ADMIN: "Admin",
  TOURNAMENT_ADMIN: "Turneringsadmin",
  REF_ADMIN: "Dommeradmin",
  CLUB_LEADER: "Klubleder",
  TEAM_LEADER: "Holdleder",
  SECRETARIAT: "Sekretariat",
  REFEREE: "Dommer",
};

function formatDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("da-DK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClubLabel(club: { name: string; clubNo: string | null }) {
  const no = String(club.clubNo ?? "").trim();
  return no ? `${club.name} (${no})` : club.name;
}

function formatClubLeaderTitle(value: string | null | undefined) {
  const v = String(value ?? "").trim().toUpperCase();
  if (!v) return "-";
  if (v === "FORMAND") return "Formand";
  if (v === "KASSER") return "Kassér";
  if (v === "BESTYRELSESMEDLEM") return "Bestyrelsesmedlem";
  return v;
}

export default function ApprovalsListClient({
  title,
  description,
  roleFilter,
  pendingQuery,
}: {
  title: string;
  description?: string;
  roleFilter: TaRole[];
  pendingQuery?: Record<string, string | null | undefined>;
}) {
  const [items, setItems] = useState<PendingRoleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const filteredItems = useMemo(
    () => items.filter((i) => roleFilter.includes(i.role)),
    [items, roleFilter]
  );

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(pendingQuery ?? {})) {
        const vv = String(v ?? "").trim();
        if (!vv) continue;
        qs.set(k, vv);
      }
      const url = qs.toString() ? `/api/approvals/pending?${qs.toString()}` : "/api/approvals/pending";

      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        setItems([]);
        setError(data?.message ?? "Kunne ikke hente afventende godkendelser.");
        return;
      }

      setItems((data?.items ?? []) as PendingRoleItem[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(roleAssignmentId: string, approve: boolean) {
    setError(null);
    setDecidingId(roleAssignmentId);

    try {
      const res = await fetch("/api/approvals/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleAssignmentId, approve }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "Kunne ikke opdatere godkendelse.");
        return;
      }

      await load();
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div>
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      {description ? <p className="mt-1 text-sm text-zinc-600">{description}</p> : null}

      {error ? (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200">
        <div className="grid grid-cols-1 gap-0 divide-y divide-zinc-200">
          {loading ? (
            <div className="p-4 text-sm text-zinc-600">Henter…</div>
          ) : filteredItems.length === 0 ? (
            <div className="p-4 text-sm text-zinc-600">Ingen afventende godkendelser.</div>
          ) : (
            filteredItems.map((item) => {
              const actorDisabled = decidingId === item.id;

              const targetText =
                item.role === "CLUB_LEADER" && item.club
                  ? `Klub: ${formatClubLabel(item.club)} · Rolle: ${formatClubLeaderTitle(item.clubLeaderTitle)}`
                  : item.role === "TEAM_LEADER"
                    ? item.team
                      ? `Hold: ${item.team.name} · ${item.team.league} · ${formatClubLabel(item.team.club)}`
                      : "Hold: (mangler)"
                    : item.role === "SECRETARIAT"
                      ? item.club
                        ? `Klub: ${formatClubLabel(item.club)}`
                        : "Klub: (mangler)"
                      : item.role === "REFEREE"
                        ? item.referee
                          ? `Dommer: ${item.referee.name} (${item.referee.refereeNo})${item.referee.club ? ` · ${item.referee.club}` : ""}`
                          : "Dommer: (mangler)"
                      : "";

              return (
                <div key={item.id} className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">
                        {roleLabels[item.role]} – {item.user.username}
                      </div>
                      <div className="mt-1 text-sm text-zinc-700">
                        {item.user.name ? `${item.user.name} · ` : ""}{item.user.email}
                      </div>
                      {targetText ? <div className="mt-1 text-sm text-zinc-700">{targetText}</div> : null}
                      <div className="mt-1 text-xs text-zinc-500">
                        Oprettet: {formatDateTime(item.createdAt)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={actorDisabled}
                        onClick={() => void decide(item.id, true)}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Godkend
                      </button>
                      <button
                        type="button"
                        disabled={actorDisabled}
                        onClick={() => void decide(item.id, false)}
                        className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300 disabled:opacity-50"
                      >
                        Afvis
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
