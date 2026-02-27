"use client";

import { useEffect, useMemo, useState } from "react";

type LeagueOption = { league: string; gender: string | null };

type ClubOption = { id: string; name: string; clubNo: string | null };

type Referee = {
  id: string;
  refereeNo: string;
  name: string;
  club: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  partner1: string | null;
  partner2: string | null;
  partner3: string | null;
  eligibleLeagues: any;
  createdAt: string;
  updatedAt: string;
};

type ApiData = {
  ok: true;
  referees: Referee[];
  options: {
    currentSeasonStartYear: number | null;
    eligibleLeagueOptions: LeagueOption[];
  };
};

type ClubsApiData = {
  ok: true;
  clubs: ClubOption[];
};

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

function formatEligibleLeagues(eligibleLeagues: any): string {
  if (!Array.isArray(eligibleLeagues) || eligibleLeagues.length === 0) return "-";
  const parts: string[] = [];
  for (const item of eligibleLeagues) {
    const league = norm(item?.league);
    const gender = norm(item?.gender);
    if (!league) continue;
    parts.push(gender ? `${league} (${gender})` : league);
  }
  return parts.length ? parts.join(", ") : "-";
}

const FIELD_CLASS = "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2";

const GENDER_LABEL: Record<string, string> = {
  MEN: "Herre",
  WOMEN: "Dame",
};

function leagueLabel(o: LeagueOption): string {
  const g = o.gender ? (GENDER_LABEL[o.gender] ?? o.gender) : null;
  return g ? `${o.league} · ${g}` : o.league;
}

