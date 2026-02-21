"use client";

import { useEffect, useMemo, useState } from "react";

type Match = {
  id: string;
  title: string;
  videoUrl: string;
  matchDate: string;
  createdAt: string;
};

function parseYouTubeId(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();

    if (host.includes("youtu.be")) {
      const id = u.pathname.replace(/^\//, "").split("/")[0] ?? "";
      return id || null;
    }

    if (host.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;

      const parts = u.pathname.split("/").filter(Boolean);
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0) {
        const id = parts[embedIdx + 1] ?? "";
        return id || null;
      }

      const shortsIdx = parts.indexOf("shorts");
      if (shortsIdx >= 0) {
        const id = parts[shortsIdx + 1] ?? "";
        return id || null;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

function toYouTubeEmbedUrl(videoId: string) {
  const params = new URLSearchParams({ autoplay: "1", rel: "0" });
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}

export default function KampeClient() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);

  const openMatch = useMemo(() => matches.find((m) => m.id === openId) ?? null, [matches, openId]);

  async function loadMatches(signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/matches", { cache: "no-store", signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "Kunne ikke hente kampe.");
        setMatches([]);
        return;
      }
      setMatches(data?.matches ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    loadMatches(ac.signal);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock scroll when modal is open
  useEffect(() => {
    if (!openMatch) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [openMatch]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Kampe</h1>
        <button
          type="button"
          onClick={() => loadMatches()}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
        >
          Opdater
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? <p className="text-sm text-zinc-600">Henter…</p> : null}

      {!loading && matches.length === 0 ? (
        <p className="text-sm text-zinc-600">Ingen kampe endnu. En leder kan tilføje dem under Leder.</p>
      ) : null}

      {matches.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setOpenId(m.id)}
              className="rounded-md border border-zinc-200 bg-white p-4 text-left hover:border-zinc-300"
            >
              <div className="text-sm font-semibold">{m.title}</div>
              <div className="mt-1 text-xs text-zinc-600">
                {new Date(m.matchDate).toLocaleDateString("da-DK")} • Klik for at afspille
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {openMatch ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpenId(null);
          }}
        >
          <div className="w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
              <div className="min-w-0 text-sm font-semibold">
                <span className="truncate">{openMatch.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
              >
                Luk
              </button>
            </div>

            <div className="bg-black">
              <div className="aspect-video w-full">
                {(() => {
                  const ytId = parseYouTubeId(openMatch.videoUrl);
                  if (ytId) {
                    return (
                      <iframe
                        className="h-full w-full"
                        src={toYouTubeEmbedUrl(ytId)}
                        title={openMatch.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    );
                  }

                  return (
                    <div className="grid h-full w-full place-items-center bg-zinc-900 p-6 text-center text-white">
                      <div>
                        <div className="text-sm font-semibold">Kan ikke indlejre videoen</div>
                        <a
                          className="mt-2 inline-block rounded-md bg-white/10 px-3 py-2 text-sm underline"
                          href={openMatch.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Åbn link
                        </a>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
