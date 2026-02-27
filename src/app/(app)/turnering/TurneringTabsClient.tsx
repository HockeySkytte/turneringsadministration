"use client";

import { useEffect, useMemo, useState } from "react";

type Tab = { key: string; label: string };

type PendingCounts = {
  clubLeaderApprovals: number;
  moveRequests: number;
  playerLicenseRequests: number;
  total: number;
};

function Badge({ count }: { count: number }) {
  const text = count > 99 ? "99+" : String(count);
  return (
    <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
      {text}
    </span>
  );
}

export default function TurneringTabsClient({
  tabs,
  activeTab,
}: {
  tabs: Tab[];
  activeTab: string;
}) {
  const [pending, setPending] = useState<PendingCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/turnering/notifications", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as any;
      if (cancelled) return;
      if (!res.ok || data?.ok !== true) {
        setPending(null);
        return;
      }
      setPending((data?.pending ?? null) as PendingCounts | null);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const badgeByKey = useMemo(() => {
    const total = Number(pending?.total ?? 0);
    return new Map<string, number>([["godkend", total]]);
  }, [pending]);

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const active = t.key === activeTab;
        const badge = badgeByKey.get(t.key) ?? 0;
        return (
          <a
            key={t.key}
            href={`/turnering?tab=${t.key}`}
            className={
              "inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold " +
              (active
                ? "bg-[color:var(--brand)] text-[var(--brand-foreground)]"
                : "bg-zinc-200 text-zinc-800 hover:bg-zinc-300")
            }
          >
            {t.label}
            {badge > 0 ? <Badge count={badge} /> : null}
          </a>
        );
      })}
    </div>
  );
}
