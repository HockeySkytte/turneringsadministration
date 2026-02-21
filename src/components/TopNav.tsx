"use client";

import { useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const FILTER_KEYS = [
  "season",
  "clubId",
  "gender",
  "age",
  "league",
  "stage",
  "pool",
  "teamId",
  "matches",
] as const;

function pickFilterQuery(searchParams: ReturnType<typeof useSearchParams>) {
  const out = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = searchParams.get(k);
    if (v) out.set(k, v);
  }
  const qs = out.toString();
  return qs ? `?${qs}` : "";
}

export type TopNavUser = {
  username: string;
  canManageApprovals: boolean;
  canAccessTurnering: boolean;
  canAccessKlubleder: boolean;
  canAccessHoldleder: boolean;
};

export type ViewMode = "LIGHT" | "DARK";

export default function TopNav({
  user,
  viewMode,
}: {
  user: TopNavUser | null;
  viewMode: ViewMode;
}) {
  const mobileMenuRef = useRef<HTMLDetailsElement | null>(null);
  const userMenuRef = useRef<HTMLDetailsElement | null>(null);
  const searchParams = useSearchParams();

  const filtersSuffix = useMemo(() => pickFilterQuery(searchParams), [searchParams]);

  function closeDetails(ref: React.RefObject<HTMLDetailsElement | null>) {
    const el = ref.current;
    if (!el) return;
    el.open = false;
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function setViewMode(mode: ViewMode) {
    await fetch("/api/ui/select-view-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    window.location.reload();
  }

  return (
    <header className="border-b border-[color:var(--brand)] bg-[color:var(--topbar-bg)] text-[color:var(--topbar-foreground)]">
      <div className="flex w-full items-center justify-between px-4 py-2">
        <div className="flex items-center gap-4">
          {/* Desktop navigation */}
          <nav className="hidden items-center gap-5 text-base sm:flex">
            <Link className="hover:underline" href={`/kalender${filtersSuffix}`}>
              Kalender
            </Link>
            <Link className="hover:underline" href={`/stilling${filtersSuffix}`}>
              Stilling
            </Link>
            <Link className="hover:underline" href={`/statistik${filtersSuffix}`}>
              Statistik
            </Link>

            <a
              className="hover:underline"
              href="https://sports-tagging.netlify.app/floorball/"
              target="_blank"
              rel="noreferrer noopener"
            >
              Shot Plotter
            </a>

            {user?.canManageApprovals ? (
              <Link className="hover:underline" href="/admin">
                Admin
              </Link>
            ) : null}

            {user?.canAccessTurnering ? (
              <Link className="hover:underline" href="/turnering">
                Turnering
              </Link>
            ) : null}

            {user?.canAccessKlubleder ? (
              <Link className="hover:underline" href={`/klubleder${filtersSuffix}`}>
                Klubleder
              </Link>
            ) : null}

            {user?.canAccessHoldleder ? (
              <Link className="hover:underline" href={`/holdleder${filtersSuffix}`}>
                Holdleder
              </Link>
            ) : null}
          </nav>

          {/* Mobile dropdown */}
          <details ref={mobileMenuRef} className="relative sm:hidden">
            <summary className="cursor-pointer select-none rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm">
              Menu
            </summary>
            <div className="absolute left-0 z-50 mt-2 w-56 rounded-md border border-zinc-200 bg-white p-2 text-sm shadow-sm">
              <div className="flex flex-col">
                <Link
                  className="rounded px-2 py-1 hover:bg-zinc-50"
                  href={`/kalender${filtersSuffix}`}
                  onClick={() => closeDetails(mobileMenuRef)}
                >
                  Kalender
                </Link>
                <Link
                  className="rounded px-2 py-1 hover:bg-zinc-50"
                  href={`/stilling${filtersSuffix}`}
                  onClick={() => closeDetails(mobileMenuRef)}
                >
                  Stilling
                </Link>
                <Link
                  className="rounded px-2 py-1 hover:bg-zinc-50"
                  href={`/statistik${filtersSuffix}`}
                  onClick={() => closeDetails(mobileMenuRef)}
                >
                  Statistik
                </Link>

                <a
                  className="rounded px-2 py-1 hover:bg-zinc-50"
                  href="https://sports-tagging.netlify.app/floorball/"
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={() => closeDetails(mobileMenuRef)}
                >
                  Shot Plotter
                </a>

                {user?.canManageApprovals ? (
                  <Link
                    className="rounded px-2 py-1 hover:bg-zinc-50"
                    href="/admin"
                    onClick={() => closeDetails(mobileMenuRef)}
                  >
                    Admin
                  </Link>
                ) : null}

                {user?.canAccessTurnering ? (
                  <Link
                    className="rounded px-2 py-1 hover:bg-zinc-50"
                    href="/turnering"
                    onClick={() => closeDetails(mobileMenuRef)}
                  >
                    Turnering
                  </Link>
                ) : null}

                {user?.canAccessKlubleder ? (
                  <Link
                    className="rounded px-2 py-1 hover:bg-zinc-50"
                    href={`/klubleder${filtersSuffix}`}
                    onClick={() => closeDetails(mobileMenuRef)}
                  >
                    Klubleder
                  </Link>
                ) : null}

                {user?.canAccessHoldleder ? (
                  <Link
                    className="rounded px-2 py-1 hover:bg-zinc-50"
                    href={`/holdleder${filtersSuffix}`}
                    onClick={() => closeDetails(mobileMenuRef)}
                  >
                    Holdleder
                  </Link>
                ) : null}

                {user ? (
                  <>
                    <div className="my-1 border-t border-zinc-200" />
                    <Link
                      className="rounded px-2 py-1 hover:bg-zinc-50"
                      href="/tilfoej-rolle"
                      onClick={() => closeDetails(mobileMenuRef)}
                    >
                      Tilføj rolle
                    </Link>
                    <Link
                      className="rounded px-2 py-1 hover:bg-zinc-50"
                      href="/indstillinger"
                      onClick={() => closeDetails(mobileMenuRef)}
                    >
                      Indstillinger
                    </Link>
                    <button
                      type="button"
                      onClick={logout}
                      className="w-full rounded px-2 py-1 text-left hover:bg-zinc-50"
                    >
                      Log ud
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </details>
        </div>

        <div className="flex items-center gap-3 text-base">
          <div className="flex overflow-hidden rounded-md border border-zinc-300 bg-white text-sm text-zinc-900">
            <button
              type="button"
              onClick={() => void setViewMode("LIGHT")}
              className={
                "px-2.5 py-1.5 font-semibold " +
                (viewMode === "LIGHT" ? "bg-[color:var(--brand)] text-[var(--brand-foreground)]" : "hover:bg-zinc-50")
              }
              title="Lys"
            >
              Lys
            </button>
            <button
              type="button"
              onClick={() => void setViewMode("DARK")}
              className={
                "px-2.5 py-1.5 font-semibold " +
                (viewMode === "DARK" ? "bg-[color:var(--brand)] text-[var(--brand-foreground)]" : "hover:bg-zinc-50")
              }
              title="Mørk"
            >
              Mørk
            </button>
          </div>

          {user ? (
            <details ref={userMenuRef} className="relative">
              <summary className="cursor-pointer list-none font-medium select-none text-[color:var(--topbar-foreground)]">
                {user.username}
              </summary>
              <div className="absolute right-0 z-50 mt-2 w-44 rounded-md border border-zinc-200 bg-white p-2 text-sm text-zinc-900 shadow-sm">
                <div className="flex flex-col">
                  <Link
                    className="rounded px-2 py-1 text-left hover:bg-zinc-50"
                    href="/tilfoej-rolle"
                    onClick={() => closeDetails(userMenuRef)}
                  >
                    Tilføj rolle
                  </Link>
                  <Link
                    className="rounded px-2 py-1 text-left hover:bg-zinc-50"
                    href="/indstillinger"
                    onClick={() => closeDetails(userMenuRef)}
                  >
                    Indstillinger
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      closeDetails(userMenuRef);
                      void logout();
                    }}
                    className="rounded px-2 py-1 text-left hover:bg-zinc-50"
                  >
                    Log ud
                  </button>
                </div>
              </div>
            </details>
          ) : (
            <Link className="hover:underline" href="/login">
              Log ind
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
