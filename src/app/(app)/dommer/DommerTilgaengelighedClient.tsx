"use client";

import { useEffect, useMemo, useState } from "react";

type AvailabilitySegment = {
  date: string; // YYYY-MM-DD
  status: "AVAILABLE" | "UNAVAILABLE";
  startTime: string | null; // HH:MM
  endTime: string | null; // HH:MM
};

type LoadResponse = {
  segments: AvailabilitySegment[];
  matches?: Array<{
    externalId: string | null;
    date: string | null; // YYYY-MM-DD
    time: string | null; // HH:MM
    league: string | null;
    venue: string | null;
    homeTeam: string;
    awayTeam: string;
  }>;
  message?: string;
};

type Rule = {
  id: string;
  weekday: number; // 0=Mon..6=Sun
  status: "AVAILABLE" | "UNAVAILABLE";
  startTime: string | null;
  endTime: string | null;
};

type RulesResponse = {
  rules: Rule[];
  message?: string;
};

type EditorSegment = {
  id: string;
  status: "AVAILABLE" | "UNAVAILABLE";
  mode: "HELE" | "TIMERUM";
  startTime: string;
  endTime: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateKeyUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function monthLabelDa(year: number, monthIndex0: number) {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  return new Intl.DateTimeFormat("da-DK", { month: "long", year: "numeric" }).format(d);
}

function mondayIndexFromJsDay(jsDay: number) {
  // JS: 0=Sun..6=Sat -> Monday-first index: 0=Mon..6=Sun
  return (jsDay + 6) % 7;
}

function uid() {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID() as string;
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildMonthGrid(year: number, monthIndex0: number) {
  const first = new Date(Date.UTC(year, monthIndex0, 1));
  const firstDow = mondayIndexFromJsDay(first.getUTCDay());
  const daysInMonth = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();

  const cells: Array<{ date: Date | null; day: number | null }> = [];

  for (let i = 0; i < firstDow; i += 1) cells.push({ date: null, day: null });

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: new Date(Date.UTC(year, monthIndex0, day)), day });
  }

  while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
  while (cells.length < 42) cells.push({ date: null, day: null });

  return cells;
}

function buildTimeOptions(stepMinutes = 30) {
  const out: string[] = [];
  for (let hh = 0; hh <= 23; hh += 1) {
    for (let mm = 0; mm < 60; mm += stepMinutes) {
      out.push(`${pad2(hh)}:${pad2(mm)}`);
    }
  }
  return out;
}

