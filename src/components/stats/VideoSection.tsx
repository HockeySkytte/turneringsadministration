"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type VideoEvent = {
  id: string;
  event: string;
  teamName?: string | null;
  strength?: string | null;
  p1Name: string | null;
  p2Name: string | null;
  goalieName?: string | null;
  homePlayersNames?: string | null;
  awayPlayersNames?: string | null;
  videoUrl?: string | null;
  videoTime?: number | null;
  gameId: string | null;
  gameDate?: string | null;
};

function parseYouTubeId(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host.includes("youtu.be")) {
      const id = url.pathname.replace(/^\//, "").split("/")[0] ?? "";
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const parts = url.pathname.split("/").filter(Boolean);
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0) {
        const id = parts[embedIdx + 1] ?? "";
        return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function formatSeconds(total: number) {
  const t = Math.max(0, Math.floor(total));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

let youTubeIframeApiPromise: Promise<void> | null = null;
function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).YT?.Player) return Promise.resolve();
  if (youTubeIframeApiPromise) return youTubeIframeApiPromise;

  youTubeIframeApiPromise = new Promise<void>((resolve) => {
    const prev = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      try {
        if (typeof prev === "function") prev();
      } finally {
        resolve();
      }
    };

    const existing = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    ) as HTMLScriptElement | null;
    if (existing) return;

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });

  return youTubeIframeApiPromise;
}

function getEventPlayerName(e: VideoEvent) {
  const p1 = String(e.p1Name ?? "").trim();
  if (p1) return p1;
  const p2 = String(e.p2Name ?? "").trim();
  if (p2) return p2;
  const g = String(e.goalieName ?? "").trim();
  if (g) return g;
  return "-";
}

