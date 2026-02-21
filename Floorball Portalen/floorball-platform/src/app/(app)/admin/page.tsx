"use client";

import { useEffect, useState } from "react";

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

export default function AdminPage() {
  const [items, setItems] = useState<PendingRoleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const [createRole, setCreateRole] = useState<"TOURNAMENT_ADMIN" | "REF_ADMIN">(
    "TOURNAMENT_ADMIN"
  );
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/approvals/pending", { cache: "no-store" });
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
    load();
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

  async function createAdminUser(e: React.FormEvent) {
    e.preventDefault();
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

      setCreateSuccess(
        `Bruger oprettet: ${data?.user?.username ?? createUsername} (${roleLabels[createRole]})`
      );
      setCreateName("");
      setCreateEmail("");
      setCreateUsername("");
      setCreatePassword("");
      await load();
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-4">
        <h1 className="text-3xl font-semibold">Admin</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Her kan du godkende eller afvise anmodninger om roller.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Opret admin-bruger</div>
        <p className="mt-1 text-sm text-zinc-600">
          Kun Admin kan oprette Turneringsadmin og Dommeradmin.
        </p>

        <form onSubmit={createAdminUser} className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-700">Rolle</label>
            <select
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value as any)}
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
              autoComplete="name"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700">Email</label>
            <input
              type="email"
              required
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700">Brugernavn</label>
            <input
              required
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={createUsername}
              onChange={(e) => setCreateUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700">Kodeord</label>
            <input
              type="password"
              required
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              autoComplete="new-password"
            />
            <div className="mt-1 text-xs text-zinc-500">Mindst 6 tegn.</div>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={createLoading}
              className="w-full rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] hover:opacity-95 disabled:opacity-50"
            >
              {createLoading ? "Opretter…" : "Opret bruger"}
            </button>
          </div>

          {createSuccess ? (
            <div className="md:col-span-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
              {createSuccess}
            </div>
          ) : null}
        </form>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-zinc-900">Afventende</div>
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50"
            disabled={loading}
          >
            {loading ? "Henter…" : "Opdater"}
          </button>
        </div>

        {error ? (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        ) : null}

        {!loading && items.length === 0 ? (
          <div className="text-sm text-zinc-600">Ingen afventende anmodninger.</div>
        ) : null}

        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.id} className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">
                    {roleLabels[it.role]} — {it.user.name ?? it.user.username}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {it.user.email} · Oprettet {formatDateTime(it.createdAt)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => decide(it.id, true)}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
                    disabled={decidingId === it.id}
                  >
                    Godkend
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(it.id, false)}
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
                    disabled={decidingId === it.id}
                  >
                    Afvis
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


