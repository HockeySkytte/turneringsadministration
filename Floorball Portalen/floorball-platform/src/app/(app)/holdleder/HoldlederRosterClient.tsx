"use client";

import { useEffect, useMemo, useState } from "react";

type TeamOption = { id: string; league: string; name: string; clubId: string };

type RosterPlayer = {
  number: string;
  name: string;
  birthDate: string;
  imageUrl: string;
};

type RosterLeader = {
  name: string;
  imageUrl: string;
};

type RosterDto = {
  id: string;
  teamId: string;
  league: string;
  teamName: string;
  players: Array<{ number: string | null; name: string; birthDate: string | null; imageUrl: string | null }>;
  leaders: Array<{ name: string; imageUrl: string | null }>;
};

function normalizeText(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function toDanishDateValue(value: string | null) {
  const v = normalizeText(value);
  if (!v) return "";
  // Prisma serializes Date as ISO, but birthDate is DATE so it can come as 'YYYY-MM-DDT00:00:00.000Z'
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function isValidDanishDate(value: string) {
  const v = normalizeText(value);
  if (!v) return true;
  const m = v.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return false;
  const d = Number.parseInt(m[1]!, 10);
  const mo = Number.parseInt(m[2]!, 10);
  const y = Number.parseInt(m[3]!, 10);
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return false;
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  return true;
}

export default function HoldlederRosterClient() {
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("");

  const [league, setLeague] = useState<string>("");
  const [teamName, setTeamName] = useState<string>("");

  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [leaders, setLeaders] = useState<RosterLeader[]>([]);

  const [newPlayer, setNewPlayer] = useState<RosterPlayer>({ number: "", name: "", birthDate: "", imageUrl: "" });
  const [newLeader, setNewLeader] = useState<RosterLeader>({ name: "", imageUrl: "" });

  const [editingPlayerIndex, setEditingPlayerIndex] = useState<number | null>(null);
  const [editingPlayerDraft, setEditingPlayerDraft] = useState<RosterPlayer | null>(null);
  const [editingLeaderIndex, setEditingLeaderIndex] = useState<number | null>(null);
  const [editingLeaderDraft, setEditingLeaderDraft] = useState<RosterLeader | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadTeams() {
      const res = await fetch("/api/holdleder/teams", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as any;
      if (cancelled) return;
      const list = (json?.teams ?? []) as TeamOption[];
      setTeams(list);
      if (!selectedTeamId && list.length) {
        setSelectedTeamId(list[0]!.id);
      }
    }
    void loadTeams();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );

  useEffect(() => {
    if (!selectedTeamId) return;
    let cancelled = false;

    async function loadRoster() {
      setLoading(true);
      setStatus("");
      try {
        const res = await fetch(`/api/holdleder/roster?teamId=${encodeURIComponent(selectedTeamId)}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as any;
        if (cancelled) return;

        const roster = json?.roster as RosterDto | null;
        if (!roster) {
          setLeague(selectedTeam?.league ?? "");
          setTeamName(selectedTeam?.name ?? "");
          setPlayers([]);
          setLeaders([]);
          return;
        }

        setLeague(roster.league ?? selectedTeam?.league ?? "");
        setTeamName(roster.teamName ?? selectedTeam?.name ?? "");
        setPlayers(
          (roster.players ?? []).map((p) => ({
            number: normalizeText(p.number) ?? "",
            name: normalizeText(p.name),
            birthDate: toDanishDateValue(p.birthDate),
            imageUrl: normalizeText(p.imageUrl) ?? "",
          })),
        );
        setLeaders((roster.leaders ?? []).map((l) => ({ name: normalizeText(l.name), imageUrl: normalizeText(l.imageUrl) ?? "" })));
        setEditingPlayerIndex(null);
        setEditingPlayerDraft(null);
        setEditingLeaderIndex(null);
        setEditingLeaderDraft(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRoster();

    return () => {
      cancelled = true;
    };
  }, [selectedTeamId, selectedTeam]);

  function addPlayer() {
    const name = normalizeText(newPlayer.name);
    if (!name) {
      setStatus("Udfyld mindst navn for spiller.");
      return;
    }
    if (!isValidDanishDate(newPlayer.birthDate)) {
      setStatus("Født skal have format: dd-mm-åååå");
      return;
    }
    setPlayers((prev) => [...prev, { ...newPlayer, name }]);
    setNewPlayer({ number: "", name: "", birthDate: "", imageUrl: "" });
  }

  function addLeader() {
    const name = normalizeText(newLeader.name);
    if (!name) {
      setStatus("Udfyld mindst navn for leder.");
      return;
    }
    setLeaders((prev) => [...prev, { ...newLeader, name }]);
    setNewLeader({ name: "", imageUrl: "" });
  }

  async function saveRoster() {
    if (!selectedTeamId) return;
    setSaving(true);
    setStatus("");
    try {
      const invalidBirth = players.find((p) => !isValidDanishDate(p.birthDate));
      if (invalidBirth) {
        setStatus("Født skal have format: dd-mm-åååå");
        return;
      }

      const res = await fetch("/api/holdleder/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeamId,
          players,
          leaders,
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        setStatus(json?.error ? `Fejl: ${json.error}` : "Kunne ikke gemme trup.");
        return;
      }

      const roster = json?.roster as RosterDto | null;
      if (roster) {
        setLeague(roster.league ?? selectedTeam?.league ?? "");
        setTeamName(roster.teamName ?? selectedTeam?.name ?? "");
        setPlayers(
          (roster.players ?? []).map((p) => ({
            number: normalizeText(p.number) ?? "",
            name: normalizeText(p.name),
            birthDate: toDanishDateValue(p.birthDate),
            imageUrl: normalizeText(p.imageUrl) ?? "",
          })),
        );
        setLeaders((roster.leaders ?? []).map((l) => ({ name: normalizeText(l.name), imageUrl: normalizeText(l.imageUrl) ?? "" })));
      }

      setEditingPlayerIndex(null);
      setEditingPlayerDraft(null);
      setEditingLeaderIndex(null);
      setEditingLeaderDraft(null);

      setStatus("Trup uploadet (overskriver eksisterende).");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRoster() {
    if (!selectedTeamId) return;
    if (!confirm("Slet hele truppen for dette hold?") ) return;
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch(`/api/holdleder/roster?teamId=${encodeURIComponent(selectedTeamId)}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        setStatus(json?.error ? `Fejl: ${json.error}` : "Kunne ikke slette trup.");
        return;
      }
      setPlayers([]);
      setLeaders([]);
      setEditingPlayerIndex(null);
      setEditingPlayerDraft(null);
      setEditingLeaderIndex(null);
      setEditingLeaderDraft(null);
      setStatus("Trup slettet.");
    } finally {
      setSaving(false);
    }
  }

  function startEditPlayer(idx: number) {
    setEditingPlayerIndex(idx);
    setEditingPlayerDraft({ ...players[idx]! });
    setStatus("");
  }

  function cancelEditPlayer() {
    setEditingPlayerIndex(null);
    setEditingPlayerDraft(null);
  }

  function commitEditPlayer() {
    if (editingPlayerIndex === null || !editingPlayerDraft) return;
    const name = normalizeText(editingPlayerDraft.name);
    if (!name) {
      setStatus("Udfyld mindst navn for spiller.");
      return;
    }
    if (!isValidDanishDate(editingPlayerDraft.birthDate)) {
      setStatus("Født skal have format: dd-mm-åååå");
      return;
    }
    setPlayers((prev) => prev.map((p, i) => (i === editingPlayerIndex ? { ...editingPlayerDraft, name } : p)));
    cancelEditPlayer();
  }

  function startEditLeader(idx: number) {
    setEditingLeaderIndex(idx);
    setEditingLeaderDraft({ ...leaders[idx]! });
    setStatus("");
  }

  function cancelEditLeader() {
    setEditingLeaderIndex(null);
    setEditingLeaderDraft(null);
  }

  function commitEditLeader() {
    if (editingLeaderIndex === null || !editingLeaderDraft) return;
    const name = normalizeText(editingLeaderDraft.name);
    if (!name) {
      setStatus("Udfyld mindst navn for leder.");
      return;
    }
    setLeaders((prev) => prev.map((l, i) => (i === editingLeaderIndex ? { ...editingLeaderDraft, name } : l)));
    cancelEditLeader();
  }

  return (
    <div className="mt-4 space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-zinc-900">Vælg hold</div>
            <select
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
            >
              {teams.length === 0 ? <option value="">Ingen hold</option> : null}
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.league}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveRoster}
              disabled={saving || loading || !selectedTeamId}
              className="rounded-md bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-60"
            >
              {saving ? "Gemmer..." : "Upload trup"}
            </button>
            <button
              type="button"
              onClick={deleteRoster}
              disabled={saving || loading || !selectedTeamId}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-60"
            >
              Slet trup
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm text-zinc-600">
          {loading ? "Henter trup..." : null}
          {!loading && (league || teamName) ? (
            <>
              Liga: <span className="font-semibold text-zinc-900">{league || selectedTeam?.league || "-"}</span> · Hold:{" "}
              <span className="font-semibold text-zinc-900">{teamName || selectedTeam?.name || "-"}</span>
            </>
          ) : null}
        </div>

        {status ? <div className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{status}</div> : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">Spillere</div>

          <div className="mt-3 grid gap-2">
            <div className="grid grid-cols-12 gap-2">
              <input
                className="col-span-3 rounded-md border border-zinc-300 px-2 py-2 text-sm"
                placeholder="Nr"
                value={newPlayer.number}
                onChange={(e) => setNewPlayer((p) => ({ ...p, number: e.target.value }))}
              />
              <input
                className="col-span-9 rounded-md border border-zinc-300 px-2 py-2 text-sm"
                placeholder="Navn"
                value={newPlayer.name}
                onChange={(e) => setNewPlayer((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-12 gap-2">
              <input
                className="col-span-5 rounded-md border border-zinc-300 px-2 py-2 text-sm"
                placeholder="dd-mm-åååå"
                value={newPlayer.birthDate}
                onChange={(e) => setNewPlayer((p) => ({ ...p, birthDate: e.target.value }))}
              />
              <input
                className="col-span-7 rounded-md border border-zinc-300 px-2 py-2 text-sm"
                placeholder="Billede URL"
                value={newPlayer.imageUrl}
                onChange={(e) => setNewPlayer((p) => ({ ...p, imageUrl: e.target.value }))}
              />
            </div>
            <button
              type="button"
              onClick={addPlayer}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900"
            >
              Tilføj spiller
            </button>
          </div>

          <div className="mt-4 overflow-auto rounded-xl border border-zinc-200">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Nr</th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Navn</th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Født</th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Billede</th>
                  <th className="border-b border-zinc-200 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {players.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-zinc-600" colSpan={5}>
                      Ingen spillere.
                    </td>
                  </tr>
                ) : (
                  players.map((p, idx) => (
                    <tr key={`${p.number}-${p.name}-${idx}`} className={idx % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}>
                      <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">
                        {editingPlayerIndex === idx ? (
                          <input
                            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
                            value={editingPlayerDraft?.number ?? ""}
                            onChange={(e) => setEditingPlayerDraft((d) => (d ? { ...d, number: e.target.value } : d))}
                          />
                        ) : (
                          p.number || "-"
                        )}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-2 font-medium text-zinc-900">
                        {editingPlayerIndex === idx ? (
                          <input
                            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm font-medium text-zinc-900"
                            value={editingPlayerDraft?.name ?? ""}
                            onChange={(e) => setEditingPlayerDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                          />
                        ) : (
                          p.name
                        )}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">
                        {editingPlayerIndex === idx ? (
                          <input
                            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
                            placeholder="dd-mm-åååå"
                            value={editingPlayerDraft?.birthDate ?? ""}
                            onChange={(e) => setEditingPlayerDraft((d) => (d ? { ...d, birthDate: e.target.value } : d))}
                          />
                        ) : (
                          p.birthDate || "-"
                        )}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">
                        {editingPlayerIndex === idx ? (
                          <input
                            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
                            placeholder="https://..."
                            value={editingPlayerDraft?.imageUrl ?? ""}
                            onChange={(e) => setEditingPlayerDraft((d) => (d ? { ...d, imageUrl: e.target.value } : d))}
                          />
                        ) : p.imageUrl ? (
                          <a className="text-[color:var(--brand)] hover:underline" href={p.imageUrl} target="_blank" rel="noreferrer noopener">
                            Link
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-2 text-right">
                        {editingPlayerIndex === idx ? (
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              className="text-sm font-semibold text-[color:var(--brand)] hover:underline"
                              onClick={commitEditPlayer}
                            >
                              Gem
                            </button>
                            <button
                              type="button"
                              className="text-sm font-semibold text-zinc-700 hover:underline"
                              onClick={cancelEditPlayer}
                            >
                              Annuller
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              className="text-sm font-semibold text-[color:var(--brand)] hover:underline"
                              onClick={() => startEditPlayer(idx)}
                            >
                              Rediger
                            </button>
                            <button
                              type="button"
                              className="text-sm font-semibold text-red-700 hover:underline"
                              onClick={() => setPlayers((prev) => prev.filter((_, i) => i !== idx))}
                            >
                              Slet
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">Ledere</div>

          <div className="mt-3 grid gap-2">
            <input
              className="rounded-md border border-zinc-300 px-2 py-2 text-sm"
              placeholder="Navn"
              value={newLeader.name}
              onChange={(e) => setNewLeader((l) => ({ ...l, name: e.target.value }))}
            />
            <input
              className="rounded-md border border-zinc-300 px-2 py-2 text-sm"
              placeholder="Billede URL"
              value={newLeader.imageUrl}
              onChange={(e) => setNewLeader((l) => ({ ...l, imageUrl: e.target.value }))}
            />
            <button
              type="button"
              onClick={addLeader}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900"
            >
              Tilføj leder
            </button>
          </div>

          <div className="mt-4 overflow-auto rounded-xl border border-zinc-200">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Navn</th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Billede</th>
                  <th className="border-b border-zinc-200 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {leaders.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-zinc-600" colSpan={3}>
                      Ingen ledere.
                    </td>
                  </tr>
                ) : (
                  leaders.map((l, idx) => (
                    <tr key={`${l.name}-${idx}`} className={idx % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}>
                      <td className="border-b border-zinc-100 px-3 py-2 font-medium text-zinc-900">
                        {editingLeaderIndex === idx ? (
                          <input
                            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm font-medium text-zinc-900"
                            value={editingLeaderDraft?.name ?? ""}
                            onChange={(e) => setEditingLeaderDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                          />
                        ) : (
                          l.name
                        )}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">
                        {editingLeaderIndex === idx ? (
                          <input
                            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
                            placeholder="https://..."
                            value={editingLeaderDraft?.imageUrl ?? ""}
                            onChange={(e) => setEditingLeaderDraft((d) => (d ? { ...d, imageUrl: e.target.value } : d))}
                          />
                        ) : l.imageUrl ? (
                          <a className="text-[color:var(--brand)] hover:underline" href={l.imageUrl} target="_blank" rel="noreferrer noopener">
                            Link
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-2 text-right">
                        {editingLeaderIndex === idx ? (
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              className="text-sm font-semibold text-[color:var(--brand)] hover:underline"
                              onClick={commitEditLeader}
                            >
                              Gem
                            </button>
                            <button
                              type="button"
                              className="text-sm font-semibold text-zinc-700 hover:underline"
                              onClick={cancelEditLeader}
                            >
                              Annuller
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              className="text-sm font-semibold text-[color:var(--brand)] hover:underline"
                              onClick={() => startEditLeader(idx)}
                            >
                              Rediger
                            </button>
                            <button
                              type="button"
                              className="text-sm font-semibold text-red-700 hover:underline"
                              onClick={() => setLeaders((prev) => prev.filter((_, i) => i !== idx))}
                            >
                              Slet
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
