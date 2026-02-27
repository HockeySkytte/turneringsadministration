"use client";

import { useEffect, useState } from "react";

type Gender = "MEN" | "WOMEN";

type LicenseItem = {
  id: string;
  licenseNumber: number;
  name: string;
  birthDate: string;
  gender: Gender;
  clubId: string;
};

type ExternalLicenseHit = {
  id: string;
  licenseNumber: number;
  name: string;
  clubId: string;
  clubLabel: string;
};

type ClubOption = {
  id: string;
  label: string;
};

type RequestType = "CREATE" | "UPDATE" | "MOVE" | "DOUBLE_LICENSE";

type RequestStatus = "PENDING_OTHER_CLUB" | "PENDING_TA" | "APPROVED" | "REJECTED";

type LicenseRequestItem = {
  id: string;
  type: RequestType;
  status: RequestStatus;
  fromClubId: string | null;
  fromClubLabel?: string | null;
  targetClubId: string | null;
  targetClubLabel?: string | null;
  licenseId: string | null;
  licenseNumber?: number | null;
  licenseName?: string | null;
  payload: any;
  createdAt: string;
  rejectionReason: string | null;
};

function normalizeText(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function toIsoDateOnly(value: string) {
  const v = normalizeText(value);
  if (!v) return "";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

function formatDateTime(value: string) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return d.toLocaleString("da-DK", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const typeLabel: Record<RequestType, string> = {
  CREATE: "Opret",
  UPDATE: "Ret",
  MOVE: "Flyt",
  DOUBLE_LICENSE: "Dobbeltlicens",
};

const statusLabel: Record<RequestStatus, string> = {
  PENDING_OTHER_CLUB: "Afventer anden klub",
  PENDING_TA: "Afventer Turneringsadmin",
  APPROVED: "Godkendt",
  REJECTED: "Afvist",
};

function statusPill(status: RequestStatus) {
  if (status === "APPROVED") return "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800";
  if (status === "REJECTED") return "rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800";
  return "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800";
}

export default function KlublederSpillerlicenserClient({ clubId }: { clubId: string | null }) {
  const [licenses, setLicenses] = useState<LicenseItem[]>([]);
  const [clubs, setClubs] = useState<ClubOption[]>([]);

  const [outgoing, setOutgoing] = useState<LicenseRequestItem[]>([]);
  const [incoming, setIncoming] = useState<LicenseRequestItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  const [editOpen, setEditOpen] = useState<LicenseItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formBirthDate, setFormBirthDate] = useState("");
  const [formGender, setFormGender] = useState<Gender>("MEN");

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createBirthDate, setCreateBirthDate] = useState("");
  const [createGender, setCreateGender] = useState<Gender>("MEN");

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveLicenseId, setMoveLicenseId] = useState("");
  const [moveSearchQ, setMoveSearchQ] = useState("");
  const [moveHits, setMoveHits] = useState<ExternalLicenseHit[]>([]);

  const [doubleOpen, setDoubleOpen] = useState(false);
  const [doubleLicenseId, setDoubleLicenseId] = useState("");
  const [doubleSearchQ, setDoubleSearchQ] = useState("");
  const [doubleHits, setDoubleHits] = useState<ExternalLicenseHit[]>([]);

  async function loadAll() {
    if (!clubId) return;
    setLoading(true);
    setStatus("");
    try {
      const [licRes, clubsRes, outRes, inRes] = await Promise.all([
        fetch(`/api/klubleder/player-licenses?clubId=${encodeURIComponent(clubId)}`, { cache: "no-store" }),
        fetch(`/api/public/turnering/clubs`, { cache: "no-store" }),
        fetch(`/api/klubleder/player-licenses/requests?clubId=${encodeURIComponent(clubId)}`, { cache: "no-store" }),
        fetch(`/api/klubleder/player-licenses/requests/incoming?clubId=${encodeURIComponent(clubId)}`, { cache: "no-store" }),
      ]);

      const licJson = (await licRes.json().catch(() => null)) as any;
      const clubsJson = (await clubsRes.json().catch(() => null)) as any;
      const outJson = (await outRes.json().catch(() => null)) as any;
      const inJson = (await inRes.json().catch(() => null)) as any;

      setLicenses((licJson?.items ?? []) as LicenseItem[]);
      setOutgoing((outJson?.items ?? []) as LicenseRequestItem[]);
      setIncoming((inJson?.items ?? []) as LicenseRequestItem[]);

      const clubItems = (clubsJson?.clubs ?? []) as Array<{ id: string; name: string; clubNo: string | null }>;
      setClubs(
        clubItems.map((c) => {
          const no = normalizeText(c.clubNo);
          return { id: c.id, label: no ? `${c.name} (${no})` : c.name };
        }),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  async function request(type: RequestType, body: Record<string, unknown>) {
    if (!clubId) return;
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/klubleder/player-licenses/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, type, ...body }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || json?.ok !== true) {
        setStatus(json?.message ?? "Kunne ikke sende anmodning.");
        return;
      }
      setStatus("Anmodning sendt.");
      await loadAll();
    } finally {
      setLoading(false);
    }
  }

  async function decideIncoming(requestId: string, decision: "APPROVE" | "REJECT") {
    if (!clubId) return;
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch(`/api/klubleder/player-licenses/requests/${encodeURIComponent(requestId)}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, decision }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || json?.ok !== true) {
        setStatus(json?.message ?? "Kunne ikke behandle anmodning.");
        return;
      }
      setStatus(decision === "APPROVE" ? "Godkendt." : "Afvist.");
      await loadAll();
    } finally {
      setLoading(false);
    }
  }

  async function searchExternal(q: string): Promise<ExternalLicenseHit[]> {
    if (!clubId) return [];
    const res = await fetch(
      `/api/klubleder/player-licenses/search?clubId=${encodeURIComponent(clubId)}&q=${encodeURIComponent(q)}`,
      { cache: "no-store" },
    );
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || json?.ok !== true) return [];
    return (json?.items ?? []) as ExternalLicenseHit[];
  }

  if (!clubId) {
    return <div className="text-sm text-zinc-700">Vælg en klub øverst.</div>;
  }

  return (
    <div className="space-y-6">
      {status ? <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800">{status}</div> : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Spillerlicenser</div>
            <div className="mt-1 text-sm text-zinc-600">Alle spillerlicenser i klubben.</div>
          </div>
          <button
            type="button"
            onClick={() => void loadAll()}
            disabled={loading}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
          >
            {loading ? "Henter…" : "Opdater"}
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200">
          <div className="grid grid-cols-1 divide-y divide-zinc-200">
            {licenses.length === 0 ? (
              <div className="p-4 text-sm text-zinc-600">Ingen licenser fundet.</div>
            ) : (
              licenses.map((p) => (
                <div key={p.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">
                      {p.name} <span className="text-zinc-500">·</span> {p.licenseNumber}
                    </div>
                    <div className="mt-1 text-sm text-zinc-700">
                      Født: {toIsoDateOnly(p.birthDate)} · Køn: {p.gender === "MEN" ? "Herre" : "Dame"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditOpen(p);
                      setFormName(p.name);
                      setFormBirthDate(toIsoDateOnly(p.birthDate));
                      setFormGender(p.gender);
                    }}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                  >
                    Rediger
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Anmodninger</div>
        <div className="mt-1 text-sm text-zinc-600">Anmod om at oprette, flytte eller oprette dobbeltlicens.</div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-50"
            disabled={loading}
          >
            Ny spillerlicens
          </button>
          <button
            type="button"
            onClick={() => {
              setMoveSearchQ("");
              setMoveHits([]);
              setMoveLicenseId("");
              setMoveOpen(true);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
            disabled={loading}
          >
            Flyt licens
          </button>
          <button
            type="button"
            onClick={() => {
              setDoubleSearchQ("");
              setDoubleHits([]);
              setDoubleLicenseId("");
              setDoubleOpen(true);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
            disabled={loading}
          >
            Opret dobbeltlicens
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Afventer din godkendelse</div>
        <div className="mt-1 text-sm text-zinc-600">Flytninger og dobbeltlicenser der kræver godkendelse fra din klub.</div>

        <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200">
          <div className="grid grid-cols-1 divide-y divide-zinc-200">
            {incoming.length === 0 ? (
              <div className="p-4 text-sm text-zinc-600">Ingen anmodninger.</div>
            ) : (
              incoming.map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-zinc-900">
                          {typeLabel[r.type]}: {r.licenseName ?? r.licenseId ?? ""}
                        </div>
                        <span className={statusPill(r.status)}>{statusLabel[r.status]}</span>
                      </div>
                      <div className="mt-1 text-sm text-zinc-700">
                        Fra: {r.fromClubLabel ?? r.fromClubId ?? ""}
                        {r.targetClubLabel ? ` · Til: ${r.targetClubLabel}` : null}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">Oprettet: {formatDateTime(r.createdAt)}</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void decideIncoming(r.id, "REJECT")}
                        disabled={loading}
                        className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300 disabled:opacity-50"
                      >
                        Afvis
                      </button>
                      <button
                        type="button"
                        onClick={() => void decideIncoming(r.id, "APPROVE")}
                        disabled={loading}
                        className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-50"
                      >
                        Godkend
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Dine anmodninger</div>
        <div className="mt-1 text-sm text-zinc-600">Status på anmodninger fra din klub.</div>

        <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200">
          <div className="grid grid-cols-1 divide-y divide-zinc-200">
            {outgoing.length === 0 ? (
              <div className="p-4 text-sm text-zinc-600">Ingen anmodninger.</div>
            ) : (
              outgoing.map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-zinc-900">
                          {typeLabel[r.type]}: {r.licenseName ?? r.licenseId ?? ""}
                        </div>
                        <span className={statusPill(r.status)}>{statusLabel[r.status]}</span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">Oprettet: {formatDateTime(r.createdAt)}</div>
                      {r.rejectionReason ? <div className="mt-1 text-sm text-red-700">Årsag: {r.rejectionReason}</div> : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

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
                  if (loading) return;
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
                <input value={formName} onChange={(e) => setFormName(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
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

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setEditOpen(null)}
                  className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300 disabled:opacity-50"
                >
                  Annuller
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    void request("UPDATE", {
                      licenseId: editOpen.id,
                      name: formName,
                      birthDate: formBirthDate,
                      gender: formGender,
                    }).then(() => setEditOpen(null))
                  }
                  className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-50"
                >
                  {loading ? "Anmoder…" : "Anmod"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Ny spillerlicens</div>
                <div className="mt-1 text-sm text-zinc-600">Spilleren har ikke tidligere repræsenteret en anden klub</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (loading) return;
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
                <input value={createName} onChange={(e) => setCreateName(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Født</div>
                <input type="date" value={createBirthDate} onChange={(e) => setCreateBirthDate(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Køn</div>
                <select value={createGender} onChange={(e) => setCreateGender(e.target.value as Gender)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                  <option value="MEN">Herre</option>
                  <option value="WOMEN">Dame</option>
                </select>
              </label>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300 disabled:opacity-50"
                >
                  Annuller
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    void request("CREATE", {
                      name: createName,
                      birthDate: createBirthDate,
                      gender: createGender,
                    }).then(() => {
                      setCreateOpen(false);
                      setCreateName("");
                      setCreateBirthDate("");
                      setCreateGender("MEN");
                    })
                  }
                  className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-50"
                >
                  {loading ? "Anmoder…" : "Anmod"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {moveOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Flyt licens</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (loading) return;
                  setMoveOpen(false);
                }}
                className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300"
              >
                Luk
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Søg spiller i anden klub</div>
                <div className="mt-1 flex gap-2">
                  <input
                    value={moveSearchQ}
                    onChange={(e) => setMoveSearchQ(e.target.value)}
                    placeholder="Navn eller licensnr"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={loading || !normalizeText(moveSearchQ)}
                    onClick={() =>
                      void (async () => {
                        const hits = await searchExternal(moveSearchQ);
                        setMoveHits(hits);
                        if (hits[0]?.id) setMoveLicenseId(hits[0].id);
                      })()
                    }
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Søg
                  </button>
                </div>
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Spiller</div>
                <select
                  value={moveLicenseId}
                  onChange={(e) => setMoveLicenseId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="">(vælg)</option>
                  {moveHits.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.licenseNumber}) · {l.clubLabel}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setMoveOpen(false)}
                  className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300 disabled:opacity-50"
                >
                  Annuller
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void request("MOVE", { licenseId: moveLicenseId }).then(() => setMoveOpen(false))}
                  className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-50"
                >
                  {loading ? "Anmoder…" : "Anmod"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {doubleOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Opret dobbeltlicens</div>
                <div className="mt-1 text-sm text-zinc-600">Skal godkendes af den anden klub og Turneringsadmin.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (loading) return;
                  setDoubleOpen(false);
                }}
                className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300"
              >
                Luk
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Søg spiller i anden klub</div>
                <div className="mt-1 flex gap-2">
                  <input
                    value={doubleSearchQ}
                    onChange={(e) => setDoubleSearchQ(e.target.value)}
                    placeholder="Navn eller licensnr"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={loading || !normalizeText(doubleSearchQ)}
                    onClick={() =>
                      void (async () => {
                        const hits = await searchExternal(doubleSearchQ);
                        setDoubleHits(hits);
                        if (hits[0]?.id) setDoubleLicenseId(hits[0].id);
                      })()
                    }
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Søg
                  </button>
                </div>
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Spiller</div>
                <select
                  value={doubleLicenseId}
                  onChange={(e) => setDoubleLicenseId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="">(vælg)</option>
                  {doubleHits.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.licenseNumber}) · {l.clubLabel}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-zinc-500">Udløber automatisk d. 1. juli.</div>
              </label>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setDoubleOpen(false)}
                  className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300 disabled:opacity-50"
                >
                  Annuller
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void request("DOUBLE_LICENSE", { licenseId: doubleLicenseId }).then(() => setDoubleOpen(false))}
                  className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-50"
                >
                  {loading ? "Anmoder…" : "Anmod"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
