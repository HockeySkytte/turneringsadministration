"use client";

import { useEffect, useMemo, useState } from "react";

type Gender = "MEN" | "WOMEN";

type Club = { id: string; name: string; clubNo: string | null };

type LicenseItem = {
  id: string;
  licenseNumber: number;
  name: string;
  birthDate: string;
  gender: Gender;
  clubId: string;
  club: Club;
  doubleClubId: string | null;
};

type ListResponse = {
  ok: true;
  items: LicenseItem[];
  total: number;
  page: number;
  pageSize: number;
};

function genderLabel(g: Gender) {
  return g === "MEN" ? "Herre" : "Dame";
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("da-DK", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function asDateInputValue(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function TurneringSpillerlicenserClient({ clubs }: { clubs: Club[] }) {
  const clubOptions = useMemo(() => {
    return [...clubs]
      .sort((a, b) => a.name.localeCompare(b.name, "da"))
      .map((c) => ({
        id: c.id,
        label: c.clubNo ? `${c.name} (${c.clubNo})` : c.name,
      }));
  }, [clubs]);

  const clubsById = useMemo(() => {
    return new Map(clubs.map((c) => [c.id, c] as const));
  }, [clubs]);

  const [items, setItems] = useState<LicenseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);

  const [filters, setFilters] = useState<{
    q: string;
    clubId: string;
    gender: "" | Gender;
    bornFrom: string;
    bornTo: string;
  }>({ q: "", clubId: "", gender: "", bornFrom: "", bornTo: "" });

  const [draftQ, setDraftQ] = useState("");
  const [draftClubId, setDraftClubId] = useState<string>("");
  const [draftGender, setDraftGender] = useState<"" | Gender>("");
  const [draftBornFrom, setDraftBornFrom] = useState("");
  const [draftBornTo, setDraftBornTo] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<LicenseItem | null>(null);

  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState("");
  const [formBirthDate, setFormBirthDate] = useState("");
  const [formGender, setFormGender] = useState<Gender>("MEN");
  const [formClubId, setFormClubId] = useState<string>(clubs[0]?.id ?? "");
  const [formDoubleClubId, setFormDoubleClubId] = useState<string>("");


  async function load(nextPage: number, nextFilters: typeof filters) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      params.set("pageSize", String(pageSize));
      if (nextFilters.q.trim()) params.set("q", nextFilters.q.trim());
      if (nextFilters.clubId) params.set("clubId", nextFilters.clubId);
      if (nextFilters.gender) params.set("gender", nextFilters.gender);
      if (nextFilters.bornFrom) params.set("bornFrom", nextFilters.bornFrom);
      if (nextFilters.bornTo) params.set("bornTo", nextFilters.bornTo);

      const res = await fetch(`/api/turnering/player-licenses?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as Partial<ListResponse> & { ok?: boolean; message?: string };

      if (!res.ok || data?.ok !== true) {
        setItems([]);
        setError(data?.message ?? "Kunne ikke hente spillerlicenser.");
        return;
      }

      setItems((data?.items ?? []) as LicenseItem[]);
      const nextTotal = Number(data?.total ?? 0);
      setTotal(nextTotal);
      const serverPage = Number(data?.page ?? nextPage);
      if (Number.isFinite(serverPage) && serverPage !== nextPage) {
        setPage(serverPage);
      } else {
        const nextMax = Math.max(1, Math.ceil((nextTotal || 0) / pageSize));
        if (nextPage > nextMax) setPage(nextMax);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(page, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters]);

  function applySearch() {
    const next = {
      q: draftQ,
      clubId: draftClubId,
      gender: draftGender,
      bornFrom: draftBornFrom,
      bornTo: draftBornTo,
    } as const;

    setFilters(next);
    setPage(1);
  }

  function resetSearch() {
    setDraftQ("");
    setDraftClubId("");
    setDraftGender("");
    setDraftBornFrom("");
    setDraftBornTo("");
    setFilters({ q: "", clubId: "", gender: "", bornFrom: "", bornTo: "" });
    setPage(1);
  }

  function resetFormForCreate() {
    setFormName("");
    setFormBirthDate("");
    setFormGender("MEN");
    setFormClubId(clubs[0]?.id ?? "");
    setFormDoubleClubId("");
  }

  function openCreate() {
    resetFormForCreate();
    setCreateOpen(true);
  }

  function openEdit(item: LicenseItem) {
    setFormName(item.name);
    setFormBirthDate(asDateInputValue(item.birthDate));
    setFormGender(item.gender);
    setFormClubId(item.clubId);
    setFormDoubleClubId(item.doubleClubId ?? "");
    setEditOpen(item);
  }

  async function create() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/turnering/player-licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          birthDate: formBirthDate,
          gender: formGender,
          clubId: formClubId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        setError(data?.message ?? "Kunne ikke oprette spiller.");
        return;
      }

      setCreateOpen(false);
      setPage(1);
      await load(1, filters);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editOpen) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/turnering/player-licenses/${encodeURIComponent(editOpen.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          birthDate: formBirthDate,
          gender: formGender,
          clubId: formClubId,
          doubleClubId: formDoubleClubId || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        setError(data?.message ?? "Kunne ikke gemme ændringer.");
        return;
      }

      setEditOpen(null);
      await load(page, filters);
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: LicenseItem) {
    setError(null);
    const ok = confirm(`Slet spillerlicens ${item.licenseNumber} – ${item.name}?`);
    if (!ok) return;

    const res = await fetch(`/api/turnering/player-licenses/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok !== true) {
      setError(data?.message ?? "Kunne ikke slette spiller.");
      return;
    }

    await load(page, filters);
  }

  const maxPage = Math.max(1, Math.ceil((total || 0) / pageSize));
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(total, page * pageSize);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold text-zinc-900">Spillerlicenser</div>
          <div className="mt-1 text-sm text-zinc-600">
            Liste over spillerlicenser. Dobbeltlicenser udløber automatisk d. 1. juli.
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)]"
        >
          Opret spiller
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm font-semibold text-zinc-900">Søg</div>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-zinc-700">Navn</label>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              placeholder="Søg på navn"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700">Klub</label>
            <select
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={draftClubId}
              onChange={(e) => setDraftClubId(e.target.value)}
            >
              <option value="">(alle)</option>
              {clubOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700">Køn</label>
            <select
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={draftGender}
              onChange={(e) => setDraftGender(e.target.value as "" | Gender)}
            >
              <option value="">(alle)</option>
              <option value="MEN">Herre</option>
              <option value="WOMEN">Dame</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700">Født (fra)</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={draftBornFrom}
              onChange={(e) => setDraftBornFrom(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700">Født (til)</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              value={draftBornTo}
              onChange={(e) => setDraftBornTo(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600">
            {loading ? "Henter…" : total ? `Viser ${pageStart}-${pageEnd} af ${total}.` : "Ingen resultater."}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applySearch}
              className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] hover:opacity-95"
            >
              Søg
            </button>
            <button
              type="button"
              onClick={resetSearch}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Nulstil
            </button>

            <div className="ml-2 flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={loading || page <= 1}
              >
                Forrige
              </button>
              <div className="text-sm text-zinc-700">Side {page} / {maxPage}</div>
              <button
                type="button"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                disabled={loading || page >= maxPage}
              >
                Næste
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-auto rounded-lg border border-zinc-200">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50">
            <tr>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                Licensnummer
              </th>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                Navn
              </th>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                Født
              </th>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                Klub
              </th>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                KlubID
              </th>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                Dobbeltlicens
              </th>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                Køn
              </th>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-3 text-sm text-zinc-600">
                  Henter…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-3 text-sm text-zinc-600">
                  Ingen spillerlicenser fundet.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="odd:bg-white even:bg-zinc-50">
                  <td className="border-b border-zinc-100 px-3 py-2 font-medium text-zinc-900">
                    {item.licenseNumber}
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-900">{item.name}</td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-900">{formatDate(item.birthDate)}</td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-900">{item.club?.name ?? ""}</td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-900">
                    {String(item.club?.clubNo ?? item.clubId ?? "")}
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-900">
                    {item.doubleClubId
                      ? String(clubsById.get(item.doubleClubId)?.clubNo ?? item.doubleClubId)
                      : ""}
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-900">{genderLabel(item.gender)}</td>
                  <td className="border-b border-zinc-100 px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300"
                      >
                        Rediger
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(item)}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                      >
                        Slet
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Opret spiller</div>
                <div className="mt-1 text-sm text-zinc-600">Licensnummer og KlubID udfyldes automatisk.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (saving) return;
                  setCreateOpen(false);
                }}
                className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300"
              >
                Luk
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Navn</div>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Født</div>
                <input
                  type="date"
                  value={formBirthDate}
                  onChange={(e) => setFormBirthDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Køn</div>
                <select
                  value={formGender}
                  onChange={(e) => setFormGender(e.target.value as Gender)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="MEN">Herre</option>
                  <option value="WOMEN">Dame</option>
                </select>
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Klub</div>
                <select
                  value={formClubId}
                  onChange={(e) => setFormClubId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  {clubOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setCreateOpen(false)}
                className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300 disabled:opacity-50"
              >
                Annuller
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void create()}
                className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-50"
              >
                {saving ? "Opretter…" : "Opret"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Rediger spiller</div>
                <div className="mt-1 text-sm text-zinc-600">Licensnummer kan ikke ændres.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (saving) return;
                  setEditOpen(null);
                }}
                className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300"
              >
                Luk
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                Licensnummer: <span className="font-semibold text-zinc-900">{editOpen.licenseNumber}</span>
              </div>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Navn</div>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Født</div>
                <input
                  type="date"
                  value={formBirthDate}
                  onChange={(e) => setFormBirthDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Køn</div>
                <select
                  value={formGender}
                  onChange={(e) => setFormGender(e.target.value as Gender)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="MEN">Herre</option>
                  <option value="WOMEN">Dame</option>
                </select>
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Klub</div>
                <select
                  value={formClubId}
                  onChange={(e) => setFormClubId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  {clubOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Dobbeltlicens</div>
                <select
                  value={formDoubleClubId}
                  onChange={(e) => setFormDoubleClubId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="">(ingen)</option>
                  {clubOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-zinc-500">Udløber automatisk d. 1. juli.</div>
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditOpen(null)}
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
