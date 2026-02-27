"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Tab = { key: string; label: string };
type ViewMode = "LIGHT" | "DARK";

type RoleItem = {
  id: string;
  role: string;
  status: string;
  scopeKey: string;
  scopeLabel: string | null;
  createdAt: string;
};

const TA_FILTERS_STORAGE_KEY = "ta_filters_v1";

type TaFiltersResponse = {
  ok: true;
  seasons: Array<{ startYear: number; label: string }>;
  clubs: Array<{ id: string; name: string; clubNo: string | null }>;
  genders: string[];
  leagues: string[];
  stages: string[];
  pools: string[];
  teams: Array<{ id: string; name: string; league: string; clubId: string; holdId?: string | null; gender?: string | null }>;
  ages: string[];
};

type TaFiltersDefaults = {
  season: string;
  clubId: string;
  gender: string;
  age: string;
  league: string;
  stage: string;
  pool: string;
  teamId: string;
  matches: string;
};

function formatAgeLabel(a: string) {
  return a === "SENIOR" ? "Senior" : a === "OLDIES" ? "Oldies" : a;
}

type NotificationChannel = "EMAIL" | "SMS" | "NONE";

type NotificationRoleKey = "TOURNAMENT_ADMIN" | "REF_ADMIN" | "CLUB_LEADER" | "TEAM_LEADER" | "REFEREE";

type RoleNotificationKey =
  | "APPROVE_CLUB_LEADER"
  | "MATCH_MOVE_REQUEST"
  | "LICENSE_CHANGE_REQUEST"
  | "APPROVE_REFEREE"
  | "REFEREE_DECLINES_MATCH"
  | "MATCH_MOVED"
  | "APPROVE_TEAM_LEADER_OR_SECRETARIAT"
  | "APPROVE_LICENSE_CHANGE"
  | "MATCH_COMMENT"
  | "ASSIGNED_MATCH";

type NotificationPreferences = Partial<
  Record<NotificationRoleKey, Partial<Record<RoleNotificationKey, NotificationChannel>>>
>;

const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  EMAIL: "Mail",
  SMS: "SMS",
  NONE: "Ingen",
};

const NOTIFICATION_MATRIX: Array<{
  role: NotificationRoleKey;
  roleLabel: string;
  items: Array<{ key: RoleNotificationKey; label: string }>;
}> = [
  {
    role: "TOURNAMENT_ADMIN",
    roleLabel: "Turneringsadmin",
    items: [
      { key: "APPROVE_CLUB_LEADER", label: "Godkend Klubleder" },
      { key: "MATCH_MOVE_REQUEST", label: "Anmodning om flytning af kamp" },
      {
        key: "LICENSE_CHANGE_REQUEST",
        label: "Anmodning om licens ændringer (flytning, oprettelse, dobbeltlicens)",
      },
    ],
  },
  {
    role: "REF_ADMIN",
    roleLabel: "Dommeradmin",
    items: [
      { key: "APPROVE_REFEREE", label: "Godkend Dommer" },
      { key: "REFEREE_DECLINES_MATCH", label: "Dommer afviser/afmelder kamp" },
      { key: "MATCH_MOVED", label: "Kamp flyttes" },
    ],
  },
  {
    role: "CLUB_LEADER",
    roleLabel: "Klubleder",
    items: [
      { key: "APPROVE_TEAM_LEADER_OR_SECRETARIAT", label: "Godkend Holdleder eller Sekretariat" },
      { key: "APPROVE_LICENSE_CHANGE", label: "Godkend licensændring" },
    ],
  },
  {
    role: "TEAM_LEADER",
    roleLabel: "Holdleder",
    items: [
      { key: "MATCH_COMMENT", label: "Kommentar til kamp" },
      { key: "MATCH_MOVE_REQUEST", label: "Anmodning om kampflytning" },
    ],
  },
  {
    role: "REFEREE",
    roleLabel: "Dommer",
    items: [
      { key: "ASSIGNED_MATCH", label: "Påsat en kamp" },
      { key: "MATCH_MOVED", label: "Kamp flyttes" },
    ],
  },
];

function getPref(prefs: NotificationPreferences | null, role: NotificationRoleKey, key: RoleNotificationKey): NotificationChannel {
  const v = prefs?.[role]?.[key];
  return v === "EMAIL" || v === "SMS" || v === "NONE" ? v : "NONE";
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  TOURNAMENT_ADMIN: "Turneringsadmin",
  REF_ADMIN: "Dommeradmin",
  CLUB_LEADER: "Klubleder",
  TEAM_LEADER: "Holdleder",
  SECRETARIAT: "Sekretariat",
  REFEREE: "Dommer",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Afventer godkendelse",
  APPROVED: "Godkendt",
  REJECTED: "Afvist",
};

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => null)) as { message?: string } | null;

  if (!res.ok) {
    throw new Error(data?.message || "Request fejlede.");
  }
}

