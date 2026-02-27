"use client";

import { useEffect, useMemo, useState } from "react";

type Tab = { key: string; label: string };

function Badge({ count }: { count: number }) {
  const text = count > 99 ? "99+" : String(count);
  return (
    <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
      {text}
    </span>
  );
}

export default function HoldlederTabsClient({
  tabs,
  activeTab,
}: {
  tabs: Tab[];
  activeTab: string;
}) {
  const [attentionCount, setAttentionCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/holdleder/notifications", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as any;
      if (cancelled) return;
      if (!res.ok || data?.ok !== true) {
        setAttentionCount(0);
        return;
      }
      setAttentionCount(typeof data?.attentionCount === "number" ? data.attentionCount : 0);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const badgeByKey = useMemo(() => new Map<string, number>([["kampe", attentionCount]]), [attentionCount]);

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = t.key === activeTab;
          const badge = badgeByKey.get(t.key) ?? 0;
          return (
            <a
              key={t.key}
              href={`/holdleder?tab=${t.key}`}
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
    </div>
  );
}
