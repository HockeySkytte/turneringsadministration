"use client";

import { useEffect, useMemo, useState } from "react";
import SearchableSelect from "@/components/ta/SearchableSelect";

type TaRole = "TEAM_LEADER" | "SECRETARIAT";

type Club = { id: string; name: string; clubNo: string | null };

type Team = {
  id: string;
  name: string;
  league: string;
  club?: Club;
};

type RoleItem = {
  id: string;
  role: TaRole;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  club: Club | null;
  team: Team | null;
  user: {
    id: string;
    username: string;
    email: string;
    name: string | null;
    createdAt: string;
  };
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

function formatClubLabel(club: Club) {
  const no = String(club.clubNo ?? "").trim();
  return no ? `${club.name} (${no})` : club.name;
}

function statusPill(status: RoleItem["status"]) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ";
  if (status === "APPROVED") return base + "bg-emerald-100 text-emerald-800";
  if (status === "REJECTED") return base + "bg-red-100 text-red-800";
  return base + "bg-amber-100 text-amber-800";
}

const statusLabel: Record<RoleItem["status"], string> = {
  PENDING: "Afventer",
  APPROVED: "Godkendt",
  REJECTED: "Afvist",
};

const roleLabel: Record<TaRole, string> = {
  TEAM_LEADER: "Holdleder",
  SECRETARIAT: "Sekretariat",
};

type EditingState =
  | { kind: "TEAM_LEADER"; item: RoleItem; teamId: string | null }
  | { kind: "SECRETARIAT"; item: RoleItem };

export default function KlublederRoleAssignmentsManagementClient({
  clubId,
}: {
  clubId: string | null;
}) {
  const [items, setItems] = useState<RoleItem[]>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string; league: string }>>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const teamOptions = useMemo(
    () =>
      teams.map((t) => ({
        id: t.id,
        label: `${t.league} · ${t.name}`,
      })),
    [teams]
  );

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const qs = clubId ? `?clubId=${encodeURIComponent(clubId)}` : "";
      const [resItems, resTeams] = await Promise.all([
        fetch(`/api/klubleder/role-assignments${qs}`, { cache: "no-store" }),
        fetch(`/api/klubleder/teams${qs}`, { cache: "no-store" }),
      ]);

      const dataItems = await resItems.json().catch(() => ({}));
      const dataTeams = await resTeams.json().catch(() => ({}));

      if (!resItems.ok || dataItems?.ok !== true) {
        setItems([]);
        setError(dataItems?.message ?? "Kunne ikke hente rolle-tilknytninger.");
      } else {
        setItems((dataItems?.items ?? []) as RoleItem[]);
      }

      if (resTeams.ok && dataTeams?.ok === true) {
        setTeams((dataTeams?.teams ?? []) as Array<{ id: string; name: string; league: string }>);
      } else {
        setTeams([]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [clubId]);

  async function saveEdit() {
    if (!editing) return;
    setError(null);

    setSaving(true);
    try {
      if (editing.kind === "TEAM_LEADER") {
        if (!editing.teamId) {
          setError("Vælg venligst et hold.");
          return;
        }
        const res = await fetch(`/api/klubleder/role-assignments/${encodeURIComponent(editing.item.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: editing.teamId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.message ?? "Kunne ikke opdatere hold.");
          return;
        }
      }

      if (editing.kind === "SECRETARIAT") {
        if (!clubId) {
          setError("Mangler klub.");
          return;
        }
        const res = await fetch(`/api/klubleder/role-assignments/${encodeURIComponent(editing.item.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clubId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.message ?? "Kunne ikke opdatere klub.");
          return;
        }
      }

      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteAssignment(item: RoleItem) {
    setError(null);
    const ok = confirm(`Er du sikker på at du vil slette denne rolle: ${roleLabel[item.role]}?`);
    if (!ok) return;

    setDeletingId(item.id);
    try {
      const res = await fetch(`/api/klubleder/role-assignments/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "Kunne ikke slette rollen.");
        return;
      }
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="text-sm font-semibold text-zinc-900">Alle holdledere og sekretariat</div>
      <p className="mt-1 text-sm text-zinc-600">Redigér hold eller slet rolle-tilknytning.</p>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200">
        <div className="grid grid-cols-1 gap-0 divide-y divide-zinc-200">
          {loading ? (
            <div className="p-4 text-sm text-zinc-600">Henter…</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-sm text-zinc-600">Ingen roller fundet.</div>
          ) : (
            items.map((item) => {
              const disabled = deletingId === item.id;

              const targetText =
                item.role === "TEAM_LEADER"
                  ? item.team
                    ? `Hold: ${item.team.name} · ${item.team.league}`
                    : "Hold: (mangler)"
                  : item.club
                    ? `Klub: ${formatClubLabel(item.club)}`
                    : "Klub: (mangler)";

              return (
                <div key={item.id} className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-zinc-900">
                          {roleLabel[item.role]} – {item.user.username}
                        </div>
                        <span className={statusPill(item.status)}>{statusLabel[item.status]}</span>
                      </div>
                      <div className="mt-1 text-sm text-zinc-700">
                        {item.user.name ? `${item.user.name} · ` : ""}{item.user.email}
                      </div>
                      <div className="mt-1 text-sm text-zinc-700">{targetText}</div>
                      <div className="mt-1 text-xs text-zinc-500">Oprettet: {formatDateTime(item.createdAt)}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (item.role === "TEAM_LEADER") {
                            setEditing({ kind: "TEAM_LEADER", item, teamId: item.team?.id ?? null });
                          } else {
                            setEditing({ kind: "SECRETARIAT", item });
                          }
                        }}
                        className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300 disabled:opacity-50"
                      >
                        Rediger
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void deleteAssignment(item)}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {deletingId === item.id ? "Sletter…" : "Slet"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Rediger rolle</div>
                <div className="mt-1 text-sm text-zinc-600">{roleLabel[editing.kind]} – {editing.item.user.username}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (saving) return;
                  setEditing(null);
                }}
                className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300"
              >
                Luk
              </button>
            </div>

            {editing.kind === "TEAM_LEADER" ? (
              <div className="mt-4">
                <SearchableSelect
                  label="Hold"
                  placeholder={teamOptions.length ? "Søg hold…" : "Ingen hold fundet"}
                  options={teamOptions}
                  valueId={editing.teamId}
                  onChange={(id) => setEditing({ ...editing, teamId: id })}
                  disabled={teamOptions.length === 0}
                />
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                Sekretariat er altid knyttet til din klub.
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditing(null)}
                className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300 disabled:opacity-50"
              >
                Annuller
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveEdit()}
                className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-50"
              >
                {saving ? "Gemmer…" : "Gem"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
