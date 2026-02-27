"use client";

import { useEffect, useMemo, useState } from "react";
import SearchableSelect from "@/components/ta/SearchableSelect";

type Club = { id: string; name: string; clubNo: string | null };

type ClubLeaderItem = {
  id: string;
  role: "CLUB_LEADER";
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  clubLeaderTitle: string | null;
  club: Club | null;
  user: {
    id: string;
    username: string;
    email: string;
    name: string | null;
    createdAt: string;
  };
};

const CLUB_LEADER_TITLE_OPTIONS = [
  { id: "FORMAND", label: "Formand" },
  { id: "KASSER", label: "Kassér" },
  { id: "BESTYRELSESMEDLEM", label: "Bestyrelsesmedlem" },
] as const;

function clubLeaderTitleLabel(value: string | null | undefined): string {
  const v = String(value ?? "").trim().toUpperCase();
  if (!v) return "-";
  const found = CLUB_LEADER_TITLE_OPTIONS.find((o) => o.id === v);
  return found?.label ?? v;
}

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

function statusPill(status: ClubLeaderItem["status"]) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ";
  if (status === "APPROVED") return base + "bg-emerald-100 text-emerald-800";
  if (status === "REJECTED") return base + "bg-red-100 text-red-800";
  return base + "bg-amber-100 text-amber-800";
}

const statusLabel: Record<ClubLeaderItem["status"], string> = {
  PENDING: "Afventer",
  APPROVED: "Godkendt",
  REJECTED: "Afvist",
};

export default function ClubLeadersManagementClient() {
  const [items, setItems] = useState<ClubLeaderItem[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ClubLeaderItem | null>(null);
  const [editClubId, setEditClubId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const clubOptions = useMemo(
    () =>
      clubs.map((c) => {
        const no = String(c.clubNo ?? "").trim();
        return { id: c.id, label: no ? `${c.name} (${no})` : c.name };
      }),
    [clubs]
  );

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [resItems, resClubs] = await Promise.all([
        fetch("/api/turnering/club-leaders", { cache: "no-store" }),
        fetch("/api/public/turnering/clubs", { cache: "no-store" }),
      ]);

      const dataItems = await resItems.json().catch(() => ({}));
      const dataClubs = await resClubs.json().catch(() => ({}));

      if (!resItems.ok || dataItems?.ok !== true) {
        setItems([]);
        setError(dataItems?.message ?? "Kunne ikke hente klubledere.");
      } else {
        setItems((dataItems?.items ?? []) as ClubLeaderItem[]);
      }

      if (resClubs.ok && dataClubs?.ok === true && Array.isArray(dataClubs?.clubs)) {
        setClubs(dataClubs.clubs as Club[]);
      } else {
        setClubs([]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveEdit() {
    if (!editing) return;
    setError(null);

    if (!editClubId) {
      setError("Vælg venligst en klub.");
      return;
    }

    if (!editTitle) {
      setError("Vælg venligst en rolle (Formand/Kassér/Bestyrelsesmedlem).");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/turnering/club-leaders/${encodeURIComponent(editing.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId: editClubId, clubLeaderTitle: editTitle }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "Kunne ikke opdatere klub.");
        return;
      }

      setEditing(null);
      setEditClubId(null);
      setEditTitle(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteAssignment(id: string) {
    setError(null);

    const ok = confirm("Er du sikker på at du vil slette denne klubleder-rolle?");
    if (!ok) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/turnering/club-leaders/${encodeURIComponent(id)}`, {
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
      <div className="text-sm font-semibold text-zinc-900">Alle klubledere</div>
      <p className="mt-1 text-sm text-zinc-600">Redigér klub eller slet rolle-tilknytning.</p>

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
            <div className="p-4 text-sm text-zinc-600">Ingen klubledere fundet.</div>
          ) : (
            items.map((item) => {
              const disabled = deletingId === item.id;
              return (
                <div key={item.id} className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-zinc-900">Klubleder – {item.user.username}</div>
                        <span className={statusPill(item.status)}>{statusLabel[item.status]}</span>
                      </div>
                      <div className="mt-1 text-sm text-zinc-700">
                        {item.user.name ? `${item.user.name} · ` : ""}{item.user.email}
                      </div>
                      <div className="mt-1 text-sm text-zinc-700">
                        Klub: {item.club ? formatClubLabel(item.club) : "(mangler)"}
                      </div>
                      <div className="mt-1 text-sm text-zinc-700">
                        Rolle: {clubLeaderTitleLabel(item.clubLeaderTitle)}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">Oprettet: {formatDateTime(item.createdAt)}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setEditing(item);
                          setEditClubId(item.club?.id ?? null);
                          setEditTitle(item.clubLeaderTitle ?? null);
                        }}
                        className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300 disabled:opacity-50"
                      >
                        Rediger
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void deleteAssignment(item.id)}
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
                <div className="text-sm font-semibold text-zinc-900">Rediger klubleder</div>
                <div className="mt-1 text-sm text-zinc-600">Vælg klub for {editing.user.username}.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (saving) return;
                  setEditing(null);
                  setEditClubId(null);
                  setEditTitle(null);
                }}
                className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300"
              >
                Luk
              </button>
            </div>

            <div className="mt-4">
              <SearchableSelect
                label="Klub"
                placeholder="Søg klub…"
                options={clubOptions}
                valueId={editClubId}
                onChange={(id) => setEditClubId(id)}
                disabled={clubOptions.length === 0}
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium">Rolle</label>
              <select
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
                value={editTitle ?? ""}
                onChange={(e) => setEditTitle(e.target.value || null)}
                required
              >
                <option value="" disabled>
                  Vælg rolle…
                </option>
                {CLUB_LEADER_TITLE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setEditing(null);
                  setEditClubId(null);
                }}
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