export default function IndstillingerClient({
  tabs,
  activeTab,
  viewMode,
  account,
}: {
  tabs: Tab[];
  activeTab: string;
  viewMode: ViewMode;
  account: { email: string; username: string; phoneNumber: string | null };
}) {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [roles, setRoles] = useState<RoleItem[] | null>(null);
  const [rolesLoading, setRolesLoading] = useState(false);

  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);

  const [email, setEmail] = useState(account.email);
  const [username, setUsername] = useState(account.username);
  const [phoneNumber, setPhoneNumber] = useState(account.phoneNumber ?? "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [taDefaults, setTaDefaults] = useState<TaFiltersDefaults>({
    season: "",
    clubId: "",
    gender: "",
    age: "",
    league: "",
    stage: "",
    pool: "",
    teamId: "",
    matches: "ALL",
  });
  const [taFiltersData, setTaFiltersData] = useState<TaFiltersResponse | null>(null);
  const [taFiltersLoading, setTaFiltersLoading] = useState(false);

  // Hydrate TA layout defaults from the same storage as Kalender/Stilling/Statistik.
  useEffect(() => {
    if (activeTab !== "layout") return;
    try {
      const raw = window.localStorage.getItem(TA_FILTERS_STORAGE_KEY);
      if (!raw) return;
      const sp = new URLSearchParams(raw);
      setTaDefaults({
        season: sp.get("season") ?? "",
        clubId: sp.get("clubId") ?? "",
        gender: sp.get("gender") ?? "",
        age: sp.get("age") ?? "",
        league: sp.get("league") ?? "",
        stage: sp.get("stage") ?? "",
        pool: sp.get("pool") ?? "",
        teamId: sp.get("teamId") ?? "",
        matches: (sp.get("matches") ?? "ALL").toUpperCase(),
      });
    } catch {
      // ignore
    }
  }, [activeTab]);

  // Load faceted TA filter options.
  useEffect(() => {
    if (activeTab !== "layout") return;
    let cancelled = false;
    async function load() {
      setTaFiltersLoading(true);
      try {
        const qs = new URLSearchParams();
        if (taDefaults.season) qs.set("season", taDefaults.season);
        if (taDefaults.clubId) qs.set("clubId", taDefaults.clubId);
        if (taDefaults.gender) qs.set("gender", taDefaults.gender);
        if (taDefaults.age) qs.set("age", taDefaults.age);
        if (taDefaults.league) qs.set("league", taDefaults.league);
        if (taDefaults.stage) qs.set("stage", taDefaults.stage);
        if (taDefaults.pool) qs.set("pool", taDefaults.pool);
        if (taDefaults.teamId) qs.set("teamId", taDefaults.teamId);
        if (taDefaults.matches && taDefaults.matches !== "ALL") qs.set("matches", taDefaults.matches);

        const url = qs.toString() ? `/api/kalender/filters?${qs.toString()}` : "/api/kalender/filters";
        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as TaFiltersResponse | null;
        if (cancelled) return;
        if (res.ok && json?.ok) setTaFiltersData(json);
        else setTaFiltersData(null);
      } finally {
        if (!cancelled) setTaFiltersLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    taDefaults.age,
    taDefaults.clubId,
    taDefaults.gender,
    taDefaults.league,
    taDefaults.matches,
    taDefaults.pool,
    taDefaults.season,
    taDefaults.stage,
    taDefaults.teamId,
  ]);

  function normalizeMatchesMode(next: TaFiltersDefaults): TaFiltersDefaults {
    const matches = String(next.matches || "ALL").toUpperCase();
    if (matches === "TEAM" && !next.teamId) {
      return { ...next, matches: next.clubId ? "CLUB" : "ALL" };
    }
    if (matches === "CLUB" && !next.clubId) {
      return { ...next, matches: "ALL" };
    }
    return { ...next, matches };
  }

  function persistTaDefaults(next: TaFiltersDefaults) {
    try {
      const normalized = normalizeMatchesMode(next);
      const sp = new URLSearchParams();
      if (normalized.season) sp.set("season", normalized.season);
      if (normalized.clubId) sp.set("clubId", normalized.clubId);
      if (normalized.gender) sp.set("gender", normalized.gender);
      if (normalized.age) sp.set("age", normalized.age);
      if (normalized.league) sp.set("league", normalized.league);
      if (normalized.stage) sp.set("stage", normalized.stage);
      if (normalized.pool) sp.set("pool", normalized.pool);
      if (normalized.teamId) sp.set("teamId", normalized.teamId);
      if (normalized.matches && normalized.matches !== "ALL") sp.set("matches", normalized.matches);
      window.localStorage.setItem(TA_FILTERS_STORAGE_KEY, sp.toString());
      setTaDefaults(normalized);
      setOk("Gemt.");
      setError(null);
    } catch {
      setError("Kunne ikke gemme layout-filtre i browseren.");
    }
  }

  function setTaDefault(key: keyof TaFiltersDefaults, value: string) {
    const next: TaFiltersDefaults = { ...taDefaults, [key]: value };

    // Keep match-mode consistent with required selections.
    const normalized = normalizeMatchesMode(next);
    persistTaDefaults(normalized);
  }

  function resetTaDefaults() {
    try {
      window.localStorage.removeItem(TA_FILTERS_STORAGE_KEY);
    } catch {
      // ignore
    }
    const next: TaFiltersDefaults = {
      season: "",
      clubId: "",
      gender: "",
      age: "",
      league: "",
      stage: "",
      pool: "",
      teamId: "",
      matches: "ALL",
    };
    setTaDefaults(next);
    setOk("Nulstillet.");
    setError(null);
  }

  useEffect(() => {
    setEmail(account.email);
    setUsername(account.username);
    setPhoneNumber(account.phoneNumber ?? "");
  }, [account.email, account.username, account.phoneNumber]);

  useEffect(() => {
    let cancelled = false;
    async function loadRoles() {
      if (activeTab !== "roller") return;
      setRolesLoading(true);
      try {
        const res = await fetch("/api/auth/my-roles", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as any;
        if (cancelled) return;
        if (!res.ok || data?.ok !== true || !Array.isArray(data?.roles)) {
          setRoles([]);
          return;
        }
        setRoles(data.roles as RoleItem[]);
      } finally {
        if (!cancelled) setRolesLoading(false);
      }
    }
    void loadRoles();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    async function loadPrefs() {
      if (activeTab !== "notifikationer") return;
      setNotifLoading(true);
      try {
        const res = await fetch("/api/auth/notification-preferences", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as any;
        if (cancelled) return;
        if (res.ok && data?.ok === true && data?.preferences && typeof data.preferences === "object") {
          setNotifPrefs(data.preferences as NotificationPreferences);
        } else {
          setNotifPrefs({});
        }
      } finally {
        if (!cancelled) setNotifLoading(false);
      }
    }
    void loadPrefs();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  async function withBusy(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await action();
      setOk("Gemt.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noget gik galt.");
    } finally {
      setBusy(false);
    }
  }

  async function setNotificationPreference(role: NotificationRoleKey, key: RoleNotificationKey, channel: NotificationChannel) {
    await withBusy(async () => {
      await postJson("/api/auth/notification-preferences", { role, key, channel });
      setNotifPrefs((prev) => {
        const base = prev ?? {};
        return {
          ...base,
          [role]: {
            ...(base[role] ?? {}),
            [key]: channel,
          },
        };
      });
    });
  }

  async function deleteRole(id: string) {
    if (!confirm("Er du sikker på at du vil slette denne rolle?\n\nAdvarsel: Du kan miste adgang til dele af systemet.")) {
      return;
    }

    await withBusy(async () => {
      const res = await fetch(`/api/auth/my-roles/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(data?.message ?? "Kunne ikke slette rolle.");

      // Refresh role list + permissions derived from roles.
      router.refresh();
      const r2 = await fetch("/api/auth/my-roles", { cache: "no-store" });
      const d2 = (await r2.json().catch(() => ({}))) as any;
      setRoles(r2.ok && d2?.ok === true && Array.isArray(d2?.roles) ? (d2.roles as RoleItem[]) : []);
    });
  }

  async function saveAccount() {
    await withBusy(async () => {
      await postJson("/api/auth/account", {
        email,
        username,
        phoneNumber,
      });
      router.refresh();
    });
  }

  async function changePassword() {
    await withBusy(async () => {
      await postJson("/api/auth/change-password", {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
    });
  }

  async function setViewMode(next: ViewMode) {
    await withBusy(async () => {
      await postJson("/api/ui/select-view-mode", { mode: next });
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = t.key === activeTab;
          return (
            <a
              key={t.key}
              href={`/indstillinger?tab=${encodeURIComponent(t.key)}`}
              className={
                "inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold " +
                (active
                  ? "bg-[color:var(--brand)] text-[var(--brand-foreground)]"
                  : "bg-zinc-200 text-zinc-800 hover:bg-zinc-300")
              }
            >
              {t.label}
            </a>
          );
        })}
      </div>

      {error ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {ok ? <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{ok}</div> : null}

      <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
        {activeTab === "roller" ? (
          <div>
            <div className="text-sm font-semibold text-zinc-900">Roller</div>
            <div className="mt-1 text-sm text-zinc-600">Her kan du se og slette dine roller.</div>

            {rolesLoading ? <div className="mt-3 text-sm text-zinc-600">Henter roller…</div> : null}

            {!rolesLoading && roles && roles.length === 0 ? (
              <div className="mt-3 text-sm text-zinc-600">Ingen roller fundet.</div>
            ) : null}

            {!rolesLoading && roles && roles.length > 0 ? (
              <div className="mt-3 space-y-2">
                {roles.map((r) => {
                  const roleLabel = ROLE_LABEL[r.role] ?? r.role;
                  const statusLabel = STATUS_LABEL[r.status] ?? r.status;
                  const canDelete = !["ADMIN", "TOURNAMENT_ADMIN", "REF_ADMIN"].includes(r.role);
                  return (
                    <div key={r.id} className="flex items-start justify-between gap-3 rounded-md border border-zinc-200 p-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">{roleLabel}</div>
                        <div className="text-xs text-zinc-600">{statusLabel}</div>
                        {r.scopeLabel ? <div className="mt-1 text-xs text-zinc-600">{r.scopeLabel}</div> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteRole(r.id)}
                        disabled={busy || !canDelete}
                        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                        title={canDelete ? "" : "Denne rolle kan ikke slettes her."}
                      >
                        Slet
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "notifikationer" ? (
          <div>
            <div className="text-sm font-semibold text-zinc-900">Notifikationer</div>
            <div className="mt-1 text-sm text-zinc-600">
              Vælg hvordan du vil modtage notifikationer for hver rolletype.
            </div>

            {notifLoading ? <div className="mt-3 text-sm text-zinc-600">Henter notifikationsindstillinger…</div> : null}

            {!notifLoading ? (
              <div className="mt-4 space-y-6">
                {!account.phoneNumber ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Du har ikke angivet et telefonnummer. SMS-notifikationer kan derfor være uden effekt.
                  </div>
                ) : null}

                {NOTIFICATION_MATRIX.map((block) => (
                  <div key={block.role} className="rounded-lg border border-zinc-200 p-3">
                    <div className="text-sm font-semibold text-zinc-900">{block.roleLabel}</div>
                    <div className="mt-3 space-y-3">
                      {block.items.map((item) => {
                        const value = getPref(notifPrefs, block.role, item.key);
                        return (
                          <div key={item.key} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_220px] md:items-center">
                            <div className="text-sm text-zinc-800">{item.label}</div>
                            <select
                              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                              value={value}
                              onChange={(e) => void setNotificationPreference(block.role, item.key, e.target.value as NotificationChannel)}
                              disabled={busy}
                            >
                              <option value="NONE">{CHANNEL_LABEL.NONE}</option>
                              <option value="EMAIL">{CHANNEL_LABEL.EMAIL}</option>
                              <option value="SMS">{CHANNEL_LABEL.SMS}</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "oplysninger" ? (
          <div className="space-y-6">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Oplysninger</div>
              <div className="mt-1 text-sm text-zinc-600">Redigér brugernavn, email og telefonnummer.</div>

              <div className="mt-4 grid grid-cols-1 gap-4">
                <div>
                  <div className="text-sm font-semibold">Brugernavn</div>
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                </div>

                <div>
                  <div className="text-sm font-semibold">Email</div>
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>

                <div>
                  <div className="text-sm font-semibold">Telefonnummer</div>
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void saveAccount()}
                  disabled={busy}
                  className="rounded-md bg-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-[var(--brand-foreground)] hover:opacity-95 disabled:opacity-60"
                >
                  {busy ? "Gemmer…" : "Gem"}
                </button>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-zinc-900">Kodeord</div>
              <div className="mt-1 text-sm text-zinc-600">Skift dit kodeord.</div>

              <div className="mt-4 grid grid-cols-1 gap-4">
                <div>
                  <div className="text-sm font-semibold">Nuværende kodeord</div>
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div>
                  <div className="text-sm font-semibold">Nyt kodeord</div>
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void changePassword()}
                  disabled={busy}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                >
                  {busy ? "Gemmer…" : "Skift kodeord"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "layout" ? (
          <div>
            <div className="text-sm font-semibold text-zinc-900">Layout</div>
            <div className="mt-1 text-sm text-zinc-600">Vælg standard Lys/Mørk og standardfiltre i slicer panelet.</div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <div>
                <div className="text-sm font-semibold">Lys/Mørk</div>
                <select
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  value={viewMode}
                  onChange={(e) => void setViewMode(e.target.value as ViewMode)}
                  disabled={busy}
                >
                  <option value="LIGHT">Lys</option>
                  <option value="DARK">Mørk</option>
                </select>
              </div>

              <div>
                <div className="text-sm font-semibold text-zinc-900">Standardfiltre (Kalender/Stilling/Statistik)</div>
                <div className="mt-1 text-sm text-zinc-600">
                  Gemmer i browseren og bruges når du åbner siderne uden valgte filtre.
                </div>

                {taFiltersLoading && !taFiltersData ? (
                  <div className="mt-3 text-sm text-zinc-600">Henter filtre…</div>
                ) : null}

                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div>
                    <div className="text-sm font-semibold">Sæson</div>
                    <select
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      value={taDefaults.season}
                      onChange={(e) => setTaDefault("season", e.target.value)}
                      disabled={busy || !taFiltersData}
                    >
                      <option value="">Alle</option>
                      {(taFiltersData?.seasons ?? []).map((s) => (
                        <option key={s.startYear} value={String(s.startYear)}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-sm font-semibold">Forening</div>
                    <select
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      value={taDefaults.clubId}
                      onChange={(e) => setTaDefault("clubId", e.target.value)}
                      disabled={busy || !taFiltersData}
                    >
                      <option value="">Alle</option>
                      {(taFiltersData?.clubs ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-sm font-semibold">Køn</div>
                    <select
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      value={taDefaults.gender}
                      onChange={(e) => setTaDefault("gender", e.target.value)}
                      disabled={busy || !taFiltersData}
                    >
                      <option value="">Alle</option>
                      {(taFiltersData?.genders?.length ? taFiltersData.genders : ["MEN", "WOMEN"]).map((g) => (
                        <option key={g} value={g}>
                          {g === "WOMEN" ? "Damer" : "Mænd"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-sm font-semibold">Alder</div>
                    <select
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      value={taDefaults.age}
                      onChange={(e) => setTaDefault("age", e.target.value)}
                      disabled={busy || !taFiltersData}
                    >
                      <option value="">Alle</option>
                      {(taFiltersData?.ages ?? []).map((a) => (
                        <option key={a} value={a}>
                          {formatAgeLabel(a)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-sm font-semibold">Liga</div>
                    <select
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      value={taDefaults.league}
                      onChange={(e) => setTaDefault("league", e.target.value)}
                      disabled={busy || !taFiltersData}
                    >
                      <option value="">Alle</option>
                      {(taFiltersData?.leagues ?? []).map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-sm font-semibold">Stadie</div>
                    <select
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      value={taDefaults.stage}
                      onChange={(e) => setTaDefault("stage", e.target.value)}
                      disabled={busy || !taFiltersData}
                    >
                      <option value="">Alle</option>
                      {(taFiltersData?.stages ?? []).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-sm font-semibold">Pulje</div>
                    <select
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      value={taDefaults.pool}
                      onChange={(e) => setTaDefault("pool", e.target.value)}
                      disabled={busy || !taFiltersData}
                    >
                      <option value="">Alle</option>
                      {(taFiltersData?.pools ?? []).map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-sm font-semibold">Hold</div>
                    <select
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      value={taDefaults.teamId}
                      onChange={(e) => setTaDefault("teamId", e.target.value)}
                      disabled={busy || !taFiltersData}
                    >
                      <option value="">Alle</option>
                      {(taFiltersData?.teams ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {`${t.name} · ${t.league}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-sm font-semibold">Kampe</div>
                    <select
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      value={taDefaults.matches}
                      onChange={(e) => setTaDefault("matches", e.target.value)}
                      disabled={busy || !taFiltersData}
                    >
                      <option value="ALL">Alle</option>
                      <option value="CLUB" disabled={!taDefaults.clubId}>
                        Foreningen
                      </option>
                      <option value="TEAM" disabled={!taDefaults.teamId}>
                        Holdet
                      </option>
                    </select>
                    {!taDefaults.clubId || !taDefaults.teamId ? (
                      <div className="mt-1 text-xs text-zinc-600">
                        {taDefaults.matches === "CLUB" && !taDefaults.clubId
                          ? "Vælg en forening for at filtrere på foreningen."
                          : taDefaults.matches === "TEAM" && !taDefaults.teamId
                            ? "Vælg et hold for at filtrere på holdet."
                            : null}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={resetTaDefaults}
                      disabled={busy}
                      className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                    >
                      Nulstil standardfiltre
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
