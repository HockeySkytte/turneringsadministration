"use client";

import { useEffect, useMemo, useState } from "react";

type TeamOption = { id: string; league: string; name: string; clubId: string };

type LicensedPlayer = {
  id: string;
  licenseNumber: number;
  name: string;
  birthDate: string;
};

type RosterPlayer = {
  number: string;
  role: "" | "C" | "G";
  licenseId: string;
  name: string;
  birthDate: string;
  imageUrl: string;
};

type RosterLeader = {
  role: "" | "Træner" | "Assistentræner" | "Holdleder";
  name: string;
  imageUrl: string;
};

type RosterDto = {
  id: string;
  teamId: string;
  league: string;
  teamName: string;
  players: Array<{
    number: string | null;
    role: string | null;
    licenseId?: string | null;
    name: string;
    birthDate: string | null;
    imageUrl: string | null;
  }>;
  leaders: Array<{ role: string | null; name: string; imageUrl: string | null }>;
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

  const [licensedPlayers, setLicensedPlayers] = useState<LicensedPlayer[]>([]);
  const [loadingLicensedPlayers, setLoadingLicensedPlayers] = useState(false);

  const [newPlayer, setNewPlayer] = useState<RosterPlayer>({
    number: "",
    role: "",
    licenseId: "",
    name: "",
    birthDate: "",
    imageUrl: "",
  });
  const [newLeader, setNewLeader] = useState<RosterLeader>({ role: "", name: "", imageUrl: "" });

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

  const selectedLicensedPlayer = useMemo(() => {
    if (!newPlayer.licenseId) return null;
    return licensedPlayers.find((p) => p.id === newPlayer.licenseId) ?? null;
  }, [licensedPlayers, newPlayer.licenseId]);

  useEffect(() => {
    if (!selectedTeamId) return;
    let cancelled = false;

    async function loadLicensedPlayers() {
      setLoadingLicensedPlayers(true);
      try {
        const res = await fetch(`/api/holdleder/player-licenses?teamId=${encodeURIComponent(selectedTeamId)}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as any;
        if (cancelled) return;

        const list = (json?.items ?? []) as Array<{ id: string; licenseNumber: number; name: string; birthDate: string }>;
        setLicensedPlayers(list);

        // Keep selection if still present, else default to first.
        setNewPlayer((p) => {
          const current = p.licenseId;
          const stillThere = current && list.some((x) => x.id === current);
          const nextId = stillThere ? current : list[0]?.id ?? "";
          const next = list.find((x) => x.id === nextId) ?? null;
          return {
            ...p,
            licenseId: nextId,
            name: next?.name ?? "",
            birthDate: toDanishDateValue(next?.birthDate ?? null),
          };
        });
      } finally {
        if (!cancelled) setLoadingLicensedPlayers(false);
      }
    }

    void loadLicensedPlayers();
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId]);

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
            role: (normalizeText(p.role) as any) === "C" || (normalizeText(p.role) as any) === "G" ? (normalizeText(p.role) as any) : "",
            licenseId: normalizeText(p.licenseId ?? ""),
            name: normalizeText(p.name),
            birthDate: toDanishDateValue(p.birthDate),
            imageUrl: normalizeText(p.imageUrl) ?? "",
          })),
        );
        setLeaders(
          (roster.leaders ?? []).map((l) => ({
            role:
              normalizeText(l.role) === "Træner" || normalizeText(l.role) === "Assistentræner" || normalizeText(l.role) === "Holdleder"
                ? (normalizeText(l.role) as any)
                : "",
            name: normalizeText(l.name),
            imageUrl: normalizeText(l.imageUrl) ?? "",
          })),
        );
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

  useEffect(() => {
    if (!licensedPlayers.length) return;
    // Backfill licenseId on loaded players when possible (for older rosters).
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.licenseId) return p;
        const keyName = normalizeText(p.name).toLowerCase();
        const keyBirth = normalizeText(p.birthDate);
        const match = licensedPlayers.find(
          (lp) => normalizeText(lp.name).toLowerCase() === keyName && toDanishDateValue(lp.birthDate) === keyBirth,
        );
        return match ? { ...p, licenseId: match.id } : p;
      }),
    );
  }, [licensedPlayers]);

  function addPlayer() {
    if (!newPlayer.licenseId || !selectedLicensedPlayer) {
      setStatus("Vælg en spiller fra licenslisten.");
      return;
    }

    if (players.some((p) => p.licenseId && p.licenseId === newPlayer.licenseId)) {
      setStatus("Den samme spiller/licens kan ikke tilføjes flere gange på samme hold.");
      return;
    }

    const name = normalizeText(selectedLicensedPlayer.name);
    const birthDate = toDanishDateValue(selectedLicensedPlayer.birthDate);
    if (!name || !birthDate) {
      setStatus("Kunne ikke læse spillerdata fra licens.");
      return;
    }

    setPlayers((prev) => [
      ...prev,
      {
        number: newPlayer.number,
        role: newPlayer.role,
        licenseId: newPlayer.licenseId,
        name,
        birthDate,
        imageUrl: newPlayer.imageUrl,
      },
    ]);

    setNewPlayer((p) => ({
      ...p,
      number: "",
      role: "",
      imageUrl: "",
    }));
  }

  function addLeader() {
    const name = normalizeText(newLeader.name);
    if (!name) {
      setStatus("Udfyld mindst navn for leder.");
      return;
    }
    setLeaders((prev) => [...prev, { ...newLeader, name }]);
    setNewLeader({ role: "", name: "", imageUrl: "" });
  }

  async function saveRoster() {
    if (!selectedTeamId) return;
    setSaving(true);
    setStatus("");
    try {
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
            role: (normalizeText(p.role) as any) === "C" || (normalizeText(p.role) as any) === "G" ? (normalizeText(p.role) as any) : "",
            licenseId: "",
            name: normalizeText(p.name),
            birthDate: toDanishDateValue(p.birthDate),
            imageUrl: normalizeText(p.imageUrl) ?? "",
          })),
        );
        setLeaders(
          (roster.leaders ?? []).map((l) => ({
            role:
              normalizeText(l.role) === "Træner" || normalizeText(l.role) === "Assistentræner" || normalizeText(l.role) === "Holdleder"
                ? (normalizeText(l.role) as any)
                : "",
            name: normalizeText(l.name),
            imageUrl: normalizeText(l.imageUrl) ?? "",
          })),
        );
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
    setPlayers((prev) => prev.map((p, i) => (i === editingPlayerIndex ? { ...p, ...editingPlayerDraft } : p)));
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
              <select
                className="col-span-9 rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm"
                value={newPlayer.licenseId}
                onChange={(e) => {
                  const id = e.target.value;
                  const lp = licensedPlayers.find((x) => x.id === id) ?? null;
                  setNewPlayer((p) => ({
                    ...p,
                    licenseId: id,
                    name: lp?.name ?? "",
                    birthDate: toDanishDateValue(lp?.birthDate ?? null),
                  }));
                }}
                disabled={loadingLicensedPlayers || licensedPlayers.length === 0}
              >
                {licensedPlayers.length === 0 ? <option value="">Ingen licenser</option> : null}
                {licensedPlayers.map((lp) => (
                  <option key={lp.id} value={lp.id}>
                    {lp.name} (#{lp.licenseNumber})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-12 gap-2">
              <input
                className="col-span-5 rounded-md border border-zinc-300 bg-zinc-50 px-2 py-2 text-sm"
                placeholder="Født"
                value={newPlayer.birthDate}
                disabled
              />
              <input
                className="col-span-7 rounded-md border border-zinc-300 px-2 py-2 text-sm"
                placeholder="Billede URL"
                value={newPlayer.imageUrl}
                onChange={(e) => setNewPlayer((p) => ({ ...p, imageUrl: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-12 gap-2">
              <select
                className="col-span-5 rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm"
                value={newPlayer.role}
                onChange={(e) => setNewPlayer((p) => ({ ...p, role: e.target.value as any }))}
              >
                <option value="">Rolle (ingen)</option>
                <option value="C">C</option>
                <option value="G">G</option>
              </select>
              <div className="col-span-7 text-xs text-zinc-500 flex items-center">
                Vælg spiller fra licenslisten. Født udfyldes automatisk.
              </div>
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
                  <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Rolle</th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Billede</th>
                  <th className="border-b border-zinc-200 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {players.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-zinc-600" colSpan={6}>
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
                        {p.name}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">
                        {p.birthDate || "-"}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">
                        {editingPlayerIndex === idx ? (
                          <select
                            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                            value={editingPlayerDraft?.role ?? ""}
                            onChange={(e) => setEditingPlayerDraft((d) => (d ? { ...d, role: e.target.value as any } : d))}
                          >
                            <option value="">-</option>
                            <option value="C">C</option>
                            <option value="G">G</option>
                          </select>
                        ) : (
                          p.role || "-"
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
            <select
              className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm"
              value={newLeader.role}
              onChange={(e) => setNewLeader((l) => ({ ...l, role: e.target.value as any }))}
            >
              <option value="">Rolle (valgfri)</option>
              <option value="Træner">Træner</option>
              <option value="Assistentræner">Assistentræner</option>
              <option value="Holdleder">Holdleder</option>
            </select>
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
                  <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Rolle</th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Navn</th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Billede</th>
                  <th className="border-b border-zinc-200 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {leaders.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-zinc-600" colSpan={4}>
                      Ingen ledere.
                    </td>
                  </tr>
                ) : (
                  leaders.map((l, idx) => (
                    <tr key={`${l.name}-${idx}`} className={idx % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}>
                      <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">
                        {editingLeaderIndex === idx ? (
                          <select
                            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                            value={editingLeaderDraft?.role ?? ""}
                            onChange={(e) => setEditingLeaderDraft((d) => (d ? { ...d, role: e.target.value as any } : d))}
                          >
                            <option value="">-</option>
                            <option value="Træner">Træner</option>
                            <option value="Assistentræner">Assistentræner</option>
                            <option value="Holdleder">Holdleder</option>
                          </select>
                        ) : (
                          l.role || "-"
                        )}
                      </td>
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