export default function VideoSection({
  title,
  events,
  showTable = true,
}: {
  title: string;
  events: VideoEvent[];
  showTable?: boolean;
}) {
  const [beforeSec, setBeforeSec] = useState<number>(5);
  const [afterSec, setAfterSec] = useState<number>(5);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [playAll, setPlayAll] = useState(false);
  const [playRequested, setPlayRequested] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const playerReadyRef = useRef(false);
  const pendingRef = useRef<{
    ytId: string;
    start: number;
    end: number;
  } | null>(null);

  const rows = useMemo(() => {
    return events.map((e) => {
      const ytId = parseYouTubeId(e.videoUrl ?? null);
      const t = typeof e.videoTime === "number" && Number.isFinite(e.videoTime) ? e.videoTime : null;
      const start = t !== null ? Math.max(0, Math.floor(t - beforeSec)) : null;
      const end = t !== null ? Math.max(0, Math.floor(t + afterSec)) : null;
      return {
        e,
        ytId,
        t,
        start,
        end,
        playable: Boolean(ytId && start !== null && end !== null),
      };
    });
  }, [events, beforeSec, afterSec]);

  useEffect(() => {
    // If nothing is selected yet, pick the first playable clip.
    if (selectedIndex !== null) return;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]!.playable) {
        setSelectedIndex(i);
        return;
      }
    }
  }, [rows, selectedIndex]);

  function findFirstPlayableIndex() {
    for (let i = 0; i < rows.length; i++) if (rows[i]!.playable) return i;
    return null;
  }

  function findNextPlayableIndex(startFromExclusive: number) {
    for (let i = startFromExclusive + 1; i < rows.length; i++) if (rows[i]!.playable) return i;
    return null;
  }

  const selectedRow = selectedIndex !== null ? rows[selectedIndex] ?? null : null;

  useEffect(() => {
    let cancelled = false;
    loadYouTubeIframeApi().then(() => {
      if (cancelled) return;
      setApiReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!apiReady) return;

    // No autoplay: only load/play after an explicit user action.
    if (!playRequested) {
      if (playerRef.current) {
        try {
          playerRef.current.stopVideo();
        } catch {
          // ignore
        }
      }
      return;
    }

    const YT = (window as any).YT;
    if (!YT?.Player) return;

    const next =
      selectedRow?.playable
        ? {
            ytId: selectedRow.ytId!,
            start: selectedRow.start ?? 0,
            end: selectedRow.end ?? Math.max(0, (selectedRow.start ?? 0) + 1),
          }
        : null;

    pendingRef.current = next;

    if (!next) {
      if (playerRef.current) {
        try {
          playerRef.current.stopVideo();
        } catch {
          // ignore
        }
      }
      return;
    }

    if (!playerRef.current && playerHostRef.current) {
      playerReadyRef.current = false;
      playerRef.current = new YT.Player(playerHostRef.current, {
        videoId: next.ytId,
        playerVars: {
          autoplay: 0,
          start: next.start,
          end: next.end,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          controls: 1,
        },
        events: {
          onReady: () => {
            playerReadyRef.current = true;
            const p = pendingRef.current;
            if (!p) return;
            try {
              playerRef.current?.loadVideoById({
                videoId: p.ytId,
                startSeconds: p.start,
                endSeconds: p.end,
              });
            } catch {
              // ignore
            }
          },
          onStateChange: (ev: any) => {
            if (ev?.data !== YT.PlayerState?.ENDED) return;
            if (!playAll) return;
            setSelectedIndex((curr) => {
              if (curr === null) return curr;
              const nextIdx = findNextPlayableIndex(curr);
              if (nextIdx === null) {
                setPlayAll(false);
                return curr;
              }
              return nextIdx;
            });
          },
        },
      });
      return;
    }

    if (playerRef.current && playerReadyRef.current) {
      try {
        playerRef.current.loadVideoById({
          videoId: next.ytId,
          startSeconds: next.start,
          endSeconds: next.end,
        });
      } catch {
        // ignore
      }
    }
  }, [apiReady, playRequested, selectedRow, playAll]);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
        playerReadyRef.current = false;
      }
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {title ? <div className="text-base font-semibold text-zinc-700">{title}</div> : null}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1">
            <span className="text-zinc-600">Før</span>
            <input
              type="number"
              min={0}
              max={120}
              value={beforeSec}
              onChange={(e) => setBeforeSec(Math.max(0, Number(e.target.value) || 0))}
              className="w-16 rounded-md border border-[color:var(--surface-border)] bg-transparent px-2 py-1"
            />
            <span className="text-zinc-600">s</span>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-zinc-600">Efter</span>
            <input
              type="number"
              min={0}
              max={120}
              value={afterSec}
              onChange={(e) => setAfterSec(Math.max(0, Number(e.target.value) || 0))}
              className="w-16 rounded-md border border-[color:var(--surface-border)] bg-transparent px-2 py-1"
            />
            <span className="text-zinc-600">s</span>
          </label>
          <button
            type="button"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={rows.every((r) => !r.playable)}
            onClick={() => {
              const start =
                selectedIndex !== null && rows[selectedIndex]?.playable ? selectedIndex : findFirstPlayableIndex();
              if (start === null) return;
              setSelectedIndex(start);
              setPlayRequested(true);
              setPlayAll(true);
            }}
          >
            Afspil Alle
          </button>
          {playAll ? (
            <button
              type="button"
              className="rounded-md border border-[color:var(--surface-border)] px-3 py-1.5 text-sm"
              onClick={() => {
                setPlayAll(false);
                if (playerRef.current) {
                  try {
                    playerRef.current.stopVideo();
                  } catch {
                    // ignore
                  }
                }
              }}
            >
              Stop
            </button>
          ) : null}
        </div>
      </div>

      <div className={showTable ? "grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-start" : "space-y-2"}>
        <div className="space-y-2">
          <div className="aspect-video w-full overflow-hidden rounded-md bg-black/90">
            {playRequested && selectedRow?.playable ? (
              <div ref={playerHostRef} className="h-full w-full" />
            ) : rows.length === 0 ? (
              <div className="grid h-full w-full place-items-center text-sm text-white/70">Ingen events.</div>
            ) : selectedRow?.playable ? (
              <div className="grid h-full w-full place-items-center text-sm text-white/70">
                {showTable ? "Tryk på Afspil Alle eller vælg et event." : "Tryk på Afspil Alle for at starte."}
              </div>
            ) : (
              <div className="grid h-full w-full place-items-center text-sm text-white/70">Vælg et event med video.</div>
            )}
          </div>
          {selectedRow?.playable ? (
            <div className="text-xs text-zinc-600">
              Clip: {formatSeconds(selectedRow.start ?? 0)} - {formatSeconds(selectedRow.end ?? 0)}
            </div>
          ) : null}
        </div>

        {showTable ? (
          <div className="max-h-[320px] overflow-auto rounded-md border border-[color:var(--surface-border)] md:max-w-[420px] md:justify-self-end">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-[color:var(--surface)]">
                <tr className="border-b border-[color:var(--surface-border)] text-left">
                  <th className="py-1.5 pl-3 pr-2">Hold</th>
                  <th className="py-1.5 pr-2">Event</th>
                  <th className="py-1.5 pr-3">Spiller</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const isSelected = selectedIndex === idx;
                  return (
                    <tr
                      key={r.e.id}
                      className={
                        "border-b border-[color:var(--surface-border)] " +
                        (r.playable ? "cursor-pointer" : "opacity-50") +
                        (isSelected ? " bg-[color:var(--surface)]" : "")
                      }
                      onClick={() => {
                        if (!r.playable) return;
                        setPlayRequested(true);
                        setPlayAll(false);
                        setSelectedIndex(idx);
                      }}
                    >
                      <td className="py-1.5 pl-3 pr-2">{r.e.teamName ?? "-"}</td>
                      <td className="py-1.5 pr-2 font-medium">{r.e.event}</td>
                      <td className="py-1.5 pr-3">{getEventPlayerName(r.e)}</td>
                    </tr>
                  );
                })}

                {rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-zinc-600" colSpan={3}>
                      Ingen events.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
