"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Venue = "Hjemme" | "Ude";

type LineupRow = {
  venue: Venue;
  rowIndex: number;
  cG: string | null;
  number: string | null;
  name: string | null;
  birthday: string | null;
  leader: string | null;
  reserve: string | null;
};

type EventRow = {
  rowIndex: number;
  period: string | null;
  time: string | null;
  side: string | null;
  number: string | null;
  goal: string | null;
  assist: string | null;
  penalty: string | null;
  code: string | null;
};

type RefApproval = {
  refIndex: number;
  name: string;
  refereeNo: string;
  noRef2: boolean;
  approvedAt: string;
};

type CloseData = {
  ok: true;
  status: string;
  startedAt: string | null;
  match: {
    dommer1: string | null;
    dommer1Id: string | null;
    dommer2: string | null;
    dommer2Id: string | null;
  } | null;
  lineups: LineupRow[];
  events: EventRow[];
  refereeApprovals: RefApproval[];
};

function norm(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isLeaderRow(r: LineupRow): boolean {
  return norm(r.leader).toUpperCase() === "L";
}

function isReserveRow(r: LineupRow): boolean {
  return norm(r.reserve).toUpperCase() === "R";
}

function formatDateTime(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("da-DK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-md bg-[color:var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-foreground)]"
          : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
      }
    >
      {children}
    </button>
  );
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  }

  function exportPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    onChange(url);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cssWidth = 560;
    const cssHeight = 180;
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";

    const getPos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const down = (e: PointerEvent) => {
      drawingRef.current = true;
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      (e.target as any)?.setPointerCapture?.(e.pointerId);
    };

    const move = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };

    const up = () => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      exportPng();
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-zinc-300 bg-white p-2">
        <canvas ref={canvasRef} className="block w-full touch-none" />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={clear} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold">
          Ryd
        </button>
        <button type="button" onClick={exportPng} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold">
          Opdater
        </button>
      </div>
    </div>
  );
}