export default function DommerpaasaetterClient() {
  const [referees, setReferees] = useState<Referee[]>([]);
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [leagueOptions, setLeagueOptions] = useState<LeagueOption[]>([]);
  const [currentSeasonStartYear, setCurrentSeasonStartYear] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Referee | null>(null);
  const [creating, setCreating] = useState(false);

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    refereeNo: "",
    name: "",
    club: "",
    address: "",
    email: "",
    phone: "",
    partner1: "",
    partner2: "",
    partner3: "",
    eligibleKeys: new Set<string>(),
  });

  const sortedReferees = useMemo(() => referees.slice(), [referees]);

  const clubNames = useMemo(() => new Set(clubs.map((c) => c.name)), [clubs]);

  const partnerOptions = useMemo(() => {
    const excludeId = editing?.id ?? null;
    return referees
      .filter((r) => (excludeId ? r.id !== excludeId : true))
      .map((r) => ({ value: r.refereeNo, label: `${r.name} – ${r.refereeNo}` }));
  }, [referees, editing?.id]);

  const allowedPartnerNos = useMemo(() => new Set(partnerOptions.map((o) => o.value)), [partnerOptions]);

  function resetForm() {
    setForm({
      refereeNo: "",
      name: "",
      club: "",
      address: "",
      email: "",
      phone: "",
      partner1: "",
      partner2: "",
      partner3: "",
      eligibleKeys: new Set<string>(),
    });
  }

  function openCreate() {
    setError(null);
    resetForm();
    setCreating(true);
    setEditing(null);
  }

  function openEdit(r: Referee) {
    setError(null);
    const eligibleKeys = new Set<string>();
    if (Array.isArray(r.eligibleLeagues)) {
      for (const item of r.eligibleLeagues) {
        const league = norm(item?.league);
        const gender = norm(item?.gender);
        if (!league) continue;
        eligibleKeys.add(`${league}||${gender}`);
      }
    }

    setForm({
      refereeNo: r.refereeNo ?? "",
      name: r.name ?? "",
      club: r.club ?? "",
      address: r.address ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      partner1: r.partner1 ?? "",
      partner2: r.partner2 ?? "",
      partner3: r.partner3 ?? "",
      eligibleKeys,
    });
    setEditing(r);
    setCreating(false);
  }

  function closeModal() {
    if (saving) return;
    setEditing(null);
    setCreating(false);
    resetForm();
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [refsRes, clubsRes] = await Promise.all([
        fetch("/api/ref-admin/referees", { cache: "no-store" }),
        fetch("/api/public/turnering/clubs", { cache: "no-store" }),
      ]);

      const refsData = (await refsRes.json().catch(() => ({}))) as Partial<ApiData>;
      const clubsData = (await clubsRes.json().catch(() => ({}))) as Partial<ClubsApiData>;

      if (!refsRes.ok || refsData?.ok !== true) {
        setReferees([]);
        setLeagueOptions([]);
        setCurrentSeasonStartYear(null);
        setError((refsData as any)?.message ?? "Kunne ikke hente dommere.");
        return;
      }

      setReferees((refsData.referees ?? []) as Referee[]);
      setLeagueOptions((refsData.options?.eligibleLeagueOptions ?? []) as LeagueOption[]);
      setCurrentSeasonStartYear((refsData.options?.currentSeasonStartYear ?? null) as number | null);

      if (clubsRes.ok && clubsData?.ok === true) {
        setClubs((clubsData.clubs ?? []) as ClubOption[]);
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

  async function save() {
    setError(null);

    const refereeNo = norm(form.refereeNo);
    const name = norm(form.name);

    if (!refereeNo) {
      setError("Dommernummer mangler.");
      return;
    }
    if (!name) {
      setError("Navn mangler.");
      return;
    }

    const clubValue = norm(form.club);
    if (clubValue && clubNames.size > 0 && !clubNames.has(clubValue)) {
      setError("Vælg en klub fra dropdown-listen.");
      return;
    }

    const p1 = norm(form.partner1);
    const p2 = norm(form.partner2);
    const p3 = norm(form.partner3);
    if (p1 && !allowedPartnerNos.has(p1)) {
      setError("Makker 1 skal vælges fra dropdown-listen.");
      return;
    }
    if (p2 && !allowedPartnerNos.has(p2)) {
      setError("Makker 2 skal vælges fra dropdown-listen.");
      return;
    }
    if (p3 && !allowedPartnerNos.has(p3)) {
      setError("Makker 3 skal vælges fra dropdown-listen.");
      return;
    }
    if ((p1 && p2 && p1 === p2) || (p1 && p3 && p1 === p3) || (p2 && p3 && p2 === p3)) {
      setError("Makker 1/2/3 må ikke være den samme.");
      return;
    }

    const eligibleLeagues = leagueOptions
      .filter((o) => form.eligibleKeys.has(`${o.league}||${o.gender ?? ""}`))
      .map((o) => ({
        league: o.league,
        gender: o.gender,
        ...(currentSeasonStartYear ? { seasonStartYear: currentSeasonStartYear } : null),
      }));

    setSaving(true);
    try {
      const url = editing
        ? `/api/ref-admin/referees/${encodeURIComponent(editing.id)}`
        : "/api/ref-admin/referees";
      const method = editing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refereeNo,
          name,
          club: clubValue || null,
          address: norm(form.address) || null,
          email: norm(form.email) || null,
          phone: norm(form.phone) || null,
          partner1: p1 || null,
          partner2: p2 || null,
          partner3: p3 || null,
          eligibleLeagues,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "Kunne ikke gemme dommer.");
        return;
      }

      closeModal();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteReferee(id: string) {
    setError(null);
    const ok = confirm("Er du sikker på at du vil slette denne dommer?");
    if (!ok) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/ref-admin/referees/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "Kunne ikke slette dommer.");
        return;
      }
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Dommere</div>
          <p className="mt-1 text-sm text-zinc-600">Opret, redigér eller slet dommere.</p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)]"
        >
          Opret dommer
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200">
        <div className="grid grid-cols-1 gap-0 divide-y divide-zinc-200">
          {loading ? (
            <div className="p-4 text-sm text-zinc-600">Henter…</div>
          ) : sortedReferees.length === 0 ? (
            <div className="p-4 text-sm text-zinc-600">Ingen dommere fundet.</div>
          ) : (
            sortedReferees.map((r) => {
              const disabled = deletingId === r.id;
              return (
                <div key={r.id} className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">{r.name} – {r.refereeNo}</div>
                      <div className="mt-1 text-sm text-zinc-700">Klub: {r.club ? r.club : "-"}</div>
                      <div className="mt-1 text-sm text-zinc-700">Ligaer: {formatEligibleLeagues(r.eligibleLeagues)}</div>
                      <div className="mt-1 text-xs text-zinc-500">Email: {r.email ? r.email : "-"} · Telefon: {r.phone ? r.phone : "-"}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => openEdit(r)}
                        className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300 disabled:opacity-50"
                      >
                        Rediger
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void deleteReferee(r.id)}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {deletingId === r.id ? "Sletter…" : "Slet"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {creating || editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-xl bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-zinc-900">{editing ? "Rediger dommer" : "Opret dommer"}</div>
                <div className="mt-1 text-sm text-zinc-600">Udfyld dommerdata og gem.</div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300"
              >
                Luk
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">Navn</label>
                <input
                  className={FIELD_CLASS}
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Dommernummer</label>
                <input
                  className={FIELD_CLASS}
                  value={form.refereeNo}
                  onChange={(e) => setForm((p) => ({ ...p, refereeNo: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Klub</label>
                <select
                  className={FIELD_CLASS}
                  value={form.club}
                  onChange={(e) => setForm((p) => ({ ...p, club: e.target.value }))}
                >
                  <option value="">—</option>
                  {form.club && !clubNames.has(form.club) ? <option value={form.club}>{form.club}</option> : null}
                  {clubs.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium">Adresse</label>
                <input
                  className={FIELD_CLASS}
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Email</label>
                <input
                  className={FIELD_CLASS}
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Telefon</label>
                <input
                  className={FIELD_CLASS}
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Makker 1</label>
                <select
                  className={FIELD_CLASS}
                  value={form.partner1}
                  onChange={(e) => setForm((p) => ({ ...p, partner1: e.target.value }))}
                >
                  <option value="">—</option>
                  {partnerOptions.map((o) => (
                    <option
                      key={o.value}
                      value={o.value}
                      disabled={
                        Boolean(form.partner2 && form.partner2 === o.value) ||
                        Boolean(form.partner3 && form.partner3 === o.value)
                      }
                    >
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium">Makker 2</label>
                <select
                  className={FIELD_CLASS}
                  value={form.partner2}
                  onChange={(e) => setForm((p) => ({ ...p, partner2: e.target.value }))}
                >
                  <option value="">—</option>
                  {partnerOptions.map((o) => (
                    <option
                      key={o.value}
                      value={o.value}
                      disabled={
                        Boolean(form.partner1 && form.partner1 === o.value) ||
                        Boolean(form.partner3 && form.partner3 === o.value)
                      }
                    >
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium">Makker 3</label>
                <select
                  className={FIELD_CLASS}
                  value={form.partner3}
                  onChange={(e) => setForm((p) => ({ ...p, partner3: e.target.value }))}
                >
                  <option value="">—</option>
                  {partnerOptions.map((o) => (
                    <option
                      key={o.value}
                      value={o.value}
                      disabled={
                        Boolean(form.partner1 && form.partner1 === o.value) ||
                        Boolean(form.partner2 && form.partner2 === o.value)
                      }
                    >
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium">Ligaer (nuværende sæson{currentSeasonStartYear ? ` ${currentSeasonStartYear}-${currentSeasonStartYear + 1}` : ""})</div>
              {leagueOptions.length === 0 ? (
                <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                  Ingen ligaer fundet. Importér/publisér Turnering først.
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {leagueOptions.map((o) => {
                    const key = `${o.league}||${o.gender ?? ""}`;
                    const checked = form.eligibleKeys.has(key);
                    return (
                      <label key={key} className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setForm((p) => {
                              const next = new Set(p.eligibleKeys);
                              if (e.target.checked) next.add(key);
                              else next.delete(key);
                              return { ...p, eligibleKeys: next };
                            });
                          }}
                        />
                        <span>{leagueLabel(o)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300 disabled:opacity-50"
              >
                Annuller
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
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
