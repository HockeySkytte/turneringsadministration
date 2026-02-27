"use client";

import { useEffect, useMemo, useState } from "react";

type Venue = {
  key: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  clubs: Club[];
};

type Club = {
  id: string;
  name: string;
  clubNo: string | null;
};

type ListResponse =
  | { ok: true; venues: Venue[]; clubs: Club[] }
  | { ok: false; message: string };

type UpdateResponse =
  | { ok: true; venue: Venue }
  | { ok: false; message: string };

type CreateResponse =
  | { ok: true; venue: Venue }
  | { ok: false; message: string };

function toEditableNumberString(n: number | null): string {
  if (n === null || n === undefined) return "";
  return String(n);
}

function normalizeNumberInput(value: string): string {
  return value.trim().replace(",", ".");
}

function normalizeClubIds(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean)));
}

function fmtClubs(clubs: Club[]): string {
  if (!clubs.length) return "-";
  return clubs
    .map((c) => (c.clubNo ? `${c.name} (${c.clubNo})` : c.name))
    .join(", ");
}

export default function TurneringSpillestederClient() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    lat: "",
    lng: "",
    clubIds: [] as string[],
  });
  const [geoLoading, setGeoLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/turnering/venues", { cache: "no-store" });
      const json = (await res.json()) as ListResponse;
      if (!res.ok || !json.ok) {
        throw new Error(!json.ok ? json.message : `HTTP ${res.status}`);
      }
      setVenues(json.venues);
      setClubs(json.clubs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setEditingKey(null);
    setForm({ name: "", address: "", lat: "", lng: "", clubIds: [] });
    setModalOpen(true);
  };

  const openEdit = (v: Venue) => {
    setEditingKey(v.key);
    setForm({
      name: v.name,
      address: v.address ?? "",
      lat: toEditableNumberString(v.lat),
      lng: toEditableNumberString(v.lng),
      clubIds: v.clubs.map((c) => c.id),
    });
    setModalOpen(true);
  };

  const autogeocode = async () => {
    setGeoLoading(true);
    setError(null);
    try {
      const query = (form.address || form.name).trim();
      const res = await fetch("/api/turnering/venues/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const json = (await res.json().catch(() => ({}))) as
        | {
            ok: true;
            result: { lat: number; lng: number; address: string | null; displayName: string };
          }
        | { ok: false; message: string };

      if (!res.ok || !json.ok) {
        throw new Error(!json.ok ? json.message : `HTTP ${res.status}`);
      }

      setForm((prev) => ({
        ...prev,
        lat: String(json.result.lat),
        lng: String(json.result.lng),
        address: prev.address.trim() ? prev.address : json.result.address ?? prev.address,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeoLoading(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address,
        lat: normalizeNumberInput(form.lat),
        lng: normalizeNumberInput(form.lng),
        clubIds: normalizeClubIds(form.clubIds),
      };

      if (editingKey) {
        const res = await fetch(`/api/turnering/venues/${encodeURIComponent(editingKey)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json().catch(() => ({}))) as UpdateResponse;
        if (!res.ok || !json.ok) {
          throw new Error(!json.ok ? json.message : `HTTP ${res.status}`);
        }
        setVenues((prev) => prev.map((v) => (v.key === editingKey ? json.venue : v)));
      } else {
        const res = await fetch("/api/turnering/venues", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json().catch(() => ({}))) as CreateResponse;
        if (!res.ok || !json.ok) {
          throw new Error(!json.ok ? json.message : `HTTP ${res.status}`);
        }
        setVenues((prev) => [...prev, json.venue].sort((a, b) => a.name.localeCompare(b.name, "da")));
      }

      setModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (key: string) => {
    if (!confirm("Vil du slette spillestedet?")) return;

    setDeletingKey(key);
    setError(null);
    try {
      const res = await fetch(`/api/turnering/venues/${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as
        | { ok: true }
        | { ok: false; message: string };

      if (!res.ok || !json.ok) {
        throw new Error(!json.ok ? json.message : `HTTP ${res.status}`);
      }
      setVenues((prev) => prev.filter((v) => v.key !== key));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingKey(null);
    }
  };

  const rows = useMemo(() => venues, [venues]);

  return (
    <div>
      <div className="font-semibold text-zinc-900">Spillesteder</div>
      <div className="mt-1 text-sm text-zinc-600">
        Her kan du tilføje geolocation (lat/lng) til hvert spillested. Det bruges senere til
        afstandsberegning.
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
          onClick={openCreate}
        >
          Tilføj spillested
        </button>

        <div className="text-sm text-zinc-700">
          Antal: <span className="font-semibold">{rows.length}</span>
        </div>
      </div>

      {error ? <div className="mt-3 text-sm text-red-700">Fejl: {error}</div> : null}

      {!rows.length && !loading ? (
        <div className="mt-4 text-sm text-zinc-700">Ingen spillesteder endnu.</div>
      ) : null}

      {rows.length ? (
        <div className="mt-4 overflow-auto rounded-lg border border-zinc-200">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                  Spillested
                </th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                  Adresse
                </th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                  Latitude
                </th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                  Longitude
                </th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                  Klubber
                </th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                  
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const isDeleting = deletingKey === v.key;

                return (
                  <tr key={v.key} className="odd:bg-white even:bg-zinc-50/50">
                    <td className="border-b border-zinc-100 px-3 py-2 align-top">
                      <div className="font-semibold text-zinc-900">{v.name}</div>
                      <div className="mt-0.5 text-xs text-zinc-500">{v.key}</div>
                    </td>
                    <td className="border-b border-zinc-100 px-3 py-2 align-top">
                      <div className="max-w-[28rem] text-sm text-zinc-800">{v.address ?? "-"}</div>
                    </td>
                    <td className="border-b border-zinc-100 px-3 py-2 align-top">
                      {v.lat ?? "-"}
                    </td>
                    <td className="border-b border-zinc-100 px-3 py-2 align-top">
                      {v.lng ?? "-"}
                    </td>
                    <td className="border-b border-zinc-100 px-3 py-2 align-top">
                      <div className="max-w-[28rem] text-sm text-zinc-800">{fmtClubs(v.clubs)}</div>
                    </td>
                    <td className="border-b border-zinc-100 px-3 py-2 align-top">
                      <div className="flex flex-col gap-2">
                        <button
                          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
                          onClick={() => openEdit(v)}
                        >
                          Rediger
                        </button>

                        <button
                          className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          onClick={() => void remove(v.key)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Sletter…" : "Slet"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-lg">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 p-4">
              <div>
                <div className="text-lg font-semibold text-zinc-900">
                  {editingKey ? "Rediger spillested" : "Tilføj spillested"}
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  Udfyld spillested + adresse, og brug Autogeocode til lat/lng.
                </div>
              </div>
              <button
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                onClick={() => setModalOpen(false)}
              >
                Luk
              </button>
            </div>

            <div className="max-h-[80dvh] overflow-y-auto p-4">
              <div className="grid gap-4">
                <div>
                  <div className="text-xs font-semibold text-zinc-700">Spillested</div>
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Navn på spillested"
                  />
                </div>

                <div>
                  <div className="text-xs font-semibold text-zinc-700">Adresse</div>
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                    value={form.address}
                    onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                    placeholder="Gade, postnr, by (eller noget der kan geocodes)"
                  />
                  <div className="mt-1 text-xs text-zinc-500">
                    Hvis du ikke kender adressen, kan Autogeocode ofte stadig finde stedet.
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold text-zinc-700">Latitude</div>
                    <input
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      value={form.lat}
                      onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))}
                      inputMode="decimal"
                      placeholder="fx 56.123"
                    />
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-zinc-700">Longitude</div>
                    <input
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      value={form.lng}
                      onChange={(e) => setForm((p) => ({ ...p, lng: e.target.value }))}
                      inputMode="decimal"
                      placeholder="fx 9.123"
                    />
                  </div>
                </div>

                <div>
                  <button
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                    onClick={() => void autogeocode()}
                    disabled={geoLoading}
                  >
                    {geoLoading ? "Finder…" : "Autogeocode"}
                  </button>
                </div>

                <div>
                  <div className="text-xs font-semibold text-zinc-700">Klubber</div>
                  <select
                    multiple
                    className="mt-1 h-40 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                    value={form.clubIds}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        clubIds: Array.from(e.target.selectedOptions).map((o) => o.value),
                      }))
                    }
                  >
                    {clubs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.clubNo ? `${c.name} (${c.clubNo})` : c.name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs text-zinc-500">
                    Hold Ctrl nede for at vælge flere.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-zinc-200 p-4">
              <div className="text-xs text-zinc-500">{editingKey ? `Key: ${editingKey}` : null}</div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                  onClick={() => setModalOpen(false)}
                >
                  Annuller
                </button>
                <button
                  className="rounded-lg bg-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-50"
                  onClick={() => void submit()}
                  disabled={saving}
                >
                  {saving ? "Gemmer…" : "Gem"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