export default function DommerTilgaengelighedClient() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex0, setMonthIndex0] = useState(now.getMonth());

  const [segments, setSegments] = useState<AvailabilitySegment[]>([]);
  const [matches, setMatches] = useState<
    Array<{
      externalId: string | null;
      date: string | null;
      time: string | null;
      league: string | null;
      venue: string | null;
      homeTeam: string;
      awayTeam: string;
    }>
  >([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [editorSegments, setEditorSegments] = useState<EditorSegment[]>([]);
  const [selectedUsesRules, setSelectedUsesRules] = useState(false);

  const [newRuleWeekday, setNewRuleWeekday] = useState<number>(0);
  const newRuleStatus: "UNAVAILABLE" = "UNAVAILABLE";
  const [newRuleMode, setNewRuleMode] = useState<"HELE" | "TIMERUM">("HELE");
  const [newRuleStart, setNewRuleStart] = useState<string>("18:00");
  const [newRuleEnd, setNewRuleEnd] = useState<string>("20:00");

  const segmentsByDate = useMemo(() => {
    const m = new Map<string, AvailabilitySegment[]>();
    for (const s of segments) {
      const arr = m.get(s.date) ?? [];
      arr.push(s);
      m.set(s.date, arr);
    }
    return m;
  }, [segments]);

  const timeOptions = useMemo(() => buildTimeOptions(30), []);

  const headerDays = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

  function go(deltaMonths: number) {
    const d = new Date(year, monthIndex0 + deltaMonths, 1);
    setYear(d.getFullYear());
    setMonthIndex0(d.getMonth());
    setSelectedDate(null);
  }

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/dommer/tilgaengelighed?year=${year}&month=${monthIndex0 + 1}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      const data = (await res.json()) as LoadResponse;
      if (!res.ok) throw new Error(data.message || "Kunne ikke hente tilgængelighed.");
      setSegments((data.segments || []).filter((s) => s.status === "UNAVAILABLE"));
      setMatches((data.matches || []).filter((m) => m.date));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setLoading(false);
    }
  }

  async function loadRules() {
    setRulesLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/dommer/tilgaengelighed/rules`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      const data = (await res.json()) as RulesResponse;
      if (!res.ok) throw new Error(data.message || "Kunne ikke hente faste regler.");
      setRules(data.rules || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setRulesLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, monthIndex0]);

  useEffect(() => {
    void loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function effectiveSegmentsForDate(date: Date): AvailabilitySegment[] {
    const key = dateKeyUTC(date);
    const explicit = (segmentsByDate.get(key) ?? []).filter((s) => s.status === "UNAVAILABLE");
    if (explicit.length > 0) return explicit;

    const weekday = mondayIndexFromJsDay(date.getUTCDay());
    const fromRules = rules
      .filter((r) => r.weekday === weekday)
      .map((r) => ({
        date: key,
        status: r.status,
        startTime: r.startTime,
        endTime: r.endTime,
      }));

    return fromRules.filter((s) => s.status === "UNAVAILABLE");
  }

  useEffect(() => {
    if (!selectedDate) return;
    const key = dateKeyUTC(selectedDate);
    const explicit = (segmentsByDate.get(key) ?? []).filter((s) => s.status === "UNAVAILABLE");
    const usesRules = explicit.length === 0;

    const eff = effectiveSegmentsForDate(selectedDate);
    setSelectedUsesRules(usesRules && eff.length > 0);
    setEditorSegments(
      eff.map((s) => ({
        id: uid(),
        status: "UNAVAILABLE",
        mode: s.startTime && s.endTime ? "TIMERUM" : "HELE",
        startTime: s.startTime ?? "18:00",
        endTime: s.endTime ?? "20:00",
      }))
    );
  }, [selectedDate, segmentsByDate, rules]);

  async function saveDay() {
    if (!selectedDate) return;

    setSaving(true);
    setError(null);

    try {
      const date = dateKeyUTC(selectedDate);
      const payload: any = {
        date,
        segments: editorSegments.map((s) => ({
          status: "UNAVAILABLE",
          mode: s.mode,
          startTime: s.mode === "TIMERUM" ? s.startTime : null,
          endTime: s.mode === "TIMERUM" ? s.endTime : null,
        })),
      };

      const res = await fetch(`/api/dommer/tilgaengelighed`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(data.message || "Kunne ikke gemme.");

      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setSaving(false);
    }
  }

  async function addRule() {
    setSavingRule(true);
    setError(null);

    try {
      const payload: any = {
        weekday: newRuleWeekday,
        status: newRuleStatus,
        mode: newRuleMode,
        startTime: newRuleMode === "TIMERUM" ? newRuleStart : null,
        endTime: newRuleMode === "TIMERUM" ? newRuleEnd : null,
      };

      const res = await fetch(`/api/dommer/tilgaengelighed/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as { ok?: boolean; id?: string; message?: string };
      if (!res.ok) throw new Error(data.message || "Kunne ikke gemme.");

      await loadRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setSavingRule(false);
    }
  }

  async function deleteRule(ruleId: string) {
    setSavingRule(true);
    setError(null);

    try {
      const res = await fetch(`/api/dommer/tilgaengelighed/rules/${encodeURIComponent(ruleId)}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });

      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(data.message || "Kunne ikke slette.");

      await loadRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setSavingRule(false);
    }
  }

  const cells = useMemo(() => buildMonthGrid(year, monthIndex0), [year, monthIndex0]);
  const monthLabel = monthLabelDa(year, monthIndex0);

  const matchesByDate = useMemo(() => {
    const m = new Map<string, Array<{ time: string | null; homeTeam: string; awayTeam: string; league: string | null; venue: string | null }>>();
    for (const item of matches) {
      const key = String(item.date ?? "").slice(0, 10);
      if (!key) continue;
      const list = m.get(key) ?? [];
      list.push({
        time: item.time,
        homeTeam: item.homeTeam,
        awayTeam: item.awayTeam,
        league: item.league,
        venue: item.venue,
      });
      m.set(key, list);
    }
    for (const [k, list] of m) {
      list.sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? "")));
      m.set(k, list);
    }
    return m;
  }, [matches]);

  function tooltipTextForDateKey(dateKey: string): string {
    const list = matchesByDate.get(dateKey) ?? [];
    if (list.length === 0) return "";
    const lines = list.map((m) => {
      const time = m.time ? m.time : "";
      const vs = `${m.homeTeam} – ${m.awayTeam}`;
      const tail = [m.league, m.venue].filter(Boolean).join(" · ");
      return [time, vs].filter(Boolean).join(" ") + (tail ? ` (${tail})` : "");
    });
    return lines.join("\n");
  }

  function unavailableTextFor(segmentsForDay: AvailabilitySegment[]): string {
    const unavailable = segmentsForDay.filter((s) => s.status === "UNAVAILABLE");
    if (unavailable.length === 0) return "";
    if (unavailable.some((s) => !s.startTime || !s.endTime)) return "Hele dagen";

    const ranges = unavailable
      .filter((s) => s.startTime && s.endTime)
      .map((s) => `${s.startTime}–${s.endTime}`)
      .sort();

    if (ranges.length === 0) return "";
    if (ranges.length === 1) return ranges[0]!;
    return `${ranges[0]} (+${ranges.length - 1})`;
  }

  function flagsFor(segmentsForDay: AvailabilitySegment[]) {
    const hasUnavailable = segmentsForDay.some((s) => s.status === "UNAVAILABLE");
    const wholeUnavailable = segmentsForDay.some((s) => s.status === "UNAVAILABLE" && (!s.startTime || !s.endTime));
    return { hasUnavailable, wholeUnavailable };
  }

  const legend = (
    <div className="mt-4 flex items-center gap-4 text-sm">
      <div className="flex items-center gap-2">
        <span className="inline-block h-4 w-4 rounded bg-red-700 ring-1 ring-inset ring-red-600" />
        <span>Ikke tilgængelig</span>
      </div>
    </div>
  );

  return (
    <div>
      <div className="font-semibold text-zinc-900">Tilgængelighed</div>
      <div className="mt-1 text-zinc-600">Marker kun dage/tidsrum hvor du ikke er tilgængelig. Alle andre dage antages tilgængelige.</div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => go(-1)}
          className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-300"
        >
          ◀
        </button>

        <div className="text-xl font-semibold text-zinc-900">{monthLabel}</div>

        <button
          type="button"
          onClick={() => go(1)}
          className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-300"
        >
          ▶
        </button>
      </div>

      {loading ? <div className="mt-3 text-sm text-zinc-600">Henter…</div> : null}
      {error ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-100">
        <div className="grid grid-cols-7 bg-zinc-950/40 text-xs font-semibold text-zinc-300">
          {headerDays.map((h) => (
            <div key={h} className="px-3 py-2">
              {h}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((c, idx) => {
            const key = c.date ? dateKeyUTC(c.date) : `empty-${idx}`;
            const isSelected = Boolean(selectedDate && c.date && dateKeyUTC(selectedDate) === dateKeyUTC(c.date));

            const eff = c.date ? effectiveSegmentsForDate(c.date) : [];
            const { hasUnavailable, wholeUnavailable } = flagsFor(eff);
            const unavailableText = unavailableTextFor(eff);

            const ring = isSelected ? "ring-2 ring-inset ring-[color:var(--brand)]" : "";

            const tooltip = c.date ? tooltipTextForDateKey(dateKeyUTC(c.date)) : "";

            return (
              <button
                key={key}
                type="button"
                disabled={!c.date}
                onClick={() => setSelectedDate(c.date)}
                title={tooltip}
                className={
                  "relative h-24 w-full overflow-hidden border-t border-zinc-800 px-3 py-2 text-left " +
                  (idx % 7 !== 0 ? "border-l border-zinc-800 " : "") +
                  ring +
                  (c.date ? " hover:brightness-110" : " bg-zinc-900")
                }
              >
                <div className={"absolute inset-0 " + (c.date ? "bg-zinc-800" : "bg-zinc-900")} />

                {c.date ? (
                  wholeUnavailable ? (
                    <div className="absolute inset-0 bg-red-700" />
                  ) : hasUnavailable ? (
                    <div
                      className="absolute inset-0 bg-red-700"
                      style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
                    />
                  ) : null
                ) : null}

                <div className="relative">
                <div className="text-sm font-semibold text-zinc-100">{c.day ?? ""}</div>
                {unavailableText ? (
                  <div className="mt-1 text-xs text-zinc-100/90">{unavailableText}</div>
                ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {legend}

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm font-semibold text-zinc-900">
          {selectedDate ? `Valgt dato: ${selectedDate.toLocaleDateString("da-DK")}` : "Vælg en dag i kalenderen"}
        </div>

        {selectedDate ? (
          <div className="mt-3">
            {selectedUsesRules ? (
              <div className="mb-2 text-xs text-zinc-600">Dagen viser faste regler (hvis ingen gemte tidsrum).</div>
            ) : null}

            <div className="space-y-2">
              {editorSegments.length === 0 ? (
                <div className="rounded-lg border border-zinc-200 p-3 text-sm text-zinc-600">
                  Ingen tidsrum endnu. Brug “Tilføj” knapperne nedenfor.
                </div>
              ) : null}
              {editorSegments.map((seg, index) => (
                <div key={seg.id} className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-3">
                  <div className="text-sm font-semibold text-zinc-800">Ikke tilgængelig</div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700">Type</label>
                    <select
                      value={seg.mode}
                      onChange={(e) => {
                        const v = e.target.value as any;
                        setEditorSegments((prev) => prev.map((p) => (p.id === seg.id ? { ...p, mode: v } : p)));
                      }}
                      className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                    >
                      <option value="HELE">Hele dagen</option>
                      <option value="TIMERUM">Tidsrum</option>
                    </select>
                  </div>

                  {seg.mode === "TIMERUM" ? (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700">Start</label>
                        <select
                          value={seg.startTime}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEditorSegments((prev) =>
                              prev.map((p) => (p.id === seg.id ? { ...p, startTime: v } : p))
                            );
                          }}
                          className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                        >
                          {timeOptions.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-700">Slut</label>
                        <select
                          value={seg.endTime}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEditorSegments((prev) => prev.map((p) => (p.id === seg.id ? { ...p, endTime: v } : p)));
                          }}
                          className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                        >
                          {timeOptions.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setEditorSegments((prev) => prev.filter((p) => p.id !== seg.id))}
                    className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-200"
                    aria-label={`Fjern segment ${index + 1}`}
                  >
                    Fjern
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setEditorSegments((prev) => [
                    ...prev,
                    { id: uid(), status: "UNAVAILABLE", mode: "TIMERUM", startTime: "18:00", endTime: "20:00" },
                  ])
                }
                className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-300"
              >
                Tilføj tidsrum (ikke tilgængelig)
              </button>

              <button
                type="button"
                onClick={() =>
                  setEditorSegments((prev) => [
                    ...prev,
                    { id: uid(), status: "UNAVAILABLE", mode: "HELE", startTime: "18:00", endTime: "20:00" },
                  ])
                }
                className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-300"
              >
                Tilføj hele dagen (ikke tilgængelig)
              </button>

              <button
                type="button"
                onClick={() => void saveDay()}
                disabled={saving}
                className={
                  "rounded-lg px-4 py-2 text-sm font-semibold " +
                  (saving
                    ? "bg-zinc-200 text-zinc-700"
                    : "bg-[color:var(--brand)] text-[var(--brand-foreground)]")
                }
              >
                {saving ? "Gemmer…" : "Gem"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm font-semibold text-zinc-900">Faste regler</div>
        <div className="mt-1 text-sm text-zinc-600">Tilføj tilbagevendende utilgængelighed (fx hver mandag).</div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-700">Ugedag</label>
            <select
              value={newRuleWeekday}
              onChange={(e) => setNewRuleWeekday(Number(e.target.value))}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
            >
              <option value={0}>Mandag</option>
              <option value={1}>Tirsdag</option>
              <option value={2}>Onsdag</option>
              <option value={3}>Torsdag</option>
              <option value={4}>Fredag</option>
              <option value={5}>Lørdag</option>
              <option value={6}>Søndag</option>
            </select>
          </div>

          <div className="pb-1 text-sm font-semibold text-zinc-800">Ikke tilgængelig</div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700">Type</label>
            <select
              value={newRuleMode}
              onChange={(e) => setNewRuleMode(e.target.value as any)}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
            >
              <option value="HELE">Hele dagen</option>
              <option value="TIMERUM">Tidsrum</option>
            </select>
          </div>

          {newRuleMode === "TIMERUM" ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-zinc-700">Start</label>
                <select
                  value={newRuleStart}
                  onChange={(e) => setNewRuleStart(e.target.value)}
                  className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                >
                  {timeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700">Slut</label>
                <select
                  value={newRuleEnd}
                  onChange={(e) => setNewRuleEnd(e.target.value)}
                  className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                >
                  {timeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}

          <button
            type="button"
            onClick={() => void addRule()}
            disabled={savingRule}
            className={
              "rounded-lg px-4 py-2 text-sm font-semibold " +
              (savingRule
                ? "bg-zinc-200 text-zinc-700"
                : "bg-[color:var(--brand)] text-[var(--brand-foreground)]")
            }
          >
            {savingRule ? "Gemmer…" : "Tilføj"}
          </button>
        </div>

        {rulesLoading ? <div className="mt-3 text-sm text-zinc-600">Henter faste regler…</div> : null}

        {rules.length > 0 ? (
          <div className="mt-3 space-y-2">
            {rules.map((r) => {
              const weekdayLabel = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"][
                r.weekday
              ];
              const text =
                r.startTime && r.endTime ? `${r.startTime}–${r.endTime}` : "Hele dagen";
              if (r.status !== "UNAVAILABLE") return null;

              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3">
                  <div className="text-sm text-zinc-900">
                    <span className="font-semibold">{weekdayLabel}</span>: Ikke tilgængelig ({text})
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteRule(r.id)}
                    disabled={savingRule}
                    className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-200"
                  >
                    Slet
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
