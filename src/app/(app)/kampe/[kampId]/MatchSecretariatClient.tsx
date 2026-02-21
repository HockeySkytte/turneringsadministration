"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MatchEventsEntryClient from "./MatchEventsEntryClient";
import MatchCloseDialogClient from "./MatchCloseDialogClient";

type Venue = "Hjemme" | "Ude";

type LineupRow = {
  rowIndex: number;
  role: string;
  number: string;
  name: string;
  born: string;
  reserve: string;
  leader: string;
};

type SideProps = {
  teamName: string;
  players: LineupRow[];
  leaders: LineupRow[];
  approved: boolean;
  approvalLeaderName: string | null;
  approvalSignatureDataUrl: string | null;
};

type TabKey = "home" | "away" | "start" | "events";

function norm(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function formatDateTime(value: string | Date | null) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("da-DK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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

function LineupTable({ title, rows }: { title: string; rows: LineupRow[] }) {
  const meaningful = rows.filter((r) => norm(r.name) || norm(r.number) || norm(r.role) || norm(r.born));

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-zinc-700">{title}</div>
      {meaningful.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">Ingen rækker.</div>
      ) : (
        <div className="overflow-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Rolle</th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">#</th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Navn</th>
                <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">Født</th>
              </tr>
            </thead>
            <tbody>
              {meaningful.map((r, idx) => (
                <tr key={`${r.rowIndex}-${r.number}-${r.name}-${idx}`} className={idx % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">{r.role || "-"}</td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">{r.number || "-"}</td>
                  <td className="border-b border-zinc-100 px-3 py-2 font-medium text-zinc-900">{r.name || "-"}</td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">{r.born || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string | null) => void;
}) {
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

    const cssWidth = 640;
    const cssHeight = 220;
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

function SideTab({
  kampId,
  venue,
  side,
}: {
  kampId: number;
  venue: Venue;
  side: SideProps;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leaderOptions = useMemo(() => {
    return (side.leaders ?? [])
      .map((r) => norm(r.name))
      .filter(Boolean)
      .filter((v, idx, arr) => arr.findIndex((x) => x.toLocaleLowerCase("da-DK") === v.toLocaleLowerCase("da-DK")) === idx);
  }, [side.leaders]);

  const [selectedLeader, setSelectedLeader] = useState<string>("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedLeader(leaderOptions[0] ?? "");
    setSignatureDataUrl(null);
    setError(null);
  }, [open, leaderOptions]);

  async function approve() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/kamp/holdliste-approval/${kampId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue, leaderName: selectedLeader, signatureDataUrl }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        setError(norm(json?.error) || "Kunne ikke godkende.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-900">{side.teamName}</div>
            <div className="mt-1 text-xs text-zinc-600">Spillere først, derefter ledere.</div>
          </div>
          <div className="text-sm">
            {side.approved ? (
              <span className="rounded-md bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">Godkendt</span>
            ) : (
              <span className="rounded-md bg-yellow-50 px-2 py-1 text-xs font-semibold text-yellow-700">Ikke godkendt</span>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <LineupTable title="Spillere" rows={side.players} />
          <LineupTable title="Ledere" rows={side.leaders} />
        </div>

        {side.approved ? (
          <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
            Godkendt af: <span className="font-semibold">{side.approvalLeaderName ?? ""}</span>
            {side.approvalSignatureDataUrl ? (
              <div className="mt-2">
                <img
                  alt="Underskrift"
                  src={side.approvalSignatureDataUrl}
                  className="max-w-full rounded-md border border-zinc-200 bg-white"
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-end">
            <button
              type="button"
              disabled={leaderOptions.length === 0}
              onClick={() => setOpen(true)}
              className="rounded-md bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-60"
            >
              Underskriv
            </button>
          </div>
        )}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div className="text-sm font-semibold text-zinc-900">Underskriv og godkend</div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                Luk
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-zinc-700">Leder</div>
                <select
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  value={selectedLeader}
                  onChange={(e) => setSelectedLeader(e.target.value)}
                >
                  {leaderOptions.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                {leaderOptions.length === 0 ? (
                  <div className="text-xs text-zinc-600">Der er ingen ledere på holdlisten.</div>
                ) : null}
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold text-zinc-700">Underskrift</div>
                <SignaturePad onChange={setSignatureDataUrl} />
                <div className="text-xs text-zinc-600">Tegn med mus/finger i feltet.</div>
              </div>

              {error ? <div className="text-sm font-semibold text-red-700">Fejl: {error}</div> : null}

              <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900"
                >
                  Annuller
                </button>
                <button
                  type="button"
                  disabled={saving || !selectedLeader || !signatureDataUrl}
                  onClick={approve}
                  className="rounded-md bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-60"
                >
                  {saving ? "Godkender…" : "Godkend"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function MatchSecretariatClient({
  kampId,
  home,
  away,
  startedAt,
}: {
  kampId: number;
  home: SideProps;
  away: SideProps;
  startedAt: Date | string | null;
}) {
  const router = useRouter();

  const [tab, setTab] = useState<TabKey>("home");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const canStart = home.approved && away.approved;
  const started = Boolean(startedAt);

  async function startMatch() {
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch(`/api/kamp/start/${kampId}`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        setStartError(norm(json?.error) || "Kunne ikke starte kamp.");
        return;
      }
      router.refresh();
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <TabButton active={tab === "home"} onClick={() => setTab("home")}>
          Hjemmehold{home.approved ? " ✓" : ""}
        </TabButton>
        <TabButton active={tab === "away"} onClick={() => setTab("away")}>
          Udehold{away.approved ? " ✓" : ""}
        </TabButton>
        <TabButton active={tab === "start"} onClick={() => setTab("start")}>
          Start Kamp{started ? " ✓" : ""}
        </TabButton>
        <TabButton active={tab === "events"} onClick={() => setTab("events")}>
          Events
        </TabButton>
      </div>

      {tab === "home" ? <SideTab kampId={kampId} venue="Hjemme" side={home} /> : null}
      {tab === "away" ? <SideTab kampId={kampId} venue="Ude" side={away} /> : null}

      {tab === "start" ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">Start Kamp</div>
          <div className="mt-1 text-sm text-zinc-700">
            Kampen kan først startes, når <span className="font-semibold">begge</span> holdlister er godkendt.
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={!canStart || starting}
              onClick={startMatch}
              className="rounded-md bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-60"
            >
              {starting ? "Starter…" : "Start kamp"}
            </button>
            {!canStart ? (
              <div className="text-sm text-zinc-600">Mangler godkendelse på én eller begge holdlister.</div>
            ) : null}
          </div>

          {startedAt ? (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-green-50 p-3 text-sm text-green-800">
              Kamp startet: <span className="font-semibold">{formatDateTime(startedAt)}</span>
            </div>
          ) : null}

          {startError ? <div className="mt-3 text-sm font-semibold text-red-700">Fejl: {startError}</div> : null}
        </div>
      ) : null}

      {tab === "events" ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          {!started ? (
            <div className="text-sm text-zinc-700">Start kampen først for at indtaste events.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-end">
                <MatchCloseDialogClient kampId={kampId} />
              </div>
              <MatchEventsEntryClient kampId={kampId} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
