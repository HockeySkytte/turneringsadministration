"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TaRole = "CLUB_LEADER" | "TEAM_LEADER" | "SECRETARIAT" | "REFEREE";

type TeamGender = "MEN" | "WOMEN" | "UNKNOWN";

type ClubLeaderTitle = "FORMAND" | "KASSER" | "BESTYRELSESMEDLEM";

const CLUB_LEADER_TITLE_OPTIONS: Array<{ value: ClubLeaderTitle; label: string }> = [
  { value: "FORMAND", label: "Formand" },
  { value: "KASSER", label: "Kassér" },
  { value: "BESTYRELSESMEDLEM", label: "Bestyrelsesmedlem" },
];

const ROLE_OPTIONS: Array<{ value: TaRole; label: string; hint: string }> = [
  {
    value: "CLUB_LEADER",
    label: "Klubleder",
    hint: "Kan godkende holdledere og sekretariat (kræver turneringsadmin-godkendelse).",
  },
  {
    value: "TEAM_LEADER",
    label: "Holdleder",
    hint: "Kan administrere spillerliste/lineup til kamp (kræver klubleder-godkendelse).",
  },
  {
    value: "SECRETARIAT",
    label: "Sekretariat",
    hint: "Kan indtaste hjemmekampe/protokol (kræver klubleder-godkendelse).",
  },
  {
    value: "REFEREE",
    label: "Dommer",
    hint: "Kan melde afbud og opdatere tilgængelighed (kræver dommeradmin-godkendelse).",
  },
];