function TeamPreview({ title, rows }: { title: string; rows: LineupRow[] }) {
  const players = rows.filter((r) => !isLeaderRow(r) && (norm(r.number) || norm(r.name)));
  const leaders = rows.filter((r) => isLeaderRow(r) && norm(r.name));

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-zinc-900">{title}</div>

      <div className="overflow-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-[560px] w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-600">
            <tr>
              <th className="px-3 py-2 text-left">Nr</th>
              <th className="px-3 py-2 text-left">C/G</th>
              <th className="px-3 py-2 text-left">Navn</th>
              <th className="px-3 py-2 text-left">Reserve</th>
            </tr>
          </thead>
          <tbody>
            {players.map((r) => (
              <tr key={`${r.venue}-${r.rowIndex}`} className="border-t border-zinc-100">
                <td className="px-3 py-2">{norm(r.number) || "-"}</td>
                <td className="px-3 py-2">{norm(r.cG) || ""}</td>
                <td className="px-3 py-2 font-medium text-zinc-900">{norm(r.name) || "-"}</td>
                <td className="px-3 py-2">{isReserveRow(r) ? "R" : ""}</td>
              </tr>
            ))}
            {leaders.length ? (
              <tr className="border-t border-zinc-200">
                <td colSpan={4} className="px-3 py-2 text-xs text-zinc-600">
                  Ledere: {leaders.map((l) => norm(l.name)).join(", ")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EventsPreview({ events }: { events: EventRow[] }) {
  const meaningful = events.filter((e) => norm(e.period) || norm(e.time) || norm(e.side) || norm(e.number) || norm(e.goal) || norm(e.assist) || norm(e.penalty) || norm(e.code));
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-zinc-900">Events</div>
      {meaningful.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">Ingen events.</div>
      ) : (
        <div className="overflow-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-600">
              <tr>
                <th className="px-2 py-2 text-left">Per</th>
                <th className="px-2 py-2 text-left">Tid</th>
                <th className="px-2 py-2 text-left">H/U</th>
                <th className="px-2 py-2 text-left">Nr</th>
                <th className="px-2 py-2 text-left">Mål</th>
                <th className="px-2 py-2 text-left">Assist</th>
                <th className="px-2 py-2 text-left">Udv</th>
                <th className="px-2 py-2 text-left">Kode</th>
              </tr>
            </thead>
            <tbody>
              {meaningful.map((e) => (
                <tr key={e.rowIndex} className="border-t border-zinc-100">
                  <td className="px-2 py-1">{norm(e.period)}</td>
                  <td className="px-2 py-1">{norm(e.time)}</td>
                  <td className="px-2 py-1">{norm(e.side)}</td>
                  <td className="px-2 py-1">{norm(e.number)}</td>
                  <td className="px-2 py-1">{norm(e.goal)}</td>
                  <td className="px-2 py-1">{norm(e.assist)}</td>
                  <td className="px-2 py-1">{norm(e.penalty)}</td>
                  <td className="px-2 py-1">{norm(e.code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function MatchCloseDialogClient({ kampId }: { kampId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CloseData | null>(null);

  const [tab, setTab] = useState<"resH" | "resU" | "ref">("resH");
  const [refTab, setRefTab] = useState<"home" | "away" | "events" | "ref1" | "ref2">("home");

  const [ref1Name, setRef1Name] = useState("");
  const [ref1No, setRef1No] = useState("");
  const [ref1NoRef2Local, setRef1NoRef2Local] = useState(false);
  const [ref1Sig, setRef1Sig] = useState<string | null>(null);

  const [ref2Name, setRef2Name] = useState("");
  const [ref2No, setRef2No] = useState("");
  const [ref2Sig, setRef2Sig] = useState<string | null>(null);

  const [reservedHomeLocal, setReservedHomeLocal] = useState<Set<string>>(() => new Set());
  const [reservedAwayLocal, setReservedAwayLocal] = useState<Set<string>>(() => new Set());

  const homeRows = useMemo(() => (data?.lineups ?? []).filter((r) => norm(r.venue) === "Hjemme"), [data]);
  const awayRows = useMemo(() => (data?.lineups ?? []).filter((r) => norm(r.venue) === "Ude"), [data]);

  const reservedHomeFromDb = useMemo(() => {
    return new Set(homeRows.filter((r) => !isLeaderRow(r) && isReserveRow(r) && norm(r.number)).map((r) => norm(r.number)));
  }, [homeRows]);
  const reservedAwayFromDb = useMemo(() => {
    return new Set(awayRows.filter((r) => !isLeaderRow(r) && isReserveRow(r) && norm(r.number)).map((r) => norm(r.number)));
  }, [awayRows]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/kamp/close-data/${kampId}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        setError(norm(json?.error) || "Kunne ikke hente data.");
        return;
      }
      setData(json as CloseData);

      const lineups = (json?.lineups ?? []) as LineupRow[];
      const home = lineups.filter((r) => norm((r as any).venue) === "Hjemme");
      const away = lineups.filter((r) => norm((r as any).venue) === "Ude");
      setReservedHomeLocal(
        new Set(home.filter((r) => !isLeaderRow(r) && isReserveRow(r) && norm(r.number)).map((r) => norm(r.number))),
      );
      setReservedAwayLocal(
        new Set(away.filter((r) => !isLeaderRow(r) && isReserveRow(r) && norm(r.number)).map((r) => norm(r.number))),
      );

      // Seed ref state from existing approvals
      const refs: RefApproval[] = (json?.refereeApprovals ?? []) as any;
      const r1 = refs.find((r) => Number(r.refIndex) === 1);
      const r2 = refs.find((r) => Number(r.refIndex) === 2);
      if (r1) {
        setRef1Name(norm(r1.name));
        setRef1No(norm(r1.refereeNo));
        setRef1NoRef2Local(Boolean(r1.noRef2));
      } else {
        const m = json?.match ?? null;
        setRef1Name(norm(m?.dommer1));
        setRef1No(norm(m?.dommer1Id));
      }
      if (r2) {
        setRef2Name(norm(r2.name));
        setRef2No(norm(r2.refereeNo));
      } else {
        const m = json?.match ?? null;
        setRef2Name(norm(m?.dommer2));
        setRef2No(norm(m?.dommer2Id));
      }
    } finally {
      setLoading(false);
    }
  }

  async function saveReserves(venue: Venue, reserved: Set<string>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/kamp/reserves/${kampId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue, reservedNumbers: Array.from(reserved) }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        setError(norm(json?.error) || "Kunne ikke gemme reserver.");
        return;
      }
      await load();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function saveRef(refIndex: 1 | 2) {
    setSaving(true);
    setError(null);
    try {
      const body =
        refIndex === 1
          ? { refIndex: 1, name: ref1Name, refereeNo: ref1No, noRef2: ref1NoRef2Local, signatureDataUrl: ref1Sig }
          : { refIndex: 2, name: ref2Name, refereeNo: ref2No, signatureDataUrl: ref2Sig };

      const res = await fetch(`/api/kamp/referee-approval/${kampId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        setError(norm(json?.error) || "Kunne ikke gemme dommerunderskrift.");
        return false;
      }

      await load();
      router.refresh();
      return true;
    } finally {
      setSaving(false);
    }
  }

  const refApprovals = data?.refereeApprovals ?? [];
  const hasRef1 = refApprovals.some((r) => Number(r.refIndex) === 1);
  const ref1NoRef2FromDb = refApprovals.find((r) => Number(r.refIndex) === 1)?.noRef2 ?? false;
  const hasRef2 = refApprovals.some((r) => Number(r.refIndex) === 2);
  const canClose = hasRef1 && (ref1NoRef2FromDb || hasRef2);

  async function closeMatch() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/kamp/close/${kampId}`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        setError(norm(json?.error) || "Kunne ikke afslutte kamp.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void load();
        }}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900"
      >
        Afslut Kamp
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Afslut Kamp</div>
                <div className="mt-1 text-sm text-zinc-600">
                  KampId {kampId}{data?.startedAt ? ` · Startet: ${formatDateTime(data.startedAt)}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold"
              >
                Luk
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <TabButton active={tab === "resH"} onClick={() => setTab("resH")}>
                  Reserver Hjemme
                </TabButton>
                <TabButton active={tab === "resU"} onClick={() => setTab("resU")}>
                  Reserver Ude
                </TabButton>
                <TabButton active={tab === "ref"} onClick={() => setTab("ref")}>
                  Dommerunderskrift
                </TabButton>
              </div>

              {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div> : null}
              {loading ? <div className="mt-3 text-sm text-zinc-600">Henter…</div> : null}

              {tab === "resH" ? (
                <div className="mt-4 space-y-3">
                  <div className="overflow-auto rounded-xl border border-zinc-200">
                    <table className="min-w-[700px] w-full text-sm">
                      <thead className="bg-zinc-50 text-xs text-zinc-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Reserve</th>
                          <th className="px-3 py-2 text-left">Nr</th>
                          <th className="px-3 py-2 text-left">C/G</th>
                          <th className="px-3 py-2 text-left">Navn</th>
                        </tr>
                      </thead>
                      <tbody>
                        {homeRows
                          .filter((r) => !isLeaderRow(r) && (norm(r.number) || norm(r.name)))
                          .map((r) => {
                            const n = norm(r.number);
                            const checked = n ? reservedHomeLocal.has(n) : false;
                            return (
                              <tr key={`h-${r.rowIndex}`} className="border-t border-zinc-100">
                                <td className="px-3 py-2">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!n}
                                    onChange={(e) => {
                                      setReservedHomeLocal((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(n);
                                        else next.delete(n);
                                        return next;
                                      });
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-2">{n}</td>
                                <td className="px-3 py-2">{norm(r.cG)}</td>
                                <td className="px-3 py-2 font-medium text-zinc-900">{norm(r.name)}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-zinc-600">Valgt: {reservedHomeLocal.size}</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setReservedHomeLocal(new Set(reservedHomeFromDb))}
                        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60"
                      >
                        Fortryd
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void saveReserves("Hjemme", reservedHomeLocal)}
                        className="rounded-md bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-60"
                      >
                        {saving ? "Gemmer…" : "Gem"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === "resU" ? (
                <div className="mt-4 space-y-3">
                  <div className="overflow-auto rounded-xl border border-zinc-200">
                    <table className="min-w-[700px] w-full text-sm">
                      <thead className="bg-zinc-50 text-xs text-zinc-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Reserve</th>
                          <th className="px-3 py-2 text-left">Nr</th>
                          <th className="px-3 py-2 text-left">C/G</th>
                          <th className="px-3 py-2 text-left">Navn</th>
                        </tr>
                      </thead>
                      <tbody>
                        {awayRows
                          .filter((r) => !isLeaderRow(r) && (norm(r.number) || norm(r.name)))
                          .map((r) => {
                            const n = norm(r.number);
                            const checked = n ? reservedAwayLocal.has(n) : false;
                            return (
                              <tr key={`u-${r.rowIndex}`} className="border-t border-zinc-100">
                                <td className="px-3 py-2">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!n}
                                    onChange={(e) => {
                                      setReservedAwayLocal((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(n);
                                        else next.delete(n);
                                        return next;
                                      });
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-2">{n}</td>
                                <td className="px-3 py-2">{norm(r.cG)}</td>
                                <td className="px-3 py-2 font-medium text-zinc-900">{norm(r.name)}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-zinc-600">Valgt: {reservedAwayLocal.size}</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setReservedAwayLocal(new Set(reservedAwayFromDb))}
                        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60"
                      >
                        Fortryd
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void saveReserves("Ude", reservedAwayLocal)}
                        className="rounded-md bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-60"
                      >
                        {saving ? "Gemmer…" : "Gem"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === "ref" ? (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <TabButton active={refTab === "home"} onClick={() => setRefTab("home")}>
                      Hjemme
                    </TabButton>
                    <TabButton active={refTab === "away"} onClick={() => setRefTab("away")}>
                      Ude
                    </TabButton>
                    <TabButton active={refTab === "events"} onClick={() => setRefTab("events")}>
                      Events
                    </TabButton>
                    <TabButton active={refTab === "ref1"} onClick={() => setRefTab("ref1")}>
                      Dommer 1
                    </TabButton>
                    <TabButton active={refTab === "ref2"} onClick={() => setRefTab("ref2")}>
                      Dommer 2
                    </TabButton>
                  </div>

                  {refTab === "home" ? <TeamPreview title="Hjemmehold" rows={homeRows} /> : null}
                  {refTab === "away" ? <TeamPreview title="Udehold" rows={awayRows} /> : null}
                  {refTab === "events" ? <EventsPreview events={data?.events ?? []} /> : null}

                  {refTab === "ref1" ? (
                    <div className="space-y-3">
                      <div className="text-sm font-semibold text-zinc-900">Dommer 1</div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-sm font-semibold text-zinc-900">Navn</div>
                          <input
                            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                            value={ref1Name}
                            onChange={(e) => setRef1Name(e.target.value)}
                          />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-zinc-900">Dommernummer</div>
                          <input
                            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                            value={ref1No}
                            onChange={(e) => setRef1No(e.target.value)}
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-sm text-zinc-900">
                        <input type="checkbox" checked={ref1NoRef2Local} onChange={(e) => setRef1NoRef2Local(e.target.checked)} />
                        Der er ingen Dommer 2
                      </label>

                      <SignaturePad onChange={setRef1Sig} />

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={saving || !norm(ref1Name) || !norm(ref1No) || !ref1Sig}
                          onClick={() =>
                            void (async () => {
                              const ok = await saveRef(1);
                              if (ok && ref1NoRef2Local) {
                                await closeMatch();
                              }
                            })()
                          }
                          className="rounded-md bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-60"
                        >
                          {saving ? "Gemmer…" : ref1NoRef2Local ? "Godkend & Afslut" : "Godkend"}
                        </button>
                        {hasRef1 ? <div className="text-sm text-green-700">Godkendt ✓</div> : null}
                      </div>
                    </div>
                  ) : null}

                  {refTab === "ref2" ? (
                    <div className="space-y-3">
                      <div className="text-sm font-semibold text-zinc-900">Dommer 2</div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-sm font-semibold text-zinc-900">Navn</div>
                          <input
                            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                            value={ref2Name}
                            onChange={(e) => setRef2Name(e.target.value)}
                            disabled={ref1NoRef2Local}
                          />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-zinc-900">Dommernummer</div>
                          <input
                            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                            value={ref2No}
                            onChange={(e) => setRef2No(e.target.value)}
                            disabled={ref1NoRef2Local}
                          />
                        </div>
                      </div>

                      {ref1NoRef2Local ? (
                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                          Dommer 2 er markeret som ikke-tilstede.
                        </div>
                      ) : (
                        <>
                          <SignaturePad onChange={setRef2Sig} />
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              disabled={saving || !norm(ref2Name) || !norm(ref2No) || !ref2Sig}
                              onClick={() => void saveRef(2)}
                              className="rounded-md bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-60"
                            >
                              {saving ? "Gemmer…" : "Godkend"}
                            </button>
                            {hasRef2 ? <div className="text-sm text-green-700">Godkendt ✓</div> : null}
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-end gap-3 border-t border-zinc-200 pt-4">
                    <button
                      type="button"
                      disabled={saving || !canClose}
                      onClick={() => void closeMatch()}
                      className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {saving ? "Afslutter…" : "Afslut Kamp"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
