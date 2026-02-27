"use client";

import { useEffect, useState } from "react";

type TaRoleStatus = "PENDING" | "APPROVED" | "REJECTED";

type ManagedRole = "TOURNAMENT_ADMIN" | "REF_ADMIN";

type UserItem = {
  id: string;
  email: string;
  username: string;
  name: string | null;
  createdAt: string;
};

type AdminRoleItem = {
  id: string;
  role: ManagedRole;
  status: TaRoleStatus;
  createdAt: string;
  approvedAt: string | null;
  user: UserItem;
};

const roleLabel: Record<ManagedRole, string> = {
  TOURNAMENT_ADMIN: "Turneringsadmin",
  REF_ADMIN: "Dommeradmin",
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

function statusPill(status: TaRoleStatus) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ";
  if (status === "APPROVED") return base + "bg-emerald-100 text-emerald-800";
  if (status === "REJECTED") return base + "bg-red-100 text-red-800";
  return base + "bg-amber-100 text-amber-800";
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<ManagedRole>("TOURNAMENT_ADMIN");
  const [userQuery, setUserQuery] = useState("");

  const [items, setItems] = useState<AdminRoleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  const [assignLoading, setAssignLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<TaRoleStatus>("APPROVED");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [createRole, setCreateRole] = useState<ManagedRole>("TOURNAMENT_ADMIN");
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const filteredUsers = users.filter((u) =>
    userQuery.trim() ? u.email.toLowerCase().includes(userQuery.trim().toLowerCase()) : true
  );

  async function loadUsers() {
    setLoadingUsers(true);
    setError(null);

    try {
      const res = await fetch("/api/ta/admin/users", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok !== true) {
        setUsers([]);
        setError(data?.message ?? "Kunne ikke hente brugere.");
        return;
      }

      const nextUsers = (data?.users ?? []) as UserItem[];
      setUsers(nextUsers);
      if (!selectedUserId && nextUsers.length) setSelectedUserId(nextUsers[0]!.id);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function loadAdmins() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ta/admin/admins", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok !== true) {
        setItems([]);
        setError(data?.message ?? "Kunne ikke hente admins.");
        return;
      }

      setItems((data?.items ?? []) as AdminRoleItem[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
    void loadAdmins();
  }, []);

  useEffect(() => {
    if (!filteredUsers.length) return;
    if (!selectedUserId || !filteredUsers.some((u) => u.id === selectedUserId)) {
      setSelectedUserId(filteredUsers[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userQuery, users]);

  async function assignRoleToUser() {
    if (!selectedUserId) return;

    setError(null);
    setAssignSuccess(null);
    setAssignLoading(true);

    try {
      const res = await fetch("/api/ta/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, role: selectedRole }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        setError(data?.message ?? "Kunne ikke tildele admin-rettigheder.");
        return;
      }

      const selectedUser = users.find((u) => u.id === selectedUserId);
      setAssignSuccess(`${roleLabel[selectedRole]} tildelt: ${selectedUser?.email ?? ""}`.trim());
      await loadAdmins();
    } finally {
      setAssignLoading(false);
    }
  }

  async function createUser() {
    setError(null);
    setCreateSuccess(null);
    setCreateLoading(true);

    try {
      const res = await fetch("/api/ta/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: createRole,
          name: createName,
          email: createEmail,
          username: createUsername,
          password: createPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        setError(data?.message ?? "Kunne ikke oprette bruger.");
        return;
      }

      setCreateSuccess(`Bruger oprettet: ${data?.user?.email ?? createEmail} (${roleLabel[createRole]})`);
      setCreateName("");
      setCreateEmail("");
      setCreateUsername("");
      setCreatePassword("");
      await loadUsers();
      await loadAdmins();
    } finally {
      setCreateLoading(false);
    }
  }

  function startEdit(item: AdminRoleItem) {
    setEditingId(item.id);
    setEditingStatus(item.status);
    setError(null);
    setAssignSuccess(null);
  }

  async function saveEdit() {
    if (!editingId) return;

    setError(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/ta/admin/admins/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: editingStatus }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        setError(data?.message ?? "Kunne ikke gemme ændringer.");
        return;
      }

      setEditingId(null);
      await loadAdmins();
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: AdminRoleItem) {
    setError(null);

    const ok = confirm(`Slet admin-rettigheder for ${item.user.email}?`);
    if (!ok) return;

    setDeletingId(item.id);
    try {
      const res = await fetch(`/api/ta/admin/admins/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        setError(data?.message ?? "Kunne ikke slette admin-rettigheder.");
        return;
      }
      await loadAdmins();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-4">
        <h1 className="text-3xl font-semibold">Admin</h1>
        <p className="mt-1 text-sm text-zinc-600">Administrér Turneringsadmin og Dommeradmin.</p>
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div>
      ) : null}

      <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Tildel rettigheder</div>
        <p className="mt-1 text-sm text-zinc-600">Vælg en eksisterende bruger (email) og tildel rettigheder.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700">Rolle</label>
            <select
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as ManagedRole)}
            >
              <option value="TOURNAMENT_ADMIN">Turneringsadmin</option>
              <option value="REF_ADMIN">Dommeradmin</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700">Email</label>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Søg email…"
              disabled={loadingUsers}
            />
            <select
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              disabled={loadingUsers || filteredUsers.length === 0}
            >
              {filteredUsers.length === 0 ? <option value="">Ingen brugere</option> : null}
              {filteredUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-zinc-500">Søg i listen over eksisterende brugere.</div>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={assignRoleToUser}
              disabled={assignLoading || !selectedUserId || !selectedRole}
              className="w-full rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] hover:opacity-95 disabled:opacity-50"
            >
              {assignLoading ? "Tildeler…" : "Tildel"}
            </button>
          </div>

          {assignSuccess ? (
            <div className="md:col-span-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
              {assignSuccess}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Opret bruger</div>
        <p className="mt-1 text-sm text-zinc-600">Opret en ny Turneringsadmin eller Dommeradmin.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-700">Rolle</label>
            <select
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value as ManagedRole)}
              disabled={createLoading}
            >
              <option value="TOURNAMENT_ADMIN">Turneringsadmin</option>
              <option value="REF_ADMIN">Dommeradmin</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700">Navn (valgfrit)</label>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              disabled={createLoading}
              autoComplete="name"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700">Email</label>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              disabled={createLoading}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700">Brugernavn</label>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={createUsername}
              onChange={(e) => setCreateUsername(e.target.value)}
              disabled={createLoading}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700">Kodeord</label>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              disabled={createLoading}
              autoComplete="new-password"
            />
            <div className="mt-1 text-xs text-zinc-500">Mindst 6 tegn.</div>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={createUser}
              disabled={createLoading}
              className="w-full rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] hover:opacity-95 disabled:opacity-50"
            >
              {createLoading ? "Opretter…" : "Opret"}
            </button>
          </div>

          {createSuccess ? (
            <div className="md:col-span-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
              {createSuccess}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-zinc-900">Turneringsadmins og Dommeradmins</div>
          <button
            type="button"
            onClick={loadAdmins}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50"
            disabled={loading}
          >
            {loading ? "Henter…" : "Opdater"}
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <div className="grid grid-cols-1 gap-0 divide-y divide-zinc-200">
            {loading ? (
              <div className="p-4 text-sm text-zinc-600">Henter…</div>
            ) : items.length === 0 ? (
              <div className="p-4 text-sm text-zinc-600">Ingen admins fundet.</div>
            ) : (
              items.map((item) => {
                const isEditing = editingId === item.id;
                const disabled = saving || deletingId === item.id;

                return (
                  <div key={item.id} className="p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-zinc-900">
                            {roleLabel[item.role]} – {item.user.username}
                          </div>
                          <span className={statusPill(item.status)}>{item.status}</span>
                        </div>
                        <div className="mt-1 text-sm text-zinc-700">
                          {item.user.name ? `${item.user.name} · ` : ""}
                          {item.user.email}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">Oprettet: {formatDateTime(item.createdAt)}</div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {isEditing ? (
                          <>
                            <select
                              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                              value={editingStatus}
                              onChange={(e) => setEditingStatus(e.target.value as TaRoleStatus)}
                              disabled={disabled}
                            >
                              <option value="APPROVED">APPROVED</option>
                              <option value="REJECTED">REJECTED</option>
                              <option value="PENDING">PENDING</option>
                            </select>
                            <button
                              type="button"
                              onClick={saveEdit}
                              disabled={disabled}
                              className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] hover:opacity-95 disabled:opacity-50"
                            >
                              {saving ? "Gemmer…" : "Gem"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              disabled={disabled}
                              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                            >
                              Annuller
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              disabled={disabled}
                              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                            >
                              Redigér
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(item)}
                              disabled={disabled}
                              className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              {deletingId === item.id ? "Sletter…" : "Slet"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