export default function AddRolePage() {
  const router = useRouter();

  const [role, setRole] = useState<TaRole>("TEAM_LEADER");

  const [clubLeaderTitle, setClubLeaderTitle] = useState<ClubLeaderTitle | null>(null);

  const [referees, setReferees] = useState<Array<{ id: string; name: string; refereeNo: string; club: string | null }>>(
    []
  );
  const [refereeId, setRefereeId] = useState<string | null>(null);

  const [clubs, setClubs] = useState<Array<{ id: string; name: string; clubNo: string | null }>>(
    []
  );
  const [clubId, setClubId] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<string[]>([]);
  const [league, setLeague] = useState<string | null>(null);
  const [teamGender, setTeamGender] = useState<TeamGender | null>(null);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [teamId, setTeamId] = useState<string | null>(null);

  const [loadingLists, setLoadingLists] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hint = ROLE_OPTIONS.find((o) => o.value === role)?.hint ?? "";

  const needsClub = role === "CLUB_LEADER" || role === "SECRETARIAT";
  const needsTeam = role === "TEAM_LEADER";
  const needsClubLeaderTitle = role === "CLUB_LEADER";
  const needsReferee = role === "REFEREE";

  const clubOptions = useMemo(
    () =>
      clubs.map((c) => {
        const no = String(c.clubNo ?? "").trim();
        const nameLabel = c.name;
        return { id: c.id, label: no ? `${nameLabel} (${no})` : nameLabel };
      }),
    [clubs]
  );

  const leagueOptions = useMemo(
    () => leagues.map((l) => ({ id: l, label: l })),
    [leagues]
  );

  const teamOptions = useMemo(
    () => teams.map((t) => ({ id: t.id, label: t.name })),
    [teams]
  );

  const refereeOptions = useMemo(
    () =>
      referees.map((r) => {
        const clubLabel = String(r.club ?? "").trim();
        const base = `${r.name} (${r.refereeNo})`;
        return { id: r.id, label: clubLabel ? `${base} · ${clubLabel}` : base };
      }),
    [referees]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadClubs() {
      setLoadingLists(true);
      try {
        const res = await fetch("/api/public/turnering/clubs", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data?.ok === true && Array.isArray(data?.clubs)) {
          setClubs(data.clubs as Array<{ id: string; name: string; clubNo: string | null }>);
        } else {
          setClubs([]);
        }
      } finally {
        if (!cancelled) setLoadingLists(false);
      }
    }

    void loadClubs();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Reset selections when role changes.
    setClubId(null);
    setLeague(null);
    setTeamGender(null);
    setTeamId(null);
    setLeagues([]);
    setTeams([]);
    setClubLeaderTitle(null);
    setRefereeId(null);
  }, [role]);

  useEffect(() => {
    let cancelled = false;
    async function loadReferees() {
      if (!needsReferee) {
        setReferees([]);
        return;
      }

      const res = await fetch("/api/auth/referees", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (res.ok && data?.ok === true && Array.isArray(data?.referees)) {
        setReferees(
          data.referees as Array<{ id: string; name: string; refereeNo: string; club: string | null }>
        );
      } else {
        setReferees([]);
      }
    }

    void loadReferees();
    return () => {
      cancelled = true;
    };
  }, [needsReferee]);

  useEffect(() => {
    let cancelled = false;
    async function loadLeagues() {
      if (!clubId) {
        setLeagues([]);
        return;
      }
      const res = await fetch(`/api/public/turnering/leagues?clubId=${encodeURIComponent(clubId)}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (res.ok && data?.ok === true && Array.isArray(data?.leagues)) {
        setLeagues(data.leagues as string[]);
      } else {
        setLeagues([]);
      }
    }
    void loadLeagues();
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  useEffect(() => {
    let cancelled = false;
    async function loadTeams() {
      if (!clubId || !league || !teamGender) {
        setTeams([]);
        return;
      }
      const res = await fetch(
        `/api/public/turnering/teams?clubId=${encodeURIComponent(clubId)}&league=${encodeURIComponent(league)}&gender=${encodeURIComponent(teamGender)}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (res.ok && data?.ok === true && Array.isArray(data?.teams)) {
        setTeams(data.teams as Array<{ id: string; name: string }>);
      } else {
        setTeams([]);
      }
    }
    void loadTeams();
    return () => {
      cancelled = true;
    };
  }, [clubId, league, teamGender]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (needsClub && !clubId) {
        setError("Vælg venligst en klub.");
        return;
      }
      if (needsTeam && !teamId) {
        setError("Vælg venligst et hold.");
        return;
      }

      if (needsTeam && !teamGender) {
        setError("Vælg venligst køn (Herre/Dame). ");
        return;
      }

      if (needsClubLeaderTitle && !clubLeaderTitle) {
        setError("Vælg venligst en rolle (Formand/Kassér/Bestyrelsesmedlem). ");
        return;
      }

      if (needsReferee && !refereeId) {
        setError("Vælg venligst en dommer fra dommerlisten.");
        return;
      }

      const res = await fetch("/api/auth/add-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          clubId: needsClub ? clubId : null,
          teamId: needsTeam ? teamId : null,
          clubLeaderTitle: needsClubLeaderTitle ? clubLeaderTitle : null,
          refereeId: needsReferee ? refereeId : null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "Kunne ikke tilføje rolle.");
        return;
      }

      const messageByRole: Record<TaRole, string> = {
        CLUB_LEADER: "Din klubleder-rolle er oprettet og afventer godkendelse.",
        TEAM_LEADER: "Din rolle er oprettet og afventer godkendelse.",
        SECRETARIAT: "Din rolle er oprettet og afventer godkendelse.",
        REFEREE: "Din dommer-rolle er oprettet og afventer godkendelse.",
      };
      setSuccess(messageByRole[role] ?? "Rolle oprettet. Afventer godkendelse.");

      setTimeout(() => {
        router.push("/statistik");
        router.refresh();
      }, 800);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold">Tilføj rolle</h1>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium">Rolle</label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            value={role}
            onChange={(e) => setRole(e.target.value as TaRole)}
            required
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hint ? <p className="mt-1 text-xs text-zinc-600">{hint}</p> : null}
        </div>

        {clubs.length === 0 ? (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
            {loadingLists
              ? "Henter klubber…"
              : "Der er ingen klubber endnu. Turneringsadmin skal først importere Excel og trykke 'Overskriv database'."}
          </div>
        ) : null}

        {needsClub ? (
          <SearchableSelect
            label="Klub"
            placeholder="Søg klub…"
            options={clubOptions}
            valueId={clubId}
            onChange={(id) => setClubId(id)}
            disabled={clubs.length === 0}
          />
        ) : null}

        {needsClubLeaderTitle ? (
          <div>
            <label className="block text-sm font-medium">Rolle</label>
            <select
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
              value={clubLeaderTitle ?? ""}
              onChange={(e) => {
                const v = String(e.target.value ?? "").trim();
                setClubLeaderTitle(v ? (v as ClubLeaderTitle) : null);
              }}
              required
            >
              <option value="" disabled>
                Vælg rolle…
              </option>
              {CLUB_LEADER_TITLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {needsTeam ? (
          <div className="space-y-3">
            <SearchableSelect
              label="Klub"
              placeholder="Søg klub…"
              options={clubOptions}
              valueId={clubId}
              onChange={(id) => {
                setClubId(id);
                setLeague(null);
                setTeamGender(null);
                setTeamId(null);
              }}
              disabled={clubs.length === 0}
            />

            <SearchableSelect
              label="Liga"
              placeholder={clubId ? "Søg liga…" : "Vælg klub først"}
              options={leagueOptions}
              valueId={league}
              onChange={(id) => {
                setLeague(id);
                setTeamGender(null);
                setTeamId(null);
              }}
              disabled={!clubId || leagueOptions.length === 0}
            />

            <div>
              <label className="block text-sm font-medium">Køn</label>
              <select
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
                value={teamGender ?? ""}
                onChange={(e) => {
                  const v = String(e.target.value ?? "").trim();
                  setTeamGender(v ? (v as TeamGender) : null);
                  setTeamId(null);
                }}
                disabled={!clubId || !league}
                required
              >
                <option value="" disabled>
                  Vælg køn…
                </option>
                <option value="MEN">Herre</option>
                <option value="WOMEN">Dame</option>
                <option value="UNKNOWN">Ikke angivet</option>
              </select>
              <p className="mt-1 text-xs text-zinc-600">
                Bruges til at skelne mellem herre-/damehold i samme liga.
              </p>
            </div>

            <SearchableSelect
              label="Hold"
              placeholder={clubId && league ? (teamGender ? "Søg hold…" : "Vælg køn først") : "Vælg klub og liga først"}
              options={teamOptions}
              valueId={teamId}
              onChange={(id) => setTeamId(id)}
              disabled={!clubId || !league || !teamGender || teamOptions.length === 0}
            />
          </div>
        ) : null}

        {needsReferee ? (
          <SearchableSelect
            label="Dommer"
            placeholder="Søg dommer…"
            options={refereeOptions}
            valueId={refereeId}
            onChange={(id) => setRefereeId(id)}
            disabled={refereeOptions.length === 0}
          />
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-green-700">{success}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-[var(--brand)] px-4 py-2 text-[var(--brand-foreground)] disabled:opacity-50"
        >
          {loading ? "Sender..." : "Tilføj"}
        </button>
      </form>
    </main>
  );
}

function SearchableSelect({
  label,
  placeholder,
  options,
  valueId,
  onChange,
  disabled,
}: {
  label: string;
  placeholder: string;
  options: Array<{ id: string; label: string }>;
  valueId: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const selected = options.find((o) => o.id === valueId) ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    return options
      .filter((o) => o.label.toLowerCase().includes(q))
      .slice(0, 50);
  }, [options, query]);

  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <div className="relative">
        <input
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
          value={open ? query : selected?.label ?? query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            onChange(null);
          }}
          placeholder={placeholder}
          onFocus={() => {
            setQuery(selected?.label ?? "");
            setOpen(true);
          }}
          onBlur={() => {
            setTimeout(() => setOpen(false), 120);
          }}
          disabled={disabled}
        />

        {open && !disabled ? (
          <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-600">Ingen resultater.</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={
                    "block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 " +
                    (o.id === valueId ? "bg-zinc-50 font-semibold" : "")
                  }
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(o.id);
                    setQuery(o.label);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
