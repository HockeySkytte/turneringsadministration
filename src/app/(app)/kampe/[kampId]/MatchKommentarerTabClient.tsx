"use client";

import { useEffect, useMemo, useState } from "react";

type CommentItem = {
  id: string;
  message: string;
  createdAt: string;
  author: string;
};

type MoveRequest = {
  id: string;
  status: string;
  proposedDate: string | null;
  proposedTime: string | null;
  note: string | null;
  rejectionReason: string | null;
  createdAt: string;
  createdBy: string;
  awayDecidedAt: string | null;
  awayDecidedBy: string | null;
  taDecidedAt: string | null;
  taDecidedBy: string | null;
};

function norm(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function fmtDateTimeIso(value: string | null): string {
  const v = norm(value);
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("da-DK", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function MatchKommentarerTabClient({ kampId }: { kampId: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [message, setMessage] = useState<string>("");
  const [sending, setSending] = useState(false);

  const [moveLoading, setMoveLoading] = useState(false);
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  const [flags, setFlags] = useState<{
    isHomeLeader: boolean;
    isAwayLeader: boolean;
    isHomeClubLeader?: boolean;
    isAwayClubLeader?: boolean;
    isAdminLike: boolean;
  } | null>(null);

  const [proposedDate, setProposedDate] = useState<string>("");
  const [proposedTime, setProposedTime] = useState<string>("");
  const [note, setNote] = useState<string>("");

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const [cRes, mRes] = await Promise.all([
        fetch(`/api/kamp/comments/${encodeURIComponent(String(kampId))}`, { cache: "no-store" }),
        fetch(`/api/kamp/move-request/${encodeURIComponent(String(kampId))}`, { cache: "no-store" }),
      ]);

      const cData = (await cRes.json().catch(() => null)) as any;
      if (!cRes.ok) throw new Error(cData?.message ?? "Kunne ikke hente kommentarer.");

      const mData = (await mRes.json().catch(() => null)) as any;
      if (!mRes.ok) throw new Error(mData?.message ?? "Kunne ikke hente kampflytning.");

      setComments(Array.isArray(cData?.comments) ? (cData.comments as CommentItem[]) : []);
      setMoveRequest((mData?.moveRequest as MoveRequest) ?? null);
      setFlags((mData?.flags as any) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kampId]);

  const isHomeLeader = Boolean(flags?.isHomeLeader);
  const isAwayLeader = Boolean(flags?.isAwayLeader);
  const isHomeClubLeader = Boolean(flags?.isHomeClubLeader);
  const isAdminLike = Boolean(flags?.isAdminLike);

  const canCreateMoveRequest = isHomeLeader || isHomeClubLeader;
  const showMoveSection = Boolean(moveRequest) || canCreateMoveRequest || isAwayLeader || isAdminLike;

  const moveStatusText = useMemo(() => {
    const s = norm(moveRequest?.status).toUpperCase();
    if (!s) return null;
    if (s === "PENDING_AWAY") return "Afventer udeholdets accept";
    if (s === "PENDING_TA") return "Afventer Turneringsadmin";
    if (s === "APPROVED") return "Godkendt";
    if (s === "REJECTED") return "Afvist";
    return s;
  }, [moveRequest?.status]);

  async function sendComment() {
    const text = norm(message);
    if (!text) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/kamp/comments/${encodeURIComponent(String(kampId))}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.message ?? "Kunne ikke gemme kommentar.");

      setMessage("");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setSending(false);
    }
  }

  async function createMoveRequest() {
    setMoveLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/kamp/move-request/${encodeURIComponent(String(kampId))}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          proposedDate: norm(proposedDate) || null,
          proposedTime: norm(proposedTime) || null,
          note: norm(note) || null,
        }),
      });

      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.message ?? "Kunne ikke oprette anmodning.");

      setProposedDate("");
      setProposedTime("");
      setNote("");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setMoveLoading(false);
    }
  }

  async function acceptMoveRequest() {
    if (!confirm("Accepter kampflytning?")) return;

    setMoveLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/kamp/move-request/${encodeURIComponent(String(kampId))}/accept`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });

      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.message ?? "Kunne ikke acceptere.");

      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setMoveLoading(false);
    }
  }

  async function rejectMoveRequest() {
    const reason = prompt("Skriv kort begrundelse (valgfri):", "");
    if (reason === null) return;

    setMoveLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/kamp/move-request/${encodeURIComponent(String(kampId))}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ reason }),
      });

      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.message ?? "Kunne ikke afvise.");

      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setMoveLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {loading ? <div className="text-sm text-zinc-600">Henter…</div> : null}
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      {showMoveSection ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">Kampflytning</div>
          <div className="mt-1 text-sm text-zinc-600">Hjemmeholdet kan anmode om kampflytning. Udeholdet accepterer, og Turneringsadmin godkender under Turnering.</div>

          {moveRequest ? (
            <div className="mt-3 rounded-lg border border-zinc-200 p-3 text-sm text-zinc-800">
              <div className="font-semibold">Status: {moveStatusText ?? moveRequest.status}</div>
              <div className="mt-2 text-zinc-700">
                Foreslået: {moveRequest.proposedDate || "(ingen dato)"}{moveRequest.proposedTime ? ` kl. ${moveRequest.proposedTime}` : ""}
              </div>
              {moveRequest.note ? <div className="mt-2 whitespace-pre-wrap text-zinc-700">Note: {moveRequest.note}</div> : null}
              <div className="mt-2 text-xs text-zinc-600">Oprettet: {fmtDateTimeIso(moveRequest.createdAt)} · {moveRequest.createdBy}</div>
              {moveRequest.rejectionReason ? <div className="mt-2 text-sm text-red-700">Afvist: {moveRequest.rejectionReason}</div> : null}

              {norm(moveRequest.status).toUpperCase() === "PENDING_AWAY" && isAwayLeader ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void acceptMoveRequest()}
                    disabled={moveLoading}
                    className={
                      "rounded-lg px-4 py-2 text-sm font-semibold " +
                      (moveLoading ? "bg-zinc-200 text-zinc-700" : "bg-[color:var(--brand)] text-[var(--brand-foreground)]")
                    }
                  >
                    Accepter
                  </button>
                  <button
                    type="button"
                    onClick={() => void rejectMoveRequest()}
                    disabled={moveLoading}
                    className={
                      "rounded-lg px-4 py-2 text-sm font-semibold " +
                      (moveLoading ? "bg-zinc-200 text-zinc-700" : "bg-zinc-200 text-zinc-800 hover:bg-zinc-300")
                    }
                  >
                    Afvis
                  </button>
                </div>
              ) : null}
            </div>
          ) : canCreateMoveRequest ? (
            <div className="mt-3 space-y-3 rounded-lg border border-zinc-200 p-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">Ny dato (valgfri)</label>
                  <input
                    type="date"
                    value={proposedDate}
                    onChange={(e) => setProposedDate(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">Ny tid (valgfri)</label>
                  <input
                    type="time"
                    value={proposedTime}
                    onChange={(e) => setProposedTime(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => void createMoveRequest()}
                    disabled={moveLoading}
                    className={
                      "w-full rounded-lg px-4 py-2 text-sm font-semibold " +
                      (moveLoading ? "bg-zinc-200 text-zinc-700" : "bg-[color:var(--brand)] text-[var(--brand-foreground)]")
                    }
                  >
                    {moveLoading ? "Opretter…" : "Anmod om flytning"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700">Note (valgfri)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                  placeholder="Kort begrundelse eller forslag…"
                />
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-zinc-600">Ingen aktiv anmodning.</div>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm font-semibold text-zinc-900">Kommentarer</div>

        {comments.length === 0 ? (
          <div className="mt-2 text-sm text-zinc-600">Ingen kommentarer endnu.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="rounded-lg border border-zinc-200 p-3">
                <div className="text-xs text-zinc-600">{c.author} · {fmtDateTimeIso(c.createdAt)}</div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-900">{c.message}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <label className="block text-xs font-semibold text-zinc-700">Ny kommentar</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm"
            placeholder="Skriv en kommentar…"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void sendComment()}
              disabled={sending || !norm(message)}
              className={
                "rounded-lg px-4 py-2 text-sm font-semibold " +
                (sending || !norm(message)
                  ? "bg-zinc-200 text-zinc-700"
                  : "bg-[color:var(--brand)] text-[var(--brand-foreground)]")
              }
            >
              {sending ? "Sender…" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => void loadAll()}
              className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-300"
            >
              Opdatér
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
