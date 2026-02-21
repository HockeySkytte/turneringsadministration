"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PickTeam = {
  teamId: string;
  label: string;
};

type RosterDto = {
  id: string;
  teamId: string;
  league: string;
  teamName: string;
  players: Array<{ number: string | null; name: string; birthDate: string | null }>;
  leaders: Array<{ name: string; imageUrl: string | null }>;
};

type UploadRow = {
  rowIndex: number;
  cG: string | null;
  number: string | null;
  name: string | null;
  birthday: string | null;
  leader: string | null;
  reserve: string | null;
};

function norm(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function keyForPlayer(p: { number: string | null; name: string; birthDate: string | null }) {
  return `${norm(p.number)}::${norm(p.name).toLocaleLowerCase("da-DK")}::${norm(p.birthDate)}`;
}

function isoToDanishDate(iso: string | null) {
  const v = norm(iso);
  if (!v) return "";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export default function MatchHoldlistePickerClient({ kampId, teams }: { kampId: number; teams: PickTeam[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [selectedTeamId, setSelectedTeamId] = useState(teams[0]?.teamId ?? "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("");

  const [roster, setRoster] = useState<RosterDto | null>(null);
  const [existingRows, setExistingRows] = useState<UploadRow[]>([]);
  const [approved, setApproved] = useState(false);

  const [selectedPlayers, setSelectedPlayers] = useState<Record<string, { role: "" | "C" | "G" }>>({});
  const [selectedLeaders, setSelectedLeaders] = useState<Record<string, true>>({});

  useEffect(() => {
    if (!selectedTeamId && teams.length) setSelectedTeamId(teams[0]!.teamId);
  }, [selectedTeamId, teams]);

  async function loadData(teamId: string) {
    setLoading(true);
    setStatus("");
    try {
      const [rosterRes, lineupRes] = await Promise.all([
        fetch(`/api/holdleder/roster?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" }),
        fetch(`/api/kamp/holdliste/${kampId}?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" }),
      ]);

      const rosterJson = (await rosterRes.json().catch(() => null)) as any;
      const lineupJson = (await lineupRes.json().catch(() => null)) as any;

      const rosterDto = (rosterJson?.roster ?? null) as RosterDto | null;
      setRoster(rosterDto);
      setExistingRows(((lineupJson?.rows ?? []) as UploadRow[]) ?? []);
      setApproved(Boolean(lineupJson?.approved));

      const nextPlayers: Record<string, { role: "" | "C" | "G" }> = {};
      const nextLeaders: Record<string, true> = {};

      const existingPlayers = (lineupJson?.rows ?? []) as UploadRow[];
      for (const r of existingPlayers) {
        const isLeader = norm(r.leader).toUpperCase() === "L";
        if (isLeader) {
          const n = norm(r.name);
          if (n) nextLeaders[n.toLocaleLowerCase("da-DK")] = true;
          continue;
        }

        const k = `${norm(r.number)}::${norm(r.name).toLocaleLowerCase("da-DK")}::${norm(r.birthday)}`;
        const role = (norm(r.cG).toUpperCase() === "C" ? "C" : norm(r.cG).toUpperCase() === "G" ? "G" : "") as
          | ""
          | "C"
          | "G";
        if (norm(r.name) || norm(r.number)) nextPlayers[k] = { role };
      }

      setSelectedPlayers(nextPlayers);
      setSelectedLeaders(nextLeaders);
    } finally {
      setLoading(false);
    }
  }

  function openDialog() {
    setOpen(true);
    if (selectedTeamId) void loadData(selectedTeamId);
  }

  function closeDialog() {
    setOpen(false);
    setStatus("");
  }

  const rosterPlayers = useMemo(() => {
    const list = roster?.players ?? [];
    return [...list].sort((a, b) => {
      const na = Number.parseInt(norm(a.number), 10);
      const nb = Number.parseInt(norm(b.number), 10);
      const nka = Number.isFinite(na) ? na : 999999;
      const nkb = Number.isFinite(nb) ? nb : 999999;
      if (nka !== nkb) return nka - nkb;
      return norm(a.name).toLocaleLowerCase("da-DK").localeCompare(norm(b.name).toLocaleLowerCase("da-DK"), "da-DK");
    });
  }, [roster]);

  const rosterLeaders = useMemo(() => {
    const list = roster?.leaders ?? [];
    return [...list].sort((a, b) =>
      norm(a.name).toLocaleLowerCase("da-DK").localeCompare(norm(b.name).toLocaleLowerCase("da-DK"), "da-DK"),
    );
  }, [roster]);

  const selectedPlayerCount = Object.keys(selectedPlayers).length;
  const selectedLeaderCount = Object.keys(selectedLeaders).length;

  function togglePlayer(p: { number: string | null; name: string; birthDate: string | null }, checked: boolean) {
    const k = keyForPlayer(p);
    setSelectedPlayers((prev) => {
      const next = { ...prev };
      if (checked) {
        if (Object.keys(prev).length >= 20 && !next[k]) return prev;
        next[k] = next[k] ?? { role: "" };
      } else {
        delete next[k];
      }
      return next;
    });
  }

  function setPlayerRole(p: { number: string | null; name: string; birthDate: string | null }, role: "" | "C" | "G") {
    const k = keyForPlayer(p);
    setSelectedPlayers((prev) => {
      if (!prev[k]) return prev;
      return { ...prev, [k]: { role } };
    });
  }

  function toggleLeader(name: string, checked: boolean) {
    const k = norm(name).toLocaleLowerCase("da-DK");
    setSelectedLeaders((prev) => {
      const next = { ...prev };
      if (checked) {
        if (Object.keys(prev).length >= 5 && !next[k]) return prev;
        next[k] = true;
      } else {
        delete next[k];
      }
      return next;
    });
  }

  async function save() {
    if (!selectedTeamId) return;
    if (approved) {
      setStatus("Holdlisten er allerede godkendt og kan ikke ændres.");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const chosenPlayers = rosterPlayers
        .filter((p) => Boolean(selectedPlayers[keyForPlayer(p)]))
        .slice(0, 20)
        .map((p) => {
          const k = keyForPlayer(p);
          return {
            role: selectedPlayers[k]?.role ?? "",
            number: norm(p.number) || null,
            name: norm(p.name) || null,
            birthday: isoToDanishDate(p.birthDate) || null,
          };
        });

      const chosenLeaders = rosterLeaders
        .filter((l) => Boolean(selectedLeaders[norm(l.name).toLocaleLowerCase("da-DK")]))
        .slice(0, 5)
        .map((l) => ({ name: norm(l.name) }));

      const res = await fetch(`/api/kamp/holdliste/${kampId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: selectedTeamId, players: chosenPlayers, leaders: chosenLeaders }),
      });

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        const err = norm(json?.error) || "Kunne ikke indsende holdliste.";
        setStatus(err === "MATCH_LOCKED" ? `Kampen er låst (${json?.status ?? ""}).` : `Fejl: ${err}`);
        return;
      }

      setStatus("Holdliste indsendt.");
      closeDialog();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-zinc-700">
          <span className="font-semibold">Holdliste</span>
          {teams.length > 1 ? <span className="ml-2 text-xs text-zinc-500">(du kan vælge for flere hold)</span> : null}
        </div>
        <button
          type="button"
          onClick={openDialog}
          className="rounded-md bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)]"
        >
          Vælg Hold
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-xl bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div className="text-sm font-semibold text-zinc-900">Vælg hold til kampen</div>
              <button type="button" onClick={closeDialog} className="rounded-md px-2 py-1 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                Luk
              </button>
            </div>

            <div className="space-y-4 p-4">
              {approved ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  Holdlisten er godkendt under Sekretariat og kan ikke ændres.
                </div>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-zinc-700">Hold</div>
                  <select
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    value={selectedTeamId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSelectedTeamId(next);
                      void loadData(next);
                    }}
                  >
                    {teams.map((t) => (
                      <option key={t.teamId} value={t.teamId}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-sm text-zinc-600">
                  Spillere: <span className="font-semibold text-zinc-900">{selectedPlayerCount}/20</span> · Ledere:{" "}
                  <span className="font-semibold text-zinc-900">{selectedLeaderCount}/5</span>
                </div>
              </div>

              {loading ? <div className="text-sm text-zinc-600">Henter trup…</div> : null}
              {status ? <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{status}</div> : null}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-zinc-200">
                  <div className="bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700">Spillere</div>
                  <div className="max-h-[52vh] overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-white">
                        <tr>
                          <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Vælg</th>
                          <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">#</th>
                          <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Navn</th>
                          <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Født</th>
                          <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Rolle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rosterPlayers.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-3 text-sm text-zinc-600">
                              Ingen spillere i truppen.
                            </td>
                          </tr>
                        ) : (
                          rosterPlayers.map((p, idx) => {
                            const k = keyForPlayer(p);
                            const checked = Boolean(selectedPlayers[k]);
                            const disabled = !checked && selectedPlayerCount >= 20;

                            return (
                              <tr key={k || idx} className={idx % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}>
                                <td className="border-b border-zinc-100 px-3 py-2">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={approved || disabled}
                                    onChange={(e) => togglePlayer(p, e.target.checked)}
                                  />
                                </td>
                                <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">{norm(p.number) || "-"}</td>
                                <td className="border-b border-zinc-100 px-3 py-2 font-medium text-zinc-900">{norm(p.name) || "-"}</td>
                                <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">{isoToDanishDate(p.birthDate) || "-"}</td>
                                <td className="border-b border-zinc-100 px-3 py-2">
                                  <select
                                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                                    disabled={approved || !checked}
                                    value={selectedPlayers[k]?.role ?? ""}
                                    onChange={(e) => setPlayerRole(p, (e.target.value as any) ?? "")}
                                  >
                                    <option value="">-</option>
                                    <option value="C">C</option>
                                    <option value="G">G</option>
                                  </select>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-zinc-200">
                  <div className="bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700">Ledere</div>
                  <div className="max-h-[52vh] overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-white">
                        <tr>
                          <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Vælg</th>
                          <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Navn</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rosterLeaders.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="px-3 py-3 text-sm text-zinc-600">
                              Ingen ledere i truppen.
                            </td>
                          </tr>
                        ) : (
                          rosterLeaders.map((l, idx) => {
                            const k = norm(l.name).toLocaleLowerCase("da-DK");
                            const checked = Boolean(selectedLeaders[k]);
                            const disabled = !checked && selectedLeaderCount >= 5;

                            return (
                              <tr key={k || idx} className={idx % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}>
                                <td className="border-b border-zinc-100 px-3 py-2">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={approved || disabled}
                                    onChange={(e) => toggleLeader(l.name, e.target.checked)}
                                  />
                                </td>
                                <td className="border-b border-zinc-100 px-3 py-2 font-medium text-zinc-900">{l.name}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-3">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900"
                >
                  Annuller
                </button>
                <button
                  type="button"
                  disabled={approved || saving || loading}
                  onClick={save}
                  className="rounded-md bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-60"
                >
                  {saving ? "Indsender…" : "Indsend holdliste"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
